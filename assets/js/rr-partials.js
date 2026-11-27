/* FYNX Risk/Reward "Take part off early?" table (site-qa run 119).
 * For one trade (entry, stop, target) it compares closing a share of the
 * position at an earlier first target (1R by default) with holding it all to
 * the final target. Results are in R (multiples of the planned risk), before
 * costs and assuming exact fills:
 *   target hit:                     f x first + (1 - f) x RR
 *   partial, then original stop:    f x first - (1 - f)
 *   partial, then stop at entry:    f x first
 * where f is the share closed early. Pure functions are exported for tests;
 * the table is wired on tools/risk-reward.html.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxRrPartials = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const SHARES = [0, 25, 50, 75];

  function outcomes(share, firstR, rr) {
    const f = share / 100;
    return {
      share,
      target: f * firstR + (1 - f) * rr,
      stopped: f * firstR - (1 - f),
      entryStop: f * firstR
    };
  }

  // Rows for 0/25/50/75% closed at the first target (plus the user's share
  // if it is different), sorted by share. Null when the first target is not
  // between entry and the final target.
  function rows({ entry, stop, target, firstR = 1, share }) {
    if (![entry, stop, target, firstR].every(Number.isFinite)) return null;
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    if (!(risk > 0) || !(reward > 0)) return null;
    const rr = reward / risk;
    if (!(firstR > 0) || firstR >= rr - 1e-9) return null;
    const dir = target > entry ? 1 : -1;
    const shares = SHARES.slice();
    if (Number.isFinite(share) && share > 0 && share < 100 && !shares.includes(share)) shares.push(share);
    shares.sort((a, b) => a - b);
    return {
      rr,
      firstPrice: entry + dir * risk * firstR,
      rows: shares.map((s) => Object.assign(outcomes(s, firstR, rr), { yours: s === share }))
    };
  }

  function formatR(x) {
    if (Math.abs(x) < 0.005) return '0.00R';
    return (x > 0 ? '+' : '−') + Math.abs(x).toFixed(2) + 'R';
  }

  return { SHARES, outcomes, rows, formatR };
});

(function () {
  if (typeof document === 'undefined' || !self.FynxRrPartials) return;
  const api = self.FynxRrPartials;
  function init() {
    const box = document.getElementById('rrPartials');
    if (!box) return;
    const first = document.getElementById('rrPartialFirst');
    const share = document.getElementById('rrPartialShare');
    const status = document.getElementById('rrPartialsStatus');
    const wrap = document.getElementById('rrPartialsWrap');
    const body = document.getElementById('rrPartialsBody');
    let last = null;

    function clear(message) {
      wrap.hidden = true;
      body.textContent = '';
      status.textContent = message;
    }

    function render() {
      if (!last) { clear('Calculate a trade above to fill this table.'); return; }
      const firstR = Number(first.value);
      const mine = Number(share.value);
      const out = api.rows({ entry: last.entry, stop: last.sl, target: last.tp, firstR, share: mine });
      if (!out) {
        clear(`Your take profit is ${(Math.abs(last.tp - last.entry) / Math.abs(last.entry - last.sl)).toFixed(2)}R, so a first target at ${firstR}R is not before it. Pick a smaller first target.`);
        return;
      }
      const price = out.firstPrice > 0 ? out.firstPrice.toFixed(last.decimals) : 'below 0';
      body.textContent = '';
      out.rows.forEach((row) => {
        const tr = document.createElement('tr');
        if (row.yours) tr.className = 'rr-partials-yours';
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = row.share === 0 ? 'None, hold all' : row.share + '%' + (row.yours ? ' (yours)' : '');
        tr.appendChild(th);
        [row.target, row.stopped, row.entryStop].forEach((v) => {
          const td = document.createElement('td');
          td.className = 'mono ' + (v > 0.004 ? 'rr-pos' : v < -0.004 ? 'rr-neg' : '');
          td.textContent = api.formatR(v);
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      const yours = out.rows.find((r) => r.yours);
      status.textContent = `First target ${firstR}R at ${price}. Closing ${yours.share}% there: ${api.formatR(yours.target)} if the rest hits your ${out.rr.toFixed(2)}R target, ${api.formatR(yours.stopped)} if price then returns to your stop, ${api.formatR(yours.entryStop)} if you move the stop to entry first.`;
      wrap.hidden = false;
    }

    document.addEventListener('fynx:rr-calculated', (e) => { last = e.detail; render(); });
    document.addEventListener('fynx:rr-reset', () => { last = null; render(); });
    first.addEventListener('change', render);
    share.addEventListener('change', render);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
