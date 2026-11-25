import { request } from './api';
import type { Candidates, CheckResult, Level, LevelObject } from '../types';
export interface Generation extends Omit<Candidates, 'candidates'> {
  status: 'needs_correction' | 'awaiting_phaser' | 'verified' | 'replay_failed';
  candidates: (Candidates['candidates'][number] & { chosen_type?: LevelObject['type']; needs_correction?: boolean; ignored_by_user?: boolean })[];
  issues: { id: string | null; message: string }[];
  level: Level | null;
  original_level: Level | null;
  assessment: CheckResult | null;
  changes: { kind: string; reason: string; before: LevelObject | null; after: LevelObject }[];
  stages: string[];
  attempts: { change: string; status: string }[];
}
export function generateGame(file: File, corrections: Record<string, string>, repairs: boolean, signal: AbortSignal) {
  const data = new FormData();
  data.append('file', file); data.append('corrections', JSON.stringify(corrections)); data.append('allow_repairs', String(repairs));
  return request<Generation>('/api/sketch/generate', { method: 'POST', body: data, signal });
}
