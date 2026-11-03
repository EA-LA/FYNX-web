'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const articleId = value => createHash('sha256').update(String(value)).digest('hex');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const fragment = fs.readFileSync(path.join(root, 'content/news-intelligence.fragment'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'assets/js/news-intelligence.js'), 'utf8');
const publishedAt = '2026-10-20T10:00:00Z';
const fetchedAt = '2026-10-20T10:05:00Z';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function story(id, title = `Market story ${id}`, source = 'CNBC') {
  return { id, articleId:articleId(id), title, source, url: `https://www.cnbc.com/story-${id}`, publishedAt };
}
function result(items, overrides = {}) { return { items, status: 'fresh', stale: false, fetchedAt, message: '', sources: [], ...overrides }; }
function releases() {
  return result([
    { ...story('fed', 'Federal Reserve announcement', 'Federal Reserve'), sourceId: 'fed', url: 'https://www.federalreserve.gov/newsevents.htm' },
    { ...story('bea', 'Economic accounts release', 'BEA'), sourceId: 'bea', url: 'https://www.bea.gov/news' },
    { ...story('ecb', 'Euro area policy decision', 'ECB'), sourceId: 'ecb', url: 'https://www.ecb.europa.eu/press/html/index.en.html' }
  ], { sources: ['fed', 'bea', 'ecb'].map(id => ({ id, status: 'fresh', fetchedAt })) });
}
function catalog() {
  return {
    topics: ['All topics', 'Markets', 'Economy', 'Investing'],
    publishers: [
      { id: 'cnbc', name: 'CNBC', summary: 'Markets and business coverage.', topics: ['Markets', 'Investing'], destinations: [
        { category: 'videos', categoryLabel: 'Video library', url: 'https://www.cnbc.com/latest-video/', access: 'Publisher access applies.' },
        { category: 'podcasts', categoryLabel: 'Podcast library', url: 'https://www.cnbc.com/podcasts/', access: 'Publisher access applies.' }
      ] },
      { id: 'bloomberg', name: 'Bloomberg', summary: 'Global market coverage.', topics: ['Markets', 'Economy'], destinations: [
        { category: 'videos', categoryLabel: 'Video library', url: 'https://www.bloomberg.com/video', access: 'Publisher access applies.' },
        { category: 'live', categoryLabel: 'Broadcast page', url: 'https://www.bloomberg.com/live', access: 'Some broadcasts require a subscription.' }
      ] },
      { id: 'ft', name: 'Financial Times', summary: 'Economic reporting.', topics: ['Economy'], destinations: [
        { category: 'podcasts', categoryLabel: 'Podcast library', url: 'https://www.ft.com/podcasts', access: 'Some content requires a subscription.' }
      ] }
    ],
    institutions: [
      { id: 'fed', name: 'Federal Reserve', region: 'United States', summary: 'US monetary policy.', url: 'https://www.federalreserve.gov/' },
      { id: 'bea', name: 'BEA', region: 'United States', summary: 'US economic accounts.', url: 'https://www.bea.gov/' },
      { id: 'imf', name: 'IMF', region: 'United States', summary: 'International research.', url: 'https://www.imf.org/' },
      { id: 'boe', name: 'Bank of England', region: 'United Kingdom', summary: 'UK monetary policy.', url: 'https://www.bankofengland.co.uk/' },
      { id: 'ecb', name: 'ECB', region: 'Europe', summary: 'Euro area policy.', url: 'https://www.ecb.europa.eu/' },
      { id: 'boj', name: 'Bank of Japan', region: 'Japan', summary: 'Japan policy and meeting calendar.', url: 'https://www.boj.or.jp/en/' }
    ],
    officialSources: [
      { id: 'fed', name: 'Federal Reserve', website: 'https://www.federalreserve.gov/newsevents.htm' },
      { id: 'bea', name: 'BEA', website: 'https://www.bea.gov/news' },
      { id: 'ecb', name: 'ECB', website: 'https://www.ecb.europa.eu/press/html/index.en.html' }
    ]
  };
}
function harness(t, options = {}) {
  const dom = new JSDOM(`<!doctype html><body>${fragment}</body>`, { url: 'https://www.fynxfinanceworld.com/news.html', runScripts: 'outside-only' });
  t.after(() => {dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();});
  const win = dom.window, doc = win.document;
  let now = options.now || Date.parse('2026-10-20T10:10:00Z');
  win.Date.now = () => now;
  let visibility = 'visible', timerId = 0;
  const timeouts = new Map();
  Object.defineProperty(doc,'visibilityState',{get:()=>visibility,configurable:true});
  const calls = { headlines: [], releases: [], saved: [], plans: 0, intervals: [], network: 0, cachedHeadlines: [], cachedReleases: [] };
  win.fetch = () => { calls.network++; throw new Error('The controller must use the injected public data service.'); };
  win.setInterval = (callback, ms) => { calls.intervals.push({ callback, ms }); return calls.intervals.length; };
  win.setTimeout = (callback, ms) => {const id=++timerId;timeouts.set(id,{callback,at:now+ms,ms});return id;};
  win.clearTimeout = id => timeouts.delete(id);
  const D = {
    ...catalog(),
    safeURL(value) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } },
    getCachedHeadlines(category, settings) { calls.cachedHeadlines.push({category,...settings}); return options.cachedHeadlines ? options.cachedHeadlines(category,settings) : options.cached?.[category] || null; },
    getCachedOfficialReleases(settings) { calls.cachedReleases.push(settings); return typeof options.cachedReleases === 'function' ? options.cachedReleases(settings) : options.cachedReleases || null; },
    loadHeadlines(category, settings) { calls.headlines.push({ category, ...settings }); return options.headlines ? options.headlines(category, settings) : Promise.resolve(result([story('a')])); },
    loadOfficialReleases(settings) { calls.releases.push(settings); return options.releases ? options.releases(settings) : Promise.resolve(releases()); }
  };
  if (options.edition) {
    let selected = options.edition;
    D.officialSources = [
      {id:'fed',name:'Federal Reserve',website:'https://www.federalreserve.gov/',editions:['us']},
      {id:'bea',name:'BEA',website:'https://www.bea.gov/news',editions:['us']},
      {id:'ecb',name:'ECB',website:'https://www.ecb.europa.eu/',editions:['europe']},
      {id:'boe',name:'Bank of England',website:'https://www.bankofengland.co.uk/news',editions:['uk']},
      {id:'boc',name:'Bank of Canada',website:'https://www.bankofcanada.ca/press/',editions:['canada']},
      {id:'boj',name:'Bank of Japan',website:'https://www.boj.or.jp/en/',editions:['japan','asia']},
      {id:'rba',name:'Reserve Bank of Australia',website:'https://www.rba.gov.au/media-releases/',editions:['australia']}
    ];
    D.sourcesForEdition = code => D.officialSources.filter(source => code === 'global' || source.editions.includes(code));
    win.FynxEdition = {get:()=>selected,set(code){ const previous=selected;selected=code;doc.dispatchEvent(new win.CustomEvent('fynx:edition-change',{detail:{edition:code,previous}})); }};
  }
  if (options.terminal) doc.body.setAttribute('data-fynx-terminal','');
  if (options.media) win.eval(fs.readFileSync(path.join(root,'assets/js/newsroom-media.js'),'utf8'));
  if (!options.missingData) win.FYNXMarketIntelligenceData = D;
  if (!options.missingMembership) win.FYNXNewsMembership = { saveResearch: item => calls.saved.push(item), openPlans: () => calls.plans++ };
  win.FYNXNewsReaderData = {
    href:item => '/news/article.html?' + new URLSearchParams({id:item.articleId,edition:item.edition || win.FynxEdition?.get() || 'us',category:item.kind==='official-release' || item.category==='official' ? 'official' : item.category || 'all'}),
    prefetch:() => {}, remember:() => {}
  };
  win.eval(controller);
  const query = selector => doc.querySelector(selector), all = selector => [...doc.querySelectorAll(selector)];
  return { win, doc, D, calls, query, all, timeouts, setNow(value) { now = value; },
    setVisibility(value) {visibility=value;doc.dispatchEvent(new win.Event('visibilitychange'));},
    async advanceTo(value) {
      let iterations=0;
      while(true){
        const next=[...timeouts].filter(([,timer])=>timer.at<=value).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next)break;
        assert(++iterations<100,'Refresh scheduler must not spin');
        now=next[1].at;timeouts.delete(next[0]);next[1].callback();await tick();
      }
      now=value;await tick();
    },
    click(selector) { const target = query(selector); assert(target, `Missing click target ${selector}`); target.click(); },
    input(selector, value) { const target = query(selector); target.value = value; target.dispatchEvent(new win.Event(target.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }
  };
}

