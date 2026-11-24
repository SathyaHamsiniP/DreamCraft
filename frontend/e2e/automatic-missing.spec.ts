import { test, expect } from '@playwright/test';
test('default Studio reports missing weights without a fake game', async ({ page }) => {
  await page.goto('/studio');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 120;
    const g = c.getContext('2d')!; g.fillStyle = 'white'; g.fillRect(0,0,200,120);
    g.strokeStyle = 'black'; g.lineWidth = 3; g.beginPath(); g.arc(100,60,25,0,Math.PI*2); g.stroke();
    return c.toDataURL().split(',')[1];
  });
  await page.getByLabel('Upload drawing').setInputFiles({ name: 'circle.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: 'Generate My Game' }).click();
  await expect(page.getByText(/The local CNN checkpoint is missing/)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Advanced Edit', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Object editor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select object 1: Unlabeled', exact: true })).toBeVisible();
});
