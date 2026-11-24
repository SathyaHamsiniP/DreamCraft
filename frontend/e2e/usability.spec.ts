import { expect, test } from '@playwright/test';

test('pages use plain instructions without model setup details', async ({ page }) => {
  for (const path of ['/', '/help', '/levels', '/studio', '/studio?sample=trail']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/CNN|checkpoint|best\.pt|training|SQLite|OpenCV|Phaser|backend|JSON/i);
  }
});

test('one start click brings the game into view and Space does not scroll the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/studio?sample=flat');
  await expect(page.getByTestId('game-state')).toHaveText('ready');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByTestId('game-state')).toHaveText('playing');
  await expect(page.getByLabel(/Game area/)).toBeFocused();
  await page.evaluate(() => new Promise<void>(resolve => {
    let previous = window.scrollY, stable = 0;
    const check = () => {
      stable = Math.abs(previous - window.scrollY) < 1 ? stable + 1 : 0;
      previous = window.scrollY;
      if (stable >= 10) resolve(); else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }));
  const canvas = await page.locator('canvas').boundingBox();
  expect(canvas!.y).toBeGreaterThanOrEqual(0);
  expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(721);
  const scroll = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space', { delay: 60 });
  await expect.poll(async () => {
    const position = await page.getByLabel('Player position', { exact: true }).textContent();
    return Number(/Y (\d+)/.exec(position || '')?.[1]);
  }, { intervals: [16] }).toBeLessThan(420);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByTestId('game-state')).toHaveText('playing');
  await page.keyboard.press('r');
  await expect(page.getByTestId('game-state')).toHaveText('playing');
  await expect(page.locator('canvas')).toHaveCount(1);
});
