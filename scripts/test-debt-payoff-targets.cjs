// Debt Payoff "Debt-free by a target date": level payment per target term, rounded up to the cent.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.resolve(__dirname, "../tools/debt-payoff.html"), "utf8");
const pick = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return html.slice(i, j); };
const src = pick("    function formatCurrency(value){", "    function resetOutput(){")
  + pick("    function simulatePayoff(loan, monthlyRate, payment){", "    function renderFasterOptions(")
  + pick("    function paymentForMonths(loan, monthlyRate, n){", "    function calculatePayoff(){");
assert.ok(html.includes('id="targetList"'), "target list must be on the page");

function run(loan, annual, current) {
  const dom = new JSDOM('<!doctype html><ul id="targetList"></ul>');
  const ctx = { document: dom.window.document, Intl, Math };
  vm.runInNewContext(src + "\nglobalThis.t = renderTargets; globalThis.p = paymentForMonths;", ctx);
  ctx.t(loan, annual / 100 / 12, current);
  return { ctx, items: [...dom.window.document.querySelectorAll("#targetList li")].map(li => li.textContent) };
}

test("standard amortisation payments, rounded up", () => {
  const { items } = run(10000, 10, 300);
  assert.equal(items.length, 4);
  assert.match(items[0], /^12 months \(1 year\): \$879\.16\/month/);
  assert.match(items[0], /\$579\.16 more than your payment · \$549\.91 total interest/);
  assert.match(items[2], /36 months \(3 years\): \$322\.68\/month/);
  assert.match(items[3], /60 months \(5 years\): \$212\.48\/month\$87\.52 less than your payment · \$2,748\.06 total interest/);
});

test("zero interest splits the balance evenly", () => {
  const { ctx, items } = run(10000, 0, 50);
  assert.equal(ctx.p(10000, 0, 24), 416.67);
  assert.match(items[1], /\$416\.67\/month.*\$0\.00 total interest/);
});
