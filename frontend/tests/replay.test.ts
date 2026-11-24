import { expect, it, vi } from 'vitest';
import { verifyRoute } from '../src/services/replay';
import { sampleLevel } from '../src/services/samples';
const { mountGame } = vi.hoisted(() => ({ mountGame: vi.fn() }));
vi.mock('../src/services/game', () => ({ loadEngine: async () => ({ mountGame }) }));

it('rejects invalid routes before starting Phaser', async () => {
  await expect(verifyRoute(sampleLevel('flat'), [{ direction: 9, jump: false, frames: 1 }])).rejects.toThrow('game check could not be completed');
  expect(mountGame).not.toHaveBeenCalled();
});

it.each([true, false])('reports the actual completion flag and destroys the replay: %s', async won => {
  const destroy = vi.fn();
  let state = 'ready';
  const step = vi.fn(() => { state = won ? 'completed' : 'dead'; });
  mountGame.mockReturnValue({ snapshot: () => ({ state }), start: vi.fn(), step, destroy });
  expect(await verifyRoute(sampleLevel('flat'), [{ direction: 1, jump: false, frames: 10 }])).toBe(won);
  expect(step).toHaveBeenCalledWith(10, { direction: 1, jump: false, frames: 10 });
  expect(destroy).toHaveBeenCalledOnce();
  expect(document.querySelector('[style*="-10000px"]')).toBeNull();
});
