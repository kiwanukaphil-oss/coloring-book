const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  // 1 retry catches transient ERR_CONNECTION_FAILED from the static server under
  // burst load (10 parallel workers). Tests with genuine failures still fail
  // on the retry, so this does not mask real regressions.
  retries: 1,
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
