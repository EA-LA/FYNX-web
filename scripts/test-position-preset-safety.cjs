const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.resolve(__dirname, "../tools/position-size.html"), "utf8");
const start = html.indexOf('    const PRESET_KEY = "fynx_forex_presets_v1";');
const end = html.indexOf("    function getCurrentInputs()", start);
assert.ok(start >= 0 && end > start, "The real calculator preset implementation must be present");
const source = html.slice(start, end);

function setup(data, raw = false) {
  const dom = new JSDOM('<!doctype html><div id="hint"></div><div id="chips"></div>', {
    url: "https://www.fynxfinanceworld.com/tools/position-size.html"
  });
  dom.window.localStorage.setItem("fynx_forex_presets_v1", raw ? data : JSON.stringify(data));
  const actions = [];
  const context = {
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    els: {
      presetHint: dom.window.document.getElementById("hint"),
      presetChips: dom.window.document.getElementById("chips")
    },
    applyPreset: idx => actions.push(["load", idx]),
    deletePreset: idx => actions.push(["delete", idx])
  };
  vm.runInNewContext(source + "\n globalThis.testLoadPresets = loadPresets; globalThis.testRenderPresets = renderPresets;", context);
  return { dom, context, actions };
}

test("saved preset names are rendered as literal text, not executable markup", () => {
  const malicious = '<img src=x onerror="alert(1)"> & Savings';
  const { dom, context } = setup([{ name: malicious, pair: "EUR/USD" }]);
  context.testRenderPresets();
  const buttons = [...dom.window.document.querySelectorAll("#chips button")];
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].querySelector(".preset-label").textContent, malicious);
  assert.equal(dom.window.document.querySelector("#chips img"), null);
  assert.equal(buttons[0].getAttribute("aria-label"), "Load preset " + malicious);
  assert.equal(buttons[1].getAttribute("aria-label"), "Delete preset " + malicious);
  assert.equal(buttons[0].querySelector("i").getAttribute("aria-hidden"), "true");
  assert.equal(buttons[1].querySelector("i").getAttribute("aria-hidden"), "true");
  dom.window.close();
});

test("valid saved inputs retain load and delete actions", () => {
  const { dom, context, actions } = setup([
    { name: "London open", pair: "EUR/USD", stopPips: "20" },
    { name: "Gold breakout", pair: "XAU/USD", stopPips: "40" }
  ]);
  context.testRenderPresets();
  assert.equal(dom.window.document.querySelector("#hint").textContent, "Free presets: 2 / 3. (Saved in your browser)");
  const buttons = dom.window.document.querySelectorAll("#chips button");
  assert.equal(buttons.length, 4);
  buttons[2].click();
  buttons[3].click();
  assert.deepEqual(actions, [["load", 1], ["delete", 1]]);
  dom.window.close();
});

test("corrupt and non-array local storage never crash preset rendering", () => {
  for (const data of ['{bad json', '{"name":"wrong shape"}', "null", '"string"', "12"]) {
    const { dom, context } = setup(data, true);
    assert.doesNotThrow(() => context.testRenderPresets(), "Malformed storage: " + data);
    assert.equal(dom.window.document.querySelectorAll("#chips button").length, 0);
    dom.window.close();
  }
});

test("mixed legacy data is bounded, displays fallback labels, and preserves button indices", () => {
  const { dom, context, actions } = setup([null, false, [], { name: "A" }, { name: 123 }, { name: "C" }, { name: "D" }]);
  context.testRenderPresets();
  const buttons = dom.window.document.querySelectorAll("#chips button");
  assert.equal(buttons.length, 6);
  assert.equal(buttons[2].querySelector(".preset-label").textContent, "Preset 2");
  assert.equal(dom.window.document.querySelector("#hint").textContent, "Free presets: 3 / 3. (Saved in your browser)");
  buttons[2].click();
  assert.deepEqual(actions, [["load", 1]]);
  dom.window.close();
});

test("preset name input is bounded and narrow-width labels may wrap", () => {
  assert.match(html, /id="presetName"[^>]*maxlength="80"/);
  assert.match(html, /\.chip \.preset-label\s*\{[^}]*overflow-wrap:anywhere/);
  assert.match(html, /\.chip:focus-visible\s*\{[^}]*outline:/);
});
