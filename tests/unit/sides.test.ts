import { expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { Game, beginnerRules, findAttack, findDanger, randomColor } from '../../src/game';
import { fromHash, gameHash } from '../../src/share';

it('random can choose either color', () => {
  expect(randomColor(() => 0)).toBe('w');
  expect(randomColor(() => .499)).toBe('w');
  expect(randomColor(() => .5)).toBe('b');
  expect(randomColor(() => .999)).toBe('b');
});

it('Black takebacks preserve the AI opening and undo the human move plus reply', () => {
  const game = new Game(beginnerRules, 'b');
  expect(game.humanTurn).toBe(false);
  game.play('e2e4');
  const opening = game.chess.fen();
  expect(game.canUndo).toBe(false);
  game.undo(); expect(game.chess.fen()).toBe(opening);
  game.play('e7e5'); game.play('g1f3');
  expect(game.canUndo).toBe(true);
  game.undo(); expect(game.chess.fen()).toBe(opening);
  expect(game.humanTurn).toBe(true);
  game.play('c7c5'); game.undo();
  expect(game.chess.fen()).toBe(opening);
});

it('links preserve Black, rules, moves, and pending warnings; old links stay White', () => {
  const game = new Game({ castling: true, enPassant: true }, 'b');
  game.play('e2e4'); game.play('e7e5');
  const restored = fromHash(gameHash(game, true))!;
  expect(restored.game.humanColor).toBe('b');
  expect(restored.game.chess.fen()).toBe(game.chess.fen());
  expect(restored.game.rules).toEqual(game.rules);
  expect(restored.pending).toBe(true);
  expect(fromHash('#v1.AA')?.game.humanColor).toBe('w');
  expect(fromHash(gameHash(new Game(beginnerRules, 'b')))?.game.humanColor).toBe('b');
});

it('warns about White attacks and Black blunders', () => {
  const chess = new Chess('4k3/8/4r3/3P4/8/8/8/4K3 b - - 0 1');
  expect(findAttack(chess, beginnerRules, 'b')?.voice).toBe('attack-pawn-rook-free');
  const blunder = new Chess('4k3/4q3/8/8/3P4/8/8/4K3 b - - 0 1');
  const played = blunder.move('Qe5');
  expect(findDanger(blunder, beginnerRules, played)?.voice).toBe('blunder-queen');
});

it('checkmate wording follows the human color', () => {
  const game = new Game(beginnerRules, 'b');
  game.chess = new Chess('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
  expect(game.over).toBe('human-checkmated');
  game.humanColor = 'w';
  expect(game.over).toBe('ai-checkmated');
});
