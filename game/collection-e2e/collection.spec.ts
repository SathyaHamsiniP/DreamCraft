import { test, expect } from '@playwright/test';

test('review, correct, reject, add and export synthetic crops', async ({ page }) => {
  await page.goto('/');
  // The browser draws the input so no personal sheet is needed in the repository.
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 600, 400);
    ctx.strokeStyle = 'black'; ctx.lineWidth = 4; ctx.strokeRect(40, 40, 120, 70);
    ctx.beginPath(); ctx.arc(300, 80, 35, 0, Math.PI * 2); ctx.stroke();
    return canvas.toDataURL().split(',')[1];
  });
  await page.locator('#file').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
  await page.getByRole('button', { name: 'Detect drawings', exact: true }).click();
  await expect(page.locator('#rows tr')).toHaveCount(2);
  await page.getByLabel('Box 1 X', { exact: true }).fill('30');
  await page.getByLabel('Box 1 X', { exact: true }).dispatchEvent('change');
  await expect(page.getByLabel('Box 1 X', { exact: true })).toHaveValue('30');
  await page.locator('#rows input[type=checkbox]').nth(1).uncheck();
  await page.getByRole('button', { name: 'Add box using numbers' }).click();
  await expect(page.locator('#rows tr')).toHaveCount(3);
  await page.locator('#rows tr').nth(2).getByRole('button', { name: 'Remove' }).click();
  const canvas = page.locator('#canvas'); await canvas.scrollIntoViewIfNeeded(); const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .05);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height * .3);
  await page.mouse.up();
  await expect(page.locator('#rows tr')).toHaveCount(3);
  await page.locator('#sheet').fill('synthetic_sheet1');
  await page.locator('#contributor').fill('synthetic_writer1');
  await page.getByRole('button', { name: 'Save reviewed crops' }).click();
  await expect(page.locator('#status')).toContainText('Saved 2 crops');
  await page.getByRole('button', { name: 'Save reviewed crops' }).click();
  await expect(page.locator('#status')).toContainText('Skipped 2 exact prepared duplicates');
  const exported = await page.request.get('/collection/metadata.csv');
  expect(await exported.text()).toContain('synthetic_sheet1,synthetic_writer1');
  await page.locator('#useRegion').check();
  await page.locator('#rx').fill('20'); await page.locator('#ry').fill('20');
  await page.locator('#rw').fill('170'); await page.locator('#rh').fill('120');
  await page.getByRole('button', { name: 'Detect drawings', exact: true }).click();
  await expect(page.locator('#rows tr')).toHaveCount(1);
});
