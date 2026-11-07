// Sanity checks for one finished txn and the Excel report (same columns as the manual sanity sheet).
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('./db');
const { settings, RESULTS } = require('./config');
const { enquiry } = require('./enquiry');

const NA = note => ({ ok: null, note });

// Each check returns { ok: true | false | null, note }. ok = null means "not checked" (N/A).
// The note is what goes into the sheet cell (YES / NO / MASTERED / WORKING ...).
async function checkTxn(page, mod, ref) {
  const r = {};
  if (db.enabled()) {
    const ex = await db.exceptions(ref);
    r.exception = ex.length ? { ok: false, note: 'YES: ' + ex.join('; ') } : { ok: true, note: 'NO' };
    const gapi = await db.gapi(ref);
    const firco = gapi.some(g => g[0] === 'EEFIRCOGapi') || (await db.firco(ref)).length > 0;
    r.firco = firco ? { ok: true, note: 'YES' } : { ok: false, note: 'NO FIRCO call' };
    r.gapi = gapi.length ? { ok: true, note: 'YES' } : { ok: false, note: 'NO GAPI call' };
    const m = await db.master(mod.code, ref);
    r.status = !m ? { ok: false, note: `not in ${mod.code}_MASTER` }
      : m.status === 'M' ? { ok: true, note: 'MASTERED' } : { ok: false, note: `status ${m.status}` };
  } else {
    r.exception = r.firco = r.gapi = r.status = NA('database check off');
  }
  r.risq = NA('not automated');
  r.size = NA('not automated');
  if (page) {
    try {
      const e = await enquiry(page, ref);
      r.enquiry = e.enquiry; r.tabs = e.tabs; r.events = e.events;
    } catch (e) {
      r.enquiry = { ok: false, note: e.message.split('\n')[0] }; r.tabs = r.events = NA('');
    }
  } else {
    r.enquiry = r.tabs = r.events = NA('no browser');
  }
  return r;
}

const mark = x => (x == null || x.ok == null ? 'N/A' : x.ok ? 'OK' : 'Not OK');
const cell = x => (x && x.ok != null && x.note ? x.note : mark(x));
const COLS = [['exception', 'Exception'], ['firco', 'COMPLIANCE FIRCO'], ['risq', 'RISQ'], ['gapi', 'GAPI TRIGGER'],
  ['size', 'SIZE EXPA'], ['enquiry', 'ENQUIRY'], ['tabs', 'ALL TABS ENQ'], ['events', 'EVENT WISE'], ['status', 'EVENT STATUS']];

// rows: [{ id, code, ref, amount, created: {ok, note}, checks, remarks }]
async function writeReport(rows, stamp) {
  fs.mkdirSync(RESULTS, { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sanity');
  ws.addRow(['DATE', 'CACHE CLEAR', 'ENV', 'PRODUCT', 'TEST ID', 'TXN NO', 'AMT', 'TIME', ...COLS.map(c => c[1]), 'OK/NOT OK', 'Notes', 'Remarks']).font = { bold: true };
  for (const r of rows) {
    const all = [r.created, ...COLS.map(c => r.checks[c[0]])];
    const marks = all.map(mark);
    const overall = marks.includes('Not OK') ? 'NOT OK' : 'OK';
    const notes = [r.created.ok === false ? `Create: ${r.created.note}` : '',
      ...COLS.filter(c => r.checks[c[0]] && r.checks[c[0]].ok === false).map(c => `${c[1]}: ${r.checks[c[0]].note}`)].filter(Boolean).join('; ');
    const now = new Date();
    const row = ws.addRow([now.toLocaleDateString('en-GB'), 'YES', settings.environment, r.code, r.id || '', r.ref || '', r.amount || '',
      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), ...COLS.map(c => cell(r.checks[c[0]])), overall, notes, r.remarks || '']);
    row.getCell(9 + COLS.length).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: overall === 'OK' ? 'FF92D050' : 'FFFF7C80' } };
  }
  ws.columns.forEach(c => { c.width = 18; });
  ws.getColumn(10 + COLS.length).width = 80;
  const file = path.join(RESULTS, `sanity-${settings.environment}-${stamp}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

module.exports = { checkTxn, writeReport, mark };
