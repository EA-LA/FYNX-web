// [site-qa] run 100: Fibonacci "Entry plan" — where the entry sits, reference stop, targets in R.
// Reference values computed independently in Python (see AUTOPILOT.md run 100).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { plan } = require('../assets/js/fibonacci-calculator.js');
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

// Uptrend with your own stop: 55% pullback between 50% and 61.8%.
const up = plan({ high: 1.12, low: 1.10, entry: 1.109, stop: 1.106 });
near(up.depth, 0.55); assert.equal(up.zone.kind, 'between');
assert.equal(up.zone.shallow.ratio, 0.5); assert.equal(up.zone.deep.ratio, 0.618);
assert.equal(up.stop.source, 'custom'); near(up.stop.risk, 0.003);
near(up.targets[0].price, 1.12); near(up.targets[0].r, 3.6666666667, 1e-6);
near(up.targets[1].r, 5.48, 1e-6); near(up.targets[2].r, 7.7866666667, 1e-6);

// Downtrend, stop defaults to the swing start (the high).
const down = plan({ high: 1.12, low: 1.10, direction: 'down', entry: 1.111 });
assert.equal(down.stop.source, 'swing'); near(down.stop.price, 1.12);
near(down.depth, 0.55); near(down.targets[0].price, 1.10);
near(down.targets[0].r, 1.2222222222, 1e-6); near(down.targets[1].r, 1.8266666667, 1e-6); near(down.targets[2].r, 2.5955555556, 1e-6);

// JPY-style 3-decimal prices; entry exactly on 50% counts as "at" with display tolerance.
const jpy = plan({ high: 151.2, low: 148.6, entry: 149.9, eps: 0.0005 });
assert.equal(jpy.zone.kind, 'at'); assert.equal(jpy.zone.level.ratio, 0.5);
near(jpy.targets[0].r, 1, 1e-9); near(jpy.targets[1].r, 1.544, 1e-9);

// Outside the swing.
assert.equal(plan({ high: 120, low: 100, entry: 125 }).zone.kind, 'beyondEnd');
const past = plan({ high: 120, low: 100, entry: 125 });
assert.ok(past.targets[0].reward < 0, 'swing high already passed');
assert.equal(plan({ high: 120, low: 100, entry: 95, stop: 90 }).zone.kind, 'beyondStart');
assert.equal(plan({ high: 120, low: 100, entry: 120, eps: 0.005 }).zone.level.ratio, 0);

// Wrong-side stops and a default stop with no room are refused with plain messages.
assert.throws(() => plan({ high: 120, low: 100, entry: 110, stop: 111 }), /below the entry/);
assert.throws(() => plan({ high: 120, low: 100, direction: 'down', entry: 110, stop: 109 }), /above the entry/);
assert.throws(() => plan({ high: 120, low: 100, entry: 95 }), /no room for a stop/);
assert.throws(() => plan({ high: 120, low: 100, entry: 110, stop: -1 }), /positive stop/);

// Page wiring: optional stop field in the scenario link, 3-decimal precision, plan box present.
const html = fs.readFileSync(path.join(__dirname, '../tools/fibonacci.html'), 'utf8');
assert.match(html, /data-scenario-fields="[^"]*stopPrice[^"]*"/);
assert.match(html, /data-scenario-optional="[^"]*stopPrice[^"]*"/);
assert.match(html, /<option value="3">3 Decimals/);
assert.match(html, /id="fibPlan"[^>]*hidden/);
assert.doesNotMatch(html, /<table style="min-width:480px">/, 'levels table must fit iPhone without a sideways swipe');
console.log('Fibonacci entry plan: zone, stop, R targets, edge cases and page wiring passed.');
