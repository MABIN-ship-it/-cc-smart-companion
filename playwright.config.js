const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
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
