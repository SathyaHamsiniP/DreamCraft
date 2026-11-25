import { expect, it, vi } from 'vitest';
import { verifyPlayability } from '../src/services/playability';
import { sampleLevel } from '../src/services/samples';
import type { CheckResult } from '../src/types';
const { replay } = vi.hoisted(() => ({ replay: vi.fn() }));
vi.mock('../src/services/replay', () => ({ verifyRoute: replay }));
const level = sampleLevel('flat');
const estimate: CheckResult = { status: 'reachable', reason: 'A possible path', verified_in_game: false,
  search: {}, physics_version: '1.1', path: [{ direction: 1, jump: false, frames: 100 }] };

it('verifies a proposed path only after the actual game reaches the finish', async () => {
  replay.mockResolvedValueOnce(true);
  expect(await verifyPlayability(level, estimate)).toMatchObject({ status: 'reachable', verified_in_game: true });
  expect(replay).toHaveBeenCalledWith(level, estimate.path, undefined);
});
it('reports an unknown result when a path fails in the game', async () => {
  replay.mockResolvedValueOnce(false);
  expect(await verifyPlayability(level, estimate)).toMatchObject({ status: 'unknown', verified_in_game: false });
});
it('keeps a failed game check separate from an impossible level', async () => {
  replay.mockRejectedValueOnce(new Error('Image did not load'));
  expect(await verifyPlayability(level, estimate)).toMatchObject({ status: 'unknown', verified_in_game: false });
});
it('does not claim game verification when no path can be tried', async () => {
  replay.mockClear();
  expect(await verifyPlayability(level, { ...estimate, status: 'unknown', path: null, verified_in_game: true })).toMatchObject({ status: 'unknown', verified_in_game: false });
  expect(replay).not.toHaveBeenCalled();
});
