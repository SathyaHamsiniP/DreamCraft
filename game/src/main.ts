import { mountGame, GameHandle } from './engine';
const examples = import.meta.glob('../../contracts/examples/*.json', { eager: true, import: 'default' });
const levels: Record<string, unknown> = {};
for (const [path, data] of Object.entries(examples)) {
  const name = path.split('/').pop()!.replace('.json', '');
  if (!name.startsWith('invalid-')) levels[name] = data;
}
const select = document.querySelector<HTMLSelectElement>('#level')!;
for (const name of Object.keys(levels).sort()) select.add(new Option(name, name));
select.value = 'flat';
const status = document.querySelector<HTMLElement>('#status')!;
const handle = mountGame(document.querySelector<HTMLElement>('#game')!, levels.flat, {
  manual: new URLSearchParams(location.search).get('test') === '1',
  onEvent: event => { status.textContent = `${event.state} · coins: ${event.score}${event.state === 'dead' ? ' · press R to restart' : ''}`; },
});
function load(data: unknown) {
  try { handle.loadLevel(data); }
  catch (error) { status.textContent = `Cannot load level: ${(error as Error).message}`; }
}
document.querySelector('#load')!.addEventListener('click', () => load(levels[select.value]));
document.querySelector<HTMLInputElement>('#file')!.addEventListener('change', async event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 200_000) { status.textContent = 'Level file is too large'; return; }
  try { load(JSON.parse(await file.text())); } catch { status.textContent = 'Cannot read level JSON'; }
});
if (new URLSearchParams(location.search).get('test') === '1') (window as unknown as { dreamcraft: GameHandle }).dreamcraft = handle;
window.addEventListener('pagehide', () => handle.destroy(), { once: true });

const api = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
document.querySelector('#load-saved')!.addEventListener('click', async () => {
  const id = document.querySelector<HTMLInputElement>('#saved-id')!.value.trim();
  if (!id || id.length > 80) { status.textContent = 'Enter a saved level ID'; return; }
  try {
    const response = await fetch(`${api}/api/levels/${encodeURIComponent(id)}`);
    const record = await response.json();
    if (!response.ok) throw new Error(record.error?.message || 'Cannot retrieve level');
    load(record.level);
  } catch (error) { status.textContent = `Cannot load saved level: ${(error as Error).message}`; }
});
