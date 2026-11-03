import { afterEach, expect, it, vi } from "vitest";
import { api, createLevel, detect, request } from "../src/services/api";
import { sampleLevel } from "../src/services/samples";
import { fromLevel } from "../src/state";
afterEach(() => vi.unstubAllGlobals());
it("uses multipart for detection and reports backend errors", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: { message: "Bad image" } }), {
      status: 422,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(detect(new File(["x"], "x.png"), "adaptive")).rejects.toThrow(
    "Bad image",
  );
  expect(fetch.mock.calls[0][1].body).toBeInstanceOf(FormData);
});
it("handles network failures and cancellation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));
  await expect(request("/x")).rejects.toThrow("Cannot reach");
  const abort = new AbortController();
  abort.abort();
  await expect(request("/x", { signal: abort.signal })).rejects.toThrow(
    "stopped",
  );
});
it("posts and updates valid level documents and validates loaded data", async () => {
  const level = sampleLevel("flat"),
    saved = { id: "saved", level, created_at: "today", updated_at: "today" };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(saved)));
  vi.stubGlobal("fetch", fetch);
  expect((await api.save(level)).id).toBe("saved");
  expect(fetch.mock.calls[0][1].method).toBe("POST");
  fetch.mockResolvedValue(new Response(JSON.stringify(saved)));
  await api.save(level, "saved");
  expect(fetch.mock.calls[1][1].method).toBe("PUT");
  fetch.mockResolvedValue(
    new Response(JSON.stringify({ ...saved, level: { bad: true } })),
  );
  await expect(api.get("saved")).rejects.toThrow("schema");
});
it("sends reviewed image coordinates without converting them in React", async () => {
  const level = sampleLevel("flat"),
    draft = fromLevel(level);
  draft.image = {
    url: "data:image/png;base64,x",
    width: 960,
    height: 540,
    name: "x",
    file: new File(["x"], "x.png"),
  };
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ level })));
  vi.stubGlobal("fetch", fetch);
  await createLevel(draft);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.image_width).toBe(960);
  expect(body.objects[1].reviewed).toBe(true);
  expect(body.objects[1].x).toBe(level.objects[1].x);
});
