import type { Level } from '../types';
import { loadEngine } from './game';
export interface RouteAction { direction: number; jump: boolean; frames: number }

// This uses the same Arcade scene as the player. It does not change the open level.
export async function verifyRoute(level: Level, path: RouteAction[]) {
  if (!path.length || path.length > 3600 || path.reduce((n, a) => n + a.frames, 0) > 3600 ||
      path.some(a => ![-1, 0, 1].includes(a.direction) || typeof a.jump !== 'boolean' || !Number.isInteger(a.frames) || a.frames < 1))
    throw new Error('The checker returned an invalid replay route.');
  const parent = document.createElement('div');
  parent.style.cssText = 'position:fixed;left:-10000px;width:960px;height:540px';
  document.body.append(parent);
  let game: ReturnType<(Awaited<ReturnType<typeof loadEngine>>)['mountGame']> | undefined;
  try {
    const { mountGame } = await loadEngine();
    game = mountGame(parent, level, { manual: true, keyboardTarget: parent });
    const deadline = performance.now() + 10000;
    while (!game.snapshot()) {
      if (performance.now() > deadline) throw new Error('Phaser replay could not start.');
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    game.start();
    for (const a of path) game.step(a.frames, a);
    return game.snapshot()?.state === 'completed';
  } finally { game?.destroy(); parent.remove(); }
}
