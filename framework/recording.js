// Helpers for tests made with the Playwright recorder (RECORD-NEW-SCRIPT.bat).
//   node framework\recording.js clean tests\recorded\MyTest.spec.js   after recording
//   node framework\recording.js run   tests\recorded\MyTest.spec.js   to replay it in the test runner
//
// "clean" makes a recording safe: the typed password is replaced by process.env.EXIM_PASS
// (asked on screen when replaying). The browser (Edge) comes from playwright.config.js.
// "run" asks for the password, runs the test, and the result goes into the HTML report.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');
const { ROOT } = require('./config');

function clean(file) {
  let src = fs.readFileSync(file, 'utf8');
  // password fields: C_PASSWORD on the login page, or any locator mentioning "password"
  src = src.replace(/(\.(?:locator|getByLabel|getByPlaceholder|getByRole)\([^)]*(?:C_PASSWORD|[Pp]assword)[^)]*\)(?:\.[a-zA-Z]+\([^)]*\))*\.fill\()('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")(\))/g,
    '$1process.env.EXIM_PASS$3');
  fs.writeFileSync(file, src);
  const left = /C_PASSWORD[^\n]*fill\((['"])(?!\1)/.test(src);
  console.log(`Cleaned ${path.basename(file)}${left ? ' - WARNING: check the file, a password may still be in it' : ''}`);
}

function askHidden(q) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => rl.output.write(rl.__m && !s.startsWith(q) ? '*' : s);
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a.trim()); });
    rl.__m = true;
  });
}

async function run(file) {
  const env = { ...process.env };
  if (/process\.env\.EXIM_PASS/.test(fs.readFileSync(file, 'utf8')) && !env.EXIM_PASS) env.EXIM_PASS = await askHidden('Password used in this test: ');
  const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  const rel = path.relative(ROOT, path.resolve(file)).replace(/\\/g, '/');
  const r = spawnSync(process.execPath, [cli, 'test', rel], { cwd: ROOT, env, stdio: 'inherit' });
  console.log(r.status === 0 ? '\nPASSED' : '\nFAILED - open the HTML report (SHOW-HTML-REPORT.bat) to see the failing step');
  process.exitCode = r.status || 0;
}

const [cmd, file] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
if (cmd === 'clean') clean(file);
else if (cmd === 'run') run(file);
else { console.error('Use: clean <file> | run <file>'); process.exit(1); }
