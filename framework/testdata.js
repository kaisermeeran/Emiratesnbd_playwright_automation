// Test cases: one row = one transaction to create and check.
// Source (settings.json "testData"): an Excel file (.xlsx), an XML file (.xml) or a JSON file (.json).
// Empty values fall back to the module file modules\<CODE>.json. With no testData file,
// each enabled module file is one test case.
//
// Columns / fields (same names in Excel headers, XML elements/attributes and JSON keys):
//   Test ID | Module | Run (Y/N) | Process | Customer | Currency | Amount | Template | Fill | Defaults | Remarks
//   Fill     = extra fields by field name,  "NARR1=SANITY CHECK; FIELD2=xyz"
//   Defaults = values for "X can't be empty", "Email Address=a@b.com; Other Label=value"
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const KEYS = { 'test id': 'id', id: 'id', module: 'module', run: 'run', 'run (y/n)': 'run', process: 'process', customer: 'customer',
  currency: 'ccy', ccy: 'ccy', amount: 'amount', template: 'template', fill: 'fill', defaults: 'defaults', remarks: 'remarks' };
const norm = k => KEYS[String(k).trim().toLowerCase()];
const pairs = s => (typeof s === 'object' && s ? s : Object.fromEntries(String(s || '').split(/[;\n]/)
  .map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf('='); return [x.slice(0, i).trim(), x.slice(i + 1).trim()]; })));

async function readXlsx(file) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('TestData') || wb.worksheets[0];
  const head = [];
  ws.getRow(1).eachCell((c, i) => { head[i] = norm(c.text); });
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r = {};
    row.eachCell({ includeEmpty: false }, (c, i) => { if (head[i]) r[head[i]] = c.text.trim(); });
    if (r.module) rows.push(r);
  });
  return rows;
}

// <tests><test id="IPLC-01" module="IPLC" run="Y"><customer>88888888</customer>
//   <fill name="NARR1">SANITY CHECK</fill><default label="Email Address">a@b.com</default></test></tests>
function readXml(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return [...xml.matchAll(/<test\b([^>]*)>([\s\S]*?)<\/test>/g)].map(([, attrs, body]) => {
    const r = { fill: {}, defaults: {} };
    for (const [, k, v] of attrs.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) if (norm(k)) r[norm(k)] = unesc(v);
    for (const [, k, v] of body.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) if (norm(k) && !['fill', 'defaults'].includes(norm(k))) r[norm(k)] = unesc(v.trim());
    for (const [, n, v] of body.matchAll(/<fill\s+name="([^"]+)"\s*>([\s\S]*?)<\/fill>/g)) r.fill[n] = unesc(v.trim());
    for (const [, n, v] of body.matchAll(/<default\s+label="([^"]+)"\s*>([\s\S]*?)<\/default>/g)) r.defaults[n] = unesc(v.trim());
    return r;
  });
}

function readJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^ï»¿/, ''));
  return (Array.isArray(data) ? data : data.tests || []).map(t => Object.fromEntries(Object.entries(t).map(([k, v]) => [norm(k) || k, v])));
}

async function loadCases() {
  const src = cfg.settings.testData;
  let rows;
  if (!src) {
    rows = cfg.modules.filter(m => m.enabled).map(m => ({ id: m.code, module: m.code, run: 'Y' }));
  } else {
    const file = path.isAbsolute(src) ? src : path.join(cfg.ROOT, src);
    if (!fs.existsSync(file)) throw new Error(`Test data file not found: ${file}`);
    const ext = path.extname(file).toLowerCase();
    rows = ext === '.xlsx' ? await readXlsx(file) : ext === '.xml' ? readXml(file) : readJson(file);
  }
  return rows.map((r, i) => {
    const m = cfg.module(r.module);
    if (!m) throw new Error(`Test ${r.id || i + 1}: no modules\\${r.module}.json`);
    const amount = r.amount ? Number(String(r.amount).replace(/,/g, '')) : null;
    return {
      ...m,
      id: r.id || `${m.code}-${i + 1}`,
      run: !/^(n|no|false|0)$/i.test(String(r.run ?? 'Y').trim()),
      process: r.process || m.process,
      customer: r.customer || m.customer,
      ccy: r.ccy || m.ccy,
      amountFrom: amount ?? m.amountFrom,
      amountTo: amount ?? m.amountTo,
      template: r.template ?? m.template,
      fill: { ...(m.fill || {}), ...pairs(r.fill) },
      defaults: { ...(m.defaults || {}), ...pairs(r.defaults) },
      remarks: r.remarks || '',
    };
  });
}

module.exports = { loadCases };
