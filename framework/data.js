// For your own (recorded) scripts: read one row of the test data and the settings.
//   const { row, settings } = require('../framework/data');
//   const r = await row('IPLC-01');          // { customer, ccy, amountFrom, template, fill, defaults, ... }
//   await page.goto(settings.url);
const { settings } = require('./config');
const { loadCases } = require('./testdata');

async function row(testId) {
  const r = (await loadCases()).find(c => c.id.toUpperCase() === String(testId).toUpperCase());
  if (!r) throw new Error(`Test ID ${testId} not found in ${settings.testData || 'modules'}`);
  return r;
}

module.exports = { row, settings };
