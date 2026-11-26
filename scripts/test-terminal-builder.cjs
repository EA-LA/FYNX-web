'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const core = require('../assets/js/terminal/builder-core.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const valid = {
  name: 'Global Market Intelligence',
  description: 'A private snapshot of the S&P 500, gold, and the dollar.',
  category: 'macro',
  main: core.TEMPLATE
};
const projectId = 'p1234abcd5678';
const otherId = 'pabcdef123456';

function row(uid, id, extra) {
  return {id, authorUid: uid, ...core.validateProject(valid).project, version: 1, updatedAt: 10, versions: [], ...extra};
}

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
  const stored = core.withVersion(null, {...ok.project, apiKey: 'should-not-stick'});
  assert.equal(stored.apiKey, undefined);
  assert.equal(stored.visibility, 'private');
  assert.deepEqual(Object.keys(stored).sort(), ['category', 'description', 'main', 'name', 'version', 'versions', 'visibility']);
});

test('quote snapshots keep only symbol, price, and change, including a second pass over an array', () => {
  const raw = {SPY: {price: 500.1, changePercent: -0.4, source: 'https://secret.example', extra: {token: 'no'}, idToken: 'auth-token'}};
  const rows = core.snapshotQuotes(raw);
  assert.deepEqual(rows, [{symbol: 'SPY', price: 500.1, changePercent: -0.4}]);
  assert.equal(JSON.stringify(rows).includes('secret'), false);
  assert.equal(JSON.stringify(rows).includes('auth-token'), false);
  assert.deepEqual(core.snapshotQuotes(rows), rows);
  assert.deepEqual(core.snapshotQuotes([{symbol: 'SPY', price: 1, changePercent: 0, uid: 'user-a'}]), [{symbol: 'SPY', price: 1, changePercent: 0}]);
  assert.equal(core.snapshotQuotes({__proto__: {price: 1}, '': {price: 1}}).length, 0);
});

