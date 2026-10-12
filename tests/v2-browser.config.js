// V2 browser specs in one Playwright run (docs/v2/DEVELOPMENT_RULES.md §17, docs/v2/DEVELOPMENT_ACCELERATION.md).
//   npx playwright test --config tests/v2-browser.config.js            every tests/v2-*browser.spec.js
//   npx playwright test --config tests/v2-browser.config.js ford       only the files whose path matches "ford"
// It lives here, not at the root as playwright.config.js, so the V1 step (`npx playwright test tests/phase255-...`) is
// not touched by it. A new V2 spec is picked up by its name alone -- no workflow step to add.
// The static server: CI starts it before the V1 step and this reuses it; a local run starts it if nothing answers.
// PW_CHROMIUM_PATH points at a local Chromium when the installed Playwright has no browser of its own version.
const path = require("node:path");

const root = path.join(__dirname, "..");

module.exports = {
  testDir: __dirname,
  testMatch: /[\\/]v2-[^\\/]*browser\.spec\.js$/,
  // each spec opens its own browser context (its own IndexedDB); files run side by side, tests in a file in order
  workers: process.env.V2_BROWSER_WORKERS ? Number(process.env.V2_BROWSER_WORKERS) : process.env.CI ? 2 : undefined,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["line"], ["github"]] : [["line"]],
  use: process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {},
  webServer: {
    command: "python3 tests/support/static-server.py 4173 web",
    cwd: root,
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: true,
    // the server logs every request on stderr; a server that does not start still fails the run on `url`
    stdout: "ignore",
    stderr: "ignore",
    timeout: 20000
  }
};
