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
      + '@media (max-width:640px){.lp-asof{display:none}.lp-tag{padding:0 10px}.lp-item{padding:8px 12px}}'
      + '@media (prefers-reduced-motion:reduce){.lp-track{animation:none}.lp-viewport{overflow-x:auto}.lp-dot{animation:none}}';
    document.head.append(st);
  }
  function ago(iso) { const t = Date.parse(iso); if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? Math.max(1, m) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString([], {month: 'short', day: 'numeric'}); }
  function render(strip, data) {
    const items = (data.items || []).filter(i => num(i.price));
    if (!items.length) { strip.remove(); return; }
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
    strip.querySelector('.lp-asof').textContent = 'Delayed · ' + ago(data.generatedAt);
    strip.hidden = false;
  }
  async function load(strip) {
    try {
      const res = await fetch(SRC + '?t=' + Math.floor(Date.now() / 300000), {cache: 'no-store'});
      if (!res.ok) throw new Error(res.status);
      render(strip, await res.json());
    } catch (_) { if (strip.hidden) strip.remove(); }
  }
  function init() {
    if (document.querySelector('.lp-strip')) return;
    const host = document.querySelector('[data-live-pulse]'), crumb = document.querySelector('.resource-wayfinding'), main = document.querySelector('main');
    if (!host && !crumb && !main) return;
    style();
    const strip = document.createElement('section'); strip.className = 'lp-strip'; strip.hidden = true; strip.setAttribute('aria-label', 'Live market pulse');
    strip.innerHTML = '<span class="lp-tag"><span class="lp-dot" aria-hidden="true"></span>Markets</span><div class="lp-viewport"><div class="lp-track"></div></div><span class="lp-asof"></span>';
    if (host) host.prepend(strip); else if (crumb) crumb.after(strip); else main.prepend(strip);
    load(strip);
    setInterval(() => { if (!document.hidden && strip.isConnected) load(strip); }, 5 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
