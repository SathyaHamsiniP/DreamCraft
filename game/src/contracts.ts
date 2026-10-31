import Ajv from 'ajv';
import schema from '../../contracts/level.schema.json';
import physics from '../../contracts/physics.json';

export const PHYSICS = physics;
export type Kind = 'platform' | 'coin' | 'spike' | 'spawn' | 'goal';
export interface LevelObject { id: string; type: Kind; x: number; y: number; width: number; height: number; recognition?: Record<string, unknown> }
export interface Level { schema_version: '1.0'; world: { width: number; height: number }; objects: LevelObject[]; recognition?: Record<string, unknown> }
const validate = new Ajv({ strict: false, strictNumbers: true }).compile<Level>(schema);
export function overlaps(a: Pick<LevelObject, 'x' | 'y' | 'width' | 'height'>, b: Pick<LevelObject, 'x' | 'y' | 'width' | 'height'>): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === 'object') return Object.values(value).every(finite);
  return true;
}
export function parseLevel(value: unknown): Level {
  if (!finite(value) || !validate(value)) throw new Error('Level does not match schema 1.0');
  const level = value;
  const objects = level.objects;
  if (new Set(objects.map(o => o.id)).size !== objects.length) throw new Error('Object IDs must be unique');
  for (const kind of ['spawn', 'goal']) {
    if (objects.filter(o => o.type === kind).length !== 1) throw new Error(`Level needs exactly one ${kind}`);
  }
  if (objects.some(o => o.x + o.width > level.world.width || o.y + o.height > level.world.height)) throw new Error('Objects must stay inside the world');
  const spawn = objects.find(o => o.type === 'spawn')!;
  const goal = objects.find(o => o.type === 'goal')!;
  if (spawn.width !== physics.player_width || spawn.height !== physics.player_height) throw new Error('Spawn dimensions must match the player dimensions');
  const platforms = objects.filter(o => o.type === 'platform');
  if (platforms.some((p, i) => platforms.slice(i + 1).some(q => overlaps(p, q)))) throw new Error('Solid platforms must not overlap');
  if (objects.some(o => ['platform', 'spike', 'goal'].includes(o.type) && overlaps(spawn, o))) throw new Error('Spawn must not overlap a platform, spike or goal');
  if (platforms.some(p => overlaps(goal, p))) throw new Error('Goal must not overlap a solid platform');
  return structuredClone(level);
}
