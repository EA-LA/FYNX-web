'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal/scanner.js'), 'utf8');
const start = source.indexOf('  function csv(asset, rows) {');
const end = source.indexOf('  /* ---------- Page ---------- */', start);
assert.ok(start >= 0 && end > start, 'Load the exact production CSV function');
const script = source.slice(start, end);
async function exportCsv(rows) {
  let data, anchor, revoked = false;
  const doc = {createElement: tag => {assert.equal(tag, 'a'); return (anchor = {click(){this.clicked = true;}});}};
  const mockURL = {createObjectURL(blob){data = blob; return 'blob:fynx-scanner-test';}, revokeObjectURL(url){assert.equal(url, 'blob:fynx-scanner-test'); revoked = true;}};
  const cols = {stocks: [['sym','SYMBOL'],['name','NAME'],['price','PRICE'],['chg','CHG %'],['industry','INDUSTRY'],['themes','THEMES']]};
  const runner = new Function('document','URL','Blob','COLS','setTimeout', script + '\nreturn csv;');
  const csv = runner(doc, mockURL, Blob, cols, fn=>fn());
  csv('stocks', rows);
  assert.equal(anchor.download.startsWith('fynx-scan-stocks-'), true);
  assert.equal(anchor.clicked, true);
  assert.equal(revoked, true);
  return data.text();
}
test('scanner export neutralizes provider-supplied spreadsheet formulas', async () => {
  const text = await exportCsv([{sym:'AAPL', name:'=HYPERLINK("https://example.invalid","run")', price:151.25, chg:-2.5, industry:' \t@SUM(1,2)',themes:['+CMD','normal']}]);
  assert.match(text, /"'=HYPERLINK\(""https:\/\/example\.invalid"",""run""\)"/);
  assert.match(text, /"' \t@SUM\(1,2\)"/);
  assert.match(text, /"'\+CMD normal"/);
  assert.match(text, /151\.25,-2\.5,/);
});
test('unicode BOM and control-prefix formulas are not executable CSV cells', async () => {
  const text = await exportCsv([{sym:'\uFEFF=HYPERLINK("x")', name:'\u0000-1+2', price:5, chg:0, industry:'safe', themes:[]}]);
  assert.ok(text.includes('"\'\uFEFF=HYPERLINK(""x"")"'));
  assert.ok(text.includes("'\u0000-1+2"));
});
test('normal quoted text and numeric negatives remain intact', async () => {
  const text = await exportCsv([{sym:'MSFT',name:'Alpha, "Beta"\nClass',price:310,chg:-3.75,industry:'Information technology',themes:['ai','growth']}]);
  assert.ok(text.includes('"Alpha, ""Beta""\nClass"'));
  assert.ok(text.includes(',310,-3.75,Information technology,ai growth'));
  assert.equal((text.match(/\n/g)||[]).length,2);
});
