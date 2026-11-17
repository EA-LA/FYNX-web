'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../assets/js/terminal/builder-core.js');

const valid = {
  name: 'Global Market Intelligence',
  description: 'A private snapshot of the S&P 500, gold, and the dollar.',
  category: 'macro',
  main: core.TEMPLATE
};

test('accepts a private finance project and rejects secrets, empty code, and unknown categories', () => {
  const ok = core.validateProject(valid);
  assert.equal(ok.ok, true);
  assert.equal(ok.project.visibility, 'private');
  assert.equal(core.validateProject({...valid, category: 'games'}).ok, false);
  assert.equal(core.validateProject({...valid, description: 'too short'}).ok, false);
  assert.equal(core.validateProject({...valid, main: 'const x = 1;'}).ok, false);
  const secret = core.validateProject({...valid, main: core.TEMPLATE + '\nconst api_key = "super-secret-value";\n'});
  assert.equal(secret.ok, false);
  assert.match(secret.errors.join(' '), /credential|secret/i);
  assert.equal(core.validateProject({...valid, main: 'x'.repeat(core.LIMITS.code + 1)}).ok, false);
});

test('quote snapshots keep only symbol, price, and change', () => {
  const rows = core.snapshotQuotes({SPY: {price: 500.1, changePercent: -0.4, source: 'https://secret.example', extra: {token: 'no'}}});
  assert.deepEqual(rows, [{symbol: 'SPY', price: 500.1, changePercent: -0.4}]);
  assert.equal(JSON.stringify(rows).includes('secret'), false);
});

test('sandbox document blocks the network and does not share the terminal origin', () => {
  assert.match(core.SANDBOX_HTML, /connect-src 'none'/);
  assert.match(core.SANDBOX_HTML, /default-src 'none'/);
  assert.doesNotMatch(core.SANDBOX_HTML, /allow-same-origin/);
  assert.equal(core.SANDBOX_ATTR, 'allow-scripts');
  assert.doesNotMatch(core.SANDBOX_ATTR, /allow-same-origin|allow-top-navigation|allow-popups/);
  assert.match(core.ASSISTANT_PROMPT, /function render\(root, FYNX\)/);
  assert.match(core.ASSISTANT_PROMPT, /cannot access the network/);
});

test('versions keep the previous source and installations stay on the owner layout', () => {
  const first = core.withVersion(null, core.validateProject(valid).project);
  assert.equal(first.version, 1);
  assert.equal(first.versions.length, 0);
  const second = core.withVersion({...first, updatedAt: 10}, {...first, main: first.main + '\n// next\n'});
  assert.equal(second.version, 2);
  assert.equal(second.versions.at(-1).main, first.main);
  const same = core.withVersion(second, second);
  assert.equal(same.version, 2);
  const slot = core.slotFor('p1234abcd5678');
  assert.match(slot, /^mine-[a-z0-9]+$/);
  assert.deepEqual(core.placeWidget(['mkts', null, 'intel'], slot), ['mkts', slot, 'intel']);
  assert.equal(core.placeWidget(Array(28).fill('mkts'), slot), null);
  assert.deepEqual(core.stripWidget(['mkts', slot, 'intel'], slot), ['mkts', null, 'intel']);
});

test('terminal page wires the builder without replacing the desk runtime', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'terminal.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'assets/js/terminal/app.js'), 'utf8');
  const rules = fs.readFileSync(path.join(root, 'backend/rules/firestore.rules'), 'utf8');
  assert.match(html, /id="fx-build"/);
  assert.match(html, /assets\/js\/terminal\/builder\.js/);
  assert.match(html, /assets\/js\/terminal\/app\.js/);
  assert.ok(html.indexOf('builder.js') < html.indexOf('terminal/app.js'));
  assert.match(app, /verb === 'BUILD'/);
  assert.match(rules, /match \/builderProjects\/\{projectId\}/);
  assert.match(rules, /visibility == ['"]private['"]/);
  assert.match(rules, /isOwner\(userId\)/);
});
