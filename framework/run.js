// Command-line run without the test runner (used by RUN-EXISTING-REF.bat; handy for debugging).
//   node framework\run.js IPLC                  one module, new transaction(s) from the test data
//   node framework\run.js IPLC GTEE             several modules
//   node framework\run.js ALL                   every test case with Run = Y (module enabled)
//   node framework\run.js IPLC-02               one test case from the test data file
//   node framework\run.js IPLC=ENBDLC26007798   continue / re-check an existing transaction
// The normal way is the test runner: framework\test-launch.js (RUN-xxxx.bat).
const s = require('./sanity');

(async () => {
  const cases = await s.selectCases(process.argv.slice(2));
  if (!cases.length) return;
  await s.prepare();
  await s.runSanity(cases);
  await s.db.close();
})().catch(async e => { s.log('STOPPED:', e.message.split('\n')[0]); await s.db.close(); process.exitCode = 1; });
