// Browser start and EximBill login. Uses the Edge browser already installed on Windows,
// so nothing else has to be downloaded. Passwords come from framework\credentials.js
// (asked on screen at the start of a run), never from files.
const { chromium } = require('playwright');
const { settings } = require('./config');
const creds = require('./credentials');

// role = 'maker' | 'validator' | 'rfa'
async function launch(role = 'maker') {
  const browser = await chromium.launch({ channel: 'msedge', headless: !settings.showBrowser });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.__as = role;
  await signIn(page, role);
  context.setDefaultTimeout((settings.timeoutSeconds || 60) * 1000);
  return { browser, context, page };
}

// Opens the start page and logs in. Also used mid-run to get back to a clean inbox.
// Returns false when the application rejects the login (e.g. [W208] invalid credentials).
async function signIn(page, role = page.__as || 'maker') {
  const { user, password } = creds.forRole(role);
  await page.goto(settings.url);
  await page.locator('#login input[name=C_USER_ID]').waitFor();
  if (settings.businessUnit) await page.locator('#login input[name=C_BUSINESS_UNIT]').fill(settings.businessUnit);
  await page.locator('#login input[name=C_USER_ID]').fill(user);
  await page.locator('#login input[name=C_PASSWORD]').fill(password);
  await page.locator('#login input[name=C_PASSWORD]').press('Enter');
  await page.waitForFunction(() => !document.querySelector('#login input[type=password]') && document.readyState === 'complete',
    null, { timeout: 5 * 60000, polling: 2000 });
  await page.waitForTimeout(5000);
  const texts = await Promise.all(page.frames().map(f => f.locator('body').innerText().catch(() => '')));
  return !texts.some(t => /\[W208\]|Invalid login/i.test(t));
}

module.exports = { launch, signIn };
