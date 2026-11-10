// Temporary live check: loads the built page against real production data sources.
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({args: ['--host-resolver-rules=MAP fynx.test 127.0.0.1']});
  const out = {};
  for (const [name, viewport] of [['desktop', {width: 1440, height: 900}], ['mobile', {width: 390, height: 844}]]) {
    const page = await browser.newPage({viewport}); const errors = [], failed = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => failed.push(r.url().slice(0, 120) + ' ' + r.failure()?.errorText));
    page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(0, 120)); });
    await page.goto('http://fynx.test:8080/macro-desk.html', {waitUntil: 'load'});
    await page.waitForTimeout(30000);
    await page.screenshot({path: `macro-${name}.png`, fullPage: true});
    out[name] = await page.evaluate(() => ({
      status: document.getElementById('md-status').textContent,
      storyTitle: document.getElementById('md-story-title').textContent,
      story: document.getElementById('md-story-body').innerText.slice(0, 700),
      headlines: [...document.querySelectorAll('.md-headline:not([aria-hidden])')].map(a => a.innerText.replace(/\s+/g, ' ')).slice(0, 5),
      banks: [...document.querySelectorAll('#md-banks tr')].map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 220)),
      liveYields: document.getElementById('md-live-yields').innerText.replace(/\s+/g, ' '),
      tenors: document.querySelectorAll('#md-tenors tr').length,
      bias: [...document.querySelectorAll('#md-bias tr')].map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 110)),
      nav: [...document.querySelectorAll('.terminal-navigation a')].map(a => a.textContent).join('|'),
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    out[name].errors = errors.filter(e => !/googlesyndication|adsbygoogle|favicon/.test(e)).slice(0, 15);
    out[name].failed = failed.filter(e => !/googlesyndication|google-analytics|favicon/.test(e)).slice(0, 15);
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
