import { expect, test } from '@playwright/test';
import type { GameHandle } from '../src/engine';

declare global { interface Window { dreamcraft: GameHandle } }

test('small and large drawings produce the same coins and a barrier cleared by one jump', async ({ page, request }) => {
  const levels = [];
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.dreamcraft?.snapshot());
  for (const [width, height] of [[4, 4], [180, 150]]) {
    const response = await request.post('http://127.0.0.1:8001/api/sketch/reviewed-level', { data: {
      image_width: 960, image_height: 540, world_width: 960, world_height: 540,
      objects: [
        { id: 'floor', type: 'platform', x: 0, y: 460, width: 960, height: 20 },
        { id: 'spawn', type: 'spawn', x: 50, y: 430, width: 20, height: 30 },
        { id: 'goal', type: 'goal', x: 850, y: 424, width: 24, height: 36 },
        { id: 'coin', type: 'coin', x: 160-width/2, y: 438-height/2, width, height },
        { id: 'spike', type: 'spike', x: 450-width/2, y: 460-height, width, height },
      ].map(o => ({ ...o, reviewed: true })),
    } });
    expect(response.ok()).toBe(true);
    const { level } = await response.json();
    expect(level.objects.find((o: { type: string }) => o.type === 'coin')).toMatchObject({ width: 20, height: 20 });
    expect(level.objects.find((o: { type: string }) => o.type === 'spike')).toMatchObject({ width: 48, height: 24, y: 436 });
    levels.push(level);
    const saved = await (await request.post('http://127.0.0.1:8001/api/levels', { data: level })).json();
    const assessment = await (await request.post(`http://127.0.0.1:8001/api/levels/${saved.id}/validate`)).json();
    expect(assessment.status).toBe('reachable');
    await page.evaluate(value => window.dreamcraft.loadLevel(value), level);
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.waitForFunction(() => window.dreamcraft.snapshot()?.state === 'ready');
    const completed = await page.evaluate(path => {
      window.dreamcraft.start();
      for (const action of path) window.dreamcraft.step(action.frames, action);
      return window.dreamcraft.snapshot();
    }, assessment.path);
    expect(completed?.state).toBe('completed');
    expect(completed?.score).toBe(1);
  }
  expect(levels[0]).toEqual(levels[1]);
  await page.goto('/?test=live');
  await page.waitForFunction(() => window.dreamcraft?.snapshot());
  await page.evaluate(value => window.dreamcraft.loadLevel(value), levels[0]);
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForFunction(() => window.dreamcraft.snapshot()?.state === 'ready');
  await page.evaluate(() => window.dreamcraft.start());
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.dreamcraft.snapshot()?.x || 0), { intervals: [16] }).toBeGreaterThan(360);
  await page.keyboard.press('Space', { delay: 60 });
  await expect.poll(() => page.evaluate(() => window.dreamcraft.snapshot()?.state), { timeout: 10000 }).toBe('completed');
  await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.dreamcraft.snapshot()?.score)).toBe(1);
});
