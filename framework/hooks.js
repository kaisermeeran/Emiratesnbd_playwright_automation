// "Hooks": your own steps that run in the middle of the standard flow, without changing the framework.
// Put a file hooks\<MODULE>.js (e.g. hooks\IPLC.js) and/or hooks\ALL.js (every module) with any of:
//
//   beforeRegisterConfirm(ctx)  Register One Step is filled, CONFIRM not yet clicked
//   afterRegister(ctx)          after Register One Step (ctx.c.ref is the new reference)
//   beforeTask(ctx)             a workflow task is open (maker, RFI, RFA, checker...), nothing done yet
//   beforeConfirm(ctx)          template + Fill applied (maker) / screen open (others), CONFIRM not yet clicked
//   afterTask(ctx)              after the task was confirmed
//   afterChecks(ctx)            after the sanity checks of the transaction (ctx.row has the results)
//
// ctx = { page, work, toolbar, inbox, c, task, role, wf, log }
//   page    : the Playwright page          work/toolbar/inbox : frame locators of the EximBill frames
//   c       : the test case (c.id, c.code, c.ref, c.customer, c.amount, c.fill ...)
//   task    : { id, name, type } of the open workflow task (task hooks only)
//   role    : 'maker' | 'rfa' | 'checker1' | 'checker2' ...
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');

const cache = {};
function load(name) {
  if (!(name in cache)) {
    const f = path.join(ROOT, 'hooks', `${name}.js`);
    cache[name] = fs.existsSync(f) ? require(f) : {};
  }
  return cache[name];
}

// Runs hooks\ALL.js then hooks\<MODULE>.js for this point. A failing hook is logged and re-thrown,
// so the step shows as failed (with a screenshot) instead of going on silently.
async function run(point, ctx) {
  const page = ctx.page;
  const full = {
    ...ctx,
    work: page && page.frameLocator('iframe[name="work"]'),
    toolbar: page && page.frameLocator('iframe[name="eeToolbar"]'),
    inbox: page && page.frameLocator('iframe[name="eeinbox"]'),
    wf: require('./wf'),
  };
  for (const file of ['ALL', ctx.c.code]) {
    const fn = load(file)[point];
    if (typeof fn !== 'function') continue;
    ctx.log(`   hook ${file}.${point}${ctx.task ? ` (${ctx.task.name})` : ''}`);
    await fn(full);
  }
}

module.exports = { run };
