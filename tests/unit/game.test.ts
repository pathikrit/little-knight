import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { Game, beginnerRules, ending, findDanger, findAttack, legalMoves, uci } from '../../src/game';
import { captureRows } from '../../src/mat';
import { gameHash, fromHash } from '../../src/share';
import { chooseMove, whiteEvaluation } from '../../src/engine/search';

const full = { castling: true, enPassant: true };
describe('simplified rules', () => {
  for (const side of ['w', 'b']) it(`disables castling for ${side}`, () => {
    const chess = new Chess(`r3k2r/8/8/8/8/8/8/R3K2R ${side} KQkq - 0 1`);
    expect(legalMoves(chess, full).filter(m => /[kq]/.test(m.flags))).toHaveLength(2);
    expect(legalMoves(chess, beginnerRules).some(m => /[kq]/.test(m.flags))).toBe(false);
  });
  for (const fen of ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1'])
    it(`disables en passant for ${fen.split(' ')[1]}`, () => {
      const chess = new Chess(fen);
      expect(legalMoves(chess, full).some(m => m.flags.includes('e'))).toBe(true);
      expect(legalMoves(chess, beginnerRules).some(m => m.flags.includes('e'))).toBe(false);
    });
  it('offers only king-safe destinations while in check', () => {
    const game = new Game();
    game.chess = new Chess('4r1k1/8/8/8/8/8/P7/4K3 w - - 0 1');
    expect(game.destinations().has('a2')).toBe(false);
    expect(game.destinations().get('e1')).not.toContain('e2');
  });
  it('detects checkmate and stalemate', () => {
    expect(ending(new Chess('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1'), beginnerRules)).toContain('Checkmate');
    expect(ending(new Chess('7k/5Q2/5K2/8/8/8/8/8 b - - 0 1'), beginnerRules)).toContain('tie');
  });
});

describe('takebacks and URL replay', () => {
  it('undoes a complete turn, then allows branching', () => {
    const game = new Game();
    game.play('e2e4'); game.play('e7e5'); game.undo();
    expect(game.chess.fen()).toBe(new Chess().fen());
    expect(game.indices).toEqual([]);
    game.play('d2d4');
    expect(fromHash(gameHash(game))?.game.chess.fen()).toBe(game.chess.fen());
  });
  it('undoes before the opponent replies', () => {
    const game = new Game(); game.play('e2e4'); game.undo(); game.undo();
    expect(game.chess.fen()).toBe(new Chess().fen());
  });
  it('round trips both rules, history, and a pending warning', () => {
    const game = new Game(full);
    for (const move of ['e2e4', 'e7e5', 'd1h5']) game.play(move);
    const restored = fromHash(gameHash(game, true))!;
    expect(restored.pending).toBe(true);
    expect(restored.game.rules).toEqual(full);
    expect(restored.game.chess.fen()).toBe(game.chess.fen());
    expect(restored.game.moves.map(uci)).toEqual(game.moves.map(uci));
  });
  it('round trips castling with all rules enabled', () => {
    const game = new Game(full);
    for (const move of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']) game.play(move);
    expect(fromHash(gameHash(game))?.game.chess.fen()).toBe(game.chess.fen());
  });
  it('preserves repetition history', () => {
    const game = new Game();
    for (let n = 0; n < 2; n++) for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) game.play(m);
    expect(fromHash(gameHash(game))?.game.chess.isThreefoldRepetition()).toBe(true);
  });
  it.each(['#oops', '#v2.AA', '#v1.A', '#v1.____', '#v1.AP8', '#v1.BA', '#v1.' + 'A'.repeat(3000)])('rejects malformed or illegal state %s', hash => {
    expect(fromHash(hash)).toBeUndefined();
  });
});

describe('kind safety checks', () => {
  it('warns about a hanging moved piece and preserves the position', () => {
    const chess = new Chess('4k3/8/8/3p4/8/8/4Q3/4K3 w - - 0 1');
    const move = chess.move('Qe4'), before = chess.fen();
    expect(findDanger(chess, beginnerRules, move)?.message).toContain('I can take your queen');
    expect(chess.fen()).toBe(before);
    expect(chess.history()).toEqual(['Qe4+']);
  });
  it('warns about uncovering an attack on another piece', () => {
    const chess = new Chess('4k3/8/8/8/r1B1Q3/8/8/4K3 w - - 0 1');
    const move = chess.move('Bd3');
    expect(findDanger(chess, beginnerRules, move)?.to).toBe('e4');
  });
  it('does not warn about a fair defended pawn exchange', () => {
    const chess = new Chess('4k3/8/8/3p4/8/5P2/4P3/4K3 w - - 0 1');
    const move = chess.move('e4');
    expect(findDanger(chess, beginnerRules, move)).toBeUndefined();
  });
  it('does not warn after capturing something more valuable', () => {
    const chess = new Chess('4k3/8/8/3p4/4q3/8/4R3/4K3 w - - 0 1');
    const move = chess.move('Rxe4');
    expect(findDanger(chess, beginnerRules, move)).toBeUndefined();
  });
  it('does not mistake a pinned attacker for a legal capture', () => {
    const chess = new Chess('4k3/8/4n3/8/8/8/3Q4/K3R3 w - - 0 1');
    const move = chess.move('Qd4');
    expect(findDanger(chess, beginnerRules, move)).toBeUndefined();
  });
});

describe('AI threats and board mat', () => {
  it('announces an uncompensated rook threat without changing the game', () => {
    const chess = new Chess('4k3/8/8/3p4/4R3/8/8/4K3 w - - 0 1');
    const before = chess.fen();
    expect(findAttack(chess, beginnerRules)?.message).toBe('My pawn can take your rook for free.');
    expect(chess.fen()).toBe(before);
  });
  it('does not announce a fair trade, check, or a pinned attacker', () => {
    for (const fen of ['4k3/8/8/3p4/4P3/5P2/8/4K3 w - - 0 1', '4k3/8/4n3/8/3Q4/8/8/K3R3 w - - 0 1', '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1']) {
      expect(findAttack(new Chess(fen), beginnerRules)).toBeUndefined();
    }
  });
  it('names the attacking queen and the free bishop', () => {
    const chess = new Chess('2q4k/8/8/8/2B5/8/8/7K w - - 0 1');
    expect(findAttack(chess, beginnerRules)?.message).toBe('My queen can take your bishop for free.');
  });
  it('does not call a profitable capture free when the attacker can be recaptured', () => {
    const chess = new Chess('4k3/8/8/3p4/4R3/5P2/8/4K3 w - - 0 1');
    expect(findAttack(chess, beginnerRules)?.message).toBe('My pawn can take your rook.');
  });
  it('counts real captures, including en passant, without counting promotion as a lost pawn', () => {
    const chess = new Chess('4k3/P7/8/3pP3/8/8/8/4K3 w - d6 0 1');
    chess.move('exd6'); chess.move('Kf7'); chess.move('a8=Q');
    expect(captureRows(chess.history({ verbose: true })).find(row => row.type === 'p')).toEqual({ type: 'p', white: 1, black: 0, rows: 1 });
  });
  it('evaluates symmetrically and from White’s perspective regardless of turn', () => {
    expect(whiteEvaluation(new Chess())).toBe(0);
    for (const turn of ['w', 'b']) expect(whiteEvaluation(new Chess(`4k3/8/8/8/8/8/8/R3K3 ${turn} - - 0 1`))).toBe(500);
  });
});

describe('beginner opponent', () => {
  it('returns legal rule-compatible moves at every strength', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1';
    const moves = legalMoves(new Chess(fen), beginnerRules).map(uci);
    for (const elo of [100, 300, 600, 900, 1500, 2400, 3000]) for (const random of [() => .01, () => .99]) {
      expect(moves).toContain(chooseMove(fen, beginnerRules, elo, 50, random));
    }
  });
  it('recognizes mate without returning a move', () => {
    expect(chooseMove('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', full, 900)).toBeUndefined();
  });
  it('stronger play can take a free queen', () => {
    expect(chooseMove('4k3/8/8/3p4/4Q3/8/8/4K3 b - - 0 1', full, 900, 300, () => .99)).toBe('d5e4');
  });
});
