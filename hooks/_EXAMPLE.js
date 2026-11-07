// EXAMPLE hooks file. It is NOT used (the name is not a module code).
// To use it: copy it to hooks\IPLC.js (or GTEE.js, IMCO.js ... or ALL.js for every module),
// keep the hooks you need, delete the rest, and change the field names / values.
//
// Field and button names: use RECORD-NEW-SCRIPT.bat > "Pick locator" in the Playwright Inspector,
// or copy the lines from a recording (they look exactly like the ones below).

module.exports = {

  // Register One Step is filled; CONFIRM is not clicked yet.
  // Example: choose another Source and type a courier reference.
  async beforeRegisterConfirm({ work, c, log }) {
    await work.locator('select[name="C_CHAN_TYPE"]').selectOption({ label: 'FrontOffice' });
    await work.locator('input[name="WF_IN_COURIER_REF"]').fill(`SANITY-${c.id}`);
    log(`   courier ref set for ${c.id}`);
  },

  // A workflow task is open and the template / Fill values are in; CONFIRM is not clicked yet.
  // Use task.name to act only on one task.
  async beforeConfirm({ page, work, task, c }) {
    if (task.name !== 'Issue Letter of Credit One Step') return;   // only the maker screen

    // go to a tab (left menu of the transaction screen) and change fields there
    await work.getByText('Shipment', { exact: true }).first().click();
    await work.locator('input[name="PORT_OF_LOAD"]').fill('JEBEL ALI');
    await work.locator('select[name="PARTIAL_SHIP"]').selectOption({ label: 'ALLOWED' });

    // tick a checkbox, type into a text area
    await work.locator('textarea[name="REMARKS"]').fill(`Sanity run ${c.id}`);

    // wait for something slow, then keep a screenshot of the screen
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `results/hook-${c.id}-before-confirm.png` });
  },

  // After a task was confirmed. result = { msgs: [...messages], errors: [...] }
  async afterTask({ task, result, log }) {
    if (result.errors.length) log(`   ${task.name} had errors: ${result.errors.join(' | ')}`);
  },

  // After the checks of the transaction; row.checks has the sanity columns.
  async afterChecks({ row, log }) {
    log(`   ${row.id}: status ${row.checks.status && row.checks.status.note}`);
  },
};
