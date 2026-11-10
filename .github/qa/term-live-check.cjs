const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({args: ['--host-resolver-rules=MAP fynx.test 127.0.0.1']}); const out = {};
  for (const [name, viewport] of [['desktop', {width: 1920, height: 1080}], ['laptop', {width: 1366, height: 768}], ['mobile', {width: 390, height: 844}]]) {
    const page = await browser.newPage({viewport}); const errors = [];
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://fynx.test:8080/terminal.html', {waitUntil: 'load'}); await page.waitForTimeout(30000);
    if (name === 'desktop') {
      await page.fill('#fx-command', 'AAPL'); await page.press('#fx-command', 'Enter'); await page.waitForTimeout(8000);
      out.afterAAPL = await page.evaluate(() => [document.getElementById('focus-title').textContent, document.querySelector('#b-focus .fx-stats')?.innerText.replace(/\s+/g, ' '), document.getElementById('fin-title').textContent, document.querySelector('#b-fin tr:nth-child(2)')?.innerText.replace(/\s+/g, ' ')]);
      await page.fill('#fx-command', 'NEWS ENERGY'); await page.press('#fx-command', 'Enter'); await page.waitForTimeout(6000);
      out.energy = await page.evaluate(() => [...document.querySelectorAll('#b-desks .fx-ht')].slice(0, 3).map(e => e.textContent));
      await page.click('#b-cb .fx-row'); await page.waitForTimeout(500);
      out.inspectFed = await page.evaluate(() => document.getElementById('fx-inspect-body').innerText.replace(/\s+/g, ' ').slice(0, 300));
    }
    out[name] = await page.evaluate(() => {
      const r = {}; document.querySelectorAll('.tp').forEach(t => { const b = t.querySelector('.tp-b'); r[t.id] = (b.innerText || '').replace(/\s+/g, ' ').slice(0, 110); });
      r.live = document.getElementById('fx-live').textContent; r.liveTitle = document.getElementById('fx-live').title; r.docH = document.documentElement.scrollHeight; r.overflow = document.documentElement.scrollWidth > innerWidth; r.ticker = document.querySelectorAll('.fx-hl').length; return r;
    });
    out[name].errors = errors.filter(e => !/googlesyndication|adsbygoogle|favicon|gstatic|firebase|accounts\.google|identitytoolkit/.test(e)).slice(0, 10);
  }
  console.log(JSON.stringify(out, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
