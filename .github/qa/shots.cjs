const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({args: ['--host-resolver-rules=MAP fynx.test 127.0.0.1']});
  const shot = async (name, url, viewport, fn, opts = {}) => {
    const page = await browser.newPage({viewport, deviceScaleFactor: opts.scale || 1});
    await page.goto('http://fynx.test:8080' + url, {waitUntil: 'load'}); await page.waitForTimeout(28000);
    if (fn) await fn(page);
    const buf = await page.screenshot({type: 'jpeg', quality: 82, fullPage: Boolean(opts.full)});
    const b64 = buf.toString('base64'); for (let i = 0; i * 3000 < b64.length; i++) console.log(`SHOT ${name} ${String(i).padStart(4, '0')} ${b64.slice(i * 3000, (i + 1) * 3000)}`); await page.close();
  };
  await shot('terminal', '/terminal.html', {width: 1920, height: 1080});
  await shot('terminal-aapl', '/terminal.html', {width: 1920, height: 1080}, async p => { await p.fill('#fx-command', 'AAPL'); await p.press('#fx-command', 'Enter'); await p.waitForTimeout(8000); await p.click('#b-cb .fx-row'); await p.waitForTimeout(800); });
  await shot('home-button', '/home.html', {width: 1440, height: 500});
  await shot('terminal-mobile', '/terminal.html', {width: 390, height: 844}, null, {scale: 2});
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
