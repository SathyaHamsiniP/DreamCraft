import { test, expect } from '@playwright/test';
import { join } from 'node:path';

for (const name of ['scene.png', 'small.png', 'scene.jpg', 'portrait.png']) {
  test(`real OpenCV and test CNN create a Phaser-verified game from ${name}`, async ({ page, request }) => {
    await page.goto('/studio');
    await expect(page.getByRole('button', { name: 'Generate My Game' })).toBeDisabled();
    await expect(page.getByLabel('Object type')).toHaveCount(0);
    await expect(page.getByLabel('World width')).toHaveCount(0);
    await page.getByLabel('Upload drawing').setInputFiles(join(process.env.DREAMCRAFT_AUTO_FIXTURES!, name));
    const generated = page.waitForResponse(r => r.url().endsWith('/api/sketch/generate'));
    await page.getByRole('button', { name: 'Generate My Game' }).click();
    const result = await (await generated).json();
    expect(result.model_status).toBe('ran');
    expect(result.status).toBe('awaiting_phaser');
    expect(result.candidates).toHaveLength(5);
    expect(new Set(result.candidates.map((c: { predicted_class: string }) => c.predicted_class)).size).toBe(5);
    expect(result.assessment.verified_in_game).toBe(false);
    await expect(page.getByText('An automatic test reached the finish in the game.')).toBeVisible();
    await expect(page.getByTestId('game-state')).toHaveText('ready');
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => {
      const text = await page.getByLabel('Player position', { exact: true }).textContent();
      return Number(/X (\d+)/.exec(text || '')?.[1] || 0);
    }).toBeGreaterThan(120);
    await expect.poll(async () => {
      const text = await page.getByLabel('Player position', { exact: true }).textContent();
      return Number(/X (\d+)/.exec(text || '')?.[1] || 0);
    }, { intervals: [16] }).toBeGreaterThan(name === 'portrait.png' ? 290 : 510);
    await page.keyboard.down('Space');
    await expect(page.getByTestId('game-state')).toHaveText('completed', { timeout: 10000 });
    await page.keyboard.up('Space'); await page.keyboard.up('ArrowRight');
    await page.getByRole('button', { name: 'Save level', exact: true }).click();
    await expect(page.getByText('Your game is saved.')).toBeVisible();
    const records = await (await request.get('http://127.0.0.1:8015/api/levels')).json();
    expect(records.some((r: { level: unknown }) => JSON.stringify(r.level) === JSON.stringify(result.level))).toBe(true);
    await page.reload();
    await page.getByRole('link', { name: 'My Levels', exact: true }).click();
    await page.getByRole('link', { name: 'Open, edit & play →' }).first().click();
    await expect(page.getByTestId('game-state')).toHaveText('ready');
  });
}

