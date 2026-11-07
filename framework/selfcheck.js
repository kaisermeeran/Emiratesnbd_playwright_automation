// SETUP-CHECK.bat: confirms this PC can run the kit (Edge, EximBill URL, login, database).
const cfg = require('./config');
const creds = require('./credentials');

const ok = m => console.log(`  [OK]   ${m}`);
const bad = m => { console.log(`  [FAIL] ${m}`); process.exitCode = 1; };

(async () => {
  console.log(`Kit folder : ${cfg.ROOT}`);
  console.log(`Environment: ${cfg.settings.environment}   URL: ${cfg.settings.url}\n`);
  ok(`Node.js ${process.version}`);
  ok(`Modules: ${cfg.modules.map(m => `${m.code}${m.enabled ? '' : ' (off)'}`).join(', ')}`);

  await creds.prepare(['maker']);
  const { chromium } = require('playwright');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    ok('Microsoft Edge starts');
  } catch (e) { bad(`Microsoft Edge does not start: ${e.message.split('\n')[0]}`); return; }
  await browser.close();

  try {
    const { launch } = require('./login');
    const s = await launch('maker');
    const texts = await Promise.all(s.page.frames().map(f => f.locator('body').innerText().catch(() => '')));
    if (texts.some(t => /\[W208\]|Invalid login/i.test(t))) bad(`EximBill login rejected for ${cfg.settings.users.maker}`);
    else ok(`EximBill login works for ${cfg.settings.users.maker}`);
    await s.browser.close();
  } catch (e) { bad(`EximBill not reachable or login failed: ${e.message.split('\n')[0]}`); }

  if (cfg.settings.database && cfg.settings.database.enabled) {
    const db = require('./db');
    try { await db.query('select 1 from dual'); ok(`Database ${cfg.settings.database.user}@${cfg.settings.database.connectString}`); }
    catch (e) { bad(`Database: ${e.message.split('\n')[0]}`); }
    await db.close();
  } else console.log('  [--]   Database checks switched off in settings.json');

  console.log(process.exitCode ? '\nSome checks failed - see HOW-TO-RUN.html, section "If something goes wrong".' : '\nAll good. You can run the sanity scripts.');
})().catch(e => { bad(e.message); });
