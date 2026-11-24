const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('tools/compound.html', 'utf8');
const js = fs.readFileSync('assets/js/compound-fee-comparison.js', 'utf8');
function page(values = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const d = dom.window.document;
  dom.window.eval(js);
  for (const [id, value] of Object.entries(values)) d.getElementById(id).value = value;
  return { dom, d, run() { d.getElementById('compareFees').click(); return d.getElementById('feeResult').textContent; } };
}
test('real page loads comparison exactly once; zero fee matches original monthly simulation', () => {
  const p=page({comparisonFee:0}); p.dom.window.eval(js);
  assert.equal(p.d.querySelectorAll('#feeComparison').length,1);
  assert.match(p.run(), /without fees \$49,308.12; with 0% annual fee \$49,308.12.*\$0.00/);
  p.dom.window.close();
});
test('monthly deductions on zero-return lump sum match independent closed form', () => {
  const p=page({startingBalance:1000,monthlyDeposit:0,annualRate:0,years:1,comparisonFee:1});
  const expected=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(1000*(1-0.01/12)**12);
  assert.ok(p.run().includes(`annual fee ${expected}`)); p.dom.window.close();
});
test('deposit timing and negative returns remain finite; fee never improves balance', () => {
 for(const timing of ['beginning','end']) for(const freq of [1,2,4,12,365]) {
  const p=page({annualRate:-10,years:2,depositTiming:timing,compoundFrequency:freq});
  const text=p.run(); assert.match(text,/Modeled balance difference: \$[\d,]+\.\d\d/); assert.doesNotMatch(text,/NaN|Infinity/); p.dom.window.close();
 }
});
test('invalid input replaces prior result; editing and reset cannot leave stale figures', () => {
 const p=page(); assert.match(p.run(),/After 10 years/);
 p.d.getElementById('annualRate').value=''; assert.match(p.run(),/Enter valid/);
 p.d.getElementById('annualRate').dispatchEvent(new p.dom.window.Event('input')); assert.match(p.d.getElementById('feeResult').textContent,/Inputs changed/);
 p.d.getElementById('resetBtn').click(); assert.equal(p.d.getElementById('feeResult').textContent,''); assert.equal(p.d.getElementById('comparisonFee').value,'1'); p.dom.window.close();
});
test('rejects fee bounds, fractional years, wipeout, missing input and numeric overflow', () => {
 for(const values of [{comparisonFee:-1},{comparisonFee:11},{years:1.5},{annualRate:-100,compoundFrequency:1},{monthlyDeposit:''}]) {
 const p=page(values); assert.match(p.run(),/Enter valid/); p.dom.window.close(); }
 const p=page({annualRate:1e300,years:100}); assert.match(p.run(),/too large/); p.dom.window.close();
});
test('fee stays local and share fields do not silently include it', () => {
 const p=page(); assert.ok(!p.d.getElementById('shareScenarioBtn').dataset.scenarioFields.includes('comparisonFee')); assert.doesNotMatch(js,/fetch\(|localStorage|sessionStorage/); p.dom.window.close();
});
