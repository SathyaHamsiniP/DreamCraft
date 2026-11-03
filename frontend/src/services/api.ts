import { parseLevel } from "../../../game/src/contracts";
import type {
  Candidates,
  CheckResult,
  Draft,
  Level,
  LevelRecord,
} from "../types";
export const API_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 30000);
  const abort = () => timeout.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) abort();
  try {
    const response = await fetch(API_URL + path, {
      ...init,
      signal: timeout.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(
        data?.error?.message ||
          (typeof data?.detail === "string"
            ? data.detail
            : `Request failed (${response.status}). Please try again.`),
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (timeout.signal.aborted)
      throw new Error(
        "The request was stopped or took too long. Please try again.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach the server. Check that the backend is running, then try again.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export function detect(file: File, method: string, signal?: AbortSignal) {
  const data = new FormData();
  data.append("file", file);
  return request<Candidates>(
    `/api/sketch/candidates?method=${encodeURIComponent(method)}`,
    { method: "POST", body: data, signal },
  );
}
export async function normalizedImage(file: File, signal?: AbortSignal) {
  const data = new FormData();
  data.append("file", file);
  return request<{ url: string; width: number; height: number }>(
    "/api/sketch/preview",
    { method: "POST", body: data, signal },
  );
}
export async function createLevel(draft: Draft) {
  if (!draft.image) {
    return parseLevel({
      schema_version: "1.0",
      world: { width: draft.width, height: draft.height },
      objects: draft.boxes.map(
        ({ reviewed: _, prediction: __, ...box }) => box,
      ),
    });
  }
  const result = await request<{ level: Level }>(
    "/api/sketch/reviewed-level",
    json({
      image_width: draft.width,
      image_height: draft.height,
      world_width: draft.worldWidth,
      world_height: draft.worldHeight,
      objects: draft.boxes.map(({ prediction: _, ...box }) => box),
    }),
  );
  return parseLevel(result.level);
}
function record(value: LevelRecord): LevelRecord {
  return { ...value, level: parseLevel(value.level) };
}
export const api = {
  async list(offset = 0, signal?: AbortSignal) {
    return (
      await request<LevelRecord[]>(`/api/levels?offset=${offset}`, { signal })
    ).map(record);
  },
  async get(id: string, signal?: AbortSignal) {
    return record(
      await request<LevelRecord>(`/api/levels/${encodeURIComponent(id)}`, {
        signal,
      }),
    );
  },
  async save(level: Level, id?: string) {
    return record(
      await request<LevelRecord>(
        id ? `/api/levels/${encodeURIComponent(id)}` : "/api/levels",
        json(parseLevel(level), id ? "PUT" : "POST"),
      ),
    );
  },
  check(id: string) {
    return request<CheckResult>(
      `/api/levels/${encodeURIComponent(id)}/validate`,
      { method: "POST" },
    );
  },
};