test('source libraries and institutions render synchronously while both public feeds are pending', t => {
  const h = harness(t, { headlines: () => new Promise(() => {}), releases: () => new Promise(() => {}) });
  assert.equal(h.query('[data-news-intelligence]').dataset.newsReady, 'true');
  assert.equal(h.all('.fn-media-card').length, 2);
  assert.equal(h.all('.fn-institution').length, 6);
  assert.equal(h.all('.fn-release-sources a').length, 3);
  assert.equal(h.calls.headlines.length, 1); assert.equal(h.calls.releases.length, 1);
  assert.equal(h.calls.headlines[0].timeoutMs, 6500); assert.equal(h.calls.releases[0].timeoutMs, 6500);
  assert.equal(h.calls.network, 0); assert.equal(h.calls.saved.length, 0); assert.equal(h.calls.plans, 0);
  assert.equal(h.calls.intervals[0].ms, 60000); // Expiry pruning only; requests use precise deadlines.
  assert.equal(h.timeouts.size,0); // Both feeds are pending, so no duplicate request is scheduled.
});

test('headlines show original source/date and search source names or titles without another request', async t => {
  const items = [story('rates', 'Rates in focus'), story('energy', 'Energy supply update', 'Bloomberg'), story('earnings', 'Earnings season', 'Reuters')];
  const h = harness(t, { headlines: () => Promise.resolve(result(items)) }); await tick();
  assert.equal(h.all('.fn-story').length, 3); assert.equal(h.query('[data-news-stories]').getAttribute('aria-busy'), 'false');
  assert.equal(h.query('.fn-story time').dateTime, publishedAt);
  h.input('[data-news-search]', 'bLOOmBeRg'); assert.equal(h.all('.fn-story').length, 1); assert.match(h.query('.fn-story').textContent, /Energy supply/);
  h.input('[data-news-search]', 'rates'); assert.equal(h.all('.fn-story').length, 1);
  h.input('[data-news-search]', 'unmatched phrase'); assert.match(h.query('[data-news-stories]').textContent, /No headlines match/);
  h.input('[data-news-search]', ''); assert.equal(h.all('.fn-story').length, 3); assert.equal(h.calls.headlines.length, 1);
});

