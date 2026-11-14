/* FYNX live pulse: a slim market strip (index, rates, FX, commodities, crypto) with 30-day
   sparklines, placed at the top of a page's <main>. Reads terminal-data/pulse.json, published
   every 15 minutes from the same delayed Yahoo Finance chart data the Terminal uses.
   If the snapshot cannot be read the strip is simply not shown: no placeholder numbers. */
(function () {
  'use strict';
  const SRC = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/terminal-data/pulse.json';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => typeof v === 'number' && isFinite(v);
  function fmt(sym, v) {
    if (!num(v)) return '—';
    const d = /=X$/.test(sym) ? (v < 20 ? 4 : 2) : sym === '^TNX' || sym === '^VIX' ? 2 : v >= 1000 ? 0 : 2;
    return v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}) + (sym === '^TNX' ? '%' : '');
  }
  function spark(values, up) {
    if (!values || values.length < 2) return '';
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1, n = values.length - 1;
    const pts = values.map((v, i) => (i / n * 60).toFixed(1) + ',' + (18 - (v - min) / span * 16).toFixed(1)).join(' ');
    return '<svg class="lp-spark" viewBox="0 0 60 20" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" class="' + (up ? 'lp-up' : 'lp-down') + '"/></svg>';
  }
  function style() {
    if (document.getElementById('lp-style')) return;
    const st = document.createElement('style'); st.id = 'lp-style';
    st.textContent = '.lp-strip{position:relative;display:flex;align-items:stretch;gap:0;margin:0 0 18px;border:1px solid rgba(127,127,127,.22);border-radius:12px;overflow:hidden;background:rgba(127,127,127,.04)}'
      + '.lp-tag{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:0 14px;font:800 10px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;border-right:1px solid rgba(127,127,127,.22);background:rgba(31,90,63,.08);color:#1f5a3f}'
      + '.lp-dot{width:7px;height:7px;border-radius:50%;background:#1f8a5a;animation:lp-pulse 2s infinite}@keyframes lp-pulse{0%{box-shadow:0 0 0 0 rgba(31,138,90,.5)}70%{box-shadow:0 0 0 7px rgba(31,138,90,0)}100%{box-shadow:0 0 0 0 rgba(31,138,90,0)}}'
      + '.lp-viewport{flex:1 1 auto;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent)}'
      + '.lp-track{display:flex;width:max-content;animation:lp-scroll var(--lp-dur,60s) linear infinite}.lp-strip:hover .lp-track,.lp-strip:focus-within .lp-track{animation-play-state:paused}'
      + '@keyframes lp-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}'
      + '.lp-item{display:flex;align-items:center;gap:9px;padding:9px 16px;border-right:1px solid rgba(127,127,127,.14);text-decoration:none;color:inherit;white-space:nowrap}.lp-item:hover{background:rgba(127,127,127,.08)}'
      + '.lp-name{font-size:11px;font-weight:700;opacity:.75}.lp-px{font:700 12px "IBM Plex Mono",ui-monospace,monospace}.lp-ch{font:800 11px "IBM Plex Mono",ui-monospace,monospace}'
      + '.lp-pos{color:#127a48}.lp-neg{color:#c42828}'
      + '.lp-spark{width:52px;height:18px}.lp-spark polyline{fill:none;stroke-width:1.5;vector-effect:non-scaling-stroke}.lp-spark .lp-up{stroke:#127a48}.lp-spark .lp-down{stroke:#c42828}'
      + '.lp-asof{flex:0 0 auto;display:flex;align-items:center;padding:0 12px;font-size:10px;opacity:.6;border-left:1px solid rgba(127,127,127,.22)}'
      + '.lp-tag-txt{display:grid;gap:3px}.lp-tag-sub{display:none;font:600 8px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.08em;opacity:.75}'
      + '.lp-feedback{display:flex;align-items:center;flex:1 1 200px;gap:10px;flex-wrap:wrap;padding:6px 12px;font:600 11px/1.4 "IBM Plex Mono",ui-monospace,monospace;min-width:0}'
      + '.lp-feedback-text{flex:1 1 150px}.lp-retry{min-height:44px;min-width:60px;padding:7px 12px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}.lp-retry:disabled{opacity:.5;cursor:wait}.lp-retry:focus-visible{outline:2px solid currentColor;outline-offset:2px}'
      + '.lp-strip.is-stale .lp-feedback{flex-basis:100%;border-top:1px solid rgba(127,127,127,.22)}.lp-feedback[hidden],.lp-viewport[hidden],.lp-asof[hidden]{display:none!important}'
      + '@media (max-width:640px){.lp-asof{display:none}.lp-tag-sub{display:block}.lp-tag{padding:0 10px}.lp-item{padding:8px 12px}}'
      + '@media (pointer:coarse){.lp-item{min-height:44px}}'
      + '@media (prefers-reduced-motion:reduce){.lp-track{animation:none}.lp-viewport{overflow-x:auto}.lp-dot{animation:none}}';
    document.head.append(st);
  }
  function ago(iso) { const t = Date.parse(iso); if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? Math.max(1, m) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString([], {month: 'short', day: 'numeric'}); }
  function render(strip, data) {
    const items = (Array.isArray(data?.items) ? data.items : []).filter(i => i && num(i.price));
    if (!items.length) throw new Error('No sourced market prices');
    const html = items.map(i => {
      const ch = i.changePercent, cls = num(ch) ? (ch >= 0 ? 'lp-pos' : 'lp-neg') : '';
      const s = i.spark || [], up = s.length > 1 ? s[s.length - 1] >= s[0] : (ch || 0) >= 0;
      return '<a class="lp-item" href="/terminal.html?sym=' + encodeURIComponent(i.symbol) + '" title="' + esc(i.label) + ' · 30-day trend · open in FYNX Terminal">'
        + '<span class="lp-name">' + esc(i.label) + '</span><span class="lp-px">' + fmt(i.symbol, i.price) + '</span>'
        + '<span class="lp-ch ' + cls + '">' + (num(ch) ? (ch > 0 ? '+' : '') + ch.toFixed(2) + '%' : '') + '</span>' + spark(s, up) + '</a>';
    }).join('');
    const track = strip.querySelector('.lp-track');
    track.innerHTML = html + html.replace(/<a /g, '<a tabindex="-1" aria-hidden="true" ');
    track.style.setProperty('--lp-dur', Math.max(40, items.length * 5) + 's');
    lastSourceAt = data.generatedAt;
    const stale = data.stale === true || items.some(i => i.stale === true);
    strip.classList.remove('is-error');
    strip.classList.toggle('is-stale', stale);
    strip.querySelector('.lp-tag-sub').textContent = stale ? 'Stale' : 'Delayed';
    strip.querySelector('.lp-asof').textContent = (stale ? 'Stale · ' : 'Delayed · ') + ago(data.generatedAt);
    strip.querySelector('.lp-viewport').hidden = false;
    strip.querySelector('.lp-asof').hidden = false;
    strip.querySelector('.lp-feedback').hidden = true;
    strip.hidden = false;
  }
  let pending = null, lastSourceAt = null;
  async function load(strip) {
    // An initial offline request must not permanently remove the pulse.
    if (pending || !strip.isConnected) return;
    const controller = new AbortController();
    pending = controller;
    const retry = strip.querySelector('.lp-retry');
    retry.disabled = true;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(SRC + '?t=' + Math.floor(Date.now() / 300000), {
        cache: 'no-store', signal: controller.signal
      });
      if (!res.ok) throw new Error('Market source unavailable');
      render(strip, await res.json());
    } catch (_) {
      const previous = !!strip.querySelector('.lp-item');
      strip.classList.toggle('is-error', !previous);
      strip.classList.add('is-stale');
      strip.querySelector('.lp-tag-sub').textContent = previous ? 'Stale' : 'Unavailable';
      strip.querySelector('.lp-viewport').hidden = !previous;
      strip.querySelector('.lp-asof').hidden = !previous;
      if (previous) strip.querySelector('.lp-asof').textContent = 'Stale · ' + ago(lastSourceAt);
      strip.querySelector('.lp-feedback-text').textContent = previous
        ? 'Update failed. Showing the last sourced snapshot.'
        : 'Market pulse unavailable. No prices are estimated.';
      strip.querySelector('.lp-feedback').hidden = false;
      strip.hidden = false;
    } finally {
      clearTimeout(timeout);
      pending = null;
      retry.disabled = false;
    }
  }
  function init() {
    if (document.querySelector('.lp-strip')) return;
    const host = document.querySelector('[data-live-pulse]'), crumb = document.querySelector('.resource-wayfinding'), main = document.querySelector('main');
    if (!host && !crumb && !main) return;
    style();
    const strip = document.createElement('section'); strip.className = 'lp-strip'; strip.hidden = true; strip.setAttribute('aria-label', 'Delayed market pulse');
    strip.innerHTML = '<span class="lp-tag"><span class="lp-dot" aria-hidden="true"></span><span class="lp-tag-txt">Markets<span class="lp-tag-sub">Delayed</span></span></span><div class="lp-viewport"><div class="lp-track"></div></div><span class="lp-asof"></span><div class="lp-feedback" role="status" hidden><span class="lp-feedback-text"></span><button class="lp-retry" type="button">Retry</button></div>';
    if (host) host.prepend(strip); else if (crumb) crumb.after(strip); else main.prepend(strip);
    strip.querySelector('.lp-retry').addEventListener('click', () => load(strip));
    load(strip);
    setInterval(() => { if (!document.hidden && strip.isConnected) load(strip); }, 5 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
