// Enquiry checks for one txn (same as the manual sheet's ENQUIRY / ALL TABS ENQ / EVENT WISE):
//   inbox Enquiry tab > search ref > ... > View Transaction  (popup with the event list)
//   for each event: tick it > View  ("Transaction Details") > click every left tab
// Any [E....] alert or error page counts as a failure.
const path = require('path');
const wf = require('./wf');
const { RESULTS } = require('./config');

async function enquiry(page, ref) {
  const res = { enquiry: { ok: false, note: '' }, tabs: { ok: null, note: '' }, events: { ok: null, note: '' } };
  if (!wf.frame(page, 'eeinbox')) await require('./login').signIn(page, page.__as || 'maker');
  const ib = wf.frame(page, 'eeinbox');
  await ib.getByText('Enquiry', { exact: true }).first().click(); await page.waitForTimeout(4000);
  const s = ib.locator('input[placeholder^=Search]'); await s.fill(ref); await s.press('Enter'); await page.waitForTimeout(5000);
  const row = ib.locator('table tbody tr', { hasText: ref }).first();
  if (!(await row.isVisible().catch(() => false))) { res.enquiry.note = 'not found in Enquiry tab'; return res; }

  await row.locator('td').first().locator('button').last().click(); await page.waitForTimeout(1500);
  const popupP = page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);
  await ib.getByText('View Transaction', { exact: true }).click();
  const pop = await popupP;
  if (!pop) { res.enquiry.note = 'View Transaction did not open'; return res; }
  await pop.setViewportSize({ width: 1600, height: 1400 }); // small popup hides the last tabs
  const errs = [];
  pop.on('dialog', d => { if (/\[E\d+\]|Exception|error/i.test(d.message())) errs.push(d.message().split('\n')[0]); d.accept().catch(() => {}); });
  await pop.waitForTimeout(10000);
  const boxes = pop.locator('input[name=_Sel_CheckBox]');
  const n = await boxes.count();
  const msg = n ? '' : ((await pop.locator('body').innerText().catch(() => '')).match(/\[W\d+\][^\n]*/) || ['no events listed'])[0].trim();
  res.enquiry = n ? { ok: true, note: 'WORKING' } : { ok: false, note: `View Transaction: ${msg}` };
  if (!n) { await pop.close(); return res; }

  let tabsOk = 0, tabsTotal = 0, eventsOk = 0;
  const eventErr = [];
  for (let i = 0; i < n; i++) {
    // exactly one event ticked
    for (let j = 0; j < n; j++) {
      const b = boxes.nth(j);
      if ((await b.isChecked()) !== (i === j)) await b.click({ force: true });
    }
    const before = errs.length;
    await pop.locator('[name=_view]').click();
    await pop.waitForTimeout(10000);
    const main = pop.frames().find(f => f.name() === 'main');
    const tabs = main ? main.locator('td.title_top') : null;
    const count = tabs ? await tabs.count() : 0;
    if (!count) { eventErr.push(`event ${i + 1}: details did not open`); continue; }
    for (let t = 0; t < count; t++) {
      const name = (await tabs.nth(t).innerText()).trim();
      // the page carries hidden tabs that don't apply to this function
      if (!name || !(await tabs.nth(t).isVisible())) continue;
      tabsTotal++;
      const e0 = errs.length;
      await tabs.nth(t).evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {});
      await tabs.nth(t).click({ timeout: 10000 }).catch(async e => {
        await pop.screenshot({ path: path.join(RESULTS, `enquiry-tab-${ref}-${name.replace(/\W+/g, '_')}.png`) }).catch(() => {});
        errs.push(`${name}: tab not clickable (${(e.message.match(/- (.*intercepts pointer events)/) || [])[1] || 'timeout'})`);
      });
      await pop.waitForTimeout(1500);
      const txt = await main.locator('body').innerText().catch(() => '');
      if (/Error Message|\[E\d+\]/.test(txt)) errs.push(`${name}: error on tab`);
      if (errs.length === e0) tabsOk++;
    }
    if (errs.length === before) eventsOk++; else eventErr.push(`event ${i + 1}: ${errs.slice(before).join('; ')}`);
    // close the Transaction Details overlay
    await pop.getByText('Transaction Details').locator('xpath=ancestor::*[1]').locator('button, [class*=close], text=Ãƒâ€”').first().click().catch(() => {});
    await pop.keyboard.press('Escape').catch(() => {});
    await pop.waitForTimeout(2000);
  }
  res.tabs = tabsOk === tabsTotal ? { ok: true, note: `OK (${tabsTotal} tabs)` } : { ok: false, note: errs.join('; ') };
  res.events = eventsOk === n ? { ok: true, note: `OK (${n} event${n > 1 ? 's' : ''})` } : { ok: false, note: eventErr.join('; ') };
  await pop.close();
  return res;
}

module.exports = { enquiry };