test('headline pagination adds ten rows and searching resets the visible limit', async t => {
  const h = harness(t, { headlines: () => Promise.resolve(result(Array.from({ length: 23 }, (_, i) => story(String(i))))) }); await tick();
  assert.equal(h.all('.fn-story').length, 10); assert.equal(h.query('[data-news-more]').hidden, false);
  h.click('[data-news-more]'); assert.equal(h.all('.fn-story').length, 20);
  h.click('[data-news-more]'); assert.equal(h.all('.fn-story').length, 23); assert.equal(h.query('[data-news-more]').hidden, true);
  h.input('[data-news-search]', 'Market story'); assert.equal(h.all('.fn-story').length, 10);
});

test('top-story order survives rendering and each story opens its own internal reader', async t => {
  const now=Date.parse('2026-10-20T10:10:00Z');
  const lead={...story('lead','Priority fixture report'),rank:1,priorityScore:90,publishedAt:new Date(now-12*3600000).toISOString()};
  const latest={...story('latest','Recent fixture update'),rank:2,priorityScore:40};
  const h=harness(t,{headlines:()=>Promise.resolve(result([lead,latest]))});await tick();
  assert.deepEqual(h.all('.fn-story h3').map(node=>node.textContent.replace(/ →$/, '')),[lead.title,latest.title]);
  assert.deepEqual(h.all('.fn-story-link').map(anchor=>new URL(anchor.href).searchParams.get('id')),[lead.articleId,latest.articleId]);
});

test('rapid category changes keep only the latest response and current category controls', async t => {
  const pending = new Map();
  const h = harness(t, { headlines: category => { const d = deferred(); pending.set(category, d); return d.promise; } });
  h.click('[data-news-category="crypto"]'); h.click('[data-news-category="forex"]');
  pending.get('forex').resolve(result([story('fx', 'Currency briefing')])); await tick();
  pending.get('all').resolve(result([story('old', 'Old all-market result')]));
  pending.get('crypto').resolve(result([story('btc', 'Late crypto result')])); await tick();
  assert.match(h.query('[data-news-stories]').textContent, /Currency briefing/); assert.doesNotMatch(h.query('[data-news-stories]').textContent, /Late crypto|Old all-market/);
  assert.equal(h.query('[data-news-category="forex"]').getAttribute('aria-pressed'), 'true');
  assert.equal(h.all('[data-news-category][aria-pressed="true"]').length, 1);
  assert.equal(h.query('[data-news-refresh]').disabled, false);
  assert.equal(h.query('.fn-story-category').textContent, 'forex');
});

test('a category switch clears the previous category while its new response is pending', async t => {
  const pending = deferred(); const h = harness(t, { headlines: category => category === 'all' ? Promise.resolve(result([story('a', 'All-market story')])) : pending.promise }); await tick();
  h.click('[data-news-category="stocks"]');
  assert.equal(h.all('.fn-story').length, 0); assert.match(h.query('[data-news-status]').textContent, /stocks/);
  pending.resolve(result([story('stocks', 'Stock briefing')])); await tick(); assert.match(h.query('[data-news-stories]').textContent, /Stock briefing/);
});

test('cached coverage stays available on refresh failure with an honest cached label', async t => {
  const cached = result([story('saved', 'Saved coverage story')], { status: 'cached', message: 'The latest refresh is unavailable.' });
  const h = harness(t, { cached: { all: cached }, headlines: () => Promise.reject(new Error('offline')) });
  assert.equal(h.all('.fn-story').length, 1); await tick();
  assert.match(h.query('[data-news-status]').textContent, /Saved coverage/); assert.match(h.query('[data-news-status]').textContent, /latest refresh is unavailable/);
  assert.equal(h.query('[data-news-intelligence]').dataset.feedReady, 'cached');
  h.click('[data-news-refresh]'); await tick(); assert.equal(h.calls.headlines.at(-1).force, true);
});

