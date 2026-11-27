// Position Size "Same risk, other stops" table ([site-qa] run 111): lots for common stop
// distances at the same dollar risk and pip value, rounded down to 0.01 like the main
// result. Expected values were computed independently with Python's decimal module.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.resolve(__dirname, "../tools/position-size.html"), "utf8");
const decimalSrc = fs.readFileSync(path.resolve(__dirname, "../assets/vendor/decimal.js"), "utf8");
const lotsStart = html.indexOf("    function positionSizeLots(");
const lotsEnd = html.indexOf("    function positionSizeUnits(", lotsStart);
const start = html.indexOf("    function renderStopTable(");
const end = html.indexOf("    /* =========================\n       CALCULATE", start);
assert.ok(lotsStart >= 0 && lotsEnd > lotsStart, "positionSizeLots must be present");
assert.ok(start >= 0 && end > start, "renderStopTable must be present");
assert.ok(html.includes('id="stopsRows"') && html.includes("renderStopTable(riskUSD, stopPips, pvUSD);"), "table and calculate hook must be present");
assert.match(html, /forEach\(el => el\.addEventListener\("input", clearResults\)\)/, "editing an input must clear the stale result");

function run(risk, stop, pv) {
  const dom = new JSDOM('<!doctype html><div id="stopsBox" hidden><small id="stopsMode"></small><table><tbody id="stopsRows"></tbody></table></div>');
  const ctx = { document: dom.window.document, fmt: (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—"), Math, Number, String };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.runInNewContext(decimalSrc, ctx);
  vm.runInNewContext(html.slice(lotsStart, lotsEnd) + html.slice(start, end) + "\nglobalThis.r = renderStopTable;", ctx);
  ctx.r(risk, stop, pv);
  const doc = dom.window.document;
  return {
    hidden: doc.getElementById("stopsBox").hidden,
    rows: [...doc.querySelectorAll("#stopsRows tr")].map(tr => [...tr.cells].map(c => c.textContent)),
    yours: [...doc.querySelectorAll("#stopsRows tr.yours")].map(tr => tr.cells[0].textContent),
    mode: doc.getElementById("stopsMode").textContent,
  };
}

test("$100 risk, $10 pip value, 25-pip stop", () => {
  const { hidden, rows, yours, mode } = run(100, 25, 10);
  assert.equal(hidden, false);
  assert.match(mode, /\$100\.00 of risk at \$10\.00 per pip/);
  assert.deepEqual(yours, ["25 (yours)"]);
  assert.deepEqual(rows, [
    ["10", "1.00", "$100.00", "$0.00"],
    ["15", "0.66", "$99.00", "$1.00"],
    ["20", "0.50", "$100.00", "$0.00"],
    ["25 (yours)", "0.40", "$100.00", "$0.00"],
    ["30", "0.33", "$99.00", "$1.00"],
    ["40", "0.25", "$100.00", "$0.00"],
    ["50", "0.20", "$100.00", "$0.00"],
    ["75", "0.13", "$97.50", "$2.50"],
    ["100", "0.10", "$100.00", "$0.00"],
  ]);
});

test("a fractional stop is added in order and non-USD pip values round to cents", () => {
  const { rows } = run(37.5, 12.5, 6.6667);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[1], ["12.50 (yours)", "0.44", "$36.67", "$0.83"]);
  assert.deepEqual(rows[9], ["100", "0.05", "$33.33", "$4.17"]);
});

test("stops too wide for 0.01 lot say so instead of showing $0", () => {
  const { rows } = run(5, 10, 10);
  assert.deepEqual(rows[0], ["10 (yours)", "0.05", "$5.00", "$0.00"]);
  assert.deepEqual(rows[8], ["100", "0.00", "Below 0.01 lot"]);
});

test("invalid inputs hide the table", () => {
  assert.equal(run(0, 25, 10).hidden, true);
  assert.equal(run(100, 0, 10).hidden, true);
  assert.equal(run(100, 25, 0).hidden, true);
});

test("the real risk mode switch is named, and clicking its label updates the calculator", async () => {
  const { window } = new JSDOM(html, {
    url: "https://www.fynxfinanceworld.com/tools/position-size.html",
    runScripts: "outside-only"
  });
  try {
    const doc = window.document;
    const get = id => doc.getElementById(id);
    const control = get("riskSwitch");
    assert.equal(control.tagName, "BUTTON", "native keyboard activation");
    assert.equal(control.type, "button");
    assert.equal(control.getAttribute("role"), "switch");
    const label = get(control.getAttribute("aria-labelledby"));
    assert.equal(label.textContent, "Risk as %");
    assert.match(get(control.getAttribute("aria-describedby")).textContent, /OFF = fixed dollars/);

    window.AbortSignal.timeout = () => new window.AbortController().signal;
    window.fetch = () => Promise.reject(new Error("Offline fixture"));
    window.eval(decimalSrc);
    const controller = [...doc.scripts].find(script => script.textContent.includes("function syncRiskUI()"));
    assert.ok(controller);
    window.eval(controller.textContent);

    assert.equal(control.getAttribute("aria-checked"), "true");
    assert.equal(get("riskDollarsRow").style.display, "none");
    control.focus();
    label.click();
    assert.equal(doc.activeElement, control);
    assert.equal(control.getAttribute("aria-checked"), "false");
    assert.equal(control.classList.contains("on"), false);
    assert.equal(get("riskPercentRow").style.display, "none");
    assert.equal(get("riskDollarsRow").style.display, "grid");

    get("pair").value = "EUR/USD";
    get("pair").dispatchEvent(new window.Event("change", { bubbles: true }));
    get("manualModeBtn").click();
    const update = (id, value) => {
      get(id).value = value;
      get(id).dispatchEvent(new window.Event("input", { bubbles: true }));
    };
    update("manualPrice", "1.1");
    update("riskDollars", "25");
    get("calcBtn").click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(get("lotsOut").textContent, "0.10", get("message").textContent);
    label.click();
    assert.equal(control.getAttribute("aria-checked"), "true");
    assert.equal(control.classList.contains("on"), true);
    assert.equal(get("riskDollarsRow").style.display, "none");
    assert.equal(get("lotsOut").textContent, "—");
    get("calcBtn").click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(get("lotsOut").textContent, "0.04");
  } finally {
    window.close();
  }
});
