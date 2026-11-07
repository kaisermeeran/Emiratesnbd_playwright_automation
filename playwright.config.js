// Playwright Test configuration for the EximBill sanity kit.
// Start runs with the RUN-xxxx.bat files (they ask for passwords first), or for a recorded test:
//   node\node.exe node_modules\@playwright\test\cli.js test tests\recorded\<name>.spec.js
const { defineConfig } = require('@playwright/test');
const { settings } = require('./framework/config');

module.exports = defineConfig({
  testDir: './tests',
  outputDir: './results/test-output',
  workers: 1,                       // one EximBill session at a time
  fullyParallel: false,
  retries: 0,
  timeout: 60 * 60 * 1000,          // a sanity phase can take long (auto release, slow screens)
  expect: { timeout: 30 * 1000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './results/html-report', open: 'never' }],
  ],
  use: {
    channel: 'msedge',              // the Edge browser already on the PC
    headless: !settings.showBrowser,
    baseURL: settings.url,
    viewport: { width: 1600, height: 1000 },
    actionTimeout: (settings.timeoutSeconds || 60) * 1000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',     // step-by-step replay of a failed recorded test in the report
  },
});