test('feed failures settle independently and preserve the public source libraries', async t => {
  const h = harness(t, { headlines: () => Promise.reject(new Error('offline')), releases: () => Promise.reject(new Error('offline')) }); await tick();
  assert.match(h.query('[data-news-status]').textContent, /Refresh unavailable/); assert.match(h.query('[data-release-status]').textContent, /Refresh unavailable/);
  assert.equal(h.query('[data-news-refresh]').disabled, false); assert.equal(h.query('[data-release-refresh]').disabled, false);
  assert.equal(h.all('.fn-media-card').length, 2); assert.equal(h.all('.fn-institution').length, 6);
});

test('media category, publisher and topic filters combine and can recover from an empty result', t => {
  const h = harness(t); h.click('[data-media-category="live"]');
  assert.equal(h.all('.fn-media-card').length, 1); assert.match(h.query('.fn-media-card').textContent, /Bloomberg/);
  assert.equal(h.query('[data-media-category="live"]').getAttribute('aria-pressed'), 'true');
  h.input('[data-media-publisher]', 'cnbc'); assert.equal(h.all('.fn-media-card').length, 0); assert.match(h.query('[data-media-grid]').textContent, /No libraries match/);
  h.click('[data-media-reset]'); assert.equal(h.all('.fn-media-card').length, 1);
  h.click('[data-media-category="podcasts"]'); h.input('[data-media-topic]', 'Economy');
  assert.equal(h.all('.fn-media-card').length, 1); assert.match(h.query('.fn-media-card').textContent, /Financial Times/);
  assert.equal(h.calls.headlines.length, 1); assert.equal(h.calls.releases.length, 1); assert.equal(h.calls.network, 0);
});

test('region controls filter institutions and dated releases together, including Japan fallback', async t => {
  const h = harness(t); await tick();
  assert.equal(h.all('.fn-release').length, 3);
  h.click('[data-region="us"]'); assert.equal(h.all('.fn-institution').length, 3); assert.equal(h.all('.fn-release').length, 2); assert.equal(h.all('.fn-release-sources a').length, 2);
  h.click('[data-region="europe"]'); assert.equal(h.all('.fn-institution').length, 2); assert.equal(h.all('.fn-release').length, 1); assert.match(h.query('.fn-release').textContent, /Euro area policy/);
  h.click('[data-region="japan"]'); assert.equal(h.all('.fn-institution').length, 1); assert.match(h.query('.fn-institution').textContent, /Bank of Japan/); assert.equal(h.all('.fn-release').length, 0);
  assert.match(h.query('[data-release-list]').textContent, /Japan’s official policy calendar/);
  for (const control of h.all('[data-region="japan"]')) assert.equal(control.getAttribute('aria-pressed'), 'true');
  h.click('[data-region="all"]'); assert.equal(h.all('.fn-institution').length, 6); assert.equal(h.all('.fn-release').length, 3);
});

test('official release refresh uses the bounded public service and retains source statuses', async t => {
  const h = harness(t, { releases: () => Promise.resolve(releases()) }); await tick();
  assert.match(h.query('.fn-release-sources').textContent, /Refreshed/);
  assert.equal(h.query('.fn-release time').dateTime, publishedAt);
  h.click('[data-release-refresh]'); await tick(); assert.deepEqual({ ...h.calls.releases.at(-1) }, { force: true, edition: 'us', timeoutMs: 6500 });
  assert.equal(h.query('[data-news-intelligence]').dataset.releasesReady, 'fresh');
});

test('untrusted title/source markup is displayed as text in headlines, releases and save labels', async t => {
  const hostile = '<img src=x onerror="window.injected=1"> & "quoted"';
  const item = story('unsafe" onclick="alert(1)', hostile, '<script>window.injected=1</script>'); item.url = 'https://www.cnbc.com/safe';
  const official = { ...releases().items[0], title: hostile, source: '<b>Fed</b>' };
  const h = harness(t, { headlines: () => Promise.resolve(result([item])), releases: () => Promise.resolve(result([official])) }); await tick();
  assert.equal(h.all('[data-news-stories] img, [data-news-stories] script, [data-release-list] img, [data-release-list] b').length, 0);
  assert.equal(h.win.injected, undefined); assert.match(h.query('.fn-story-link').textContent, /<img src=x/);
  assert.equal(h.query('.fn-story [data-save-source]').getAttribute('aria-label'), `Save source: ${hostile}`);
  assert.equal(h.all('[onclick], [onerror]').length, 0);
  for (const anchor of h.all('.fn-story a, .fn-release a')) { assert.equal(anchor.protocol, 'https:'); assert.equal(anchor.origin, h.win.location.origin); assert.equal(anchor.pathname, '/news/article.html'); assert.equal(anchor.target, ''); assert.match(new URL(anchor.href).searchParams.get('id'), /^[a-f0-9]{64}$/); }
});

