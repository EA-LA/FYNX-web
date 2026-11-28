/* Regression tests for the real Newsroom central-bank monitor. Run with Node. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/cb-monitor.js'), 'utf8');

const goodHistory = [['2026-08', 3.25], ['2026-09', 3.5], ['2026-10', 3.75]];
const valid = () => ({
  source: 'BIS monthly series',
  areas: {
    US: {history: goodHistory},
    GB: {history: [['2026-09', 4.0], ['2026-10', 4.0]]}
  }
});
const validDesk = () => ({
  fed: {
    source: 'fed funds futures',
    effr: {targetFrom: 3.5, targetTo: 3.75},
    odds: {meeting: '2026-12-09', hike: 35, hold: 60, cut: 5}
  }
});
function harness(provider, timer = setTimeout, controller = AbortController) {
  const grid = {innerHTML: ''}, note = {textContent: ''}, listeners = {};
  const host = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === '.cb-grid') return grid;
      if (selector === '[data-cb-source]') return note;
      throw new Error('Unexpected selector: ' + selector);
    },
    contains(node) {return node === retryButton;}
  };
  const retryButton = {};
  const document = {
    querySelector(selector) {
      assert.equal(selector, '[data-cb-monitor]');
      return host;
    },
    addEventListener(type, callback) {
      listeners[type] = callback;
    }
  };
  let calls = 0;
  const fetch = async (url, options) => {
    calls += 1;
    return provider(String(url).includes('/policy.json') ? 'policy' : 'desk', options);
  };
  const sandbox = {document, fetch, AbortController: controller, setTimeout: timer, clearTimeout, console};
  vm.runInNewContext(source, sandbox, {filename: 'cb-monitor.js'});
  return {
    grid, note, get calls() {return calls;},
    retry() {listeners.click({target: {closest: selector => selector === '[data-cb-retry]' ? retryButton : null}});},
    region(name) {listeners.click({target: {closest: selector => selector === '[data-region]' ? {dataset: {region: name}} : null}});}
  };
}
const json = value => ({ok: true, json: async () => value});
const missing = {ok: false, json: async () => {throw new Error('Should not parse 404');}};
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
}
(async () => {
  // An unreachable rate feed cannot leave the skeleton spinning forever.
  const unavailable = harness(async kind => kind === 'policy' ? missing : json(validDesk()));
  await settle();
  assert.match(unavailable.grid.innerHTML, /Retry policy data/);
  assert.match(unavailable.grid.innerHTML, /No estimated rates/);
  assert.equal(unavailable.grid.innerHTML.includes('cb-card'), false);
  console.log('ok 1 - policy feed failure offers an honest retry');

  // A retry actually refetches and paints sourced rates.
  let recovered = false;
  const recovery = harness(async kind => kind === 'policy' ? (recovered ? json(valid()) : missing) : json(validDesk()));
  await settle();
  assert.match(recovery.grid.innerHTML, /Retry policy data/);
  recovered = true;
  recovery.retry();
  await settle();
  assert.match(recovery.grid.innerHTML, /Federal Reserve/);
  assert.match(recovery.grid.innerHTML, /3.75/);
  assert.equal(recovery.calls, 4);
  console.log('ok 2 - retry restores official policy data');

  // One malformed bank must not take down all verified banks.
  const partiallyInvalid = valid();
  partiallyInvalid.areas.GB = {history: [['not-a-month', '4.0']]};
  const partial = harness(async kind => json(kind === 'policy' ? partiallyInvalid : validDesk()));
  await settle();
  assert.match(partial.grid.innerHTML, /Federal Reserve/);
  assert.doesNotMatch(partial.grid.innerHTML, /Bank of England/);
  assert.match(partial.note.textContent, /7 banks omitted/);
  console.log('ok 3 - malformed bank series is isolated');

  // Unordered, missing and non-finite records must not be shown as live rates.
  const invalid = harness(async kind => json(kind === 'policy' ? {
    areas: {US: {history: [['2026-10', 3.5], ['2026-09', 3.75]]}, GB: {history: []}}
  } : validDesk()));
  await settle();
  assert.match(invalid.grid.innerHTML, /Retry policy data/);
  assert.doesNotMatch(invalid.grid.innerHTML, /cb-card/);
  console.log('ok 4 - invalid-only series cannot display invented values');

  const untrustedOdds = validDesk();
  untrustedOdds.fed.odds.hike = '100';
  untrustedOdds.fed.effr.targetFrom = '<script>alert(1)</script>';
  const guarded = harness(async kind => json(kind === 'policy' ? valid() : untrustedOdds));
  await settle();
  assert.match(guarded.grid.innerHTML, /Federal Reserve/);
  assert.doesNotMatch(guarded.grid.innerHTML, /Next FOMC/);
  assert.doesNotMatch(guarded.grid.innerHTML, /<script>/);
  console.log('ok 5 - invalid odds and unsafe policy target content do not render');

  // Region filtering remains functional with the verified subset.
  guarded.region('europe');
  assert.match(guarded.grid.innerHTML, /Bank of England/);
  assert.doesNotMatch(guarded.grid.innerHTML, /Federal Reserve/);
  guarded.region('us');
  assert.match(guarded.grid.innerHTML, /Federal Reserve/);
  console.log('ok 6 - filters still work after feed validation');

  // A valid but several-month-old monthly series must never appear current without a warning.
  const monthFromNow = offset => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
  };
  const oldSeries = {
    source: 'BIS monthly series',
    areas: {US: {history: [[monthFromNow(-5), 3.5], [monthFromNow(-4), 3.75]]}}
  };
  const dated = harness(async kind => json(kind === 'policy' ? oldSeries : validDesk()));
  await settle();
  assert.match(dated.grid.innerHTML, /Older published coverage — verify current rate/);
  assert.match(dated.grid.innerHTML, /Federal Reserve/);
  assert.match(dated.note.textContent, /1 bank has older published coverage/);
  console.log('ok 7 - older monthly observations remain visible with explicit age warnings');

  // A future-dated monthly policy entry cannot be displayed as today's observed rate.
  const futureSeries = {
    source: 'BIS monthly series',
    areas: {US: {history: [[monthFromNow(-1), 3.5], [monthFromNow(1), 4.25]]}}
  };
  const future = harness(async kind => json(kind === 'policy' ? futureSeries : validDesk()));
  await settle();
  assert.match(future.grid.innerHTML, /Verified policy-rate data is unavailable/);
  assert.doesNotMatch(future.grid.innerHTML, /cb-card/);
  console.log('ok 8 - future-effective observations cannot be reported as current');

  // A timely published monthly series does not get an unnecessary stale warning.
  const recentSeries = {
    source: 'BIS monthly series',
    areas: {US: {history: [[monthFromNow(-1), 3.5], [monthFromNow(0), 3.75]]}}
  };
  const recent = harness(async kind => json(kind === 'policy' ? recentSeries : validDesk()));
  await settle();
  assert.match(recent.grid.innerHTML, /Federal Reserve/);
  assert.doesNotMatch(recent.grid.innerHTML, /Older published coverage/);
  console.log('ok 9 - timely monthly observations have no stale-data warning');

  // A never-resolving fetch is terminated instead of showing a permanent skeleton.
  const stalled = harness((_kind, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
  }), callback => setImmediate(callback));
  await settle();
  assert.match(stalled.grid.innerHTML, /Retry policy data/);
  console.log('ok 10 - timed-out fetch resolves to recoverable state');

  const noAbort = harness(async kind => json(kind === 'policy' ? valid() : validDesk()), setTimeout, null);
  await settle();
  assert.match(noAbort.grid.innerHTML, /Federal Reserve/);
  assert.equal(noAbort.calls, 2);
  console.log('ok 11 - browsers without AbortController can load policy rates');

  let recoveredAfterTimeout = false, finishLate;
  const controlledTimers = [];
  const manualTimer = callback => { controlledTimers.push(callback); };
  const ignoredAbort = harness(async kind => {
    if (kind === 'desk') return json(validDesk());
    if (recoveredAfterTimeout) return json(valid());
    return new Promise(resolve => { finishLate = resolve; });
  }, manualTimer);
  controlledTimers.splice(0).forEach(callback => callback());
  await settle();
  assert.match(ignoredAbort.grid.innerHTML, /Retry policy data/);
  recoveredAfterTimeout = true;
  ignoredAbort.retry();
  await settle();
  assert.match(ignoredAbort.grid.innerHTML, /Federal Reserve/);
  finishLate(missing);
  await settle();
  assert.match(ignoredAbort.grid.innerHTML, /Federal Reserve/);
  console.log('ok 12 - ignored abort reaches retry; late response cannot overwrite recovery');

  const stalledBody = harness(async kind => kind === 'policy'
    ? {ok: true, json: () => new Promise(() => {})} : missing,
    callback => setImmediate(callback), null);
  await settle();
  assert.match(stalledBody.grid.innerHTML, /Retry policy data/);
  console.log('ok 13 - body decoding is bounded even without AbortController');

  const optionalStall = harness(async kind => kind === 'policy' ? json(valid()) : new Promise(() => {}),
    callback => setImmediate(callback));
  await settle();
  assert.match(optionalStall.grid.innerHTML, /Federal Reserve/);
  assert.doesNotMatch(optionalStall.grid.innerHTML, /Next FOMC/);
  console.log('ok 14 - stalled optional odds feed does not hide verified rates');
})().catch(error => {console.error(error);process.exitCode = 1;});
