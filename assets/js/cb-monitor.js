/* FYNX central bank monitor (newsroom "Policy moves" section).
 * Live cards for the major central banks: current policy rate, last move and when, 12-month change,
 * a policy-rate sparkline since 2022, and for the Fed the next FOMC date with futures-implied odds.
 * Sources: BIS policy rates (terminal-data/policy.json), CBOT fed funds futures and the New York Fed
 * (macro-data/desk.json). Region buttons in the section filter the cards. */
(function () {
  'use strict';
  const host = document.querySelector('[data-cb-monitor]');
  if (!host) return;
  const POLICY = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/terminal-data/policy.json';
  const DESK = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/macro-data/desk.json';
  const BANKS = [
    ['US', 'Federal Reserve', 'FED', 'us', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', '/macro/'],
    ['XM', 'European Central Bank', 'ECB', 'europe', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', '/macro/'],
    ['GB', 'Bank of England', 'BOE', 'europe', 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates', '/macro/'],
    ['JP', 'Bank of Japan', 'BOJ', 'japan', 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm', '/macro/'],
    ['CA', 'Bank of Canada', 'BOC', 'americas', 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/', '/macro/'],
    ['AU', 'Reserve Bank of Australia', 'RBA', 'asia', 'https://www.rba.gov.au/schedules-events/board-meeting-schedules.html', '/macro/'],
    ['CH', 'Swiss National Bank', 'SNB', 'europe', 'https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/decisions', '/macro/'],
    ['NZ', 'Reserve Bank of New Zealand', 'RBNZ', 'asia', 'https://www.rbnz.govt.nz/monetary-policy/official-cash-rate-decisions', '/macro/']
  ];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const month = ym => new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'});
  const day = iso => new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});
  const getJSON = url => fetch(url, {cache: 'no-cache', credentials: 'omit'}).then(r => r.ok ? r.json() : null).catch(() => null);
  let region = 'all', cards = [];

  function lastMove(h) { const v = h.at(-1)[1]; for (let i = h.length - 2; i >= 0; i--) if (h[i][1] !== v) return {bp: Math.round((v - h[i][1]) * 100), at: h[i + 1][0]}; return null; }
  function spark(h) {
    const pts = h.filter(p => p[0] >= '2022-01'); if (pts.length < 2) return '';
    const W = 160, H = 40, vs = pts.map(p => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), x = i => i / (pts.length - 1) * W, y = v => H - 3 - (v - lo) / ((hi - lo) || 1) * (H - 6);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    return `<svg class="cb-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${W},${H}L0,${H}Z" class="cb-area"/><path d="${d}" class="cb-line"/></svg>`;
  }
  function render() {
    const shown = cards.filter(c => region === 'all' || c.region === region || (region === 'us' && c.region === 'americas'));
    host.querySelector('.cb-grid').innerHTML = shown.map(c => c.html).join('') || '<p class="cb-note">No central bank in this region.</p>';
  }
  async function start() {
    host.innerHTML = '<div class="cb-head"><span class="cb-live" aria-hidden="true"></span><b>Central bank monitor</b><span class="cb-sub">Policy rates, last moves and what markets price next</span></div><div class="cb-grid" aria-live="polite"><div class="cb-skel"></div><div class="cb-skel"></div><div class="cb-skel"></div><div class="cb-skel"></div></div><p class="cb-note" data-cb-source></p>';
    const [policy, desk] = await Promise.all([getJSON(POLICY), getJSON(DESK)]);
    if (!policy?.areas) { host.querySelector('.cb-grid').innerHTML = '<p class="cb-note">Policy-rate data is refreshing — the institutions are listed alongside.</p>'; return; }
    const fed = desk?.fed, odds = fed?.odds;
    cards = BANKS.filter(([a]) => policy.areas[a]).map(([a, name, code, reg, url]) => {
      const h = policy.areas[a].history, v = h.at(-1)[1], mv = lastMove(h), yr = h.at(-13)?.[1];
      const ch12 = Number.isFinite(yr) ? Math.round((v - yr) * 100) : null;
      const trend = mv ? (mv.bp > 0 ? 'up' : 'down') : 'flat';
      let next = '';
      if (a === 'US' && odds?.meeting) {
        const lead = [['hike', odds.hike], ['hold', odds.hold], ['cut', odds.cut]].sort((x, y) => (y[1] || 0) - (x[1] || 0))[0];
        next = `<p class="cb-next"><span>Next FOMC ${esc(day(odds.meeting))}</span><b>${esc(lead[0])} ${Number(lead[1]).toFixed(0)}%</b><small>fed funds futures</small></p>`;
      }
      const effr = a === 'US' && fed?.effr ? ` · target ${fed.effr.targetFrom}–${fed.effr.targetTo}%` : '';
      return {region: reg, html: `<a class="cb-card cb-${trend}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(name)}: policy rate ${v.toFixed(2)} percent">
        <span class="cb-code">${esc(code)}</span><span class="cb-name">${esc(name)}</span>
        <span class="cb-rate">${v.toFixed(2)}<small>%</small></span>
        <span class="cb-move">${mv ? `${mv.bp > 0 ? '▲' : '▼'} ${mv.bp > 0 ? '+' : ''}${mv.bp} bp · ${esc(month(mv.at))}` : 'Unchanged since 2015'}${effr}</span>
        ${spark(h)}
        <span class="cb-meta">12 months: ${ch12 == null ? '—' : (ch12 > 0 ? '+' : '') + ch12 + ' bp'} · as of ${esc(month(h.at(-1)[0]))}</span>${next}</a>`};
    });
    host.querySelector('[data-cb-source]').textContent = `Policy rates: ${policy.source}. Fed odds: ${fed?.source || 'CBOT fed funds futures'}. Cards open each bank's official meeting calendar.`;
    render();
  }
  document.addEventListener('click', e => { const b = e.target.closest?.('[data-region]'); if (b && cards.length) { region = b.dataset.region; render(); } });
  start();
})();
