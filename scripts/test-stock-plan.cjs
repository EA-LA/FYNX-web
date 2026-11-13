// Stock calculators "Targets and cash check": 1R/2R/3R targets and the cash check.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { plan, render, clear } = require("../assets/js/stock-plan.js");

for (const page of ["stock.html", "profit-loss.html"]) {
  test(`${page} wires the card and has no developer note`, () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../tools", page), "utf8");
    assert.ok(html.includes('id="stockPlan"') && html.includes('id="stockPlanBody"'));
    assert.ok(html.includes("/assets/js/stock-plan.js"));
    assert.ok(html.includes("FynxStockPlan.render({ accountSize, entryPrice, stopLoss, shares })"));
    assert.ok(html.includes("FynxStockPlan.clear()"));
    assert.ok(!html.includes("keeps your existing page style"));
  });
}

test("long targets and profit at the sized share count", () => {
  const p = plan({ accountSize: 10000, entryPrice: 150.25, stopLoss: 145, shares: 38 });
  assert.equal(p.long, true);
  assert.deepEqual(p.targets.map(t => t.price), [155.5, 160.75, 166]);
  assert.deepEqual(p.targets.map(t => Number(t.profit.toFixed(2))), [199.5, 399, 598.5]);
  assert.equal(p.cash, null); // $5,709.50 fits in $10,000
});

test("short targets below entry stop at zero", () => {
  const p = plan({ accountSize: 1000, entryPrice: 3, stopLoss: 5, shares: 5 });
  assert.equal(p.long, false);
  assert.deepEqual(p.targets.map(t => t.price), [1, null, null]);
});

test("five-decimal prices keep up to 4 decimals", () => {
  const p = plan({ accountSize: 1000, entryPrice: 1.2345, stopLoss: 1.2, shares: 10 });
  assert.equal(p.dp, 4);
  assert.equal(p.targets[0].price, 1.269);
});

test("cash check when the shares cost more than the account", () => {
  const p = plan({ accountSize: 10000, entryPrice: 50, stopLoss: 49.5, shares: 400 }); // 2% risk
  assert.deepEqual(p.cash, { shares: 200, cost: 10000, loss: 100, lossPct: 1 });
});

test("render writes a table and the cash sentence; clear hides it", () => {
  const dom = new JSDOM('<div id="stockPlan" hidden><div id="stockPlanBody"></div></div>');
  const doc = dom.window.document;
  render({ accountSize: 10000, entryPrice: 50, stopLoss: 49.5, shares: 400 }, doc);
  assert.equal(doc.getElementById("stockPlan").hidden, false);
  const rows = [...doc.querySelectorAll("tbody tr")].map(tr => [...tr.cells].map(c => c.textContent));
  assert.deepEqual(rows, [["1R", "50.50", "+$200.00"], ["2R", "51.00", "+$400.00"], ["3R", "51.50", "+$600.00"]]);
  assert.match(doc.querySelector(".stock-plan-cash").textContent, /covers 200 shares \(\$10,000\.00\).*\$100\.00 \(1\.00% of the account\)/);
  clear(doc);
  assert.equal(doc.getElementById("stockPlan").hidden, true);
  render({ accountSize: 0, entryPrice: 50, stopLoss: 49, shares: 1 }, doc);
  assert.equal(doc.getElementById("stockPlan").hidden, true);
});
