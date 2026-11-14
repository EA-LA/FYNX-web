// Compound calculator "Goal and inflation check": deposit needed for a goal, time to goal, today's money.
// Expected values from an independent Python month-by-month simulation (12%/yr monthly, end-of-month deposits).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.resolve(__dirname, "../tools/compound.html"), "utf8");
const pick = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return html.slice(i, j); };
const src = pick("    function formatCurrency(value){", "    function formatMultiple(")
  + pick("    function simulateBalance(", "    document.getElementById(\"calculateBtn\")");
assert.ok(html.includes('data-scenario-optional="goalAmount,inflationRate"'), "goal/inflation must be optional scenario fields");

function run(goal, inflation, opts = {}) {
  const dom = new JSDOM(`<!doctype html><div id="goalBox" hidden><ul id="goalList"></ul></div>
    <input id="goalAmount" value="${goal}"><input id="inflationRate" value="${inflation}">`);
  const ctx = { document: dom.window.document, Intl, Math, Number, parseFloat };
  vm.runInNewContext(src + "\nglobalThis.r = renderGoalCheck; globalThis.s = simulateBalance;", ctx);
  const start = opts.start ?? 1000, dep = opts.dep ?? 200, years = opts.years ?? 10, rate = 0.01;
  const endingBalance = ctx.s(start, dep, rate, years * 12, "end");
  ctx.r({ startingBalance: start, monthlyDeposit: dep, monthlyRateEquivalent: rate, years, depositTiming: "end", endingBalance, totalContributions: start + dep * 12 * years });
  const doc = dom.window.document;
  return { hidden: doc.getElementById("goalBox").hidden, items: [...doc.querySelectorAll("#goalList li")].map(li => li.textContent) };
}

test("goal: shortfall, deposit needed (rounded up), time to goal, today's money", () => {
  const { hidden, items } = run("100000", "3");
  assert.equal(hidden, false);
  assert.match(items[0], /Short of goal: \$49,308\.12 vs \$100,000\.00/);
  assert.match(items[1], /\$420\.37\/month reaches it in 10 years.*\$220\.37 more than your deposit/);
  assert.match(items[2], /14 years 8 months.*\$100,998\.80/);
  assert.match(items[3], /In today's money: \$36,689\.88/);
});

test("blank optional fields hide the box", () => {
  assert.equal(run("", "").hidden, true);
});

test("goal below the starting balance, unreachable goal, bad inflation", () => {
  assert.match(run("500", "").items[0], /Goal already reached/);
  const none = run("1000000000", "", { dep: 0, start: 1 });
  assert.ok(none.items.some(t => /Not reached within 100 years/.test(t)));
  assert.match(run("", "80").items[0], /between 0% and 50%/);
});
