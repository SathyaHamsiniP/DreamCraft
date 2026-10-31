import { expect, test, Page } from '@playwright/test';
import type { GameHandle } from '../src/engine';
declare global { interface Window { dreamcraft: GameHandle } }
async function snapshot(page: Page) { return page.evaluate(() => window.dreamcraft?.snapshot() ?? null); }
async function state(page: Page) { return (await snapshot(page))!; }
async function step(page: Page, frames: number) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await page.evaluate(n => window.dreamcraft.step(n), frames);
}
async function load(page: Page, name: string) {
  await page.selectOption('#level', name); await page.click('#load');
  await expect.poll(async () => (await snapshot(page))?.state).toBe('ready');
}
async function start(page: Page) { await page.keyboard.down('Enter'); await step(page, 2); await page.keyboard.up('Enter'); }
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?test=1'); await expect.poll(() => snapshot(page)).not.toBeNull();
});
test.afterEach(async ({ page }) => { expect(browserErrors.get(page)).toEqual([]); });

test('movement, jumping, landing, victory and restart use the real game', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  expect((await state(page)).x).toBeCloseTo(50); await start(page);
  await page.keyboard.down('ArrowRight'); await step(page, 20); await page.keyboard.up('ArrowRight');
  expect((await state(page)).x).toBeCloseTo(110);
  await page.keyboard.down('a'); await step(page, 10); await page.keyboard.up('a');
  expect((await state(page)).x).toBeCloseTo(80);
  await page.keyboard.down('Space'); await step(page, 10); await page.keyboard.up('Space');
  const rising = await state(page); expect(rising.y).toBeLessThan(430); expect(rising.vy).toBeLessThan(0);
  await page.keyboard.down('w'); await step(page, 1); await page.keyboard.up('w');
  expect((await state(page)).vy).toBeCloseTo(rising.vy + 15);
  await step(page, 50); expect((await state(page)).grounded).toBe(true);
  await page.keyboard.down('d'); await step(page, 280); await page.keyboard.up('d');
  expect((await state(page)).state).toBe('completed');
  const won = await state(page); await page.keyboard.down('a'); await step(page, 10); await page.keyboard.up('a');
  expect((await state(page)).x).toBe(won.x);
  await page.keyboard.down('r'); await step(page, 1); await page.keyboard.up('r');
  await expect.poll(async () => (await snapshot(page))?.state).toBe('ready');
  expect((await state(page)).x).toBeCloseTo(50); expect(errors).toEqual([]);
});
test('coins collect once, spikes kill and levels reload cleanly', async ({ page }) => {
  await load(page, 'coins'); await start(page);
  await page.keyboard.down('d'); await step(page, 40); await page.keyboard.up('d');
  expect((await state(page)).score).toBe(1); await step(page, 10); expect((await state(page)).score).toBe(1);
  await page.keyboard.down('r'); await step(page, 1); await page.keyboard.up('r');
  await expect.poll(async () => (await snapshot(page))?.state).toBe('ready');
  expect((await state(page)).score).toBe(0);
  for (let i = 0; i < 3; i++) await load(page, 'spikes');
  await start(page); await page.keyboard.down('d'); await step(page, 100); await page.keyboard.up('d');
  expect((await state(page)).state).toBe('dead');
  await load(page, 'wide-gap'); await start(page);
  await page.keyboard.down('d'); await step(page, 180); await page.keyboard.up('d');
  expect((await state(page)).state).toBe('dead');
  await page.keyboard.down('r'); await step(page, 1); await page.keyboard.up('r');
  await expect.poll(async () => (await snapshot(page))?.state).toBe('ready');
  expect((await state(page)).x).toBeCloseTo(50);
});
test('bad JSON is rejected without losing the current level', async ({ page }) => {
  await page.setInputFiles('#file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"bad":true}') });
  await expect(page.locator('#status')).toContainText('Cannot load level'); expect((await state(page)).state).toBe('ready');
});

