// Starts a sanity run through Playwright Test (used by the RUN-xxxx.bat files):
//   node framework\test-launch.js IPLC | GTEE IMCO | ALL | IPLC-02 | IPLC=ENBDLC26007798
// 1. picks the test cases from the test data, 2. asks the passwords (hidden),
// 3. runs tests\sanity.spec.js, 4. tells where the Excel and HTML reports are.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const cfg = require('./config');
const creds = require('./credentials');
const { selectCases, prepare, logFile } = require('./sanity');

(async () => {
  const cases = await selectCases(process.argv.slice(2));
  if (!cases.length) { console.log('Nothing to run.'); return; }
  await prepare();
  fs.writeFileSync(path.join(cfg.RESULTS, '.selected-cases.json'), JSON.stringify(cases, null, 2));
  console.log(`\nRunning: ${cases.map(c => c.id).join(', ')}\n`);

  const cli = path.join(cfg.ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  const r = spawnSync(process.execPath, [cli, 'test', 'tests/sanity.spec.js'], {
    cwd: cfg.ROOT, stdio: 'inherit',
    env: { ...process.env, ...creds.toEnv(), SANITY_LOG: logFile },
  });
  fs.rmSync(path.join(cfg.RESULTS, '.selected-cases.json'), { force: true });

  const xlsx = fs.readdirSync(cfg.RESULTS).filter(f => /^sanity-.*\.xlsx$/.test(f))
    .map(f => path.join(cfg.RESULTS, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  console.log('\n=====================================================================');
  console.log(r.status === 0 ? ' RESULT: ALL PASSED' : ' RESULT: SOME CHECKS FAILED (see the reports)');
  if (xlsx) console.log(` Excel report : ${xlsx}`);
  console.log(` HTML report  : double-click SHOW-HTML-REPORT.bat`);
  console.log('=====================================================================');
  process.exitCode = r.status || 0;
})().catch(e => { console.error('STOPPED:', e.message.split('\n')[0]); process.exitCode = 1; });
