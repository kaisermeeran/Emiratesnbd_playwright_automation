// Workflow driving: register a txn via Workflow Initialization > Register One Step,
// then work its inbox tasks. Frames: side menu in screen/index.htm, form in "work",
// buttons in "eeToolbar".
const frame = (page, name) => page.frames().find(f => f.name() === name);
const menuFrame = page => page.frames().find(f => f.url().includes('screen/index.htm'));

async function openRegister(page) {
  const f = menuFrame(page);
  const top = f.getByText('Workflow Initialization', { exact: true });
  if (!(await f.getByText('Register One Step', { exact: true }).isVisible().catch(() => false))) {
    await top.first().click(); await page.waitForTimeout(800);
    await top.nth(1).click(); await page.waitForTimeout(800);
  }
  await f.getByText('Register One Step', { exact: true }).first().click();
  await frame(page, 'work').locator('select[name=WF_MODULE]').waitFor();
  await page.waitForTimeout(2000);
}

// Fills the register form and confirms. Returns the WF reference shown on the screen.
async function register(page, p) {
  await openRegister(page);
  const w = frame(page, 'work');
  const wfRef = (await frame(page, 'pathInfo').locator('body').innerText()).match(/ENBDWF\d+/)?.[0];
  await w.locator('select[name=WF_MODULE]').selectOption(p.code);
  await page.waitForTimeout(1500);
  await w.locator('select[name=C_PROCESS_ID]').selectOption({ label: p.process });
  await page.waitForTimeout(1500);
  await w.locator('input[name=WF_CUST_ID]').fill(p.customer);
  await w.locator('input[name=WF_CUST_ID]').press('Tab');
  await page.waitForTimeout(3000);
  if (p.ccy) await w.locator('select[name=WF_CCY]').selectOption(p.ccy);
  await w.locator('input[name=WF_AMT]').fill(String(p.amount));
  await w.locator('input[name=WF_AMT]').press('Tab');
  // Mandatory flags with no sensible default: take the first real option
  // unless config gives a value, e.g. "register": {"WF_SIG_VER_FLG": "Yes"}
  const sels = await w.locator('select:visible').evaluateAll(es => es.filter(e => !e.disabled && !e.value).map(e => e.name));
  for (const name of sels) {
    const want = (p.register || {})[name];
    const s = w.locator(`select[name="${name}"]`);
    if (want) await s.selectOption({ label: want });
    else await s.evaluate(e => { const o = [...e.options].find(o => o.value); if (o) { e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); } });
  }
  // Explicit register values from the module file always win, e.g. WF_VESSEL_CHK_FLG = No
  // (Vessel check = Yes creates a TBML Maker task)
  for (const [name, label] of Object.entries(p.register || {})) {
    const s = w.locator(`select[name="${name}"]`);
    if (await s.count()) await s.selectOption({ label });
  }
  await w.locator('select[name=WF_TRX_DECISION]').selectOption({ label: 'Proceed' });
  const mainRef = await w.locator('input[name=WF_C_MAIN_REF]').inputValue().catch(() => '');
  return { wfRef, mainRef, w, filled: sels };
}

// "Duplicate Data" popup (same customer/ccy/amount seen before): click Ok to go on.
async function acceptDuplicate(page) {
  for (const f of page.frames()) {
    if (!(await f.getByText('Duplicate Data').first().isVisible().catch(() => false))) continue;
    await f.getByRole('button', { name: 'Ok', exact: true }).click();
    await page.waitForTimeout(6000);
    return true;
  }
  return false;
}

// Clicks CONFIRM and accepts the "Duplicate Data" popup if it shows.
async function confirm(page) {
  await frame(page, 'eeToolbar').getByText('CONFIRM', { exact: true }).click();
  await page.waitForTimeout(5000);
  await acceptDuplicate(page);
}

