'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/auto-refresh.js'), 'utf8');

async function setup() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <main>
      <button id="refreshBtn">Refresh</button>
      <button id="retryVix">Try again</button>
      <button id="check-alerts">Check now</button>
      <div id="hiddenPanel" hidden><button id="hiddenRefresh">Refresh</button></div>
      <div id="ariaPanel" aria-hidden="true"><button id="ariaRefresh">Refresh</button></div>
      <div id="cssPanel" style="display:none"><button id="cssRefresh">Refresh</button></div>
      <div id="inertPanel" inert><button id="inertRefresh">Refresh</button></div>
      <fieldset id="disabledGroup" disabled><button id="fieldsetRefresh" type="button">Refresh</button></fieldset>
      <button id="ariaDisabledRefresh" aria-disabled="true">Refresh</button>
      <button id="billing-refresh">Refresh</button>
      <form><button id="submit" type="submit">Refresh</button></form>
    </main>
  </body></html>`, {url: 'https://www.fynxfinanceworld.com/', runScripts: 'outside-only'});
  const {window} = dom;
  // JSDOM reports a background tab by default; exercise foreground refresh semantics.
  Object.defineProperty(window.document, 'hidden', {configurable: true, value: false});
  let now = 1000000000000;
  const ticks = [];
  window.Date.now = () => now;
  window.setInterval = callback => { ticks.push(callback); return ticks.length; };
  const ready = new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, {once: true}));
  window.eval(source);
  await ready;
  return {
    window, document: window.document, ticks,
    advance: milliseconds => { now += milliseconds; ticks.forEach(callback => callback()); },
    close: () => window.close()
  };
}

test('manual refresh and retry remain visible, keyboard-focusable, and actionable', async () => {
  const app = await setup();
  try {
    for (const id of ['refreshBtn', 'retryVix', 'check-alerts']) {
      const button = app.document.getElementById(id);
      assert.equal(button.dataset.fxAuto, '1', id + ' auto-refresh registration');
      assert.notEqual(button.getAttribute('aria-hidden'), 'true', id + ' must be accessible');
      assert.notEqual(button.tabIndex, -1, id + ' must remain focusable');
      assert.equal(app.window.getComputedStyle(button).display === 'none', false, id + ' must remain visible');
      const chip = button.nextElementSibling;
      assert.equal(chip.classList.contains('fx-auto'), true);
      assert.equal(chip.getAttribute('aria-hidden'), 'true', 'countdown must not announce every second');
      let clicked = 0;
      button.addEventListener('click', () => clicked++);
      button.click();
      assert.equal(clicked, 1, id + ' manual recovery works without a timer');
    }
  } finally { app.close(); }
});

test('automatic updates still trigger after ten minutes without requiring user action', async () => {
  const app = await setup();
  try {
    const button = app.document.getElementById('refreshBtn');
    let calls = 0;
    button.addEventListener('click', () => calls++);
    assert.equal(app.ticks.length, 1, 'one background clock');
    app.advance(9 * 60 * 1000);
    assert.equal(calls, 0, 'do not refresh prematurely');
    app.advance(61 * 1000);
    assert.equal(calls, 1, 'refresh at next interval');
    button.click();
    assert.equal(calls, 2, 'manual refresh remains available after automatic refresh');
  } finally { app.close(); }
});

test('billing refresh, form submit, and disabled controls are not auto-clicked', async () => {
  const app = await setup();
  try {
    const billing = app.document.getElementById('billing-refresh');
    const submit = app.document.getElementById('submit');
    const retry = app.document.getElementById('retryVix');
    let billingCalls = 0, submitCalls = 0, retryCalls = 0;
    billing.addEventListener('click', () => billingCalls++);
    submit.addEventListener('click', event => { event.preventDefault(); submitCalls++; });
    retry.addEventListener('click', () => retryCalls++);
    retry.disabled = true;
    assert.equal(billing.dataset.fxAuto, undefined);
    assert.equal(submit.dataset.fxAuto, undefined);
    app.advance(10 * 60 * 1000 + 1);
    assert.equal(billingCalls, 0);
    assert.equal(submitCalls, 0);
    assert.equal(retryCalls, 0);
    assert.notEqual(retry.getAttribute('aria-hidden'), 'true');
  } finally { app.close(); }
});
 

test('inactive sections never auto-click and become eligible again after reopening', async () => {
  const app = await setup();
  try {
    const ids = ['hiddenRefresh', 'ariaRefresh', 'cssRefresh', 'inertRefresh', 'fieldsetRefresh', 'ariaDisabledRefresh'];
    const clicks = new Map(ids.map(id => [id, 0]));
    for (const id of ids) {
      const button = app.document.getElementById(id);
      assert.equal(button.dataset.fxAuto, '1', id + ' still retains its manual control');
      button.addEventListener('click', () => clicks.set(id, clicks.get(id) + 1));
    }

    app.advance(10 * 60 * 1000 + 1);
    for (const id of ids) assert.equal(clicks.get(id), 0, id + ' must not be triggered while inactive');

    app.document.getElementById('hiddenPanel').hidden = false;
    app.document.getElementById('ariaPanel').removeAttribute('aria-hidden');
    app.document.getElementById('cssPanel').style.display = 'block';
    app.document.getElementById('inertPanel').removeAttribute('inert');
    app.document.getElementById('disabledGroup').disabled = false;
    app.document.getElementById('ariaDisabledRefresh').removeAttribute('aria-disabled');

    app.advance(10 * 60 * 1000 + 1);
    for (const id of ids) assert.equal(clicks.get(id), 1, id + ' should resume once its section is active');
  } finally { app.close(); }
});

test('visibility:hidden ancestors prevent timer actions without disabling manual refresh', async () => {
  const app = await setup();
  try {
    const button = app.document.getElementById('refreshBtn');
    let calls = 0;
    button.addEventListener('click', () => calls++);
    button.parentElement.style.visibility = 'hidden';
    app.advance(10 * 60 * 1000 + 1);
    assert.equal(calls, 0, 'hidden parent must prevent background clicks');
    button.parentElement.style.visibility = 'visible';
    app.advance(10 * 60 * 1000 + 1);
    assert.equal(calls, 1, 'visible parent allows the next regular refresh');
    button.click();
    assert.equal(calls, 2, 'manual refresh remains available');
  } finally { app.close(); }
});
