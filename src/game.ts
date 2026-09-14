import { Chess, type Color, type Move, type Square } from 'chess.js';

export const randomColor = (random = Math.random): Color => random() < .5 ? 'w' : 'b';

export interface Rules { castling: boolean; enPassant: boolean }
export const beginnerRules: Rules = { castling: false, enPassant: false };
export const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
export const uci = (move: Move) => move.from + move.to + (move.promotion ?? '');

export function legalMoves(chess: Chess, rules: Rules): Move[] {
  return chess.moves({ verbose: true }).filter(m =>
    (rules.castling || !/[kq]/.test(m.flags)) && (rules.enPassant || !m.flags.includes('e')));
}

export function ending(chess: Chess, rules: Rules, humanColor: Color = 'w'): string | undefined {
  if (!legalMoves(chess, rules).length) {
    if (chess.isCheck()) return chess.turn() === humanColor
      ? 'Checkmate! Let’s try again. Every game helps you learn.'
      : 'Checkmate! You did it, little knight!';
    return 'A tie! No one has a move. Let’s play again.';
  }
  if (chess.isInsufficientMaterial() || chess.isThreefoldRepetition() || chess.isDrawByFiftyMoves())
    return 'It’s a tie! That was a good adventure.';
}

export class Game {
  chess = new Chess();
  indices: number[] = [];
  constructor(public rules: Rules = { ...beginnerRules }, public humanColor: Color = 'w') {}
  get humanTurn() { return this.chess.turn() === this.humanColor; }
  get humanName() { return this.humanColor === 'w' ? 'white' : 'black'; }
  get canUndo() { return this.moves.some(move => move.color === this.humanColor); }
  get moves() { return this.chess.history({ verbose: true }); }
  get over() { return ending(this.chess, this.rules, this.humanColor); }
  play(move: string): Move {
    if (this.over) throw new Error('This game has finished.');
    const choices = legalMoves(this.chess, this.rules).sort((a, b) => uci(a).localeCompare(uci(b), 'en'));
    const index = choices.findIndex(m => uci(m) === move);
    if (index < 0) throw new Error('That move is not available.');
    const played = this.chess.move(choices[index]);
    this.indices.push(index);
    return played;
  }
  undo() {
    const lastHuman = this.moves.map(move => move.color).lastIndexOf(this.humanColor);
    if (lastHuman < 0) return;
    while (this.indices.length > lastHuman) {
      this.chess.undo(); this.indices.pop();
    }
  }
  destinations(): Map<Square, Square[]> {
    const result = new Map<Square, Square[]>();
    for (const m of legalMoves(this.chess, this.rules)) {
      const dests = result.get(m.from) ?? [];
      if (!dests.includes(m.to)) dests.push(m.to);
      result.set(m.from, dests);
    }
    return result;
  }
}

export interface Danger { from: Square; to: Square; message: string }
/** A short, legal capture/recapture check, not a full tactical evaluation. */
export function findDanger(chess: Chess, rules: Rules, played: Move): Danger | undefined {
  if (ending(chess, rules)) return;
  const compensation = played.captured ? values[played.captured] : 0;
  return captureRisk(chess, rules, compensation, 'blunder');
}

/** Threats on the AI's next turn; defended equal trades are not warnings. */
export function findAttack(chess: Chess, rules: Rules, humanColor: Color = 'w'): Danger | undefined {
  if (chess.turn() !== humanColor || chess.isCheck() || ending(chess, rules)) return;
  const fen = chess.fen().split(' ');
  fen[1] = humanColor === 'w' ? 'b' : 'w'; fen[3] = '-';
  return captureRisk(new Chess(fen.join(' ')), rules, 0, 'attack');
}

/** A legal capture with no immediate legal recapture, not a claim about deeper tactics. */
export function findFreeCapture(chess: Chess, rules: Rules, humanColor: Color = 'w'): Danger | undefined {
  if (chess.turn() !== humanColor || chess.isCheck() || ending(chess, rules)) return;
  return captureRisk(chess, rules, 0, 'opportunity');
}

function captureRisk(chess: Chess, rules: Rules, compensation: number, kind: 'blunder' | 'attack' | 'opportunity'): Danger | undefined {
  let worst: { move: Move; loss: number; canRecapture: boolean } | undefined;
  for (const capture of legalMoves(chess, rules).filter(m => m.captured)) {
    chess.move(capture);
    const canRecapture = legalMoves(chess, rules).some(m => m.to === capture.to && m.captured);
    chess.undo();
    if (kind === 'opportunity' && canRecapture) continue;
    const loss = values[capture.captured!] - (canRecapture ? values[capture.promotion ?? capture.piece] : 0) - compensation;
    if (loss >= 100 && (!worst || loss > worst.loss)) worst = { move: capture, loss, canRecapture };
  }
  if (!worst) return;
  const m = worst.move;
  return { from: m.from, to: m.to,
    message: kind === 'opportunity' ? `I think you can capture this ${names[m.captured!]} for free.`
      : kind === 'attack' ? `My ${names[m.piece]} can take your ${names[m.captured!]}${worst.canRecapture ? '' : ' for free'}.`
      : `Careful! I can take your ${names[m.captured!]}.` };
}
