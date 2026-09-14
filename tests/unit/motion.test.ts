import { expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { motionPlan, moveDuration, moveRoute } from '../../src/motion';

it('uses a readable duration and separate two-then-one knight legs', () => {
  expect(moveDuration).toBe(800);
  expect(moveRoute('g1', 'f3', true, false)).toEqual([[6, 7], [6, 5], [5, 5]]);
  expect(moveRoute('g1', 'e2', true, false)).toEqual([[6, 7], [4, 7], [4, 6]]);
  expect(moveRoute('b8', 'c6', true, true)).toEqual([[6, 7], [6, 5], [5, 5]]);
  expect(moveRoute('e2', 'e4', false, false)).toEqual([[4, 6], [4, 4]]);
});

it('keeps captured pieces visible until landing, without duplicating the mover', () => {
  const chess = new Chess('4k3/8/8/8/4r3/8/4R3/4K3 w - - 0 1');
  const plan = motionPlan(chess.move('Rxe4'), false);
  const visible = new Chess(plan.fen);
  expect(visible.get('e2')).toBeUndefined();
  expect(visible.get('e4')).toEqual({ type: 'r', color: 'b' });
  expect(plan.pieces).toEqual([{ role: 'rook', route: [[4, 6], [4, 4]] }]);
});

it('moves both castling pieces and uses a pawn until promotion lands', () => {
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const plan = motionPlan(castle.move('O-O'), false);
  expect(plan.pieces).toEqual([
    { role: 'king', route: [[4, 7], [6, 7]] },
    { role: 'rook', route: [[7, 7], [5, 7]] },
  ]);
  const before = new Chess(plan.fen, { skipValidation: true });
  expect(before.get('e1')).toBeUndefined(); expect(before.get('h1')).toBeUndefined();
  const promotion = new Chess('4k3/6P1/8/8/8/8/8/4K3 w - - 0 1');
  expect(motionPlan(promotion.move('g8=Q'), false).pieces[0].role).toBe('pawn');
});

it('keeps the en-passant victim visible during the diagonal move', () => {
  const chess = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const plan = motionPlan(chess.move('exd6'), false);
  expect(new Chess(plan.fen).get('d5')).toEqual({ type: 'p', color: 'b' });
  expect(plan.pieces[0].route).toEqual([[4, 3], [3, 2]]);
});
