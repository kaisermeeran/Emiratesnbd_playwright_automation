// Creates data\testdata.xlsx (and XML / JSON examples) from the module files.
// Only needed once, or to start again from a clean sheet:  node\node.exe framework\make-testdata.js
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const cfg = require('./config');

const dir = path.join(cfg.ROOT, 'data');
fs.mkdirSync(path.join(dir, 'examples'), { recursive: true });
const order = ['IPLC', 'EPLC', 'IMCO', 'EXCO', 'GTEE', 'IWGT'];
const mods = order.map(c => cfg.module(c)).filter(Boolean);
const kv = o => Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join('; ');
const rows = mods.map(m => ({
  'Test ID': `${m.code}-01`, Module: m.code, 'Run (Y/N)': m.enabled ? 'Y' : 'N', Process: m.process, Customer: m.customer,
  Currency: m.ccy, Amount: m.amountFrom === m.amountTo ? m.amountFrom : '', Template: m.template,
  Fill: kv(m.fill), Defaults: kv(m.defaults), Remarks: m.enabled ? '' : m.notes,
}));
rows.splice(1, 0, { ...rows[0], 'Test ID': 'IPLC-02', 'Run (Y/N)': 'N', Amount: 250000, Remarks: 'Example of a second IPLC case with a fixed amount' });

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('TestData');
  const cols = Object.keys(rows[0]);
  ws.columns = cols.map(k => ({ header: k, key: k, width: { Process: 32, Fill: 30, Defaults: 34, Remarks: 60 }[k] || 14 }));
  rows.forEach(r => ws.addRow(r));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4F9C' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.getColumn('Run (Y/N)').eachCell((c, n) => { if (n > 1) c.dataValidation = { type: 'list', allowBlank: false, formulae: ['"Y,N"'] }; });
  ws.getColumn('Module').eachCell((c, n) => { if (n > 1) c.dataValidation = { type: 'list', allowBlank: false, formulae: [`"${order.join(',')}"`] }; });

  const help = wb.addWorksheet('How to fill');
  help.columns = [{ header: 'Column', width: 14 }, { header: 'What to put', width: 110 }];
  [
    ['Test ID', 'Any unique name, e.g. IPLC-01. You can run one row with RUN-TEST-ID.bat. It is copied to the result sheet.'],
    ['Module', 'IPLC, EPLC, IMCO, EXCO, GTEE or IWGT.'],
    ['Run (Y/N)', 'Y = this row runs with RUN-ALL.bat / RUN-<module>.bat. N = skipped.'],
    ['Process', 'Process Name exactly as in Workflow Initialization > Register One Step. Empty = value from modules\\<module>.json.'],
    ['Customer', 'Customer ID / CIF for the registration. Empty = module file value.'],
    ['Currency', 'e.g. AED. Empty = module file value.'],
    ['Amount', 'Fixed amount. Empty = a random amount between amountFrom and amountTo of the module file (avoids duplicates).'],
    ['Template', 'Template name from the toolbar Load list. Empty = module file value.'],
    ['Fill', 'Extra fields by field name, separated by ";"  e.g.  NARR1=SANITY CHECK; REMARKS=test'],
    ['Defaults', 'Values for "<Label> can\'t be empty" messages, by label, e.g.  Email Address=a@b.com'],
    ['Remarks', 'Free text, copied to the result sheet.'],
    ['', 'Add as many rows as you like: one row = one transaction. Do not rename the sheet "TestData" or the column headers.'],
  ].forEach(r => help.addRow(r));
  help.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(path.join(dir, 'testdata.xlsx'));

  // XML and JSON versions of the same data (settings.json "testData" can point at either)
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<tests>'];
  for (const r of rows) {
    xml.push(`  <test id="${esc(r['Test ID'])}" module="${r.Module}" run="${r['Run (Y/N)']}">`);
    for (const [tag, key] of [['process', 'Process'], ['customer', 'Customer'], ['currency', 'Currency'], ['amount', 'Amount'], ['template', 'Template'], ['remarks', 'Remarks']]) {
      if (r[key] !== '' && r[key] != null) xml.push(`    <${tag}>${esc(r[key])}</${tag}>`);
    }
    for (const [n, v] of Object.entries(cfg.module(r.Module).fill || {})) xml.push(`    <fill name="${esc(n)}">${esc(v)}</fill>`);
    for (const [n, v] of Object.entries(cfg.module(r.Module).defaults || {})) xml.push(`    <default label="${esc(n)}">${esc(v)}</default>`);
    xml.push('  </test>');
  }
  xml.push('</tests>', '');
  fs.writeFileSync(path.join(dir, 'examples', 'testdata.xml'), xml.join('\n'));
  fs.writeFileSync(path.join(dir, 'examples', 'testdata.json'), JSON.stringify({ tests: rows.map(r => ({
    id: r['Test ID'], module: r.Module, run: r['Run (Y/N)'], process: r.Process, customer: r.Customer, currency: r.Currency,
    amount: r.Amount, template: r.Template, fill: cfg.module(r.Module).fill || {}, defaults: cfg.module(r.Module).defaults || {}, remarks: r.Remarks,
  })) }, null, 2));
  console.log('Written data\\testdata.xlsx, data\\examples\\testdata.xml, data\\examples\\testdata.json');
})();
