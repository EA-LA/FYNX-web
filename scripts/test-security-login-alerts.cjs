'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'security.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'assets/js/security-login-alerts.mjs'), 'utf8');
const controllerModule = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

async function makeHarness(save = async () => {}) {
  const { createLoginAlertsController } = await controllerModule;
  const names = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const button = {
    disabled: false,
    classList: {
      contains(name) { return names.has(name); },
      toggle(name, force) { if (force) names.add(name); else names.delete(name); }
    },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.get(name); },
    addEventListener(name, callback) { listeners.set(name, callback); }
  };
  const status = { textContent: '' };
  const controller = createLoginAlertsController({ button, status, save });
  return { button, status, controller, click: () => listeners.get('click')(), isOn: () => names.has('on') };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('Security page uses an accessible, disabled-until-loaded switch and visible save status', () => {
  assert.match(html, /id="loginAlertsSwitch"[^>]*role="switch"[^>]*aria-label="Login alerts"[^>]*aria-checked="false"[^>]*disabled/);
  assert.match(html, /id="loginAlertsStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /createLoginAlertsController/);
  assert.match(html, /saveSecuritySettings\(uid,\s*\{\s*loginAlerts:\s*enabled\s*\}\)/);
  assert.doesNotMatch(html, /loginAlertsSwitch\.onclick/);
  assert.match(html, /loginAlertController\.setAccount\(user\.uid,\s*null\)/);
  assert.match(html, /revision !== authRevision \|\| auth\.currentUser\?\.uid !== user\.uid/);
});

test('Switch starts unavailable until a confirmed account value arrives', async () => {
  const h = await makeHarness();
  assert.equal(h.button.disabled, true);
  assert.equal(h.button.getAttribute('aria-checked'), 'false');
  assert.match(h.status.textContent, /Checking/);
  h.controller.setAccount('alpha', true);
  assert.equal(h.button.disabled, false);
  assert.equal(h.button.getAttribute('aria-checked'), 'true');
  assert.equal(h.isOn(), true);
});

test('A successful save only changes the switch after confirmation', async () => {
  const gate = deferred();
  const saves = [];
  const h = await makeHarness((uid, enabled) => { saves.push([uid, enabled]); return gate.promise; });
  h.controller.setAccount('alpha', true);
  const attempt = h.click();
  assert.deepEqual(saves, [['alpha', false]]);
  assert.equal(h.button.disabled, true);
  assert.equal(h.isOn(), true);
  assert.equal(h.button.getAttribute('aria-busy'), 'true');
  assert.match(h.status.textContent, /Saving/);
  gate.resolve();
  await attempt;
  assert.equal(h.isOn(), false);
  assert.equal(h.button.getAttribute('aria-checked'), 'false');
  assert.equal(h.button.disabled, false);
  assert.equal(h.button.getAttribute('aria-busy'), 'false');
  assert.match(h.status.textContent, /disabled/);
});

test('Failed saves preserve the last confirmed value and allow retry', async () => {
  let fail = true;
  const h = await makeHarness(async () => { if (fail) throw Error('simulated offline'); });
  h.controller.setAccount('alpha', false);
  await h.click();
  assert.equal(h.isOn(), false);
  assert.equal(h.button.getAttribute('aria-checked'), 'false');
  assert.equal(h.button.disabled, false);
  assert.match(h.status.textContent, /Could not save.*Try again/);
  fail = false;
  await h.click();
  assert.equal(h.isOn(), true);
  assert.match(h.status.textContent, /enabled/);
});

test('Pending saves reject duplicate taps', async () => {
  const gate = deferred();
  let count = 0;
  const h = await makeHarness(() => { count += 1; return gate.promise; });
  h.controller.setAccount('alpha', false);
  const first = h.click();
  await h.click();
  assert.equal(count, 1);
  gate.resolve();
  await first;
  assert.equal(h.isOn(), true);
});

test('A late save from a signed-out or different account cannot replace its settings', async () => {
  const gate = deferred();
  const h = await makeHarness(() => gate.promise);
  h.controller.setAccount('alpha', false);
  const oldRequest = h.click();
  h.controller.setAccount('beta', true);
  gate.resolve();
  await oldRequest;
  assert.equal(h.isOn(), true);
  assert.equal(h.button.disabled, false);
  assert.equal(h.button.getAttribute('aria-checked'), 'true');
  h.controller.setAccount(null);
  assert.equal(h.button.disabled, true);
  assert.equal(h.isOn(), false);
  assert.match(h.status.textContent, /Sign in/);
});

test('Missing authentication or an unreadable preference cannot silently write', async () => {
  let writes = 0;
  const h = await makeHarness(async () => { writes += 1; });
  h.controller.setAccount('alpha', null);
  assert.equal(h.button.disabled, true);
  assert.match(h.status.textContent, /Could not load/);
  await h.click();
  h.controller.setAccount(null, true);
  await h.click();
  assert.equal(writes, 0);
});
