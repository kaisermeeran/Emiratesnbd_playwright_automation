// EximBill sanity as Playwright tests.
// The phases run in order, each with one login for all selected test cases (as done by hand):
//   1 maker  ->  2 RFA  ->  3 checker(s)  ->  4 wait for Mastered  ->  5 checks + Excel
// then one test per transaction with the sanity-sheet checks as assertions.
// The cases are chosen by framework\test-launch.js (RUN-xxxx.bat), which writes them to
// results\.selected-cases.json before starting this file.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { RESULTS } = require('../framework/config');

const selected = path.join(RESULTS, '.selected-cases.json');
const cases = fs.existsSync(selected) ? JSON.parse(fs.readFileSync(selected, 'utf8')) : [];

test.describe.configure({ mode: 'serial' });   // a failed phase stops the rest of this run
test.use({ trace: 'off', screenshot: 'off' });  // the sanity steps use their own browsers; screenshots are attached per case

test.describe(`EximBill sanity: ${cases.map(c => c.id).join(', ') || 'no cases'}`, () => {
  let s, report;

  test.beforeAll(async () => {
    test.skip(!cases.length, 'Start the run with a RUN-xxxx.bat file (no cases selected)');
    s = require('../framework/sanity');
    await s.prepare();                          // passwords come from the launcher
  });

  test.afterAll(async () => { if (s) await s.db.close(); });

  test('1. Maker: register + maker / RFI / maker decision', async () => {
    await s.phases.maker(cases);
    const failed = cases.filter(c => !c.created || c.created.ok === false);
    expect(failed.map(c => `${c.id}: ${c.created && c.created.note}`), 'registration').toEqual([]);
  });

  test('2. RFA / RFI intervene approval', async () => {
    await s.phases.rfa(cases);
  });

  test('3. Checker authorization (each checker in settings.json)', async () => {
    for (const role of s.creds.checkerRoles()) {
      await test.step(`checker ${s.creds.userOf(role)}`, () => s.phases.checker(cases, role));
    }
    await test.step('extra passes for tasks raised late', () => s.phases.extraPasses(cases));
  });

  test('4. Wait for Auto Release / Mastered', async () => {
    await s.phases.waitMastered(cases);
  });

  test('5. Checks, enquiry and Excel report', async ({}, info) => {
    report = await s.phases.checks(cases);
    await info.attach('sanity-report.xlsx', { path: report.file });
    await info.attach('run.log', { path: s.logFile, contentType: 'text/plain' });
  });

  // One test per transaction: every sanity-sheet column that is "Not OK" fails it.
  for (const c of cases) {
    test(`${c.id} (${c.code}) sanity result`, async ({}, info) => {
      const row = report && report.rows.find(r => r.id === c.id);
      expect(row, 'checks did not run').toBeTruthy();
      info.annotations.push({ type: 'transaction', description: row.ref || '-' });
      for (const shot of row.screenshots) await info.attach(path.basename(shot), { path: shot });
      expect.soft(row.created.ok, `Created: ${row.created.note}`).not.toBe(false);
      const names = { exception: 'Exception', firco: 'Compliance FIRCO', gapi: 'GAPI trigger', enquiry: 'Enquiry',
        tabs: 'All tabs enquiry', events: 'Event wise', status: 'Event status Mastered' };
      for (const [key, label] of Object.entries(names)) {
        const r = row.checks[key];
        if (!r || r.ok == null) continue;          // N/A (not checked)
        expect.soft(r.ok, `${label}: ${r.note}`).toBe(true);
      }
      expect.soft(row.openTasks, 'workflow tasks still open').toEqual([]);
      if (row.problems.length) info.annotations.push({ type: 'problems', description: row.problems.join(' | ') });
    });
  }
});
