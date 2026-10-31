import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const database = join(mkdtempSync(join(tmpdir(), 'dreamcraft-e2e-')), 'levels.sqlite3');
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: [
    { command: 'npm run dev -- --port 5173', env: { VITE_API_URL: 'http://127.0.0.1:8001' }, url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
    { command: `${process.env.DREAMCRAFT_PYTHON || 'python3'} -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001`, cwd: '..', url: 'http://127.0.0.1:8001/api/health', env: { DREAMCRAFT_DB: database }, reuseExistingServer: false },
  ],
});