test('headline and release save controls delegate the original source object only after activation', async t => {
  const headline = story('save', 'Research-worthy headline'), official = releases().items[0];
  const h = harness(t, { headlines: () => Promise.resolve(result([headline])), releases: () => Promise.resolve(result([official])) }); await tick();
  assert.equal(h.calls.saved.length, 0);
  h.query('.fn-story [data-save-source] svg path').dispatchEvent(new h.win.MouseEvent('click', { bubbles: true }));
  h.click('.fn-release [data-save-source]'); assert.equal(h.calls.saved.length, 2); assert.strictEqual(h.calls.saved[0], headline); assert.strictEqual(h.calls.saved[1], official);
  h.click('[data-news-plan]'); assert.equal(h.calls.plans, 1);
});

test('unavailable membership does not block reading and announces save recovery', async t => {
  const h = harness(t, { missingMembership: true }); await tick(); h.click('.fn-story [data-save-source]');
  assert.match(h.query('[data-news-announcement]').textContent, /temporarily unavailable/); assert.equal(h.query('.fn-story-link').pathname, '/news/article.html'); assert.equal(new URL(h.query('.fn-story-link').href).searchParams.get('id'), articleId('a'));
});

test('a rejected source save is announced without breaking the public reading surface', async t => {
  const h = harness(t); await tick();
  h.win.FYNXNewsMembership.saveResearch = async () => { throw new Error('This source could not be saved. Please retry.'); };
  h.click('.fn-story [data-save-source]'); await tick();
  assert.match(h.query('[data-news-announcement]').textContent, /could not be saved/);
  assert.equal(h.query('.fn-story-link').pathname, '/news/article.html'); assert.equal(new URL(h.query('.fn-story-link').href).searchParams.get('id'), articleId('a'));
});

test('missing data script provides a retry explanation instead of leaving a loading spinner', t => {
  const h = harness(t, { missingData: true });
  assert.match(h.query('[data-news-status]').textContent, /Reload/); assert.equal(h.query('[data-news-stories]').getAttribute('aria-busy'), 'false');
  assert.match(h.query('[data-news-stories]').textContent, /Explore the original publishers/); assert.equal(h.calls.headlines.length, 0);
});

test('both published News entry points contain the same generated experience and required assets', () => {
  for (const entry of ['news.html', 'news/news.html']) {
    const html = fs.readFileSync(path.join(root, entry), 'utf8');
    const generated = html.match(/<!-- news-intelligence:start -->\s*([\s\S]*?)\s*<!-- news-intelligence:end -->/);
    assert(generated, `${entry}: generated markers missing`); assert.equal(generated[1].trim(), fragment.trim());
    for (const asset of ['market-intelligence-data.js', 'news-membership.js', 'news-intelligence.js', 'news-intelligence.css', 'news-membership.css']) {
      assert.equal(html.split(`/assets/${asset.endsWith('.js') ? 'js' : 'css'}/${asset}`).length - 1, 1, `${entry}: ${asset}`);
    }
  }
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'news.html'), 'utf8'));
  try {
    const preservedModules = {
      macro: ['tools/interest-rates.html', 'tools/economic-indicators-heatmap.html'],
      markets: ['markets/index.html', 'markets/currencies.html', 'markets/crypto.html'],
      analysis: ['markets/indicators.html', 'markets/patterns.html', 'markets/volatility.html', 'markets/correlation.html', 'markets/liquidity.html', 'markets/historical-data.html'],
      positioning: ['markets/cot.html', 'tools/recent-topics-discussed.html']
    };
    for (const [mode, expected] of Object.entries(preservedModules)) {
      const panel = dom.window.document.querySelector(`[data-news-panel="${mode}"]`);
      assert(panel, `Preserved ${mode} panel missing`);
      assert.deepEqual([...panel.querySelectorAll('iframe[data-src]')].map(frame => frame.dataset.src), expected);
      for (const frame of panel.querySelectorAll('iframe[data-src]')) {
        assert(fs.existsSync(path.join(root, frame.dataset.src)), `Preserved module missing: ${frame.dataset.src}`);
        assert.equal(frame.hasAttribute('src'), false, 'Non-selected modules must stay lazy');
      }
    }
    for (const route of ['/news/heatmap.html', '/news/sentiment.html', '/news/challenges.html']) {
      assert(dom.window.document.querySelector(`.fn-jump-tools a[href="${route}"]`)); assert(fs.existsSync(path.join(root, route.slice(1))));
    }
  } finally { dom.window.close(); }
});

