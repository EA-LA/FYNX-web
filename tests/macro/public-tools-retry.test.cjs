'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/js/macro-data.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

const cases = [
  ['rates', 'interest-rates', [
    { area: 'US', value: 4, observationDate: '2026-11-26' },
    { area: 'XM', value: 2, observationDate: '2026-11-26' }
  ], '4.00%'],
  ['indicators', 'economic-indicators-heatmap', [
    { country: 'USA', indicator: 'NY.GDP.MKTP.KD.ZG', value: 2.25, year: 2025 }
  ], '2.25%']
];

for (const [kind, page, rows, expectedFigure] of cases) {
  test(`${kind}: first failure stays visible through search and a retry keeps its control available`, async () => {
    const filename = path.join(root, 'tools', page + '.html');
    const dom = new JSDOM(fs.readFileSync(filename, 'utf8'), {
      url: 'https://test.invalid/tools/' + page + '.html', runScripts: 'outside-only'
    });
    try {
      const requests = [];
      const { document, Event } = dom.window;
      dom.window.AbortSignal.timeout = () => new dom.window.AbortController().signal;
      dom.window.fetch = url => new Promise(resolve => requests.push({ url, resolve }));
      dom.window.eval(source);
      assert.equal(requests.length, 1);
      assert.equal(new URL(requests[0].url).searchParams.get('kind'), kind);

      const search = document.querySelector('#macroSearch');
      const cards = document.querySelector('#macroRows');
      const status = document.querySelector('#macroStatus');
      const refresh = document.querySelector('#refreshData');
      requests[0].resolve({ ok: false });
      await flush();
      assert.equal(cards.textContent, 'Data unavailable');
      assert.equal(cards.getAttribute('aria-busy'), 'false');

      search.value = 'USD';
      search.dispatchEvent(new Event('input'));
      assert.equal(cards.textContent, 'Data unavailable');
      refresh.focus();
      refresh.click();
      assert.equal(document.activeElement, refresh);
      assert.equal(refresh.disabled, false);
      assert.equal(refresh.getAttribute('aria-disabled'), 'true');
      assert.equal(cards.getAttribute('aria-busy'), 'true');
      refresh.click();
      assert.equal(requests.length, 2);

      requests[1].resolve({ ok: true, json: async () => ({ rows, fetchedAt: '2026-11-26T16:00:00Z' }) });
      await flush();
      assert.equal(refresh.hasAttribute('aria-disabled'), false);
      assert.equal(cards.getAttribute('aria-busy'), 'false');
      assert.deepEqual([...cards.querySelectorAll('h2')].map(h => h.textContent), ['United States']);
      assert(cards.textContent.includes(expectedFigure));
      if (kind === 'rates') assert.equal(document.querySelector('#rateDifference').textContent, '2.000 percentage points');

      refresh.click();
      assert.equal(requests.length, 3);
      requests[2].resolve({ ok: false });
      await flush();
      assert.match(status.textContent, /^Refresh failed/);
      assert(cards.textContent.includes(expectedFigure));
      assert.equal(search.value, 'USD');
      assert.equal(refresh.hasAttribute('aria-disabled'), false);
      assert.equal(cards.getAttribute('aria-busy'), 'false');
    } finally {
      dom.window.close();
    }
  });
}
