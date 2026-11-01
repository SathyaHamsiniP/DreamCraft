import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const data = mkdtempSync(join(tmpdir(), 'dreamcraft-collection-'));
export default defineConfig({
  testDir: './collection-e2e', workers: 1,
  use: { baseURL: 'http://127.0.0.1:7861', headless: true,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `${process.env.DREAMCRAFT_PYTHON || 'python3'} -m sketch.app --port 7861 --data ${data}`,
    cwd: '..', url: 'http://127.0.0.1:7861', reuseExistingServer: false,
  },
});
