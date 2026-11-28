'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('welcome.html', 'utf8');
const source = fs.readFileSync('assets/js/welcome.js', 'utf8');

async function setup({initial = {signedIn: true}, response} = {}) {
  const dom = new JSDOM(html, {
    url: 'https://www.fynxfinanceworld.com/welcome.html?plan=pro',
    runScripts: 'outside-only'
  });
  const w = dom.window;
  let calls = 0, meter = {limit: 15, left: 12}, listener;
  w.setTimeout = fn => { fn(); return 0; };
  w.FYNXPlan = {
    ready: async () => initial,
    refresh: async () => { calls++; return response; },
    NAMES: {starter: 'Essential', plus: 'Plus', pro: 'Professional'},
    PRICES: {starter: '$5.99', plus: '$10.99', pro: '$30.99'},
    PERKS: {starter: ['Six Pro tools'], plus: ['Seven Pro tools'], pro: ['Eight Pro tools']},
    meter: () => meter,
    onChange: fn => { listener = fn; }
  };
  w.eval(source);
  await new Promise(resolve => setImmediate(resolve));
  return {dom, document: w.document, calls, emit: (state, nextMeter = meter) => { meter = nextMeter; listener(state); }};
}

test('verified existing membership shows actual tier and published rate, not a new payment receipt', async () => {
  const h = await setup({response: {signedIn: true, verified: true, tier: 'starter'}});
  try {
    const d = h.document;
    assert.equal(d.getElementById('wlWelcome').hidden, false);
    assert.equal(d.getElementById('wlPlan').textContent, 'Essential');
    assert.equal(d.getElementById('wlPrice').textContent, '$5.99 / month');
    assert.match(d.getElementById('wlPrice').parentElement.textContent, /WEBSITE LIST PRICE/);
    assert.match(d.getElementById('wlVerificationNote').textContent, /not a new payment/);
    assert.match(d.getElementById('wlVerificationNote').textContent, /Apple/);
    assert.match(d.querySelector('.wl-unlocked h2').textContent, /Included with your membership/);
    assert.equal(d.getElementById('wlStart').getAttribute('href'), '/pro.html?tool=analytics#workbench');
    assert.equal(h.calls, 1);
  } finally { h.dom.window.close(); }
});

test('unverified paid-tier hint cannot open the welcome tour', async () => {
  const h = await setup({response: {signedIn: true, verified: false, tier: 'pro'}});
  try {
    const d = h.document;
    assert.equal(d.getElementById('wlWelcome').hidden, true);
    assert.equal(d.getElementById('wlPending').hidden, false);
    assert.match(d.getElementById('wlPending').textContent, /membership could not be verified/);
    assert.doesNotMatch(d.getElementById('wlPending').textContent, /Stripe has not confirmed/);
    assert.equal(h.calls, 6);
  } finally { h.dom.window.close(); }
});

test('sign-out during verification returns to sign-in instead of polling for payment', async () => {
  const h = await setup({response: {signedIn: false, verified: true, tier: 'guest'}});
  try {
    assert.equal(h.document.getElementById('wlGuest').hidden, false);
    assert.equal(h.document.getElementById('wlWelcome').hidden, true);
    assert.equal(h.calls, 1);
  } finally { h.dom.window.close(); }
});

test('paid welcome refreshes the allowance when server usage arrives without restarting the tour', async () => {
  const membership = {uid: 'paid-a', signedIn: true, verified: true, tier: 'starter'};
  const h = await setup({response: membership});
  try {
    const d = h.document;
    d.getElementById('wlNext').click();
    assert.equal(d.querySelector('#wlSteps h3').textContent, 'More room in the Terminal');
    h.emit(membership, {limit: 15, left: 4});
    assert.equal(d.getElementById('wlToday').textContent, '4 of 15 analyses left');
    assert.equal(d.querySelector('#wlSteps h3').textContent, 'More room in the Terminal');
    assert.match(d.querySelector('#wlWelcome > .wl-fine').textContent, /00:00 UTC/);
    assert.match(d.querySelector('#wlWelcome > .wl-fine').textContent, /local allowance/);
  } finally { h.dom.window.close(); }
});

test('paid welcome hides the previous membership after account, tier, or verification changes', async () => {
  const membership = {uid: 'paid-a', signedIn: true, verified: true, tier: 'starter'};
  for (const next of [
    {...membership, uid: 'paid-b'},
    {...membership, tier: 'plus'},
    {...membership, verified: false},
    {uid: null, signedIn: false, verified: true, tier: 'guest'}
  ]) {
    const h = await setup({response: membership});
    try {
      h.emit(next);
      assert.equal(h.document.getElementById('wlWelcome').hidden, true);
      assert.equal(h.document.getElementById(next.signedIn ? 'wlPending' : 'wlGuest').hidden, false);
    } finally { h.dom.window.close(); }
  }
});