test('native News Feed clears the prior module URL and browser Back restores the selected tool', async t => {
  const html = fs.readFileSync(path.join(root, 'news.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/news.html', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const win = dom.window, doc = win.document;
  const tabWiring = [...doc.querySelectorAll('script:not([src])')].find(script => script.textContent.includes('function setNewsTab('));
  assert(tabWiring, 'News tab wiring is missing');
  win.eval(tabWiring.textContent);
  win.eval(fs.readFileSync(path.join(root, 'assets/js/module-loader.js'), 'utf8'));
  const activePanel = () => doc.querySelector('.mode-content.active');
  assert.equal(activePanel().dataset.newsPanel, 'feed');
  assert.equal(activePanel().querySelector('iframe'), null);
  assert.equal(doc.querySelectorAll('.mode-content iframe[src]').length, 0);
  doc.querySelector('[data-news-tab="analysis"]').click(); await tick();
  const analysis = activePanel(); assert.equal(analysis.dataset.newsPanel, 'analysis');
  const patternButton = [...analysis.querySelectorAll('.module-toolbar button')].find(button => button.textContent === 'Patterns');
  assert(patternButton); patternButton.click();
  assert.equal(new URL(win.location.href).searchParams.get('tool'), '/markets/patterns.html');
  doc.querySelector('[data-news-tab="feed"]').click(); await tick();
  assert.equal(activePanel().dataset.newsPanel, 'feed');
  assert.equal(new URL(win.location.href).searchParams.get('section'), 'feed');
  assert.equal(new URL(win.location.href).searchParams.has('tool'), false);
  const length = win.history.length;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser Back did not dispatch popstate')), 1000);
    win.addEventListener('popstate', () => { clearTimeout(timer); resolve(); }, { once: true });
    win.history.back();
  });
  await tick();
  assert.equal(activePanel().dataset.newsPanel, 'analysis');
  assert.equal(new URL(win.location.href).searchParams.get('tool'), '/markets/patterns.html');
  assert.equal(analysis.querySelector('.module-toolbar button[aria-pressed="true"]').textContent, 'Patterns');
  assert.equal(doc.querySelector('[data-news-tab="analysis"]').getAttribute('aria-selected'), 'true');
  assert.equal(doc.querySelector('[data-news-tab="analysis"]').tabIndex, 0);
  assert.equal(win.history.length, length, 'Restoring history must not push another entry');
});

test('edition changes clear both lists immediately, send explicit selectors and reject late headline and release responses', async t => {
  const headlines=new Map(),official=new Map();
  const h=harness(t,{edition:'us',terminal:true,headlines:(_category,settings)=>{const d=deferred();headlines.set(settings.edition,d);return d.promise;},releases:settings=>{const d=deferred();official.set(settings.edition,d);return d.promise;}});
  h.win.FynxEdition.set('uk');
  assert.equal(h.all('.fn-story').length,0);assert.equal(h.all('.fn-release').length,0);
  assert.match(h.query('[data-release-status]').textContent,/UK/);
  assert.match(h.query('.fn-terminal-sources').textContent,/Bank of England/);
  assert.doesNotMatch(h.query('.fn-terminal-sources').textContent,/Federal Reserve|BEA/);
  assert.deepEqual({...h.calls.cachedHeadlines.at(-1)},{category:'all',edition:'uk'});
  assert.deepEqual({...h.calls.cachedReleases.at(-1)},{edition:'uk'});
  headlines.get('uk').resolve(result([{...story('uk','UK market report'),edition:'uk'}],{edition:'uk'}));
  official.get('uk').resolve(result([{...story('boe','UK policy release','Bank of England'),sourceId:'boe',kind:'official-release',edition:'uk',url:'https://www.bankofengland.co.uk/news/policy'}],{edition:'uk'}));await tick();
  headlines.get('us').resolve(result([story('old','US late market report')],{edition:'us'}));
  official.get('us').resolve({...releases(),edition:'us'});await tick();
  assert.match(h.query('[data-news-stories]').textContent,/UK market report/);assert.doesNotMatch(h.query('[data-news-stories]').textContent,/US late/);
  assert.match(h.query('[data-release-list]').textContent,/UK policy release/);assert.doesNotMatch(h.query('[data-release-list]').textContent,/Federal Reserve announcement|Economic accounts/);
  assert.equal(h.query('[data-news-intelligence]').dataset.feedEdition,'uk');assert.equal(h.query('[data-news-intelligence]').dataset.releasesEdition,'uk');
  assert.equal(h.query('[data-news-refresh]').disabled,false);assert.equal(h.query('[data-release-refresh]').disabled,false);
});

