'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), { JSDOM } = require('jsdom');
const { create, normalizeArticle, saveRequest, entitled, DRAFT_KEY } = require('../assets/js/news-membership.js');
const { PLANS } = require('../backend/consumer-core.cjs');
const article = { title: 'Rates and the next session', source: 'Federal Reserve', url: 'https://www.federalreserve.gov/newsevents.htm', publishedAt: '2026-10-20T10:00:00Z' };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
function harness(options = {}) {
  const dom = new JSDOM('<!doctype html><button id="start">Save research</button>', { url: 'https://www.fynxfinanceworld.com/news/news.html' + (options.query || '') });
  const win = dom.window, calls = []; win.crypto.randomUUID = require('node:crypto').randomUUID; let user = options.user ? { uid: 'owner' } : null, listener, loads = 0;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (options.fastTimeout) { const timer = win.setTimeout.bind(win); win.setTimeout = (fn, ms) => timer(fn, ms === 8500 ? 5 : ms); }
  if (options.draft) win.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(options.draft));
  const services = async () => { loads++; return { getUser: () => user, onAccountChange: fn => { listener = fn; }, call: async data => {
    calls.push(data); if (options.call) { const result = await options.call(data); if (result !== undefined) return result; }
    if (data.action === 'status') return { mode: 'live', features: { researchNotesVersion: 1 }, tier: options.tier || null, plans: PLANS, billingUnavailable: !!options.unavailable };
    return { saved: true, id: 'saved-note' };
  } }; };
  const api = create({ window: win, services });
  return { api, win, doc: win.document, calls, loads: () => loads, changeUser: next => { user = next; listener?.(next); }, open: () => api.saveResearch(article),
    submit: () => win.document.querySelector('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })), close: () => win.close() };
}
test('initial public rendering never imports account services', async () => {
  const h = harness(); await tick(); assert.equal(h.loads(), 0); assert.equal(h.calls.length, 0); assert.equal(h.doc.querySelector('dialog'), null); h.close();
});
test('guests can read the source and see honest monthly web membership pricing', async () => {
  const h = harness(); await h.open(); assert.equal(h.calls.length, 0);
  assert.match(h.doc.querySelector('.news-member-primary').textContent, /5.99\/month/);
  assert.match(h.doc.body.textContent, /Publisher subscriptions are separate/);
  assert.match(h.doc.body.textContent, /not automatically interchangeable/);
  assert.equal(h.doc.querySelector('.news-member-free').href, article.url);
  assert.equal(h.doc.querySelector('button[form]'), null); h.close();
});
test('server-verified Essential access saves original citation and notes to the current account', async () => {
  const h = harness({ user: true, tier: 'starter' }); await h.open();
  h.doc.querySelector('[name="notes"]').value = 'Watch the release, not a price forecast.';
  h.submit(); await tick(); const payload = h.calls.find(x => x.action === 'save');
  assert.equal(payload.accountUid, 'owner'); assert.equal(payload.product, 'watchlist');
  assert.match(payload.requestId, /^[\da-f-]{36}$/i); assert.deepEqual(payload.input.symbols, ['MARKET NEWS']);
  assert.match(payload.input.notes, /https:\/\/www.federalreserve.gov\/newsevents.htm/);
  assert.match(payload.input.notes, /2026-10-20/); assert.match(payload.input.notes, /Watch the release/);
  assert.match(h.doc.querySelector('[role="status"]').textContent, /Saved to your account/); assert.equal(h.win.sessionStorage.getItem(DRAFT_KEY), null); h.close();
});
test('checkout flags and local status cannot grant access', async () => {
  const h = harness({ user: true, query: '?checkout=complete&paid=true&tier=pro' }); h.win.localStorage.setItem('isPro', 'true'); await h.open();
  assert.equal(h.doc.querySelector('button[form]'), null); h.submit(); await tick(); assert.equal(h.calls.some(c => c.action === 'save'), false); h.close();
});
test('unavailable provider verification leaves access locked and source reading available', async () => {
  const h = harness({ user: true, tier: 'pro', unavailable: true }); await h.open();
  assert.equal(h.doc.querySelector('button[form]'), null); assert.match(h.doc.body.textContent, /Retry membership check/); assert.equal(h.doc.querySelector('.news-member-free').href, article.url); h.close();
});
test('slow account service stops waiting and offers recovery without blocking public coverage', async () => {
  const h = harness({ user: true, fastTimeout: true, call: data => data.action === 'status' ? new Promise(() => {}) : undefined });
  await h.open(); assert.match(h.doc.querySelector('[role="status"]').textContent, /taking too long/); assert.equal(h.doc.querySelector('button[form]'), null); assert.equal(h.doc.querySelector('.news-member-free').href, article.url); h.close();
});
test('late membership response cannot restore access after the account changes', async () => {
  let resolve; const h = harness({ user: true, call: data => data.action === 'status' ? new Promise(r => { resolve = r; }) : undefined });
  const pending = h.open(); await tick(); h.doc.querySelector('[name="notes"]').value='Private note'; h.doc.querySelector('[name="labels"]').value='PRIVATE LABEL'; h.changeUser({ uid: 'other' }); resolve({ mode: 'live', tier: 'pro', plans: PLANS }); await pending;
  assert.equal(h.doc.querySelector('button[form]'), null); assert.match(h.doc.querySelector('[role="status"]').textContent, /account changed/); assert.equal(h.doc.querySelector('[name="notes"]').value,''); assert.equal(h.doc.querySelector('[name="labels"]').value,'Market news'); h.close();
});
test('closing during a request discards a late response and restores focus', async () => {
  let resolve; const h = harness({ user: true, call: data => data.action === 'status' ? new Promise(r => { resolve = r; }) : undefined });
  h.doc.getElementById('start').focus(); const pending = h.open(); await tick(); h.doc.querySelector('.news-member-close').click(); resolve({ mode: 'live', tier: 'pro', plans: PLANS }); await pending;
  assert.equal(h.doc.querySelector('dialog').open, false); assert.equal(h.doc.activeElement.id, 'start'); assert.equal(h.doc.querySelector('button[form]'), null); h.close();
});
test('failed save retry uses the same request ID and preserves the draft', async () => {
  let attempts = 0; const h = harness({ user: true, tier: 'starter', call: data => { if (data.action === 'save' && attempts++ === 0) throw Error('Connection interrupted'); } });
  await h.open(); h.doc.querySelector('[name="notes"]').value = 'My thesis'; h.submit(); await tick();
  assert.match(h.doc.querySelector('[role="status"]').textContent, /Connection interrupted/);
  assert.equal(JSON.parse(h.win.sessionStorage.getItem(DRAFT_KEY)).ownerUid, 'owner'); h.submit(); await tick();
  const saves = h.calls.filter(x => x.action === 'save'); assert.equal(saves.length, 2); assert.equal(saves[0].requestId, saves[1].requestId); h.close();
});
test('plan navigation preserves a tab draft and binds an anonymous draft after sign-in', async () => {
  const h = harness(); await h.open(); h.doc.querySelector('[name="notes"]').value = 'Private draft';
  const link = h.doc.querySelector('.news-member-primary'); link.onclick(); const draft = JSON.parse(h.win.sessionStorage.getItem(DRAFT_KEY));
  assert.equal(draft.notes, 'Private draft'); assert.equal(draft.ownerUid, null); assert.equal(draft.claimOnSignIn, true); h.close();
  const next = harness({ user: true, tier: 'starter', query: '?resumeResearch=1', draft }); await tick(); await tick();
  assert.equal(next.doc.querySelector('[name="notes"]').value, 'Private draft'); assert.equal(JSON.parse(next.win.sessionStorage.getItem(DRAFT_KEY)).ownerUid, 'owner'); next.close();
});
test('a different signed-in account cannot recover another account draft', async () => {
  const h = harness({ user: true, query: '?resumeResearch=1', draft: { article, notes: 'Other private note', labels: 'AAPL', ownerUid: 'other', createdAt: Date.now(), returnPath: '/news.html' } });
  await tick(); await tick(); assert.equal(h.doc.querySelector('dialog'), null); assert.equal(h.win.sessionStorage.getItem(DRAFT_KEY), null); h.close();
});
test('unsafe URLs and oversized notes are rejected and source titles never become HTML', async () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com']) assert.throws(() => normalizeArticle({ ...article, url }));
  assert.throws(() => saveRequest(normalizeArticle(article), '', '', 'owner', 'id'), /labels/);
  assert.throws(() => saveRequest(normalizeArticle(article), 'AAPL', 'x'.repeat(2001), 'owner', 'id'), /Shorten/);
  assert.equal(entitled({ mode: 'test', tier: 'pro', plans: PLANS }), false);
  const h = harness(); await h.api.saveResearch({ ...article, title: '<img src=x onerror=alert(1)>' }); assert.equal(h.doc.querySelector('img'), null); h.close();
});


test('revoked membership on save locks the dialog until membership is checked again',async()=>{
 const h=harness({user:true,tier:'starter',call:data=>{if(data.action==='save')throw Object.assign(Error('Membership ended'),{code:'functions/permission-denied'});}});
 await h.open();h.submit();await tick();assert.equal(h.doc.querySelector('button[form]'),null);assert.match(h.doc.body.textContent,/Retry membership check/);h.close();
});


test('an older server cannot enable new research-save promises',async()=>{
 const h=harness({user:true,tier:'starter',call:data=>data.action==='status'?{mode:'live',tier:'starter',plans:PLANS}:undefined});
 await h.open();assert.equal(h.doc.querySelector('button[form]'),null);assert.match(h.doc.querySelector('[role="status"]').textContent,/being updated/);h.close();
});
