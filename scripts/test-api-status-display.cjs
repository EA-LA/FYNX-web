'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../api/status.html'), 'utf8');
const statusScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(script => script.includes("const RAW='https://raw.githubusercontent.com/EA-LA/FYNX-web/status-data'"));
assert.ok(statusScript, 'production status renderer must be present');

const minutesAgo = n => new Date(Date.now() - n * 60_000).toISOString();
const hoursAgo = n => minutesAgo(n * 60);

function gateway(updatedAt = minutesAgo(10)) {
  return {
    updated_at: updatedAt,
    uptime_30d: 100,
    uptime_90d: 100,
    components: {
      health: { name: 'API health self-check', ok: true, latency_ms: 120, checked_at: minutesAgo(10) },
      gateway: { name: 'Gateway authentication', ok: true, latency_ms: 150, checked_at: minutesAgo(10) },
    },
    daily: [],
    incidents: [],
  };
}
function products(checkedAt = minutesAgo(12)) {
  return { updated_at: checkedAt, components: {
    risk: { name: 'Risk API', ok: true, latency_ms: 450, checked_at: checkedAt },
  }, incidents: [] };
}

async function render(shallow, deep) {
  const nodes = new Map();
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) {
        nodes.set(selector, { textContent: '', className: '', innerHTML: '' });
      }
      return nodes.get(selector);
    },
  };
  const fetch = async url => {
    const data = url.includes('api-status-deep.json') ? deep : shallow;
    return data === undefined ? { ok: false } : { ok: true, json: async () => data };
  };
  vm.runInNewContext(statusScript, { document, fetch, Date }, { timeout: 1_000 });
  await new Promise(resolve => setImmediate(resolve));
  const field = selector => nodes.get(selector) || {};
  return {
    banner: field('#status-banner').textContent,
    className: field('#status-banner').className,
    components: field('#components').innerHTML,
    incidents: field('#incidents').innerHTML,
  };
}

test('current gateway and product checks render operational', async () => {
  const page = await render(gateway(), products());
  assert.match(page.banner, /All systems operational/);
  assert.match(page.className, /status-ok/);
  assert.match(page.components, /Risk API/);
  assert.doesNotMatch(page.components, /Stale/);
});

test('old product snapshot does not inherit fresh gateway status', async () => {
  const page = await render(gateway(), products(hoursAgo(25)));
  assert.match(page.banner, /product checks are missing, outdated or unverified/);
  assert.match(page.className, /status-stale/);
  assert.match(page.components, /Risk API.*Stale/);
  assert.doesNotMatch(page.banner, /All systems operational/);
});

test('missing deep check never claims every system is operational', async () => {
  const page = await render(gateway(), null);
  assert.match(page.banner, /product checks are missing/);
  assert.doesNotMatch(page.banner, /All systems operational/);
  assert.match(page.components, /API health self-check/);
});

test('malformed gateway timestamp is not shown as current', async () => {
  const page = await render(gateway('not-a-date'), products());
  assert.match(page.banner, /Status data is stale/);
  assert.match(page.banner, /time unavailable/);
  assert.match(page.className, /status-stale/);
});

test('missing base feed resolves loading placeholders to errors', async () => {
  const page = await render(null, null);
  assert.match(page.banner, /could not be loaded/);
  assert.match(page.components, /Component status unavailable/);
  assert.match(page.incidents, /Incident history unavailable/);
  assert.doesNotMatch(page.components, /Loading/);
});

test('current failing component is labeled degraded', async () => {
  const d = products();
  d.components.risk.ok = false;
  const page = await render(gateway(), d);
  assert.match(page.banner, /Degraded: Risk API/);
  assert.match(page.className, /status-bad/);
  assert.match(page.components, /Risk API.*Failing/);
});

test('empty components do not render an operational success', async () => {
  const s = gateway();
  s.components = {};
  const page = await render(s, null);
  assert.match(page.components, /No verified component checks/);
  assert.doesNotMatch(page.banner, /All systems operational/);
});
