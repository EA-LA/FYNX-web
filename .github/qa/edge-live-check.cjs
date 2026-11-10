const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({args: ['--host-resolver-rules=MAP fynx.test 127.0.0.1']}); const out = {};
  for (const [name, url, viewport] of [['index', '/edge-radar/', {width: 1440, height: 900}], ['usdjpy', '/edge-radar/usdjpy/', {width: 1440, height: 900}], ['mobile-btc', '/edge-radar/btcusd/', {width: 390, height: 844}], ['macro', '/macro-desk.html', {width: 1440, height: 900}]]) {
    const page = await browser.newPage({viewport}); const errors = [];
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://fynx.test:8080' + url, {waitUntil: 'load'}); await page.waitForTimeout(25000);
    out[name] = await page.evaluate(() => {
      const q = s => document.querySelector(s)?.innerText?.replace(/\s+/g, ' ').slice(0, 400);
      return {status: q('#ei-status') || q('#md-status'), story: q('#ei-story h3'), text: q('.ei-story-text'), bias: q('.ei-score'), vol: q('.ei-vol-now'), pos: q('#ei-positions .ei-small'), orders: q('#ei-orders .ei-empty'), related: document.querySelectorAll('.ei-related li').length, edgeTable: document.querySelectorAll('#edge-primary tr, #edge-primary .edge-row').length, mdStory: q('#md-story-title'), overflow: document.documentElement.scrollWidth > innerWidth};
    });
    out[name].errors = errors.filter(e => !/googlesyndication|adsbygoogle|favicon|accounts\.google/.test(e)).slice(0, 10);
  }
  console.log(JSON.stringify(out, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
