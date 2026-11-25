import type { CheckResult, Level } from '../types';
import { verifyRoute } from './replay';

export async function verifyPlayability(level: Level, result: CheckResult, signal?: AbortSignal): Promise<CheckResult> {
  if (result.status !== 'reachable' || !result.path?.length) return { ...result, verified_in_game: false };
  try {
    const won = await verifyRoute(level, result.path, signal);
    return { ...result, status: won ? 'reachable' : 'unknown', verified_in_game: won,
      reason: won ? 'Try the jumps yourself to see how they feel.'
        : 'The suggested path did not reach the finish when tested in the game. Try playing it yourself or change the layout.' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...result, status: 'unknown', verified_in_game: false,
      reason: 'The game test could not finish. Please check the level again.' };
  }
}
