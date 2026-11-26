// Currency converter "Cost of your rate" and "Quick amounts" (assets/js/currency-check.js).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { providerCost, quickAmounts } = require("../assets/js/currency-check.js");

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("page wires the reference rate and the module", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../tools/currency.html"), "utf8");
  assert.ok(html.includes('id="referenceRate"'));
  assert.ok(html.includes("/assets/js/currency-check.js"));
  assert.ok(html.includes('data-scenario-optional="customRate,referenceRate"'));
  assert.ok(html.includes("FynxCurrencyCheck.providerCost(amount, rate, reference)"));
});

test("worse provider rate: shortfall and markup", () => {
  // 1000 USD at 0.90 EUR vs reference 0.92: 900 vs 920, 20 EUR short (21.739 USD), 2.1739% markup
  const c = providerCost(1000, 0.9, 0.92);
  close(c.received, 900);
  close(c.atReference, 920);
  close(c.shortfall, 20);
  close(c.shortfallSource, 20 / 0.92);
  close(c.markupPct, 2 / 0.92);
  assert.equal(c.better, false);
  assert.equal(c.farApart, false);
});

test("better rate and equal rate", () => {
  const b = providerCost(500, 1.3, 1.25);
  assert.equal(b.better, true);
  close(-b.shortfall, 25);
  const e = providerCost(500, 1.25, 1.25);
  assert.equal(e.same, true);
});

test("flags rates entered opposite ways round", () => {
  const c = providerCost(100, 0.92, 1 / 0.92);
  assert.equal(c.looksInverted, true);
  const far = providerCost(100, 150, 1 / 150); // JPY per USD vs USD per JPY
  assert.equal(far.farApart, true);
  assert.equal(far.looksInverted, true);
  // a real 3% markup near parity is not flagged
  assert.equal(providerCost(100, 0.97, 1).looksInverted, false);
  const typo = providerCost(100, 0.92, 9.2);
  assert.equal(typo.farApart, true);
  assert.equal(typo.looksInverted, false);
});

test("invalid inputs return null", () => {
  assert.equal(providerCost(100, 0.9, 0), null);
  assert.equal(providerCost(100, 0.9, NaN), null);
  assert.equal(providerCost(0, 0.9, 0.9), null);
});

test("quick amounts include and mark yours, sorted, no duplicates", () => {
  const rows = quickAmounts(250, 150);
  assert.deepEqual(rows.map(r => r.amount), [1, 10, 100, 250, 500, 1000, 5000]);
  assert.deepEqual(rows.filter(r => r.yours).map(r => r.amount), [250]);
  close(rows[3].forward, 37500);
  close(rows[3].backward, 250 / 150);
  const same = quickAmounts(1000, 2);
  assert.equal(same.length, 6);
  assert.equal(same.find(r => r.amount === 1000).yours, true);
  assert.deepEqual(quickAmounts(100, 0), []);
});
