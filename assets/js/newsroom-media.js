/* Section-context images, upgraded to the publisher's own story photo when one is published.
 * Context photographs load first (and stay as the fallback); createFigure(section, {story}) then asks
 * the FYNX preview service for the share image each publisher attaches to that story.
 * Per-file authorship and license verified using Commons imageinfo/extmetadata.
 * Images remain hosted by Wikimedia; no local copies or editorial alterations.
 */
(function (root) {
  'use strict';
  const sections = {
    markets: {
      context: true,
      subject: 'The New York Stock Exchange and Federal Hall at Broad and Wall Streets, New York',
      alt: 'The New York Stock Exchange and Federal Hall at the intersection of Broad Street and Wall Street',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/92/New_York_Stock_Exchange_August_2017_02.jpg/960px-New_York_Stock_Exchange_August_2017_02.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:New_York_Stock_Exchange_August_2017_02.jpg',
      credit: 'Arild Vågen', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', width: 960, height: 641
    },
    finance: {
      context: true,
      subject: 'Canary Wharf viewed from Limehouse, London',
      alt: 'The Canary Wharf skyline across the River Thames from Limehouse, London',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Canary_Wharf_from_Limehouse_London_June_2016_HDR.jpg/960px-Canary_Wharf_from_Limehouse_London_June_2016_HDR.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Canary_Wharf_from_Limehouse_London_June_2016_HDR.jpg',
      credit: 'King of Hearts', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', width: 960, height: 540
    },
    economics: {
      context: true,
      subject: 'Container cranes at the Port of Oakland, California',
      alt: 'Three container cranes at the Port of Oakland in California',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Container_cranes_at_the_Port_of_Oakland.jpg/960px-Container_cranes_at_the_Port_of_Oakland.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Container_cranes_at_the_Port_of_Oakland.jpg',
      credit: 'Jim Heaphy (Cullen328)', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', width: 960, height: 634
    },
    technology: {
      context: true,
      subject: 'A 12-inch silicon wafer',
      alt: 'A circular 12-inch silicon wafer with a grid of semiconductor dies and colored reflections',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/eb/12-inch_silicon_wafer.jpg/960px-12-inch_silicon_wafer.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:12-inch_silicon_wafer.jpg',
      credit: 'Peellden', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', width: 960, height: 960
    },
    politics: {
      context: true,
      subject: 'The west front of the U.S. Capitol, Washington, D.C.',
      alt: 'The west front, dome and grounds of the United States Capitol in Washington, D.C.',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/United_States_Capitol_west_front_edit2.jpg/960px-United_States_Capitol_west_front_edit2.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:United_States_Capitol_west_front_edit2.jpg',
      credit: 'Architect of the Capitol; derivative by O.J.', license: 'Public domain', licenseUrl: 'https://commons.wikimedia.org/wiki/File:United_States_Capitol_west_front_edit2.jpg#Licensing', width: 960, height: 497
    },
    industries: {
      context: true,
      subject: 'Industrial robots used for automatic packaging',
      alt: 'Industrial robotic arms operating on an automatic packaging line',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Robots_empaquetado_automatico.jpg/960px-Robots_empaquetado_automatico.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Robots_empaquetado_automatico.jpg',
      credit: 'Tecnowey', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', width: 960, height: 661
    },
    energy: {
      context: true,
      subject: 'Power County Wind Farm in Idaho',
      alt: 'An aerial view of wind turbines across the Power County Wind Farm in Idaho',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/Power_County_Wind_Farm_002.jpg/960px-Power_County_Wind_Farm_002.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Power_County_Wind_Farm_002.jpg',
      credit: 'ENERGY.GOV', license: 'Public domain', licenseUrl: 'https://commons.wikimedia.org/wiki/File:Power_County_Wind_Farm_002.jpg#Licensing', width: 960, height: 675
    },
    world: {
      context: true,
      subject: 'NASA’s Blue Marble composite of Earth’s Eastern Hemisphere',
      alt: 'A NASA Blue Marble composite rendering of Earth’s Eastern Hemisphere using satellite and other Earth-observation data',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Blue_Marble_Eastern_Hemisphere.jpg/960px-Blue_Marble_Eastern_Hemisphere.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Blue_Marble_Eastern_Hemisphere.jpg',
      credit: 'NASA / Reto Stöckli, using NASA and NOAA data', license: 'Public domain', licenseUrl: 'https://commons.wikimedia.org/wiki/File:Blue_Marble_Eastern_Hemisphere.jpg#Licensing', width: 960, height: 960
    }
  };
  Object.values(sections).forEach(Object.freeze);
  Object.freeze(sections);
  function get(section) { return Object.hasOwn(sections, section) ? sections[section] : null; }
  function createFigure(section, options) {
    const item = get(section), doc = root.document;
    if (!item || !doc) return null;
    const settings = options || {};
    const figure = doc.createElement('figure');
    figure.className = 'newsroom-context-image' + (settings.className ? ' ' + settings.className : '');
    figure.dataset.contextImage = section; figure.dataset.contextSrc = item.url;
    const image = doc.createElement('img');
    const stories = (Array.isArray(settings.story) ? settings.story : settings.story ? [settings.story] : []).filter(Boolean).slice(0, 4);
    // With a story, never flash the generic context photo: hold a neutral frame until the story photo
    // loads, and use the context photo only if the publisher has none.
    const pending = stories.length > 0 && typeof root.fetch === 'function';
    if (!pending) image.src = item.url;
    image.alt = item.alt;
    image.width = item.width; image.height = item.height;
    image.loading = settings.loading === 'eager' ? 'eager' : 'lazy';
    image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => { if (!figure.dataset.storyImage) figure.remove(); });
    const caption = doc.createElement('figcaption');
    const label = doc.createElement('strong'); label.textContent = 'Context: ' + item.subject + '. ';
    const source = doc.createElement('a'); source.href = item.sourceUrl; source.textContent = item.credit;
    const license = doc.createElement('a'); license.href = item.licenseUrl; license.textContent = item.license;
    [source, license].forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer'; });
    caption.append(label, source, doc.createTextNode(' · '), license);
    figure.append(image, caption);
    if (pending) {
      figure.classList.add('newsroom-photo-pending'); figure.setAttribute('aria-busy', 'true'); caption.hidden = true;
      ensureStyle(doc);
      let settled = false;
      const settle = ok => {
        if (settled) return; settled = true; figure.dataset.photoSettled = ok ? 'story' : 'context';
        figure.classList.remove('newsroom-photo-pending'); figure.removeAttribute('aria-busy'); caption.hidden = false;
        if (!ok) image.src = item.url;
      };
      setTimeout(() => settle(false), 8000);
      upgrade(figure, image, caption, stories, settings, settle).catch(() => settle(false));
    }
    return figure;
  }

  /* ---- Story photos: the publisher's share image for the actual headline ---- */
  const host = root.location?.hostname || '';
  const PREVIEW = /(^|\.)vercel\.app$/.test(host) ? '/fn/preview.js' : 'https://fynxfinanceworld.vercel.app/fn/preview.js';
  const CACHE_KEY = 'fynx_story_previews_v1', HIT_MS = 6 * 3600000, MISS_MS = 3600000;
  let cache = {};
  try { const raw = root.sessionStorage?.getItem(CACHE_KEY); if (raw && raw.length < 400000) cache = JSON.parse(raw) || {}; } catch { cache = {}; }
  const waiting = new Map(), inflight = new Set(); let timer = null;
  function safe(value) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.') ? u.href : null; } catch { return null; } }
  function persist() {
    try { const now = Date.now(), keep = Object.entries(cache).filter(([, v]) => v && now - v.at < HIT_MS).slice(-150); cache = Object.fromEntries(keep); root.sessionStorage?.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
  }
  function fresh(url) { const v = cache[url]; return v && Date.now() - v.at < (v.image ? HIT_MS : MISS_MS) ? v : null; }
  function flush() {
    timer = null;
    const urls = [...waiting.keys()].filter(u => !inflight.has(u)); if (!urls.length) return;
    urls.forEach(u => inflight.add(u));
    for (let i = 0; i < urls.length; i += 8) {
      const batch = urls.slice(i, i + 8), query = new URLSearchParams(); batch.forEach(u => query.append('u', u));
      const done = data => batch.forEach(u => { const p = data?.previews?.[u], hit = p && safe(p.image) ? {image: safe(p.image), site: String(p.site || '').slice(0, 80), url: safe(p.url) || u, alt: p.alt ? String(p.alt).slice(0, 300) : '', at: Date.now()} : {image: null, at: Date.now()}; cache[u] = hit; inflight.delete(u); (waiting.get(u) || []).forEach(fn => fn(hit)); waiting.delete(u); });
      root.fetch(PREVIEW + '?' + query, {credentials: 'omit', referrerPolicy: 'no-referrer', signal: root.AbortSignal?.timeout ? root.AbortSignal.timeout(15000) : undefined})
        .then(r => r.ok ? r.json() : null).catch(() => null).then(data => { if (data) done(data); else batch.forEach(u => { inflight.delete(u); (waiting.get(u) || []).forEach(fn => fn(null)); waiting.delete(u); }); persist(); });
    }
  }
  function lookup(url) {
    const known = fresh(url); if (known) return Promise.resolve(known);
    return new Promise(resolve => { if (!waiting.has(url)) waiting.set(url, []); waiting.get(url).push(resolve); if (!timer && !inflight.has(url)) timer = setTimeout(flush, 40); });
  }
  function ensureStyle(doc) {
    if (doc.getElementById('fynx-story-photo-style')) return;
    const st = doc.createElement('style'); st.id = 'fynx-story-photo-style';
    st.textContent = '.newsroom-story-photo img{object-fit:cover!important;background:#0d1210}'
      + '.newsroom-photo-pending img{display:none}'
      + '.newsroom-photo-pending{position:relative;min-height:180px;aspect-ratio:16/9;background:linear-gradient(100deg,rgba(127,127,127,.10) 30%,rgba(127,127,127,.22) 50%,rgba(127,127,127,.10) 70%);background-size:300% 100%;animation:fynx-photo-wait 1.4s ease-in-out infinite}'
      + '.newsroom-photo-pending figcaption{display:none}'
      + '@keyframes fynx-photo-wait{0%{background-position:100% 0}100%{background-position:0 0}}'
      + '@media (prefers-reduced-motion:reduce){.newsroom-photo-pending{animation:none}}';
    doc.head.append(st);
  }
  async function upgrade(figure, image, caption, stories, settings, settle = () => {}) {
    if (typeof root.fetch !== 'function') return settle(false);
    const candidates = stories.map(item => ({item, url: safe(item.url || item.link)})).filter(c => c.url);
    const found = await Promise.all(candidates.map(c => lookup(c.url)));
    const shown = new Set([...(root.document?.querySelectorAll('[data-story-image] img') || [])].map(img => img.src));
    let index = found.findIndex(p => p && p.image && !shown.has(p.image));
    if (index < 0) index = found.findIndex(p => p && p.image);
    if (index < 0) return settle(false);
    const {item} = candidates[index], p = found[index], doc = root.document;
    const original = {src: image.getAttribute('src') || figure.dataset.contextSrc || '', alt: image.alt, width: image.width, height: image.height, caption: [...caption.childNodes]};
    ensureStyle(doc);
    const probe = new root.Image(); probe.referrerPolicy = 'no-referrer'; probe.decoding = 'async';
    probe.onload = () => {
      // Once the context photo is showing, a late story photo would only cause a visible swap.
      if (figure.dataset.photoSettled === 'context') return;
      if (!figure.isConnected && !figure.parentNode) return settle(false);
      if (probe.naturalWidth < 200 || probe.naturalHeight < 110) return settle(false);
      image.src = p.image; image.alt = p.alt || String(item.title || 'Story photo').slice(0, 300);
      image.width = probe.naturalWidth; image.height = probe.naturalHeight;
      figure.classList.add('newsroom-story-photo'); figure.dataset.storyImage = 'publisher';
      const label = doc.createElement('strong'); label.textContent = 'Story photo · ';
      const site = doc.createElement('a'); site.href = p.url; site.textContent = p.site || new URL(p.url).hostname.replace(/^www\./, ''); site.target = '_blank'; site.rel = 'noopener noreferrer';
      caption.replaceChildren(label, site, doc.createTextNode(settings.captionTitle === false ? '' : ' — ' + String(item.title || '').slice(0, 160)));
      settle(true);
      image.addEventListener('error', () => { image.src = original.src; image.alt = original.alt; image.width = original.width; image.height = original.height; caption.replaceChildren(...original.caption); figure.classList.remove('newsroom-story-photo'); delete figure.dataset.storyImage; }, {once: true});
    };
    probe.onerror = () => settle(false);
    probe.src = p.image;
  }
  function monogram(source) {
    const words = String(source || '').replace(/^(the|www\.)\s*/i,'').split(/[\s.\-–—:|]+/).filter(w => /[a-z0-9]/i.test(w));
    if (!words.length) return 'FN';
    return (words.length === 1 ? words[0].slice(0,3) : words.slice(0,3).map(w => w[0]).join('')).toUpperCase();
  }
  function thumbStyle(doc) {
    if (doc.getElementById('fynx-thumb-style')) return;
    const st = doc.createElement('style'); st.id = 'fynx-thumb-style';
    st.textContent = '.fx-thumb{float:right;flex:0 0 auto;width:112px;height:74px;margin:2px 0 8px 16px;border-radius:8px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(135deg,rgba(31,90,63,.14),rgba(31,90,63,.04));border:1px solid rgba(127,127,127,.18);font:800 12px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.08em;color:#1f5a3f}'
      + '.fx-thumb img{width:100%;height:100%;object-fit:cover;display:block;animation:fx-thumb-in .35s ease}'
      + '.fx-thumb.fx-thumb-photo{background:#0d1210;border-color:transparent}'
      + '.fx-thumb-wait{color:transparent!important;background:linear-gradient(100deg,rgba(127,127,127,.10) 30%,rgba(127,127,127,.22) 50%,rgba(127,127,127,.10) 70%);background-size:300% 100%;animation:fynx-photo-wait 1.4s ease-in-out infinite}'
      + '.nr-latest-story.has-thumb{grid-template-columns:42px minmax(0,1fr) auto}.nr-latest-story .fx-thumb{float:none;width:76px;height:52px;margin:0}'
      + '#homeSecondaryStories .fx-thumb{width:84px;height:58px}'
      + 'html[data-theme=dark] .fx-thumb,body.dark-mode .fx-thumb,.terminal-shell .fx-thumb{color:#7fd3a6}'
      + '@keyframes fynx-photo-wait{0%{background-position:100% 0}100%{background-position:0 0}}@keyframes fx-thumb-in{from{opacity:0}to{opacity:1}}'
      + '@media (max-width:600px){.fx-thumb{width:84px;height:58px;margin-left:12px}.nr-latest-story .fx-thumb{width:64px;height:46px}}'
      + '@media (prefers-reduced-motion:reduce){.fx-thumb-wait,.fx-thumb img{animation:none}}';
    doc.head.append(st);
  }
  // Small story picture for list rows: shimmer while the publisher's own preview image is
  // looked up, then the photo, or a source monogram when the publisher has none. Never swaps twice.
  function thumb(item) {
    const doc = root.document, url = safe(item && (item.url || item.link)); if (!doc) return null;
    thumbStyle(doc);
    const box = doc.createElement('span'); box.className = 'fx-thumb fx-thumb-wait'; box.setAttribute('aria-hidden','true');
    box.textContent = monogram(item && item.source);
    let done = false; const settle = img => { if (done) return; done = true; box.classList.remove('fx-thumb-wait'); if (img) { box.classList.add('fx-thumb-photo'); box.replaceChildren(img); } };
    if (!url || typeof root.fetch !== 'function') { settle(null); return box; }
    setTimeout(() => settle(null), 7000);
    lookup(url).then(p => {
      const src = p && safe(p.image); if (!src || done) return settle(null);
      const img = doc.createElement('img'); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.onload = () => settle(img.naturalWidth >= 80 ? img : null); img.onerror = () => settle(null); img.src = src;
    }, () => settle(null));
    return box;
  }
  const api = Object.freeze({ sections, get, createFigure, lookupStoryImage: lookup, thumb });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FYNXNewsroomMedia = api;
})(typeof window === 'undefined' ? globalThis : window);
