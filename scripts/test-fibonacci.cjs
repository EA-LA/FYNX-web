const assert = require('node:assert/strict');
const { calculate, customPullbackPrice } = require('../assets/js/fibonacci-calculator.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const up = calculate({ high: 120, low: 100, entry: 112.4 });
near(up.range, 20); near(up.retracements[1].price, 112.36); near(up.retracements[3].price, 107.64);
near(up.extensions[1].price, 132.36); assert.equal(up.nearest.ratio, 0.382);
const down = calculate({ high: 120, low: 100, direction: 'down' });
near(down.retracements[3].price, 112.36); near(down.extensions[1].price, 87.64); assert.equal(down.nearest, null);
near(calculate({ high: 1.12, low: 1.10 }).retracements[1].price, 1.11236);
for (const args of [{high:100,low:100},{high:99,low:100},{high:100,low:0},{high:NaN,low:10},{high:Infinity,low:10},{high:100,low:10,entry:-1},{high:100,low:10,entry:Infinity},{high:100,low:10,direction:'invalid'}]) assert.throws(() => calculate(args));
console.log('Fibonacci: up/down arithmetic, decimal precision, nearest level and invalid input checks passed.');

const custom = (percent, direction = 'up', high = 120, low = 100) =>
  customPullbackPrice({high, low, percent, direction});
near(custom(70.5), 105.9);
near(custom(70.5, 'down'), 114.1);
near(custom(61.8), up.retracements[3].price);
assert.equal(custom(0, 'up'), 120);
assert.equal(custom(0, 'down'), 100);
assert.equal(custom(100, 'up', 1e18, 0.01), 0.01);
assert.equal(custom(100, 'down'), 120);
for (const percent of [-0.1, 100.01, NaN, Infinity, '50']) {
  assert.throws(() => custom(percent), /percentage/);
}
assert.throws(() => custom(50, 'up', 100, 120), /swing/);
assert.throws(() => custom(50, 'unknown'), /uptrend or downtrend/);
console.log('Custom pullback: direction, exact endpoints, standard-ratio compatibility and validation passed.');
