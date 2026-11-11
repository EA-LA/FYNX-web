// Only public editorial pages may display ads. Never account, journal or auth pages.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/advertising.json'), 'utf8'));
const allowed = ['index.html', 'learn.html', 'news/news.html', 'market-analysis.html'];
if (!Array.isArray(config.pages) || config.pages.some(page => !allowed.includes(page))) throw Error('Ads may only appear on approved public editorial pages');
if (config.enabled && (!/^ca-pub-\d{16}$/.test(config.publisherId) || !/^\d{10}$/.test(config.slotId) || !config.siteApproved || !config.privacyAndConsentReady)) {
  throw Error('Advertising requires real publisher and slot IDs, site approval, and configured privacy/consent messaging');
}
for (const page of allowed) {
  const file = path.join(root, page);
  let html = fs.readFileSync(file, 'utf8').replace(/<!-- FYNX AD START -->[\s\S]*?<!-- FYNX AD END -->\n?/g, '');
  if (config.enabled && config.pages.includes(page)) {
    const block = `<!-- FYNX AD START --><aside aria-label="Advertisement" style="max-width:1100px;margin:32px auto;padding:16px;box-sizing:border-box"><p style="font-size:12px;text-align:center">Advertisement</p><ins class="adsbygoogle" style="display:block" data-ad-client="${config.publisherId}" data-ad-slot="${config.slotId}" data-ad-format="auto" data-full-width-responsive="true"></ins></aside><script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.publisherId}"></script><script>(window.adsbygoogle=window.adsbygoogle||[]).push({});</script><!-- FYNX AD END -->\n`;
    if (!/<footer\b/.test(html)) throw Error(`Missing footer for ad placement: ${page}`);
    html = html.replace(/<footer\b/, block + '<footer');
  }
  fs.writeFileSync(file, html);
}
const ads = path.join(root, 'ads.txt');
if (config.enabled) fs.writeFileSync(ads, `google.com, ${config.publisherId.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
else if (fs.existsSync(ads)) fs.unlinkSync(ads);
console.log(config.enabled ? 'Advertising placements generated.' : 'Advertising prepared; disabled until publisher approval and configuration.');