for (const name of ['flat', 'one-jump', 'multi-jump', 'coins', 'spikes', 'edge-horizontal', 'edge-vertical-low']) {
  test(`saved ${name} route replays in Phaser`, async ({ page, request }, testInfo) => {
    const { readFileSync } = await import('node:fs');
    const level = JSON.parse(readFileSync(new URL(`../../contracts/examples/${name}.json`, import.meta.url), 'utf8'));
    const created = await request.post('http://127.0.0.1:8001/api/levels', { data: level });
    expect(created.status()).toBe(201);
    const record = await created.json();
    const fetched = await (await request.get(`http://127.0.0.1:8001/api/levels/${record.id}`)).json();
    expect(fetched.level).toEqual(level);
    const result = await (await request.post(`http://127.0.0.1:8001/api/levels/${record.id}/validate`)).json();
    expect(result.status).toBe('reachable'); expect(result.verified_in_game).toBe(false);
    await page.fill('#saved-id', record.id);
    await Promise.all([page.waitForResponse(response => response.url().endsWith(`/api/levels/${record.id}`) && response.status() === 200), page.click('#load-saved')]);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(async () => (await snapshot(page))?.state).toBe('ready');
    await start(page);
    const comparison = [];
    for (const action of result.path) {
      for (const [key, down] of [['ArrowRight', action.direction === 1], ['ArrowLeft', action.direction === -1], ['Space', action.jump]] as const) {
        if (down) await page.keyboard.down(key); else await page.keyboard.up(key);
      }
      await step(page, action.frames);
      const actual = await state(page);
      comparison.push({ tick: action.tick, expected: action.expected, actual });
      expect(actual.x, `x at tick ${action.tick}`).toBeCloseTo(action.expected.x, 2);
      expect(actual.y, `y at tick ${action.tick}`).toBeCloseTo(action.expected.y, 2);
      expect(actual.state).not.toBe('dead');
    }
    await testInfo.attach('replay-positions', { body: JSON.stringify(comparison, null, 2), contentType: 'application/json' });
    expect((await state(page)).state).toBe('completed');
  });
}

test('upload mock result can be saved and played', async ({ page, request }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==', 'base64');
  const response = await request.post('http://127.0.0.1:8001/api/levels/from-sketch?mode=mock&fixture=flat', { multipart: { file: { name: 'sketch.png', mimeType: 'image/png', buffer: png } } });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.image_analyzed).toBe(false); expect(result.mode).toBe('mock');
  const record = await (await request.post('http://127.0.0.1:8001/api/levels', { data: result.level })).json();
  await page.fill('#saved-id', record.id);
  await Promise.all([page.waitForResponse(response => response.url().endsWith(`/api/levels/${record.id}`)), page.click('#load-saved')]);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.poll(async () => (await snapshot(page))?.state).toBe('ready');
  await start(page); await page.keyboard.down('d'); await step(page, 300); await page.keyboard.up('d');
  expect((await state(page)).state).toBe('completed');
});


test('measured jump rise matches the shared movement model', async ({ page }) => {
  await start(page);
  const initial = await state(page);
  await page.keyboard.down('Space'); await step(page, 24); await page.keyboard.up('Space');
  const apex = await state(page);
  expect(initial.y - apex.y).toBeCloseTo(69, 4);
  expect(apex.vy).toBe(0);
  await step(page, 30);
  expect((await state(page)).grounded).toBe(true);
});

for (const name of ['wide-gap', 'high-goal', 'blocked-jump', 'edge-vertical']) {
  test(`${name} does not get an unsupported reachability claim`, async ({ page, request }) => {
    const { readFileSync } = await import('node:fs');
    const level = JSON.parse(readFileSync(new URL(`../../contracts/examples/${name}.json`, import.meta.url), 'utf8'));
    const record = await (await request.post('http://127.0.0.1:8001/api/levels', { data: level })).json();
    const result = await (await request.post(`http://127.0.0.1:8001/api/levels/${record.id}/validate`)).json();
    expect(result.status).toBe('unknown'); expect(result.verified_in_game).toBe(false);
    await load(page, name); await start(page);
    await page.keyboard.down('d'); await step(page, 35);
    await page.keyboard.down('Space'); await step(page, 200);
    await page.keyboard.up('Space'); await page.keyboard.up('d');
    expect((await state(page)).state).not.toBe('completed');
    // A failed keyboard attempt is evidence about this attempt, not a proof.
  });
}
