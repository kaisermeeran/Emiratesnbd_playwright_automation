// Asks for passwords once at the start of a run (typing is hidden) and keeps them in memory only.
// For unattended runs the same values can be given as environment variables:
//   EXIM_PASS (all users), EXIM_PASS_MAKER / EXIM_PASS_RFA / EXIM_PASS_CHECKER1 / EXIM_PASS_CHECKER2, EXIM_DB_PASS
const readline = require('readline');
const { settings } = require('./config');

const store = {};

// 'maker', 'rfa' -> users.maker / users.rfa ; 'checker1', 'checker2' ... -> users.checkers[0], [1] ...
const userOf = role => { const m = /^checker(\d+)$/.exec(role); return m ? (settings.users.checkers || [])[m[1] - 1] : settings.users[role]; };

function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (!rl.__muted || s.startsWith(question)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer.trim()); });
    rl.__muted = true;
  });
}

// Fills the store for the roles a run will use (and the database, if enabled).
async function prepare(roles) {
  const env = process.env;
  if (settings.samePasswordForAllUsers) {
    const p = env.EXIM_PASS || await askHidden(`Password for EximBill users (${roles.map(userOf).join(', ')}): `);
    for (const r of roles) store[r] = p;
  } else {
    for (const r of roles) {
      store[r] = env[`EXIM_PASS_${r.toUpperCase()}`] || env.EXIM_PASS || await askHidden(`Password for ${userOf(r)} (${r}): `);
    }
  }
  if (settings.database && settings.database.enabled) {
    store.db = env.EXIM_DB_PASS || await askHidden(`Password for database user ${settings.database.user}: `);
  }
}

module.exports = {
  prepare,
  forRole: role => ({ user: userOf(role), password: store[role] }),
  userOf,
  checkerRoles: () => (settings.users.checkers || []).map((_, i) => `checker${i + 1}`),
  db: () => store.db,
  // Hands the passwords to the test-runner process (memory only, never written to disk)
  toEnv: () => {
    const env = {};
    if (settings.samePasswordForAllUsers) env.EXIM_PASS = store.maker;
    else for (const [r, p] of Object.entries(store)) if (r !== 'db') env[`EXIM_PASS_${r.toUpperCase()}`] = p;
    if (store.db) env.EXIM_DB_PASS = store.db;
    return env;
  },
};
