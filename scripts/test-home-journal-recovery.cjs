'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/terminal-home.css'), 'utf8');
const source = fs.readFileSync(path.join(root, 'assets/js/home-journal.js'), 'utf8');

function setup() {
 const elements = Object.fromEntries(['homeStatsStatus','homeJournalRetry','homePnl','homeTrades','homeWinRate']
  .map(id => [id, {textContent:'',hidden:false,disabled:false,addEventListener(event, fn) {if (event === 'click') this.click = fn;}}]));
 const auth = {currentUser:null};
 const subscriptions = [];
 let changed, throwOnSubscribe = false;
 const sandbox = {
  auth, app:{},
  document:{getElementById(id) {return elements[id];}},
  onAuthStateChanged(_auth, cb) {changed=cb;},
  getFirestore() {return {};},
  collection(_db, owner, uid, category) {
   assert.equal(owner, 'users');
   assert.equal(category, 'trades');
   if (throwOnSubscribe) throw new Error('Simulated unavailable store');
   return uid;
  },
  onSnapshot(_path, success, failed) {
   const item = {success, failed, unsubscribed:0};
   subscriptions.push(item);
   return () => item.unsubscribed++;
  }
 };
 const plainScript = source.replace(/^import\s+.*;\s*$/gm,'');
 assert.doesNotMatch(plainScript, /^import\s/m, 'Test must load all module source after removing only import declarations');
 vm.runInNewContext(plainScript, sandbox, {filename:'home-journal.js'});
 return {
  elements, auth, subscriptions,
  login(uid) { auth.currentUser = {uid}; changed(auth.currentUser); },
  logout() { auth.currentUser = null; changed(null); },
  clickRetry() { elements.homeJournalRetry.click(); },
  throwOnSubscribe(value) { throwOnSubscribe = value; }
 };
}
const snapshot = values => ({empty:values.length===0,docs:values.map(value=>({data:()=>value}))});

test('Home includes a real accessible, initially hidden, mobile-sized retry action', () => {
 assert.match(html, /id="homeStatsStatus"[^>]*role="status"[^>]*aria-live="polite"/);
 assert.match(html, /<button[^>]*type="button"[^>]*id="homeJournalRetry"[^>]*hidden>/);
 assert.match(html, /home-journal\.js\?v=20261117-journal-retry/);
 assert.match(html, /terminal-home\.css\?v=20261117-journal-retry/);
 assert.match(css, /\.nr-actions \.nr-journal-retry\s*\{[^}]*min-height:\s*44px/);
 assert.match(css, /\.nr-journal-retry:focus-visible/);
 assert.match(css, /\.nr-journal-retry\[hidden\]/);
});

test('Successful journal sync hides retry and shows verified summary', () => {
 const e=setup();
 assert.equal(e.elements.homeJournalRetry.hidden, true);
 e.login('account-a');
 assert.equal(e.subscriptions.length, 1);
 e.subscriptions[0].success(snapshot([{pl:100},{pl:-25}]));
 assert.equal(e.elements.homeTrades.textContent, 2);
 assert.equal(e.elements.homePnl.textContent, '$75.00');
 assert.equal(e.elements.homeWinRate.textContent, '50.0%');
 assert.match(e.elements.homeStatsStatus.textContent, /Synced with your saved journal/);
 assert.equal(e.elements.homeJournalRetry.hidden, true);
});

test('Subscription failure preserves verified figures, warns that they are stale, and offers retry', () => {
 const e=setup();
 e.login('account-a');
 e.subscriptions[0].success(snapshot([{pl:80}]));
 e.subscriptions[0].failed(new Error('offline'));
 assert.equal(e.elements.homePnl.textContent,'$80.00');
 assert.match(e.elements.homeStatsStatus.textContent,/may be out of date/);
 assert.equal(e.elements.homeJournalRetry.hidden,false);
 assert.equal(e.elements.homeJournalRetry.disabled,false);
 assert.equal(e.subscriptions[0].unsubscribed,1);
});

test('Retry reconnects the same user and recovers on next valid snapshot', () => {
 const e=setup();
 e.login('account-a');
 e.subscriptions[0].failed(new Error('network'));
 e.clickRetry();
 assert.equal(e.subscriptions.length,2);
 assert.equal(e.elements.homeJournalRetry.disabled,true);
 assert.equal(e.elements.homeJournalRetry.hidden,false);
 assert.match(e.elements.homeStatsStatus.textContent,/Reconnecting/);
 e.subscriptions[1].success(snapshot([{pl:-10},{pl:40}]));
 assert.equal(e.elements.homePnl.textContent,'$30.00');
 assert.equal(e.elements.homeJournalRetry.hidden,true);
 assert.equal(e.elements.homeJournalRetry.disabled,false);
});

test('Sign-out clears private figures and hides a previously visible retry', () => {
 const e=setup();
 e.login('account-a');
 e.subscriptions[0].success(snapshot([{pl:120}]));
 e.subscriptions[0].failed(new Error('offline'));
 e.logout();
 assert.equal(e.elements.homePnl.textContent,'—');
 assert.equal(e.elements.homeTrades.textContent,0);
 assert.equal(e.elements.homeJournalRetry.hidden,true);
 assert.match(e.elements.homeStatsStatus.textContent,/Sign in/);
 e.subscriptions[0].success(snapshot([{pl:300}]));
 e.subscriptions[0].failed(new Error('late'));
 assert.equal(e.elements.homePnl.textContent,'—');
 assert.equal(e.elements.homeJournalRetry.hidden,true);
});

test('Callbacks from previous account cannot replace the current account figures', () => {
 const e=setup();
 e.login('account-a');
 e.login('account-b');
 assert.equal(e.subscriptions[0].unsubscribed,1);
 e.subscriptions[1].success(snapshot([{pl:45}]));
 e.subscriptions[0].success(snapshot([{pl:9000}]));
 e.subscriptions[0].failed(new Error('old'));
 assert.equal(e.elements.homePnl.textContent,'$45.00');
 assert.equal(e.elements.homeJournalRetry.hidden,true);
});

test('Retry never reuses an old user while Firebase account state is changing', () => {
 const e=setup();
 e.login('account-a');
 e.subscriptions[0].failed(new Error('offline'));
 e.auth.currentUser = null;
 e.clickRetry();
 assert.equal(e.subscriptions.length,1);
 assert.equal(e.elements.homeJournalRetry.hidden,true);
 assert.match(e.elements.homeStatsStatus.textContent,/Sign in/);
});

test('Synchronous listener setup errors expose the same actionable retry state', () => {
 const e=setup();
 e.throwOnSubscribe(true);
 e.login('account-a');
 assert.equal(e.subscriptions.length,0);
 assert.equal(e.elements.homeJournalRetry.hidden,false);
 assert.match(e.elements.homeStatsStatus.textContent,/Journal sync unavailable/);
 e.throwOnSubscribe(false);
 e.clickRetry();
 assert.equal(e.subscriptions.length,1);
 e.subscriptions[0].success(snapshot([]));
 assert.match(e.elements.homeStatsStatus.textContent,/Record your first trade/);
 assert.equal(e.elements.homeJournalRetry.hidden,true);
});
