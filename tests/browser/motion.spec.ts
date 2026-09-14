import { expect, test, type Page } from '@playwright/test';
import { fromHash } from '../../src/share';
import { moveDuration } from '../../src/motion';

const state = (page: Page) => fromHash(new URL(page.url()).hash)!;
async function setup(page: Page) {
  await page.route('**/assets/worker-*.js', route => route.fulfill({ contentType: 'text/javascript', body:
    `self.onmessage = ({ data }) => { if (data.type === 'play') self.postMessage({ id: data.id, fen: data.fen, move: 'g8f6' }); };` }));
  await page.goto('/#v1.AA');
}
async function knightMove(page: Page) {
  const board = page.locator('#board');
  const size = (await board.boundingBox())!.width / 8;
  await board.click({ position: { x: size * 6.5, y: size * 7.5 } });
  await board.click({ position: { x: size * 5.5, y: size * 5.5 } });
}

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

test('Take Back cancels an in-flight move and the queued AI reply', async ({ page }) => {
  await setup(page); await knightMove(page);
  await expect(page.locator('#motion-layer .moving-piece')).toHaveCount(1);
  await page.getByRole('button', { name: 'Take Back', exact: true }).click();
  await expect(page.locator('#motion-layer')).toBeEmpty();
  await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  await page.waitForTimeout(moveDuration + 100);
  expect(state(page).game.indices.length).toBe(0);
  await expect(page.locator('cg-board piece:not(.ghost)')).toHaveCount(32);
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
