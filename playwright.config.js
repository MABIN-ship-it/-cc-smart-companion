import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results.json' }],
  ],
  use: {
    screenshot: 'on',
    video: 'off',
  },
});