test('empty regional headline feeds keep official releases in their own panel rather than replacing top news', async t => {
  const h=harness(t,{edition:'uk',headlines:()=>Promise.resolve(result([],{edition:'uk'})),releases:()=>Promise.resolve(result([
    {...story('boe','UK official policy'),sourceId:'boe',kind:'official-release',edition:'uk',url:'https://www.bankofengland.co.uk/news/policy'},
    {...story('fed','Unrelated US policy'),sourceId:'fed',kind:'official-release',edition:'us',url:'https://www.federalreserve.gov/policy'}
  ],{edition:'uk'}))});await tick();
  assert.equal(h.calls.releases.length,1,'official releases are independently requested once');
  assert.equal(h.all('.fn-story').length,0);assert.equal(h.all('.fn-release').length,1);assert.match(h.query('[data-release-list]').textContent,/UK official policy/);
  assert.doesNotMatch(h.query('[data-news-stories]').textContent,/UK official policy|Unrelated US/);
  h.click('[data-news-category="crypto"]');await tick();assert.equal(h.all('.fn-story').length,0);assert.equal(h.calls.headlines.at(-1).edition,'uk');
});

test('regional publisher filters and official source links rebuild without retaining US default destinations', async t => {
  const h=harness(t,{edition:'us',terminal:true,headlines:(_category,settings)=>Promise.resolve(result([story('headline')],{edition:settings.edition})),releases:settings=>Promise.resolve(result([],{edition:settings.edition}))});await tick();
  h.input('[data-media-publisher]','cnbc');assert.match(h.query('.fn-media-card').textContent,/CNBC/);
  h.win.FynxEdition.set('uk');await tick();
  assert.equal(h.query('[data-media-publisher]').value,'all');assert.doesNotMatch(h.query('[data-media-grid]').textContent,/CNBC/);assert.match(h.query('.fn-media-edition').textContent,/UK edition · Global publisher libraries/);
  assert.deepEqual(h.all('.fn-institution h3').map(el=>el.textContent),['Bank of England']);assert.deepEqual(h.all('.fn-release-sources a').map(el=>el.textContent),['Bank of England ↗']);
  h.click('[data-region="us"]');assert.equal(h.all('.fn-release-sources a').length,0);assert.equal(h.all('.fn-institution').length,0);
  h.win.FynxEdition.set('canada');await tick();assert.match(h.query('.fn-terminal-sources').textContent,/Bank of Canada/);assert.match(h.query('.fn-institution').textContent,/Bank of Canada/);assert.equal(h.query('[data-region="all"]').getAttribute('aria-pressed'),'true');
});

test('mismatched edition responses never render even when a faulty data service returns them', async t => {
  const h=harness(t,{edition:'uk',headlines:()=>Promise.resolve(result([story('us','Unexpected US report')],{edition:'us'})),releases:()=>Promise.resolve({...releases(),edition:'us'})});await tick();
  assert.equal(h.all('.fn-story').length,0);assert.equal(h.all('.fn-release').length,0);assert.match(h.query('[data-news-status]').textContent,/could not be refreshed/);
});

test('visible refresh runs at five minutes, pauses while hidden and catches up once on return', async t => {
  const h=harness(t);await tick();const start=Date.parse('2026-10-20T10:10:00Z');
  assert.equal([...h.timeouts.values()][0].at,start+300000);
  await h.advanceTo(start+299999);assert.equal(h.calls.headlines.length,1);assert.equal(h.calls.releases.length,1);
  h.setVisibility('hidden');assert.equal(h.timeouts.size,0);
  await h.advanceTo(start+420000);assert.equal(h.calls.headlines.length,1);
  h.setVisibility('visible');await tick();assert.equal(h.calls.headlines.length,2);assert.equal(h.calls.releases.length,2);
  h.doc.dispatchEvent(new h.win.Event('visibilitychange'));await tick();assert.equal(h.calls.headlines.length,2);assert.equal(h.calls.releases.length,2);
  assert.equal([...h.timeouts.values()][0].at,start+720000);
});

test('a category changed at minute two refreshes at minute seven, independently of release deadlines',async t=>{
  const h=harness(t);await tick();const start=Date.parse('2026-10-20T10:10:00Z');
  await h.advanceTo(start+120000);h.click('[data-news-category="stocks"]');await tick();
  assert.equal(h.calls.headlines.length,2);assert.equal(h.calls.headlines.at(-1).category,'stocks');
  await h.advanceTo(start+300000);assert.equal(h.calls.headlines.length,2);assert.equal(h.calls.releases.length,2);
  await h.advanceTo(start+419999);assert.equal(h.calls.headlines.length,2);
  await h.advanceTo(start+420000);assert.equal(h.calls.headlines.length,3);assert.equal(h.calls.headlines.at(-1).category,'stocks');
  assert.equal(h.calls.releases.length,2);
});

test('an edition changed at minute two gives both selected feeds a minute-seven deadline',async t=>{
  const h=harness(t,{edition:'us'});await tick();const start=Date.parse('2026-10-20T10:10:00Z');
  await h.advanceTo(start+120000);h.win.FynxEdition.set('uk');await tick();
  await h.advanceTo(start+419999);assert.equal(h.calls.headlines.length,2);assert.equal(h.calls.releases.length,2);
  await h.advanceTo(start+420000);assert.equal(h.calls.headlines.length,3);assert.equal(h.calls.releases.length,3);
  assert.equal(h.calls.headlines.at(-1).edition,'uk');assert.equal(h.calls.releases.at(-1).edition,'uk');
});