test('sandbox document blocks the network and does not share the terminal origin', () => {
  assert.match(core.SANDBOX_HTML, /connect-src 'none'/);
  assert.match(core.SANDBOX_HTML, /default-src 'none'/);
  assert.match(core.SANDBOX_HTML, /worker-src 'none'/);
  assert.match(core.SANDBOX_HTML, /frame-src 'none'/);
  assert.doesNotMatch(core.SANDBOX_CSP, /navigate-to/);
  assert.match(core.SANDBOX_HTML, /with \(scopeProxy\)/);
  assert.match(core.SANDBOX_HTML, /evalTickets/);
  assert.equal(core.SANDBOX_HTML.includes(core.SANDBOX_CSP), true);
  assert.doesNotMatch(core.SANDBOX_HTML, /allow-same-origin/);
  assert.equal(core.SANDBOX_ATTR, 'allow-scripts');
  assert.doesNotMatch(core.SANDBOX_ATTR, /allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
  assert.match(core.SANDBOX_HTML, /lockWindow/);
  assert.match(core.SANDBOX_HTML, /Window.prototype|getPrototypeOf/);
  assert.match(core.SANDBOX_HTML, /document\.write|document\.' \+ name/);
  assert.match(core.ASSISTANT_PROMPT, /function render\(root, FYNX\)/);
  assert.match(core.ASSISTANT_PROMPT, /cannot access the network/);
  const script = core.SANDBOX_HTML.slice(core.SANDBOX_HTML.indexOf('<script>') + 8, core.SANDBOX_HTML.lastIndexOf('</script>'));
  const file = path.join(root, 'scripts', '.sandbox-boot-check.js');
  fs.writeFileSync(file, script);
  try {
    const checked = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
    assert.equal(checked.status, 0, checked.stderr);
  } finally { fs.rmSync(file, {force: true}); }
  assert.equal(script.includes('super-secret'), false);
});

test('versions keep the previous source and installations stay on the owner layout', () => {
  const first = core.withVersion(null, core.validateProject(valid).project);
  assert.equal(first.version, 1);
  assert.equal(first.versions.length, 0);
  const second = core.withVersion({...first, updatedAt: 10}, {...first, main: first.main + '\n// next\n'});
  assert.equal(second.version, 2);
  assert.equal(second.versions.at(-1).main, first.main);
  assert.deepEqual(Object.keys(second.versions.at(-1)).sort(), ['main', 'savedAt', 'version']);
  const same = core.withVersion(second, second);
  assert.equal(same.version, 2);
  const renamed = core.withVersion(second, {...second, name: 'Renamed tool'});
  assert.equal(renamed.version, 2);
  assert.equal(renamed.versions.length, 1);
  const slot = core.slotFor(projectId);
  assert.equal(slot, 'mine-' + projectId);
  assert.throws(() => core.slotFor('mkts'));
  assert.throws(() => core.slotFor('pshort'));
  assert.throws(() => core.slotFor('mine-p1234abcd5678'));
  assert.deepEqual(core.placeWidget(['mkts', null, 'intel'], slot), ['mkts', slot, 'intel']);
  assert.equal(core.placeWidget(Array(28).fill('mkts'), slot), null);
  assert.deepEqual(core.stripWidget(['mkts', slot, 'intel'], slot), ['mkts', null, 'intel']);
});

test('one account cannot see another account project or a forged install slot', () => {
  const alice = 'alice-uid';
  const bob = 'bob-uid';
  const rows = [
    row(alice, projectId, {updatedAt: 20}),
    row(bob, otherId, {updatedAt: 30, main: valid.main + '\n// bob only\n'}),
    row(alice, 'mkts', {updatedAt: 40}),
    {id: otherId, authorUid: alice, name: 'Broken', description: 'too short', category: 'macro', main: valid.main}
  ];
  const forged = [
    {slot: 'mkts', projectId, name: 'Markets', version: 1, enabled: true},
    {slot: 'mine-' + projectId, projectId, name: 'Global Market Intelligence', version: 1, enabled: true},
    {slot: 'mine-' + otherId, projectId: otherId, name: 'Other', version: 1, enabled: true},
    {slot: 'mine-' + projectId, projectId, name: 'Duplicate', version: 1, enabled: true},
    {slot: 'mine-p' + 'a'.repeat(24), projectId: 'p' + 'a'.repeat(24), name: 'Long', version: 1, enabled: true}
  ];
  const view = core.accountView(alice, rows, forged);
  assert.deepEqual(view.projects.map(project => project.id), [projectId]);
  assert.equal(view.projects[0].main.includes('bob only'), false);
  assert.deepEqual(view.installs, [{slot: 'mine-' + projectId, projectId, name: 'Global Market Intelligence', version: 1, enabled: true}]);
  assert.equal(core.accountView('', rows, forged).projects.length, 0);
  assert.equal(core.accountView(bob, rows, forged).projects[0].id, otherId);
  assert.equal(core.accountView(bob, rows, forged).projects[0].main.includes('bob only'), true);
  assert.deepEqual(core.accountView(bob, rows, forged).installs.map(widget => widget.projectId), [otherId]);
  const many = Array.from({length: 14}, (_, i) => ({slot: 'mine-p' + String(i).padStart(8, '0'), projectId: 'p' + String(i).padStart(8, '0'), name: 'Tool ' + i, version: 1, enabled: true}));
  assert.equal(core.sanitizeWidgets(many).length, core.LIMITS.widgets);
  assert.equal(core.LIMITS.widgets, 12);
  const noisy = row(alice, projectId, {versions: [{version: 1, savedAt: 1, main: valid.main, apiKey: 'nope'}, {version: 0, savedAt: 1, main: valid.main}, {version: 2, savedAt: 2, main: 'no render here'}]});
  const cleaned = core.accountView(alice, [noisy], []);
  assert.deepEqual(cleaned.projects[0].versions, [
    {version: 1, savedAt: 1, main: valid.main},
    {version: 2, savedAt: 2, main: 'no render here'}
  ]);
  assert.equal(JSON.stringify(cleaned.projects[0].versions).includes('apiKey'), false);
});

test('an unknown private slot blanks one cell and a bad slot drops only a corrupt layout', () => {
  const app = read('assets/js/terminal/app.js');
  const start = app.indexOf('/* layout-slot:start */');
  const end = app.indexOf('/* layout-slot:end */');
  assert.ok(start > 0 && end > start);
  const panels = {mkts: ['MKTS'], intel: ['INTEL'], ['mine-' + projectId]: ['MINE', 'Tool', '']};
  const harness = new Function('PANELS', 'store', 'S', 'D', `${app.slice(start, end)}\nreturn {builtinLayoutSlot, getSlots};`);
  const defaults = ['mkts', 'focus'];
  const run = saved => harness(panels, {get: () => saved == null ? null : JSON.stringify(saved)}, {sym: null, deskKey: 'all'}, () => ({slots: defaults}));
  const desk = run(['mkts', null, 'card:AAPL', 'mine-' + otherId, 'intel']);
  assert.deepEqual(desk.getSlots(), ['mkts', null, 'card:AAPL', null, 'intel']);
  assert.deepEqual(run(['mkts', 'mine-' + projectId, 'intel']).getSlots(), ['mkts', 'mine-' + projectId, 'intel']);
  assert.deepEqual(run(['mkts', 'bogus', 'intel']).getSlots(), defaults);
  assert.deepEqual(run(['mkts', 'constructor', 'intel']).getSlots(), defaults);
  assert.deepEqual(run(['mkts', 'mine-mkts', 'intel']).getSlots(), defaults);
  assert.deepEqual(run(['mkts', 'mine-p' + 'a'.repeat(30), 'intel']).getSlots(), defaults);
  assert.deepEqual(core.layoutSlot('mine-' + otherId, panels), null);
  assert.equal(core.layoutSlot('mine-' + projectId, panels), 'mine-' + projectId);
  assert.equal(core.layoutSlot('constructor', panels), undefined);
  assert.equal(core.layoutSlot('mkts', panels), 'mkts');
  const parity = harness(panels, {get() { return null; }}, {sym: null, deskKey: 'all'}, () => ({slots: defaults}));
  for (const sample of ['mkts', null, 'card:^GSPC', 'card:EURUSD=X', 'mine-' + projectId, 'mine-' + otherId, 'bogus', 'constructor']) {
    assert.equal(core.layoutSlot(sample, panels), parity.builtinLayoutSlot(sample));
  }
});

test('terminal page wires the builder without replacing desks, panels, or shortcuts', () => {
  const html = read('terminal.html');
  const app = read('assets/js/terminal/app.js');
  const pages = read('assets/js/terminal/pages.js');
  const builder = read('assets/js/terminal/builder.js');
  const rules = read('backend/rules/firestore.rules');
  const release = read('scripts/build-release-assets.cjs');
  assert.match(html, /id="fx-build"/);
  assert.match(html, /assets\/vendor\/codemirror\/codemirror\.js\?v=20261117-builder-4/);
  assert.match(html, /assets\/vendor\/codemirror\/javascript\.js\?v=20261117-builder-4/);
  assert.match(html, /assets\/vendor\/codemirror\/searchcursor\.js\?v=20261117-builder-4/);
  assert.match(html, /assets\/css\/terminal-builder\.css\?v=20261119-builder-5/);
  assert.match(html, /assets\/js\/terminal\/builder-core\.js\?v=20261126-tick-1/);
  assert.match(html, /assets\/js\/terminal\/builder\.js\?v=20261126-tick-1/);
  assert.doesNotMatch(html, /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net\/npm\/codemirror|unpkg\.com\/codemirror/);
  assert.ok(html.indexOf('codemirror.js') < html.indexOf('builder-core.js'));
  assert.ok(html.indexOf('builder.js') < html.indexOf('terminal/app.js'));
  assert.match(html, /assets\/js\/terminal\/app\.js\?v=20261126-rows-1/);
  assert.match(html, /assets\/js\/terminal\/pages\.js\?v=20261126-rows-1/);
  assert.match(release, /'assets\/js\/terminal\/app\.js':'20261126-rows-1'/);
  assert.match(release, /'assets\/js\/terminal\/pages\.js':'20261126-rows-1'/);
  const buildAt = app.indexOf("verb === 'BUILD'");
  const symbolAt = app.indexOf('if (/^[A-Za-z0-9.\\-=^&]{1,24}$/.test(cmd.trim()))');
  assert.ok(buildAt > 0 && symbolAt > buildAt);
  assert.match(app, /\['F5', 'F11', 'F12'\]\.includes\(e\.key\)/);
  assert.match(app, /const KEYS = \[\['F1', 'Help', 'help'\].*\['F12', 'Vol', 'vol'\]\]/);
  assert.match(app, /const DESK_ORDER = \['all', 'stocks', 'forex', 'bonds', 'crypto', 'funds', 'futures', 'indices', 'economy', 'options', 'commodities'\]/);
  for (const id of ['mkts', 'focus', 'heat', 'fin', 'story', 'intel', 'top', 'desks', 'cb', 'curve', 'vix', 'bias', 'edge', 'pos', 'eco', 'corr', 'tools', 'movers', 'xa', 'idx', 'sess', 'earn', 'opt', 'optlist', 'chain', 'active', 'term', 'rates', 'gov', 'books', 'range', 'perf', 'official', 'squote', 'srisk', 'snews', 'cmp']) {
    assert.match(app, new RegExp('\\b' + id + ':'));
  }
  assert.match(app, /for \(const plug of window\.FynxTerminalPlugins \|\| \[\]\) \{ try \{ plug\(CORE, PG\); \} catch/);
  assert.match(app, /window\.FynxBuilderSweep\?\.\(\)/);
  assert.match(pages, /\['BUILD', 'Open FYNX Builder:/);
  assert.match(builder, /stopAllFrames\(\);\s*clearInstalls\(T\)/);
  assert.match(builder, /const live = byId\(projectId\)/);
  assert.match(builder, /event\.origin !== 'null'/);
  assert.match(builder, /setAttribute\('sandbox', Core\.SANDBOX_ATTR\)/);
  assert.doesNotMatch(builder, /allow-same-origin/);
  assert.match(builder, /Visibility is private/);
  assert.match(builder, /Community Library, official submission, and external API credentials are not part of this release/);
  assert.match(builder, /fx-term-builder-v1:/);
  assert.match(builder, /if \(!window\.CodeMirror\)/);
  assert.match(builder, /Core\.syntaxError\(draft\.main\)/);
  assert.doesNotMatch(builder, /key === 'F5'|event\.key === 'F5'/);
  assert.match(builder, /Added to this desk on this browser only/);
  assert.match(builder, /Not saved to your account/);
  assert.doesNotMatch(builder, /allow-same-origin/);
  const css = read('assets/css/terminal-builder.css');
  assert.match(css, /#fx-page-body > \.fxb/);
  assert.match(css, /color-scheme:dark!important/);
  assert.match(css, /background:var\(--fxb-field\)!important/);
  assert.doesNotMatch(css, /#fx-command|fx-cmd /);
  assert.match(read('assets/vendor/codemirror/LICENSE'), /MIT License/);
  assert.match(read('assets/vendor/codemirror/codemirror.js'), /CodeMirror/);
  const cats = [...rules.match(/category in \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(cats, core.CATEGORIES.map(([id]) => id));
  assert.match(rules, /match \/builderProjects\/\{projectId\}/);
  assert.match(rules, /allow read: if isOwner\(userId\);/);
  assert.match(rules, /visibility == 'private'/);
  assert.match(rules, /authorUid == userId/);
  assert.match(rules, /projectId\.matches\('\^p\[a-z0-9\]\{8,24\}\$'\)/);
  assert.match(rules, /widget\.slot == 'mine-' \+ widget\.projectId/);
  assert.match(rules, /widgets\.size\(\) <= 12/);
  assert.match(rules, /versions\.size\(\) <= 5/);
  assert.match(rules, /documentId == 'current'/);
  assert.match(rules, /allow delete: if false;/);
  assert.match(rules, /main\.size\(\) <= 48000/);
  assert.equal(rules.includes("visibility == 'public'"), false);
});

test('syntax checks parse without running, and account merge keeps only this browser\'s unsynced work', () => {
  assert.equal(core.syntaxError(core.TEMPLATE), '');
  assert.equal(core.syntaxError('   '), 'main.js is empty.');
  assert.match(core.syntaxError('function render(root, FYNX) {'), /Syntax error/);
  assert.equal(core.syntaxError('function render(root, FYNX) { throw new Error("executed"); }'), '');
  const localOnly = row('alice', otherId, {updatedAt: 50, stored: 'device'});
  const cached = row('alice', 'p0000cached01', {updatedAt: 5, stored: 'account'});
  const shared = row('alice', projectId, {updatedAt: 10, stored: 'device', main: 'function render(root, FYNX) { root.textContent = "local"; }\n'});
  const server = core.accountView('alice', [row('alice', projectId, {updatedAt: 20})], []);
  const merged = core.mergeAccount([localOnly, cached, shared, {id: otherId, name: 'bad', main: 'nope'}], server);
  const ids = merged.projects.map(project => project.id);
  assert.ok(ids.includes(otherId));
  assert.equal(ids.includes('p0000cached01'), false);
  assert.equal(merged.projects.find(project => project.id === projectId).updatedAt, 20);
  assert.equal(merged.projects.find(project => project.id === otherId).stored, 'device');
  const newer = core.mergeAccount([row('alice', projectId, {updatedAt: 40, stored: 'device', main: 'function render(root, FYNX) { root.textContent = "newer"; }\n'})], server);
  assert.match(newer.projects.find(project => project.id === projectId).main, /newer/);
  const kept = core.mergeAccount([localOnly, cached], {projects: [], installs: []});
  assert.deepEqual(kept.projects.map(project => project.id), [otherId]);
});

