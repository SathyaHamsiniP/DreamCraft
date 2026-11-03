import { expect, it } from "vitest";
import { developmentServer } from "../dev-server";

it("forwards API calls to the local backend without opening external hosts", () => {
  const config = developmentServer({});
  expect(config.allowedHosts).toEqual([]);
  expect(config.proxy?.["/api"]).toEqual({
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
  });
});

it("allows only the current Codespace frontend host and supports another backend port", () => {
  const config = developmentServer({
    CODESPACE_NAME: "my-space-123",
    GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
    DREAMCRAFT_API_PROXY_TARGET: "http://127.0.0.1:8002",
  });
  expect(config.allowedHosts).toEqual(["my-space-123-5174.app.github.dev"]);
  expect(config.proxy?.["/api"]).toEqual({
    target: "http://127.0.0.1:8002",
    changeOrigin: true,
  });
});
