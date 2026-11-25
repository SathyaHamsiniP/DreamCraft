import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('checking a new sample saves it and tests the path without another question', async ({ page }) => {
  await page.goto('/studio?sample=flat');
  await expect(page.getByTestId('game-state')).toHaveText('ready');
  const saved = page.waitForResponse(r => r.url().endsWith('/api/levels') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Check playability' }).click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByText('An automatic test reached the finish in the game.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

for (const name of ['tight timing', 'start above platform']) {
  test(`Studio checks ${name} in the actual game without a second question`, async ({ page, request }) => {
    const path = name === 'tight timing'
      ? '../../playability/tests/fixtures/tight-timing.json'
      : '../../contracts/examples/flat.json';
    const level = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    if (name === 'start above platform') level.objects.find((o: { type: string }) => o.type === 'spawn').y = 200;
    const saved = await request.post('http://127.0.0.1:8002/api/levels', { data: level });
    expect(saved.ok()).toBe(true);
    const record = await saved.json();
    await page.goto(`/studio?level=${record.id}`);
    await expect(page.getByTestId('game-state')).toHaveText('ready');
    const checked = page.waitForResponse(r => r.url().endsWith(`/api/levels/${record.id}/validate`));
    await page.getByRole('button', { name: 'Check playability' }).click();
    const estimate = await (await checked).json();
    expect(estimate.status).toBe('reachable');
    expect(estimate.verified_in_game).toBe(false);
    await expect(page.getByText('An automatic test reached the finish in the game.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByText(/Spawn is not resting|start is above a gap/)).toHaveCount(0);
    if (name === 'tight timing') await expect(page.getByText(/Some jumps may need careful timing/)).toBeVisible();
  });
}