// Opens the task; if an earlier aborted run left the txn locked, unlocks it and retries once.
async function openTask(page, ref, taskName, module) {
  const tab = await openTaskOnce(page, ref, taskName);
  const w = frame(page, 'work');
  const t = w ? await w.locator('body').innerText().catch(() => '') : '';
  if (!/Transaction Locked/.test(t) || !module) return tab;
  await w.getByText('Go Back').click().catch(() => {});
  await page.waitForTimeout(3000);
  if (!(await unlock(page, ref, module))) throw new Error(`${ref} locked and not in unlock list`);
  await require('./login').signIn(page, page.__as || 'maker');
  return openTaskOnce(page, ref, taskName);
}

// Finds a task row for ref + task name in My Tasks or Group Queue and opens it (play button).
async function openTaskOnce(page, ref, taskName) {
  // After another screen (e.g. Register) the inbox frame is gone: reload the start page
  if (!frame(page, 'eeinbox')) await require('./login').signIn(page, page.__as || 'maker');
  for (let i = 0; i < 30 && !frame(page, 'eeinbox'); i++) await page.waitForTimeout(1000);
  const ib = frame(page, 'eeinbox');
  if (!ib) throw new Error('inbox frame not loaded');
  // A Group Queue task is claimed first (2nd action icon), which moves it to My Tasks,
  // then processed from My Tasks (1st action icon).
  const findRow = async tab => {
    await ib.getByText(tab, { exact: true }).first().click();
    await page.waitForTimeout(3000);
    const search = ib.locator('input[placeholder^=Search]');
    await search.fill(ref); await search.press('Enter');
    await page.waitForTimeout(4000);
    // match the Task Name cell exactly ("Maker" must not pick the "TBML Maker" row)
    const exact = new RegExp(`^\\s*${taskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    const row = ib.locator('table tbody tr').filter({ has: ib.locator('td', { hasText: exact }) }).first();
    return (await row.isVisible().catch(() => false)) ? row : null;
  };
  const actions = row => row.locator('td').first().locator('button');
  let row = await findRow('My Tasks');
  if (!row) {
    const g = await findRow('Group Queue');
    if (!g) {
      // RFA/RFI intervene user works referrals from the Intervene tab directly
      const iv = await findRow('Intervene');
      if (!iv) throw new Error(`task "${taskName}" for ${ref} not in inbox`);
      await actions(iv).first().click();
      await page.waitForTimeout(10000);
      return 'Intervene';
    }
    page.once('dialog', d => d.accept().catch(() => {}));
    await actions(g).nth(1).click();
    await page.waitForTimeout(5000);
    row = await findRow('My Tasks');
    if (!row) throw new Error(`claimed "${taskName}" for ${ref} but it is not in My Tasks`);
  }
  await actions(row).first().click();
  await page.waitForTimeout(10000);
  return 'My Tasks';
}

// After CONFIRM: waits (up to 2 min) for "Transaction Completed", a validation error,
// or a stopping alert (msgs grew past `before`) once no "Data in process" overlay is up.
async function waitDone(page, msgs = [], before = msgs.length, ms = 120000) {
  await page.waitForTimeout(5000);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await acceptDuplicate(page);
    const t = await frame(page, 'work')?.locator('body').innerText().catch(() => '') || '';
    if (/Transaction Completed|\[[WE]\d+\]/.test(t)) return t;
    const busy = (await Promise.all(page.frames().map(f => f.getByText(/Data in process/).isVisible().catch(() => false)))).some(Boolean);
    if (!busy && msgs.length > before && /Limit Check Again|TBML SOP|empty/i.test(msgs.slice(before).join(' '))) return t;
    await page.waitForTimeout(2000);
  }
  return '';
}

// "Select a record to load" lookup popups: take the first row's link.
async function pickFirstRecord(page) {
  const f = page.frames().find(x => /confirmDialogFrame/.test(x.name()));
  if (!f) return false;
  const link = f.locator('table a, tbody a, u, a').first();
  if (!(await link.isVisible().catch(() => false))) return false;
  await link.click(); await page.waitForTimeout(6000);
  return true;
}

// "[W4206] <Label> can't be empty": finds the field whose title is <Label> and fills it,
// with the module's "defaults" value for that label if given, else a harmless test value.
// Returns the labels it filled.
async function fillEmptyMandatory(page, defaults = {}) {
  const w = frame(page, 'work');
  const labels = (await errors(page)).map(e => (e.match(/\[W4206\]\s*(.+?) can't be empty/) || [])[1]).filter(Boolean);
  const done = [];
  for (const label of labels) {
    const el = w.locator(`[title="${label}"]`).first();
    if (!(await el.count())) continue;
    const want = defaults[label];
    const ok = await el.evaluate((e, [label, want]) => {
      if (e.tagName === 'SELECT') {
        const o = [...e.options].find(o => want ? o.text.trim() === want : o.value);
        if (!o) return false;
        e.value = o.value;
      } else {
        e.value = want || (/mail/i.test(label) ? 'sanity.check@example.com' : 'SANITY CHECK');
      }
      e.dispatchEvent(new Event('change', { bubbles: true }));
      e.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }, [label, want]);
    if (ok) done.push(label);
  }
  return done;
}

// Maker CONFIRM: ticks the TBML "I hereby confirm..." box (it may only show after a
// first CONFIRM attempt), does the Finacle limit check when asked, fills empty mandatory
// fields named in validation errors, then confirms. Returns alert texts + validation errors.
async function makerConfirm(page, defaults = {}) {
  const msgs = [];
  const onDialog = d => { msgs.push(d.message()); d.accept().catch(() => {}); };
  page.on('dialog', onDialog);
  const w = frame(page, 'work');
  const decision = w.locator('select[name=TRX_DECISION]');
  if (await decision.count() && !(await decision.inputValue())) await decision.selectOption({ label: 'Proceed' });
  for (let i = 0; i < 6; i++) {
    const tick = w.locator('xpath=//input[@type="checkbox"][contains(normalize-space(..), "hereby confirm")]');
    if (await tick.first().isVisible().catch(() => false) && !(await tick.first().isChecked())) await tick.first().check();
    const before = msgs.length;
    await frame(page, 'eeToolbar').getByText('CONFIRM', { exact: true }).click();
    await waitDone(page, msgs, before);
    const fresh = msgs.slice(before);
    if (fresh.some(m => /Limit Check Again/i.test(m))) {
      // Limit tab > "Check Limits in Finacle", then back to TBML for the next attempt
      await w.getByText('Limit', { exact: true }).first().click(); await page.waitForTimeout(2000);
      await w.locator('[name=CHK_LMT_BTN]').click(); await page.waitForTimeout(10000);
      await pickFirstRecord(page);
      continue;
    }
    if ((await fillEmptyMandatory(page, defaults)).length) continue;
    if (!fresh.some(m => /TBML SOP/.test(m))) break;
  }
  page.off('dialog', onDialog);
  return { msgs, errors: await errors(page) };
}

// Workflow Initialization > Unlock Transaction for a ref left locked by an earlier run.
// Side-menu name per module, from modules\*.json ("menu")
const MODULE_MENU = Object.fromEntries(require('./config').modules.map(m => [m.code, m.menu]));

// Opens "<module menu>><function>" through the side-menu search box.
// `nth` picks among same-named hits (a module can have several "Unlock Transaction").
// Returns false when there is no such hit.
async function openFunction(page, label, nth = 0) {
  const f = menuFrame(page);
  const search = f.locator('input[placeholder=Search]');
  await search.fill(label.split('>').pop(), { force: true });
  await page.waitForTimeout(1500);
  const hit = f.getByText(label, { exact: true });
  if (await hit.count() <= nth) { await search.fill('').catch(() => {}); return false; }
  await hit.nth(nth).click();
  await page.waitForTimeout(6000);
  await search.fill('').catch(() => {});
  return true;
}

// Tries each "<module>>Unlock Transaction" screen until one lists the ref.
async function unlock(page, ref, module) {
  for (let n = 0; n < 6; n++) {
    if (n > 0) await require('./login').signIn(page, page.__as || 'maker'); // menu search is hidden once a screen is open
    if (!(await openFunction(page, `${MODULE_MENU[module]}>Unlock Transaction`, n))) return false;
    const w = frame(page, 'work');
    await w.locator('select[name=recordsperpage]').selectOption('200').catch(() => {});
    await page.waitForTimeout(4000);
    const refs = await w.locator('textarea[name=_F_C_MAIN_REF]').evaluateAll(es => es.map(e => e.value.trim())).catch(() => []);
    const i = refs.indexOf(ref);
    if (i < 0) continue;
    await w.locator('input[name=_Sel_CheckBox]').nth(i).check();
    page.once('dialog', d => d.accept().catch(() => {}));
    await frame(page, 'eeToolbar').getByText('CONFIRM', { exact: true }).click();
    await page.waitForTimeout(6000);
    return true;
  }
  return false;
}

// RFI/RFA referral task: answer every referral group, then CONFIRM.
// RFI rows have a "Feedback" button (comment + Submit Decision); RFA rows have
// "Decision" (comment + Approve). The modal is rendered in the top document.
async function answerReferrals(page, comment = 'Automated sanity check') {
  const msgs = [];
  const onDialog = d => { msgs.push(d.message()); d.accept().catch(() => {}); };
  page.on('dialog', onDialog);
  await page.waitForTimeout(8000);
  const w = frame(page, 'work');
  const groups = w.getByText(/\d+ exception\(s\)/);
  for (let i = 0; i < await groups.count(); i++) {
    await groups.nth(i).click(); await page.waitForTimeout(2500);
    const btns = w.getByRole('button', { name: /Feedback|Decision/ });
    for (let j = 0; j < await btns.count(); j++) {
      await btns.nth(j).click(); await page.waitForTimeout(3000);
      await page.locator('#decisionCommentText').fill(comment); // contenteditable div
      const approve = page.locator('#decisionBtnApprove');
      if (await approve.isVisible().catch(() => false)) await approve.click();
      else await page.getByRole('button', { name: /Submit Decision/ }).click();
      await page.waitForTimeout(4000);
    }
  }
  await frame(page, 'eeToolbar').getByText('CONFIRM', { exact: true }).click();
  await waitDone(page);
  page.off('dialog', onDialog);
  return { msgs, errors: await errors(page) };
}

// Toolbar Load > pick template by name > Load.
async function loadTemplate(page, name) {
  await frame(page, 'eeToolbar').getByText('Load', { exact: true }).click();
  await page.waitForTimeout(4000);
  for (let pg = 0; pg < 5; pg++) {
    const f = page.frames().find(x => /confirmDialogFrame/.test(x.name()));
    const cell = f.getByText(name, { exact: true }).first();
    if (await cell.isVisible().catch(() => false)) {
      await cell.click();
      await f.getByRole('button', { name: 'Load' }).or(f.getByText('Load', { exact: true })).last().click();
      await page.waitForTimeout(8000);
      return;
    }
    const next = f.getByText(String(pg + 2), { exact: true }).first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click(); await page.waitForTimeout(2500);
  }
  throw new Error(`template ${name} not found`);
}

// Collects visible validation messages ([Wnnnn] ...) from the work frame.
async function errors(page) {
  const w = frame(page, 'work');
  const t = await w.locator('body').innerText().catch(() => '');
  return [...new Set(t.match(/\[[WE]\d+\][^\n]*/g) || [])];
}

module.exports = { frame, menuFrame, openRegister, register, confirm, openTask, loadTemplate, makerConfirm, answerReferrals, unlock, openFunction, MODULE_MENU, errors };
