'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/cloud-reminders.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function harness() {
  const calls = [];
  const status = { textContent: '' };
  const list = {
    rows: [],
    textContent: '',
    replaceChildren() { this.rows = []; this.textContent = ''; },
    append(item) { this.rows.push(item); }
  };
  const save = { disabled: false, onclick: null };
  const refreshButton = { onclick: null };
  const consent = { checked: true };
  const nodes = {
    '#cloudReminderStatus': status,
    '#cloudReminderList': list,
    '#saveCloudReminder': save,
    '#refreshCloudReminders': refreshButton,
    '#cloudReminderConsent': consent
  };
  const section = {
    style: {},
    querySelector(selector) { return nodes[selector]; }
  };
  const inputs = {
    eventDate: '2026-11-12', eventTime: '08:30', eventName: 'CPI',
    eventNote: 'Check DXY', reminderOffset: '15'
  };
  const document = {
    createElement(tag) {
      if (tag === 'section') return section;
      return {
        textContent: '', style: {}, children: [], disabled: false,
        append(item) { this.children.push(item); }
      };
    },
    querySelector(selector) {
      return selector === '.alerts-wrap' ? { before() {} } : { append() {} };
    },
    getElementById(id) { return { value: inputs[id] }; }
  };
  const auth = { currentUser: { uid: 'trader-1' } };
  let authChanged;
  const cloudCall = (name, data, options) => {
    const request = { name, data, options, ...deferred() };
    calls.push(request);
    return request.promise;
  };
  vm.runInNewContext(source, {
    document, auth, cloudCall, Date, console,
    crypto: { randomUUID: () => 'test-id' },
    onAuthStateChanged(_auth, callback) {
      authChanged = callback;
      callback(auth.currentUser);
    }
  }, { filename: 'cloud-reminders.js' });
  return {
    calls, status, list, save, refreshButton,
    changeUser(user) { auth.currentUser = user; authChanged(user); }
  };
}

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function reminder(name) {
  return { id: name, name, status: 'sent', reminderAt: '2026-11-12T16:15:00Z' };
}

test('last requested reminder list wins, even when earlier responses arrive later', async () => {
  const h = harness();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.expectedUid, 'trader-1');
  h.refreshButton.onclick();
  h.refreshButton.onclick();
  assert.equal(h.calls.length, 3);
  h.calls[2].resolve({ reminders: [reminder('Newest')] });
  await settle();
  assert.equal(h.list.rows.length, 1);
  assert.match(h.list.rows[0].children[0].textContent, /Newest/);
  h.calls[0].resolve({ reminders: [reminder('Outdated')] });
  h.calls[1].resolve({ reminders: [reminder('Also outdated')] });
  await settle();
  assert.equal(h.list.rows.length, 1);
  assert.match(h.list.rows[0].children[0].textContent, /Newest/);
});

test('a stale failed refresh does not replace the newer successful state with an error', async () => {
  const h = harness();
  h.refreshButton.onclick();
  h.calls[1].resolve({ reminders: [reminder('Fresh')] });
  await settle();
  h.calls[0].reject(new Error('Old network failure'));
  await settle();
  assert.doesNotMatch(h.status.textContent, /Old network failure/);
  assert.match(h.list.rows[0].children[0].textContent, /Fresh/);
});

test('signing out while a request is running cannot restore the previous account list', async () => {
  const h = harness();
  h.changeUser(null);
  assert.match(h.status.textContent, /Sign in/);
  h.calls[0].resolve({ reminders: [reminder('Private')] });
  await settle();
  assert.equal(h.list.rows.length, 0);
});

test('a successful schedule with a failed list refresh reports schedule success truthfully', async () => {
  const h = harness();
  h.calls[0].resolve({ reminders: [] });
  await settle();
  const promise = h.save.onclick();
  assert.equal(h.calls[1].data.action, 'create');
  h.calls[1].resolve({ ok: true });
  await settle();
  assert.equal(h.calls[2].data.action, 'list');
  h.calls[2].reject(new Error('List offline'));
  await promise;
  assert.match(h.status.textContent, /Email reminder scheduled, but the list could not refresh/);
  assert.doesNotMatch(h.status.textContent, /Reminder could not be scheduled/);
});

test('a failed schedule still reports the actual create error', async () => {
  const h = harness();
  h.calls[0].resolve({ reminders: [] });
  await settle();
  const promise = h.save.onclick();
  h.calls[1].reject(new Error('Verify your email first'));
  await promise;
  assert.equal(h.status.textContent, 'Verify your email first');
});

test('a schedule finishing after account switch cannot show success for the previous account', async () => {
  const h = harness();
  h.calls[0].resolve({ reminders: [] });
  await settle();
  const promise = h.save.onclick();
  h.changeUser({ uid: 'trader-2' });
  h.calls[1].resolve({ ok: true });
  await promise;
  assert.doesNotMatch(h.status.textContent, /Email reminder scheduled/);
  assert.equal(h.calls[2].options.expectedUid, 'trader-2');
  h.calls[2].resolve({ reminders: [] });
  await settle();
});
