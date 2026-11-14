/* FYNX home · Market movers. Reads the published terminal-data/movers.json (built every
   15 minutes by scripts/refresh-scanner.cjs from Nasdaq's public screener and CoinGecko).
   Nothing here is estimated: rows show only what the snapshot carries, with its as-of time. */
(function () {
  'use strict';
  const URL_ = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/terminal-data/movers.json';
  const TABS = [
    ['gainers', 'Gainers', 'Large caps ($10B+) with the biggest gain on the session'],
    ['losers', 'Losers', 'Large caps ($10B+) with the biggest decline on the session'],
    ['active', 'Most traded', 'US stocks with the highest dollar volume'],
    ['crypto', 'Crypto', 'Top-100 coins by market cap, ranked by 24h move (stablecoins excluded)'],
    ['aiUnder3', 'AI under $3', 'AI-theme stocks priced at $3 or less with 500k+ shares traded']
  ];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => typeof v === 'number' && isFinite(v);
  function price(v) { if (!num(v)) return '—'; if (v > 0 && v < 0.01) return v.toPrecision(3); const d = v >= 1000 ? 0 : v >= 1 ? 2 : 4; return v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}); }
  function big(v) { if (!num(v)) return ''; const a = Math.abs(v); return a >= 1e12 ? (v/1e12).toFixed(2)+'T' : a >= 1e9 ? (v/1e9).toFixed(1)+'B' : a >= 1e6 ? (v/1e6).toFixed(1)+'M' : a >= 1e3 ? (v/1e3).toFixed(0)+'K' : String(Math.round(v)); }
  function ago(iso) { const t = Date.parse(iso); if (!Number.isFinite(t) || t <= 0 || t > Date.now() + 300000) return ''; const m = Math.round((Date.now()-t)/60000); return m < 1 ? 'just now' : m < 60 ? m+' min ago' : m < 1440 ? Math.round(m/60)+' h ago' : new Date(t).toLocaleDateString([], {month:'short', day:'numeric'}); }
  // Snapshot creation time is not an exchange trade timestamp. Never label old or
  // unverified snapshots as current, even when the JSON request itself succeeds.
  function freshness(iso) {
    const time = Date.parse(iso);
    if (!Number.isFinite(time) || time <= 0 || time > Date.now() + 300000)
      return {label:'Snapshot time unverified', stale:true};
    return Date.now() - time > 45 * 60000
      ? {label:'Older snapshot', stale:true}
      : {label:'Recent snapshot', stale:false};
  }
  function style() {
    if (document.getElementById('fx-movers-style')) return;
    const st = document.createElement('style'); st.id = 'fx-movers-style';
    st.textContent = '.fx-movers{margin-top:18px;padding-top:16px;border-top:1px solid var(--terminal-line,rgba(127,127,127,.25))}'
      + '.fx-movers-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.fx-movers-head h2{margin:0;font-size:15px;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}'
      + '.fx-movers-head a{font-size:12px;text-decoration:none;color:inherit;opacity:.8}.fx-movers-head a:hover{opacity:1;text-decoration:underline}@media (pointer:coarse){.fx-movers-head a{display:inline-flex;align-items:center;min-height:44px;padding:0 2px}}'
      + '.fx-live{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.65}'
      + '.fx-movers-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-bottom:8px}.fx-movers-tabs::-webkit-scrollbar{display:none}'
      + '.fx-movers-tabs button{flex:0 0 auto;font-family:inherit;font-weight:700;font-size:11px;line-height:1;letter-spacing:.02em;padding:7px 11px;border-radius:999px;border:1px solid var(--terminal-line,rgba(127,127,127,.3));background:transparent;color:inherit;cursor:pointer}'
      + '.fx-movers-tabs button[aria-selected=true]{background:#1f5a3f;border-color:#1f5a3f;color:#fff}'
      + '.fx-movers-desc{font-size:11px;opacity:.7;margin:0 0 6px}'
      + '.fx-mv{display:grid;grid-template-columns:30px minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--terminal-line,rgba(127,127,127,.18));text-decoration:none;color:inherit;border-radius:6px;transition:background .15s}'
      + '.fx-mv:hover{background:rgba(127,127,127,.08)}.fx-mv:last-child{border-bottom:0}'
      + '.fx-mv-logo{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font:800 10px/1 "IBM Plex Mono",ui-monospace,monospace;background:rgba(31,90,63,.12);color:#1f5a3f}'
      + '.fx-mv-up .fx-mv-logo{background:rgba(18,122,72,.12);color:#127a48}.fx-mv-down .fx-mv-logo{background:rgba(196,40,40,.11);color:#c42828}'
      + '.fx-mv-id{min-width:0}.fx-mv-id b{display:block;font:800 13px/1.2 "IBM Plex Mono",ui-monospace,monospace}.fx-mv-id span{display:block;font-size:11px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.fx-mv-px{font:600 12px "IBM Plex Mono",ui-monospace,monospace;text-align:right}.fx-mv-px small{display:block;font-size:10px;opacity:.6;font-weight:500}'
      + '.fx-mv-ch{min-width:66px;text-align:center;font:800 12px "IBM Plex Mono",ui-monospace,monospace;padding:5px 7px;border-radius:6px}'
      + '.fx-mv-up .fx-mv-ch{background:rgba(18,122,72,.12);color:#127a48}.fx-mv-down .fx-mv-ch{background:rgba(196,40,40,.11);color:#c42828}'
      + '.fx-movers-foot{font-size:10px;opacity:.65;margin:8px 0 0}'
      + '.fx-mv-skel{height:44px;border-radius:6px;margin:4px 0;background:linear-gradient(100deg,rgba(127,127,127,.10) 30%,rgba(127,127,127,.2) 50%,rgba(127,127,127,.10) 70%);background-size:300% 100%;animation:fynx-photo-wait 1.4s ease-in-out infinite}'
      + '@keyframes fynx-photo-wait{0%{background-position:100% 0}100%{background-position:0 0}}'
      + '.fx-live.is-stale{opacity:.3}'
      + '.fx-movers-error{font-size:12px;line-height:1.6;opacity:.85;padding:12px 4px}.fx-movers-retry{border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;padding:7px 12px;margin-left:8px;min-height:36px;cursor:pointer;font:inherit}'
      + '.fx-movers-retry:disabled{opacity:.5;cursor:wait}'
      + '@media (prefers-reduced-motion:reduce){.fx-live,.fx-mv-skel{animation:none}}';
    document.head.append(st);
  }
  let data = null, tab = 'gainers', loadFailed = false, loading = false;
  function row(r, kind) {
    const ch = r.changePct, cls = num(ch) ? (ch > 0 ? 'fx-mv-up' : ch < 0 ? 'fx-mv-down' : '') : '';
    const sym = String(r.symbol || ''), open = kind === 'crypto' ? (r.open || sym + '-USD') : sym;
    const extra = kind === 'active' ? (num(r.volume) && num(r.price) ? '$' + big(r.volume * r.price) + ' traded' : '') : kind === 'crypto' ? (num(r.marketCap) ? 'Cap $' + big(r.marketCap) : '') : kind === 'aiUnder3' ? (num(r.volume) ? big(r.volume) + ' sh' : '') : (num(r.marketCap) ? 'Cap $' + big(r.marketCap) : '');
    return '<a class="fx-mv ' + cls + '" href="/terminal.html?sym=' + encodeURIComponent(open) + '" title="Open ' + esc(sym) + ' in FYNX Terminal">'
      + '<span class="fx-mv-logo" aria-hidden="true">' + esc(sym.replace(/-USD$/,'').replace(/[^A-Za-z0-9]/g,'').slice(0, 4)) + '</span>'
      + '<span class="fx-mv-id"><b>' + esc(sym.replace(/-USD$/,'')) + '</b><span>' + esc(r.name || '') + '</span></span>'
      + '<span class="fx-mv-px">' + (kind === 'crypto' ? '$' : '') + price(r.price) + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</span>'
      + '<span class="fx-mv-ch">' + (num(ch) ? (ch > 0 ? '+' : '') + ch.toFixed(2) + '%' : '—') + '</span></a>';
  }
  function render(host) {
    const meta = TABS.find(t => t[0] === tab), list = (data && Array.isArray(data[tab]) ? data[tab] : []).slice(0, 6);
    host.querySelectorAll('.fx-movers-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const body = host.querySelector('.fx-movers-body');
    const asOf = data ? (tab === 'crypto' ? data.cryptoAsOf : data.stocksAsOf) : null;
    const quality = freshness(asOf);
    const indicator = host.querySelector('.fx-live');
    indicator?.classList.toggle('is-stale', loadFailed || quality.stale);
    indicator?.setAttribute('title', !data ? 'Snapshot unavailable' : loadFailed ? 'Update unavailable; previous snapshot' : quality.label);
    if (!data) {
      body.innerHTML = loadFailed
        ? '<p class="fx-movers-error" role="status">Market movers are temporarily unavailable. No market prices are estimated. <button type="button" class="fx-movers-retry" data-movers-retry>Retry</button></p>'
        : '<div class="fx-mv-skel"></div>'.repeat(5);
      return;
    }
    const src = tab === 'crypto' ? 'CoinGecko' : 'Nasdaq screener';
    body.innerHTML = '<p class="fx-movers-desc">' + esc(meta[2]) + '</p>'
      + (list.length ? list.map(r => row(r, tab)).join('') : '<p class="fx-movers-desc">Nothing qualifies in the latest snapshot. Open the scanner for the full list.</p>')
      + '<p class="fx-movers-foot"><span class="fx-movers-quality" role="status">' + esc(quality.label) + '</span> · Source: ' + src + (ago(asOf) ? ' · as of ' + esc(ago(asOf)) : '') + ' · Stock data may be delayed. Not a recommendation.'
      + (loadFailed ? ' <span role="status">Update failed. Showing the previous snapshot.</span> <button type="button" class="fx-movers-retry" data-movers-retry>Retry</button>' : '') + '</p>';
  }
  async function load(host) {
    if (loading) return;
    loading = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(URL_ + '?t=' + Math.floor(Date.now() / 300000), {cache: 'no-store', signal: controller.signal});
      if (!res.ok) throw new Error(res.status);
      const j = await res.json(); if (!j || !Array.isArray(j.gainers)) throw new Error('shape');
      data = j;
      loadFailed = false;
      host.hidden = false;
      render(host);
    } catch (_) {
      // Keep already sourced rows visible, and always provide recovery from a first-load failure.
      loadFailed = true;
      render(host);
    } finally {
      clearTimeout(timeout);
      loading = false;
    }
  }
  function init() {
    const anchor = document.getElementById('homeSecondaryStories'); if (!anchor || document.querySelector('.fx-movers')) return;
    style();
    const host = document.createElement('section'); host.className = 'fx-movers'; host.setAttribute('aria-labelledby', 'fx-movers-title');
    host.innerHTML = '<div class="fx-movers-head"><h2 id="fx-movers-title"><span class="fx-live" aria-hidden="true"></span>Market movers</h2><a href="/terminal.html#scan">Full scanner →</a></div>'
      + '<div class="fx-movers-tabs" role="tablist">' + TABS.map(t => '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="false">' + t[1] + '</button>').join('') + '</div>'
      + '<div class="fx-movers-body" role="tabpanel"></div>';
    anchor.after(host);
    host.querySelector('.fx-movers-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; tab = b.dataset.tab; render(host); });
    host.addEventListener('click', e => {
      const retry = e.target.closest('[data-movers-retry]');
      if (!retry || loading) return;
      retry.disabled = true;
      retry.textContent = 'Retrying…';
      load(host);
    });
    render(host); load(host);
    setInterval(() => { if (!document.hidden) load(host); }, 5 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
