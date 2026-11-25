import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = process.env.DREAMCRAFT_AUTO_FIXTURES || mkdtempSync(join(tmpdir(), 'dreamcraft-auto-'));
process.env.DREAMCRAFT_AUTO_FIXTURES = directory;
export default defineConfig({
  testDir: './auto-e2e', workers: 1, timeout: 45000, expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:5175', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: [
    { command: 'npm run dev -- --port 5175 --strictPort', url: 'http://127.0.0.1:5175',
      env: { VITE_API_URL: '', DREAMCRAFT_API_PROXY_TARGET: 'http://127.0.0.1:8015' }, reuseExistingServer: false },
    { command: `${process.env.DREAMCRAFT_PYTHON || 'python3'} -m sketch.tests.automatic_fixture --output ${directory} --serve 8015`,
      cwd: '..', url: 'http://127.0.0.1:8015/api/health', env: { OMP_NUM_THREADS: '2', MKL_NUM_THREADS: '2' }, reuseExistingServer: false },
  ],
});
