const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  // Electron 应用限制单实例
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results.json' }],
    ['html', { outputFolder: 'e2e/html-report', open: 'never' }],
  ],
  use: {
    screenshot: 'on',
    video: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.js',
    },
  ],
});
