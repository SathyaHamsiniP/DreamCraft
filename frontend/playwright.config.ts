import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const database = join(
  mkdtempSync(join(tmpdir(), "dreamcraft-react-")),
  "levels.sqlite3",
);
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: [
    {
      command: "npm run dev -- --strictPort",
      url: "http://127.0.0.1:5174",
      env: { VITE_API_URL: "http://127.0.0.1:8002" },
      reuseExistingServer: false,
    },
    {
      command: `${process.env.DREAMCRAFT_PYTHON || "python3"} -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8002`,
      cwd: "..",
      url: "http://127.0.0.1:8002/api/health",
      env: { DREAMCRAFT_DB: database },
      reuseExistingServer: false,
    },
  ],
});
