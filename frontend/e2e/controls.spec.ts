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
  await expect(page.getByTestId('game-state')).toHaveText('ready');
  await page.keyboard.press('Enter');
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

test('Studio verifies a route in Phaser and separates diagnostic samples', async ({ page }) => {
  await page.goto('/studio?sample=flat');
  await expect(page.getByTestId('game-state')).toHaveText('ready');
  await page.getByRole('button', { name: 'Back to editor', exact: true }).click();
  await page.getByRole('button', { name: 'Create level →' }).click();
  await expect(page.getByRole('heading', { name: 'A route was found' })).toBeVisible();
  await expect(page.getByText('This route has not been verified in Phaser for this request.')).toBeVisible();
  await page.getByRole('button', { name: 'Verify route in Phaser' }).click();
  await expect(page.getByText('The route reached the goal in an actual Phaser replay.')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('optgroup[label="Diagnostic examples · need changes"] option')).toHaveCount(2);
  await expect(page.locator('optgroup[label="Playable demos"] option')).toHaveCount(4);
});