test('blank and touching drawings do not produce fake playable games', async ({ page }) => {
  await page.goto('/studio');
  await page.getByLabel('Upload drawing').setInputFiles(join(process.env.DREAMCRAFT_AUTO_FIXTURES!, 'blank.png'));
  await page.getByRole('button', { name: 'Generate My Game' }).click();
  await expect(page.getByText(/No drawings were found/)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByLabel('Upload drawing').setInputFiles(join(process.env.DREAMCRAFT_AUTO_FIXTURES!, 'touching.png'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Generate My Game' }).click();
  await expect(page.getByRole('heading', { name: 'A little help is needed' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Advanced Edit', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Object editor' })).toBeVisible();
});

test('a small bridge is logged, rechecked and verified in real Phaser', async ({ page }) => {
  await page.goto('/studio');
  await page.getByLabel('Upload drawing').setInputFiles(join(process.env.DREAMCRAFT_AUTO_FIXTURES!, 'gap.png'));
  await page.getByLabel(/Allow small repairs/).uncheck();
  await page.getByRole('button', { name: 'Generate My Game' }).click();
  await expect(page.getByRole('heading', { name: 'A little help is needed' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByLabel(/Allow small repairs/).check();
  const generated = page.waitForResponse(r => r.url().endsWith('/api/sketch/generate'));
  await page.getByRole('button', { name: 'Generate My Game' }).click();
  const result = await (await generated).json();
  expect(result.changes.some((c: { kind: string }) => c.kind === 'add_bridge')).toBe(true);
  expect(result.attempts).toHaveLength(2);
  expect(result.original_level.objects.some((o: { id: string }) => o.id === 'auto_bridge')).toBe(false);
  await expect(page.getByText('An automatic test reached the finish in the game.')).toBeVisible();
  await expect(page.getByText(/small automatic adjustments were applied/)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Advanced Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: /Select object/ })).toHaveCount(result.level.objects.length);
  await page.getByRole('button', { name: 'Select object 2: spawn', exact: true }).locator('rect').first().click();
  await expect(page.getByLabel('Y', { exact: true })).toHaveValue(String(result.level.objects.find((o: { type: string }) => o.type === 'spawn').y));
});

test('a confidently recognized high goal is reported as unreachable without a game', async ({ page }) => {
  await page.goto('/studio');
  await page.getByLabel('Upload drawing').setInputFiles(join(process.env.DREAMCRAFT_AUTO_FIXTURES!, 'high.png'));
  const generated = page.waitForResponse(r => r.url().endsWith('/api/sketch/generate'));
  await page.getByRole('button', { name: 'Generate My Game' }).click();
  const result = await (await generated).json();
  expect(result.model_status).toBe('ran');
  expect(result.assessment.status).toBe('unreachable');
  expect(result.assessment.verified_in_game).toBe(false);
  await expect(page.getByRole('heading', { name: 'This level needs a change' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('only unclear drawings need a quick correction before real generation', async ({ page }) => {
  await page.goto('/studio');
  await page.getByLabel('Upload drawing').setInputFiles(join(process.env.DREAMCRAFT_AUTO_FIXTURES!, 'large.png'));
  const pending = page.waitForResponse(r => r.url().endsWith('/api/sketch/generate'));
  await page.getByRole('button', { name: 'Generate My Game' }).click();
  const result = await (await pending).json();
  expect(result.status).toBe('needs_correction');
  const uncertain = result.candidates.filter((c: { needs_correction?: boolean }) => c.needs_correction);
  expect(uncertain.length).toBeGreaterThan(0); expect(uncertain.length).toBeLessThan(5);
  for (const c of uncertain) {
    const x = c.x/1.5;
    const label = c.width/1.5 > 800 ? 'platform' : x < 100 ? 'spawn' : x < 400 ? 'coin' : x < 700 ? 'spike' : 'goal';
    await page.getByLabel(`Correct ${c.id}`, { exact: true }).selectOption(label);
  }
  await page.getByRole('button', { name: 'Generate My Game' }).click();
  await expect(page.getByText('An automatic test reached the finish in the game.')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('I reviewed this object')).toHaveCount(0);
});

test('an attached tall spike is separated automatically and cleared by one jump', async ({ page }) => {
  await page.goto('/studio');
  await page.getByLabel('Upload drawing').setInputFiles(join(process.env.DREAMCRAFT_AUTO_FIXTURES!, 'supported-spike.png'));
  const generated=page.waitForResponse(r=>r.url().endsWith('/api/sketch/generate'));
  await page.getByRole('button',{name:'Generate My Game'}).click();
  const result=await (await generated).json();
  expect(result.status).toBe('awaiting_phaser');
  expect(result.issues).toEqual([]);
  expect(result.candidates).toHaveLength(5);
  expect(result.candidates.some((c: {separation?:string})=>c.separation==='triangle_on_platform')).toBe(true);
  const hazard=result.level.objects.find((o:{type:string})=>o.type==='spike');
  expect(hazard.height).toBeLessThanOrEqual(24); expect(hazard.width).toBeLessThanOrEqual(48);
  expect(result.changes.some((c:{kind:string})=>c.kind==='fit_hazard')).toBe(true);
  await expect(page.getByText('An automatic test reached the finish in the game.')).toBeVisible();
  await expect(page.getByLabel(/Correct candidate/)).toHaveCount(0);
  await page.getByRole('button',{name:'Start game',exact:true}).click();
  await page.locator('canvas').screenshot({path:'/tmp/dreamcraft-neon-runner.png'});
  await page.keyboard.down('ArrowRight');
  await expect.poll(async()=>{
    const text=await page.getByLabel('Player position',{exact:true}).textContent();
    return Number(/X (\d+)/.exec(text||'')?.[1]||0);
  },{intervals:[16]}).toBeGreaterThan(510);
  await page.keyboard.press('Space',{delay:60});
  await expect(page.getByTestId('game-state')).toHaveText('completed',{timeout:10000});
  await page.keyboard.up('ArrowRight');
});
