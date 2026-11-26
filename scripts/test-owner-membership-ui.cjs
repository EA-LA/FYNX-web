'use strict';
/* Owner membership display: profile shows "FYNX Owner — Lifetime Unlimited Access" only when the server status says so;
 * the Pro workspace and the developer workspace label owner access; nothing in the browser decides ownership. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
async function profileWith(status) {
  const html = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  const body = html.slice(html.indexOf('<section class="panel">'), html.indexOf('</section>', html.indexOf('<section class="panel">')) + 10);
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {runScripts: 'outside-only'});
  const w = dom.window; w.__FYNX_PLAN_TEST__ = true;
  w.eval(fs.readFileSync(path.join(root, 'assets/js/fynx-plan.js'), 'utf8'));
  w.FYNXPlan._test.set({config: {auth: {currentUser: {uid: 'u'}}}, call: async d => d.action === 'status' ? status : {counts: {}}}, {});
  await w.FYNXPlan.refresh();
  w.eval(fs.readFileSync(path.join(root, 'assets/js/profile-membership.js'), 'utf8'));
  await new Promise(r => setTimeout(r, 20));
  return w.document;
}
(async () => {
  const html = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  assert.match(html, /id="statMembership"/); assert.match(html, /profile-membership\.js/); assert.match(html, /fynx-plan\.js/);
  let d = await profileWith({mode: 'live', tier: 'pro', owner: true, lifetime: true});
  assert.equal(d.getElementById('profileMembership').querySelector('b').textContent, 'FYNX Owner — Lifetime Unlimited Access');
  assert.equal(d.getElementById('profileMembership').hidden, false); assert.ok(d.getElementById('profileMembership').classList.contains('owner'));
  assert.equal(d.getElementById('statMembership').textContent, 'FYNX Owner');
  d = await profileWith({mode: 'live', tier: 'plus'});
  assert.equal(d.getElementById('profileMembership').querySelector('b').textContent, 'Plus membership');
  d = await profileWith({mode: 'live', tier: null});
  assert.equal(d.getElementById('statMembership').textContent, 'Free plan');
  d = await profileWith({mode: 'live', tier: 'free', owner: true});
  assert.equal(d.getElementById('statMembership').textContent, 'Free plan', 'owner flag without the server-verified tier is ignored');
  // Pro workspace and developer workspace labels.
  const pw = fs.readFileSync(path.join(root, 'assets/js/pro-workspace.js'), 'utf8');
  assert.match(pw, /state\.accessProvider==='owner'\?\(state\.membershipLabel\|\|'FYNX Owner — Lifetime Unlimited Access'\)/);
  const ws = fs.readFileSync(path.join(root, 'api/workspace.js'), 'utf8');
  assert.match(ws, /state\.limits\.unlimited\?'Unlimited'/); assert.match(ws, /FYNX Owner — Lifetime Unlimited Access/);
  // No browser file checks the owner's email for entitlement.
  for (const f of ['assets/js/fynx-plan.js', 'assets/js/profile-membership.js', 'assets/js/pro-workspace.js', 'assets/js/terminal/membership.js', 'assets/js/terminal/markets-dash.js']) assert.ok(!/ha6876122/.test(fs.readFileSync(path.join(root, f), 'utf8')), f);
  console.log('Owner membership UI: profile, Pro workspace and developer workspace labels passed; no browser-side owner checks');
})().catch(e => { console.error(e); process.exit(1); });