test('page suspension cancels the request timer and restoring catches up without duplicating in-flight feeds',async t=>{
  const next=deferred();let count=0;
  const h=harness(t,{headlines:()=>++count===1?Promise.resolve(result([story('a')])):next.promise});await tick();
  const start=Date.parse('2026-10-20T10:10:00Z');h.win.dispatchEvent(new h.win.Event('pagehide'));assert.equal(h.timeouts.size,0);
  await h.advanceTo(start+420000);assert.equal(h.calls.headlines.length,1);
  h.win.dispatchEvent(new h.win.Event('pageshow'));await tick();assert.equal(h.calls.headlines.length,2);
  h.doc.dispatchEvent(new h.win.Event('visibilitychange'));await tick();assert.equal(h.calls.headlines.length,2);
  next.resolve(result([story('b')]));await tick();assert.equal([...h.timeouts.values()][0].at,start+720000);
});

test('open pages prune expired 24-hour headlines and analysis, plus thirty-day official releases without waiting for a provider', async t => {
  const now=Date.parse('2026-10-30T12:00:00Z'),hours=h=>new Date(now-h*3600000).toISOString();
  const h=harness(t,{now,headlines:()=>Promise.resolve(result([
    {...story('fresh','Fresh story'),publishedAt:hours(1)},
    {...story('near','Expiring headline'),publishedAt:hours(24)+''},
    {...story('analysis','Expiring analysis'),publishedAt:hours(24),kind:'analysis',category:'analysis'},
    {...story('old','Already expired'),publishedAt:hours(25)}
  ])),releases:()=>Promise.resolve(result([{...story('release','Expiring official release'),sourceId:'fed',kind:'official-release',publishedAt:hours(720),url:'https://www.federalreserve.gov/policy'}]))});await tick();
  Object.defineProperty(h.doc,'visibilityState',{value:'visible',configurable:true});
  assert.equal(h.all('.fn-story').length,3);assert.equal(h.all('.fn-release').length,1);
  h.setNow(now+60000);h.calls.intervals.find(timer=>timer.ms===60000).callback();
  assert.equal(h.all('.fn-story').length,1);assert.match(h.query('.fn-story').textContent,/Fresh story/);assert.equal(h.all('.fn-release').length,0);
  assert.equal(h.calls.headlines.length,1);assert.equal(h.calls.releases.length,1);
});

test('licensed source images preserve attribution and alt text and are removed if unavailable', async t => {
  const item={...story('image','Source image headline'),image:{url:'https://images.publisher.example/report.jpg',sourceURL:'https://publisher.example/report',credit:'Source photographer',source:'Publisher',license:'CC BY 4.0',licenseURL:'https://creativecommons.org/licenses/by/4.0/',alt:'A shipping crane beside a container terminal'}};
  const h=harness(t,{headlines:()=>Promise.resolve(result([item])),media:true});await tick();
  const figure=h.query('.fn-source-image');assert(figure);assert.equal(figure.querySelector('img').alt,item.image.alt);assert.equal(figure.querySelector('img').getAttribute('src'),item.image.url);
  assert.match(figure.querySelector('figcaption').textContent,/Source image · Source photographer · CC BY 4.0/);assert.equal(h.all('.newsroom-context-image').length,0);
  figure.querySelector('img').dispatchEvent(new h.win.Event('error'));assert.equal(h.all('.fn-lead-image').length,0);
});

test('context images stay visibly labeled and avoid geographic false associations for non-US editions', async t => {
  const h=harness(t,{edition:'japan',media:true,headlines:()=>Promise.resolve(result([{...story('japan','Nikkei market report'),edition:'japan'}],{edition:'japan'})),releases:()=>Promise.resolve(result([],{edition:'japan'}))});await tick();
  const figure=h.query('.newsroom-context-image');assert(figure);assert.equal(figure.dataset.contextImage,'world');assert.match(figure.querySelector('figcaption').textContent,/Context:/);assert.match(figure.querySelector('img').alt,/Earth/);assert.doesNotMatch(figure.querySelector('img').alt,/Nikkei market report|New York/);
});

test('unsafe and noncommercial source images fall back to labeled context rather than executable markup', async t => {
  const item={...story('bad-image'),image:{url:'javascript:alert(1)',sourceURL:'https://publisher.example/story',credit:'<img onerror=alert(2)>',license:'CC BY-NC 4.0',licenseURL:'https://creativecommons.org/licenses/by-nc/4.0/'}};
  const h=harness(t,{media:true,headlines:()=>Promise.resolve(result([item]))});await tick();
  assert.equal(h.all('.fn-source-image').length,0);assert.equal(h.all('.newsroom-context-image').length,1);assert.equal(h.all('[onerror]').length,0);assert.match(h.query('.fn-lead-image figcaption').textContent,/Context:/);
});
