const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const moduleUrl = pathToFileURL(path.resolve(__dirname, '../assets/js/notifications/preference-save.mjs')).href;
const make = async (saveImpl = async () => {}) => {
  const { createNotificationPreferenceController } = await import(moduleUrl);
  let uid = 'member-a';
  const rendered = new Map();
  const statuses = [];
  const writes = [];
  const ctl = createNotificationPreferenceController({
    keys: ['breakingNews', 'browserEnabled'],
    currentUid: () => uid,
    save: async (owner, data) => { writes.push([owner, data]); await saveImpl(owner, data); },
    render: (k, v) => rendered.set(k, v),
    report: message => statuses.push(message)
  });
  return { ctl, rendered, statuses, writes, changeUid: x => { uid = x; } };
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

test('switches are disabled until a signed-in account has loaded', async () => {
  const x = await make();
  assert.equal(x.rendered.get('breakingNews').disabled, true);
  assert.equal(await x.ctl.toggle('breakingNews'), false);
  x.ctl.reset('member-a');
  assert.equal(x.rendered.get('breakingNews').disabled, true);
  assert.equal(x.ctl.load('member-a', { breakingNews: false }), true);
  assert.equal(x.rendered.get('breakingNews').disabled, false);
});

test('successful write changes visible switch only after confirmation', async () => {
  const d = deferred(), x = await make(() => d.promise);
  x.ctl.reset('member-a'); x.ctl.load('member-a', { breakingNews: false });
  const operation = x.ctl.toggle('breakingNews');
  assert.deepEqual(x.rendered.get('breakingNews'), { checked: false, busy: true, disabled: true });
  assert.deepEqual(x.writes, [['member-a', { breakingNews: true }]]);
  d.resolve(); assert.equal(await operation, true);
  assert.deepEqual(x.rendered.get('breakingNews'), { checked: true, busy: false, disabled: false });
});

test('failed save preserves confirmed preference and announces retry', async () => {
  const x = await make(async () => { throw Error('offline'); });
  x.ctl.reset('member-a'); x.ctl.load('member-a', { breakingNews: true });
  assert.equal(await x.ctl.toggle('breakingNews'), false);
  assert.equal(x.rendered.get('breakingNews').checked, true);
  assert.match(x.statuses.at(-1), /previous setting is unchanged/);
});

test('repeated taps while saving cannot initiate conflicting writes', async () => {
  const d = deferred(), x = await make(() => d.promise);
  x.ctl.reset('member-a'); x.ctl.load('member-a', { breakingNews: false });
  const first = x.ctl.toggle('breakingNews');
  assert.equal(await x.ctl.toggle('breakingNews'), false);
  assert.equal(x.writes.length, 1);
  d.resolve(); await first;
});

test('previous account save cannot repaint a newly signed-in account', async () => {
  const d = deferred(), x = await make(() => d.promise);
  x.ctl.reset('member-a'); x.ctl.load('member-a', { breakingNews: false });
  const old = x.ctl.toggle('breakingNews');
  x.changeUid('member-b'); x.ctl.reset('member-b'); x.ctl.load('member-b', { breakingNews: false });
  d.resolve(); assert.equal(await old, false);
  assert.deepEqual(x.rendered.get('breakingNews'), { checked: false, busy: false, disabled: false });
  assert.equal(x.statuses.some(s => s === 'Notification preference saved.'), false);
});

test('stale, unauthenticated and unexpected preference writes are blocked', async () => {
  const x = await make(); x.ctl.reset('member-a');
  assert.equal(x.ctl.load('member-b', { breakingNews: true }), false);
  assert.equal(await x.ctl.toggle('breakingNews'), false);
  x.ctl.load('member-a', { breakingNews: true });
  x.changeUid(null);
  assert.equal(await x.ctl.toggle('breakingNews'), false);
  assert.equal(await x.ctl.set('unknown', true), false);
  assert.equal(x.writes.length, 0);
});

test('browser permission preference follows the same confirmed-save contract', async () => {
  const x = await make(); x.ctl.reset('member-a'); x.ctl.load('member-a', { browserEnabled: false });
  assert.equal(await x.ctl.set('browserEnabled', true), true);
  assert.deepEqual(x.writes[0], ['member-a', { browserEnabled: true }]);
  assert.equal(x.rendered.get('browserEnabled').checked, true);
});

test('production Notifications page imports controller and avoids optimistic toggle', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../notifications.html'), 'utf8');
  assert.match(html, /import \{ createNotificationPreferenceController \} from/);
  assert.match(html, /preferenceController\.toggle\(button\.dataset\.pref\)/);
  assert.match(html, /preferenceController\.set\('browserEnabled', result\.permission === 'granted'\)/);
  assert.match(html, /preferenceController\.reset\(uid\)/);
  assert.match(html, /authRevision !== revision/);
  assert.doesNotMatch(html, /prefs\[k\]=!prefs\[k\]/);
});

test('production inline notification script parses after ES imports are removed', () => {
  const vm = require('node:vm');
  const html = fs.readFileSync(path.resolve(__dirname, '../notifications.html'), 'utf8');
  const inline = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(inline, 'Notifications inline module exists');
  const script = inline[1].replace(/^import .*?;\s*$/gm, '');
  assert.doesNotThrow(() => new vm.Script(script, { filename: 'notifications-inline.js' }));
});
