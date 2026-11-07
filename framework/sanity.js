// The sanity engine, split into phases so a test runner (tests\sanity.spec.js) can show each
// phase as its own test, and the command line (framework\run.js) can run them in one go.
//   1. maker      : Register One Step, maker task (template + extra fields), RFI answers, maker decision
//   2. rfa        : RFA / RFI intervene approval (falls back to the maker user if that login fails)
//   3. checkers   : authorization, one login per user in settings.json users.checkers
//                   (e.g. ANBU_VAL, then ANBU_AUTH when the first says "partially authorized")
//   4. wait       : Auto Refresh / Auto Release until Mastered
//   5. checks     : Exception, FIRCO, GAPI, Enquiry, all tabs, event wise, Mastered + Excel report
// Each phase works on all selected test cases with one login, as the bank does it by hand.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const creds = require('./credentials');
const { launch, signIn } = require('./login');
const wf = require('./wf');
const db = require('./db');
const { checkTxn, writeReport, mark } = require('./report');
const { loadCases } = require('./testdata');
const hooks = require('./hooks');

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
fs.mkdirSync(cfg.RESULTS, { recursive: true });
// The test-runner worker writes to the launcher's log (SANITY_LOG)
const logFile = process.env.SANITY_LOG || path.join(cfg.RESULTS, `run-${cfg.settings.environment}-${stamp}.log`);
const log = (...a) => {
  const line = `${new Date().toTimeString().slice(0, 8)} ${a.join(' ')}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
};

const IGNORE = ['TBMLMaker', 'FileLibrary', 'Dispatchlibrarian', 'AutoRefresh', 'AutoRelease'];
const openTasks = async ref => (await db.tasks(ref)).filter(t => !IGNORE.includes(t[0]));
const roleOf = t => /^Authorization$/.test(t[2]) ? 'checker' : /^RFA/.test(t[2]) ? 'rfa' : 'maker';
const kind = role => role.replace(/\d+$/, '');   // checker1, checker2 -> checker

// Which test cases: ALL, module codes (IPLC), test ids from the test data (IPLC-02),
// or CODE=REFERENCE to continue / re-check an existing transaction.
async function selectCases(args) {
  if (!args.length) throw new Error('Give a module code (IPLC, EPLC, IMCO, EXCO, GTEE, IWGT), a test id, or ALL');
  const all = await loadCases();
  const cases = [];
  for (const a of args) {
    const [key, ref] = a.split('=');
    const K = key.toUpperCase();
    if (ref) {
      const m = cfg.module(K);
      if (!m) throw new Error(`No modules\\${K}.json`);
      cases.push({ ...m, id: `${K}-${ref}`, run: true, ref });
    } else if (K === 'ALL') cases.push(...all.filter(c => c.run && c.enabled));
    else {
      const byId = all.filter(c => c.id.toUpperCase() === K);
      const byModule = all.filter(c => c.code === K && c.run);
      const pick = byId.length ? byId : byModule;
      if (!pick.length) throw new Error(`No test case for "${key}" (check Run = Y in the test data)`);
      for (const c of pick) {
        if (!c.enabled) log(`${c.id}: module ${c.code} is switched off in modules\\${c.file} - ${c.notes || ''}`);
        else cases.push(c);
      }
    }
  }
  return cases;
}

// Passwords (asked on screen, or from environment variables in a test-runner worker)
async function prepare() {
  if (!db.enabled()) throw new Error('The workflow run needs the database (settings.json > database > enabled = true)');
  if (!creds.checkerRoles().length) throw new Error('settings.json users.checkers is empty');
  await creds.prepare(['maker', 'rfa', ...creds.checkerRoles()]);
}

// One browser + login for a whole phase
async function session(role, work) {
  let { browser, page } = await launch(role);
  const texts = await Promise.all(page.frames().map(f => f.locator('body').innerText().catch(() => '')));
  if (texts.some(t => /\[W208\]|Invalid login/i.test(t))) {
    if (role !== 'rfa' || !cfg.settings.rfaFallbackToMaker) throw new Error(`login failed for ${creds.userOf(role)} (${role})`);
    log(`[rfa] ${cfg.settings.users.rfa} cannot log in, using ${cfg.settings.users.maker} instead`);
    await browser.close();
    ({ browser, page } = await launch('maker'));
  }
  page.on('dialog', d => { log(`[${role}] message:`, d.message().split('\n')[0]); d.accept().catch(() => {}); });
  try { await work(page); } finally { await browser.close(); }
}

// Works every task that belongs to `role` on the case's txn until none is left (max 6 rounds).
// A checker approves only once per transaction; the next checker login does the next level.
async function drain(page, role, c) {
  const ref = c.ref;
  for (let i = 0; i < (kind(role) === 'checker' ? 1 : 6); i++) {
    const t = (await openTasks(ref)).find(x => roleOf(x) === kind(role));
    if (!t) return;
    const [id, name, type] = t;
    log(`[${role}] ${c.id} ${ref}: ${name} (${type})`);
    try {
      await wf.openTask(page, ref, name, c.code);
      const task = { id, name, type };
      await hooks.run('beforeTask', { page, c, task, role, log });
      let res;
      if (/^RF[IA]/.test(type)) {
        await hooks.run('beforeConfirm', { page, c, task, role, log });
        res = await wf.answerReferrals(page, c.referralComment || 'Automated sanity check');
      } else if (type === 'Authorization') {
        const txt = (await wf.frame(page, 'work').locator('body').innerText()).replace(/\s+/g, ' ');
        if (/no record/i.test(txt)) { log('   authorization screen shows "no record"'); c.problems.push(`${name}: no record`); return; }
        await hooks.run('beforeConfirm', { page, c, task, role, log });
        res = await wf.makerConfirm(page);
      } else {
        if (id !== 'MakerDecision' && c.template) await wf.loadTemplate(page, c.template);
        for (const [n, v] of Object.entries(id !== 'MakerDecision' && c.fill || {})) {
          await wf.frame(page, 'work').locator(`[name="${n}"]`).first().evaluate((e, val) => {
            e.value = val; e.dispatchEvent(new Event('change', { bubbles: true }));
          }, v);
        }
        await hooks.run('beforeConfirm', { page, c, task, role, log });
        res = await wf.makerConfirm(page, c.defaults || {});
      }
      await hooks.run('afterTask', { page, c, task, role, log, result: res });
      if (res.errors.length) { log('   screen errors:', res.errors.join(' | ')); c.problems.push(`${name}: ${res.errors.join(' | ')}`); }
    } catch (e) {
      const msg = e.message.split('\n')[0];
      log(`   ERROR ${msg}`);
      c.problems.push(`${name}: ${msg}`);
      const shot = path.join(cfg.RESULTS, `error-${c.id}-${name.replace(/\W+/g, '_')}.png`);
      await page.screenshot({ path: shot }).then(() => c.screenshots.push(shot)).catch(() => {});
      return;
    }
    await page.waitForTimeout(5000);
  }
}

const phases = {
  async maker(cases) {
    cases.forEach(c => { c.problems ||= []; c.screenshots ||= []; });
    await session('maker', async page => {
      for (const c of cases) {
        if (c.ref) { c.created ||= { ok: true, note: 'existing ref' }; continue; }
        try {
          await signIn(page, 'maker');
          c.amount = c.amountFrom + Math.floor(Math.random() * (c.amountTo - c.amountFrom));
          const r = await wf.register(page, c);
          await hooks.run('beforeRegisterConfirm', { page, c, role: 'maker', log });
          await wf.confirm(page);
          c.ref = r.mainRef;
          c.created = r.mainRef ? { ok: true, note: r.mainRef } : { ok: false, note: 'no reference shown' };
          log(`[maker] ${c.id}: registered ${c.code} ${r.mainRef} (${r.wfRef}) amount ${c.amount}`);
          await hooks.run('afterRegister', { page, c, role: 'maker', log });
        } catch (e) {
          c.created = { ok: false, note: e.message.split('\n')[0] };
          log(`[maker] ${c.id}: registration failed: ${c.created.note}`);
          const shot = path.join(cfg.RESULTS, `error-${c.id}-register.png`);
          await page.screenshot({ path: shot }).then(() => c.screenshots.push(shot)).catch(() => {});
        }
      }
      for (const c of cases) if (c.ref) await drain(page, 'maker', c);
    });
  },

  async rfa(cases) {
    await session('rfa', async page => { for (const c of cases.filter(x => x.ref)) await drain(page, 'rfa', c); });
  },

  async checker(cases, role) {
    await session(role, async page => { for (const c of cases.filter(x => x.ref)) await drain(page, role, c); });
  },

  // Some flows raise a task again after another phase: one more pass each, same order
  async extraPasses(cases) {
    const live = cases.filter(c => c.ref);
    for (const role of ['rfa', ...creds.checkerRoles()]) {
      let pending = false;
      for (const c of live) if ((await openTasks(c.ref)).some(t => roleOf(t) === kind(role))) pending = true;
      if (pending) {
        log(`== extra pass: ${role}`);
        await session(role, async page => { for (const c of live) await drain(page, role, c); });
      }
    }
  },

  async waitMastered(cases) {
    const live = cases.filter(c => c.ref);
    const minutes = cfg.settings.waitForMasteredMinutes || 10;
    log(`== waiting for Auto Release / Mastered (up to ${minutes} min)`);
    for (let i = 0; i < minutes * 2; i++) {
      let pending = 0;
      for (const c of live) {
        const st = await db.master(c.code, c.ref);
        if ((!st || st.status !== 'M') && !(await db.exceptions(c.ref)).length) pending++;
      }
      if (!pending) break;
      await new Promise(r => setTimeout(r, 30000));
    }
  },

  // Runs the checks for every case, writes the Excel file, returns { rows, file }
  async checks(cases) {
    const rows = [];
    await session('maker', async page => {
      for (const c of cases) {
        const checks = c.ref ? await checkTxn(page, c, c.ref) : {};
        const left = c.ref ? (await openTasks(c.ref)).map(t => t[1]) : [];
        rows.push({ id: c.id, code: c.code, ref: c.ref, amount: c.amount, created: c.created || { ok: false, note: 'not created' },
          checks, remarks: c.remarks, openTasks: left, problems: c.problems || [], screenshots: c.screenshots || [] });
        await hooks.run('afterChecks', { page, c, role: 'maker', log, row: rows[rows.length - 1] });
        log(`${c.id} ${c.ref || '-'}: ${Object.entries(checks).map(([k, v]) => `${k}=${mark(v)}`).join(' ')}${left.length ? '  open tasks: ' + left.join(', ') : ''}`);
      }
    });
    const file = await writeReport(rows, stamp);
    log(`RESULT FILE: ${file}`);
    return { rows, file };
  },
};

// Everything in one go (command line)
async function runSanity(cases) {
  log(`Sanity run on ${cfg.settings.environment}: ${cases.map(c => c.id).join(', ')}   log: ${logFile}`);
  log('== phase 1: maker'); await phases.maker(cases);
  log('== phase 2: rfa'); await phases.rfa(cases);
  for (const role of creds.checkerRoles()) { log(`== phase 3: checker ${creds.userOf(role)}`); await phases.checker(cases, role); }
  await phases.extraPasses(cases);
  await phases.waitMastered(cases);
  log('== checks and enquiry');
  return phases.checks(cases);
}

module.exports = { selectCases, prepare, phases, runSanity, log, logFile, stamp, creds, db, mark };
