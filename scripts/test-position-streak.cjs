// Position Size "If you hit a losing streak" table: balance, drawdown and recovery
// after 3/5/10/20 losses, for percent-of-balance and fixed-dollar risk.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.resolve(__dirname, "../tools/position-size.html"), "utf8");
const start = html.indexOf("    function renderStreaks(bal, risk){");
const end = html.indexOf("    function computeAccountRiskUSD(){", start);
assert.ok(start >= 0 && end > start, "renderStreaks must be present in position-size.html");
assert.ok(html.includes('id="streakRows"') && html.includes("renderStreaks(bal, risk);"), "table and live update hook must be present");

function run(bal, risk, percent) {
  const dom = new JSDOM('<!doctype html><small id="streakMode"></small><table><tbody id="streakRows"></tbody></table>');
  const ctx = { document: dom.window.document, usePercentRisk: percent, fmt: (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—"), Math };
  vm.runInNewContext(html.slice(start, end) + "\nglobalThis.r = renderStreaks;", ctx);
  ctx.r(bal, risk);
  const rows = [...dom.window.document.querySelectorAll("#streakRows tr")].map(tr => [...tr.cells].map(c => c.textContent));
  return { rows, mode: dom.window.document.getElementById("streakMode").textContent };
}

test("percent risk compounds on the current balance", () => {
  const { rows, mode } = run(10000, 200, true); // 2%
  assert.match(mode, /2\.00% of the current balance/);
  assert.deepEqual(rows, [
    ["3", "$9,412", "5.9%", "+6.2%"],
    ["5", "$9,039", "9.6%", "+10.6%"],
    ["10", "$8,171", "18.3%", "+22.4%"],
    ["20", "$6,676", "33.2%", "+49.8%"],
  ]);
});

test("small balances keep cents", () => {
  const { rows } = run(500, 5, true); // 1%
  assert.deepEqual(rows[0], ["3", "$485.15", "3.0%", "+3.1%"]);
});

test("fixed dollar risk is linear and stops at zero", () => {
  const { rows, mode } = run(10000, 1500, false);
  assert.match(mode, /fixed \$1500\.00/);
  assert.deepEqual(rows[0], ["3", "$5,500", "45.0%", "+81.8%"]);
  assert.deepEqual(rows[1], ["5", "$2,500", "75.0%", "+300.0%"]);
  assert.deepEqual(rows[2], ["10", "$0", "100%", "—"]);
});

test("invalid inputs show guidance instead of numbers", () => {
  assert.equal(run(0, 10, true).rows[0].length, 1);
  assert.equal(run(1000, 0, true).rows[0].length, 1);
  assert.equal(run(1000, 1000, true).rows[0].length, 1); // 100% risk
});
