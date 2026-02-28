const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    serviceWorkers: 'block'
  },
  webServer: {
    command: 'node scripts/static-server.js',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
