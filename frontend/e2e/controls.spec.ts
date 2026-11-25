import { test, expect, type Page } from '@playwright/test';
async function position(page: Page) {
  const text = await page.getByLabel('Player position', { exact: true }).textContent();
  const match = /X (-?\d+), Y (-?\d+)/.exec(text || '');
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}
test('real-time Studio movement works before, during and after a jump', async ({ page }) => {
  await page.goto('/studio?sample=flat');
  await expect(page.getByTestId('game-state')).toHaveText('ready');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await position(page)).x).toBeGreaterThan(80);
  await page.keyboard.up('ArrowRight');
  const start = await position(page);
  await page.keyboard.down('Space');
  await expect.poll(async () => (await position(page)).y).toBeLessThan(410);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await position(page)).x).toBeGreaterThan(start.x + 15);
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await position(page)).y).toBe(430);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByTestId('game-state')).toHaveText('playing');
  await page.getByLabel('Game area.', { exact: false }).click();
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Space');
  await expect.poll(async () => (await position(page)).x).toBeGreaterThan(80);
  await expect.poll(async () => (await position(page)).y).toBeLessThan(420);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');
  await expect.poll(async () => (await position(page)).y).toBe(430);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('Studio verifies a route in Phaser and offers only playable samples', async ({ page }) => {
  await page.goto('/studio?sample=flat');
  await expect(page.getByTestId('game-state')).toHaveText('ready');
  await page.getByRole('button', { name: 'Back to editor', exact: true }).click();
  await page.getByRole('button', { name: 'Create level →' }).click();
  await expect(page.getByRole('heading', { name: 'A path to the finish was found' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the path in the game' })).toHaveCount(0);
  await expect(page.getByText('An automatic test reached the finish in the game.')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('option[value="gap"], option[value="high"]')).toHaveCount(0);
  await expect(page.locator('optgroup[label="Playable demos"] option')).toHaveCount(4);
});
