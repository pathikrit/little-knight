import { expect, test, type Page } from '@playwright/test';
import { fromHash, gameHash } from '../../src/share';
import { moveDuration, undoDuration } from '../../src/motion';
import { Game } from '../../src/game';

const state = (page: Page) => fromHash(new URL(page.url()).hash)!;
async function setup(page: Page, buddy = false, hash = '#v1.AA') {
  if (!buddy) await page.addInitScript(() => {
    localStorage.setItem('little-knight-settings', JSON.stringify({ blunders: false }));
  });
  await page.route('**/assets/worker-*.js', route => route.fulfill({ contentType: 'text/javascript', body:
    `self.onmessage = ({ data }) => { if (data.type === 'play') self.postMessage({ id: data.id, fen: data.fen, move: 'g8f6' }); };` }));
  await page.goto('/' + hash);
}
async function boardMove(page: Page, from: string, to: string) {
  const board = page.locator('#board');
  const size = (await board.boundingBox())!.width / 8;
  const point = (square: string) => ({ x: size * (square.charCodeAt(0) - 96.5), y: size * (8.5 - Number(square[1])) });
  await board.click({ position: point(from) });
  await board.click({ position: point(to) });
}
const knightMove = (page: Page) => boardMove(page, 'g1', 'f3');

test('pieces move slowly along the knight L, with the AI animation following the human', async ({ page }) => {
  await setup(page); await knightMove(page);
  const mover = page.locator('#motion-layer .moving-piece');
  await expect(mover).toHaveClass(/white knight/);
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.motion-track polyline')).toHaveAttribute('points', '650,750 650,550 550,550');
  const sample = async (progress: number) => mover.evaluate(async (piece, time) => {
    const animation = piece.getAnimations()[0];
    animation.pause(); await animation.ready;
    animation.currentTime = time;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(piece).transform);
    const width = piece.getBoundingClientRect().width;
    return { x: matrix.m41 / width, y: matrix.m42 / width, duration: animation.effect!.getTiming().duration };
  }, moveDuration * progress);
  const firstLeg = await sample(.5);
  expect(firstLeg.duration).toBe(moveDuration);
  expect(firstLeg.x).toBeCloseTo(6); expect(firstLeg.y).toBeCloseTo(5.5);
  const secondLeg = await sample(.8);
  expect(secondLeg.x).toBeCloseTo(5.6); expect(secondLeg.y).toBeCloseTo(5);
  await page.screenshot({ path: `test-results/motion-${test.info().project.name}.png`, fullPage: true });
  expect(state(page).game.indices.length).toBe(1);
  await mover.evaluate(piece => piece.getAnimations()[0].finish());
  await expect(mover).toHaveClass(/black knight/);
  await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  expect(state(page).game.indices.length).toBe(2);
  await expect(page.locator('#motion-layer')).toBeEmpty();
});

test('the AI waits for coaching audio, including a replay, before moving', async ({ page }) => {
  await page.addInitScript(() => {
    const tracked = window as typeof window & { coachingAudio: { starts: number; ends: number } };
    tracked.coachingAudio = { starts: 0, ends: 0 };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if ((this.buffer?.duration ?? 0) > 1) {
        tracked.coachingAudio.starts++;
        this.addEventListener('ended', () => { tracked.coachingAudio.ends++; });
      }
      return start.apply(this, args);
    };
  });
  const game = new Game();
  for (const move of ['e2e4', 'e7e5', 'd1h5', 'b8c6']) game.play(move);
  await setup(page, true, gameHash(game));
  await boardMove(page, 'h5', 'e5');
  const mover = page.locator('#motion-layer .moving-piece');
  await expect(mover).toHaveClass(/white queen/);
  await expect(page.locator('#coach-message')).toHaveText('Careful! I can take your queen.');
  const audio = () => page.evaluate(() =>
    (window as typeof window & { coachingAudio: { starts: number; ends: number } }).coachingAudio);
  await expect.poll(async () => (await audio()).starts).toBe(1);
  await page.getByRole('button', { name: 'Repeat message', exact: true }).click();
  await expect.poll(async () => (await audio()).starts).toBe(2);
  await mover.evaluate(piece => piece.getAnimations()[0].finish());
  expect(state(page).game.indices.length).toBe(5);
  expect((await audio()).ends).toBeLessThan(2);
  await expect.poll(() => state(page).game.indices.length, { timeout: 10000 }).toBe(6);
  expect((await audio()).ends).toBe(2);
});

test('Take Back reverses an in-flight human move at the shorter undo speed', async ({ page }) => {
  await setup(page); await knightMove(page);
  await expect(page.locator('#motion-layer .moving-piece')).toHaveCount(1);
  await page.getByRole('button', { name: 'Take Back', exact: true }).click();
  const mover = page.locator('#motion-layer .moving-piece');
  await expect(mover).toHaveClass(/white knight/);
  await expect(page.locator('.motion-track polyline')).toHaveAttribute('points', '550,550 650,550 650,750');
  expect(await mover.evaluate(piece => piece.getAnimations()[0].effect!.getTiming().duration)).toBe(undoDuration);
  expect(state(page).game.indices.length).toBe(0);
  await mover.evaluate(piece => piece.getAnimations()[0].finish());
  await expect(page.locator('#motion-layer')).toBeEmpty();
  await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  await expect(page.locator('cg-board piece:not(.ghost)')).toHaveCount(32);
});

test('Take Back walks the AI move back before the human move', async ({ page }) => {
  await setup(page); await knightMove(page);
  const mover = page.locator('#motion-layer .moving-piece');
  await expect(mover).toHaveClass(/black knight/);
  await mover.evaluate(piece => piece.getAnimations()[0].finish());
  await expect(page.locator('#motion-layer')).toBeEmpty();
  await page.getByRole('button', { name: 'Take Back', exact: true }).click();
  await expect(mover).toHaveClass(/black knight/);
  await expect(page.locator('.motion-track polyline')).toHaveAttribute('points', '550,250 650,250 650,50');
  await mover.evaluate(piece => piece.getAnimations()[0].finish());
  await expect(mover).toHaveClass(/white knight/);
  await expect(page.locator('.motion-track polyline')).toHaveAttribute('points', '550,550 650,550 650,750');
  await mover.evaluate(piece => piece.getAnimations()[0].finish());
  await expect(page.locator('#motion-layer')).toBeEmpty();
  expect(state(page).game.indices.length).toBe(0);
});

test('reduced motion skips the travel animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page); await knightMove(page);
  await expect.poll(() => state(page).game.indices.length).toBe(2);
  await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  await expect(page.locator('#motion-layer')).toBeEmpty();
});

test('settings interrupt movement safely and resume the AI only when closed', async ({ page }) => {
  await setup(page); await knightMove(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#motion-layer')).toBeEmpty();
  expect(state(page).game.indices.length).toBe(1);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => state(page).game.indices.length).toBe(2);
  await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  await expect(page.locator('cg-board piece:not(.ghost)')).toHaveCount(32);
});
