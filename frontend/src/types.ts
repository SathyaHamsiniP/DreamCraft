import type { Kind, Level } from "../../game/src/contracts";
export type { Kind, Level, LevelObject } from "../../game/src/contracts";
export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: Kind;
  reviewed: boolean;
  prediction?: { label: Kind; confidence: number };
}
export interface Candidates {
  image: { width: number; height: number; coordinates: "exif_oriented_pixels" };
  candidates: Array<
    Omit<Box, "type" | "reviewed"> & {
      predicted_class?: Kind;
      confidence?: number;
    }
  >;
  warnings: string[];
  model_status: string;
}
export interface LevelRecord {
  id: string;
  level: Level;
  created_at: string;
  updated_at: string;
}
export interface CheckResult {
  status: "reachable" | "unreachable" | "unknown";
  reason: string;
  verified_in_game: boolean;
  search: Record<string, number | boolean>;
  warnings?: string[];
  physics_version: string;
  path: unknown[] | null;
}
export interface Draft {
  boxes: Box[];
  image?: {
    url: string;
    width: number;
    height: number;
    name: string;
    file: File;
  };
  width: number;
  height: number;
  worldWidth: number;
  worldHeight: number;
  level: Level | null;
  savedId?: string;
  dirty: boolean;
  mode: "manual" | "sample" | "saved";
  stage: "edit" | "play";
}
export const emptyDraft = (): Draft => ({
  boxes: [],
  width: 960,
  height: 540,
  worldWidth: 960,
  worldHeight: 540,
  level: null,
  dirty: false,
  mode: "manual",
  stage: "edit",
});
export const symbols: {
  kind: Kind;
  icon: string;
  name: string;
  drawing: string;
}[] = [
  { kind: "platform", icon: "▰", name: "Platform", drawing: "Rectangle" },
  { kind: "coin", icon: "●", name: "Coin", drawing: "Circle" },
  { kind: "spike", icon: "▲", name: "Spike", drawing: "Triangle" },
  { kind: "spawn", icon: "S", name: "Spawn", drawing: "S" },
  { kind: "goal", icon: "G", name: "Goal", drawing: "G" },
];
