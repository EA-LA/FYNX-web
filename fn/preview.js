/* FYNX story preview (Vercel serverless). Read-only.
 *   ?u=<article url>&u=<article url>   up to 8 story links
 * For each link it returns the publisher's own share-preview image (Open Graph / Twitter card),
 * the publisher name and the resolved article address, so headline lists can show the picture
 * each publisher attaches to its story. Google News links are resolved to the publisher article first.
 * Nothing is stored; images are not copied or proxied, only their published addresses are returned. */
'use strict';
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_HTML = 600000;

function safeURL(value) {
  try {
    const u = new URL(String(value || ''));
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    if (!host.includes('.') || host === 'localhost' || /\.(local|localhost|internal|lan)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(':')) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

async function text(url, init = {}, limit = MAX_HTML) {
  const res = await fetch(url, {redirect: 'follow', ...init, headers: {'User-Agent': AGENT, 'Accept-Language': 'en-US,en;q=0.8', ...(init.headers || {})}, signal: AbortSignal.timeout(init.timeout || 7000)});
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (!safeURL(res.url)) throw new Error('Unsafe redirect');
  const reader = res.body.getReader(), parts = []; let size = 0;
  while (size < limit) { const {done, value} = await reader.read(); if (done) break; parts.push(Buffer.from(value)); size += value.length; }
  try { reader.cancel(); } catch {}
  return {url: res.url, body: Buffer.concat(parts).toString('utf8')};
}

// Google News RSS links point at an interstitial. Resolve them to the publisher article.
async function resolveGoogle(url) {
  const u = new URL(url);
  const id = u.pathname.split('/').filter(Boolean).pop();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id || '')) throw new Error('Unknown Google News link');
  const page = await text(`https://news.google.com/rss/articles/${id}?hl=en-US&gl=US&ceid=US:en`, {timeout: 6000}, 200000);
  const sg = page.body.match(/data-n-a-sg="([^"]+)"/)?.[1], ts = page.body.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) throw new Error('Google News signature missing');
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${Number(ts)},"${sg}"]`;
  const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {method: 'POST', headers: {'User-Agent': AGENT, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'}, body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner]]])), signal: AbortSignal.timeout(6000)});
  if (!res.ok) throw new Error('Google News decode HTTP ' + res.status);
  const raw = await res.text();
  const payload = JSON.parse(raw.split('\n\n')[1]);
  const target = safeURL(JSON.parse(payload[0][2])[1]);
  if (!target || new URL(target).hostname.endsWith('google.com')) throw new Error('Google News link did not resolve');
  return target;
}

function meta(html, names) {
  const head = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : html.length);
  for (const name of names) {
    const tags = head.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name.replace(/:/g, ':')}["'][^>]*>`, 'gi')) || [];
    for (const tag of tags) { const c = tag.match(/content=["']([^"']+)["']/i)?.[1]; if (c) return decode(c); }
  }
  return null;
}

async function preview(input) {
  let url = safeURL(input);
  if (!url) throw new Error('Invalid link');
  if (/(^|\.)news\.google\.com$/.test(new URL(url).hostname)) url = await resolveGoogle(url);
  const page = await text(url);
  const image = meta(page.body, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
  let imageURL = null;
  if (image) { try { imageURL = safeURL(new URL(image, page.url).href); } catch {} }
  if (imageURL && /\.svg(\?|$)|logo|favicon|placeholder|default[-_]?(share|image|og)/i.test(imageURL)) imageURL = null;
  const site = meta(page.body, ['og:site_name', 'application-name']) || new URL(page.url).hostname.replace(/^www\./, '');
  const alt = meta(page.body, ['og:image:alt', 'twitter:image:alt']);
  return {url: page.url, image: imageURL, site: site.slice(0, 80), alt: alt ? alt.slice(0, 300) : null};
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); return res.status(204).end(); }
  if (req.method !== 'GET') return res.status(405).json({error: 'Use GET.'});
  const raw = req.query?.u, list = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map(String))];
  if (!list.length || list.length > 8 || list.some(u => u.length > 1200)) return res.status(400).json({error: 'Send 1 to 8 story links as u=.'});
  const previews = {};
  await Promise.all(list.map(async u => { try { previews[u] = await preview(u); } catch (e) { previews[u] = {error: String(e.message || 'Preview unavailable').slice(0, 120)}; } }));
  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
  return res.status(200).json({previews, fetchedAt: new Date().toISOString()});
};
module.exports.preview = preview;
module.exports.safeURL = safeURL;
