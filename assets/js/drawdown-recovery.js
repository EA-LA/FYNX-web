/* FYNX drawdown recovery table (site-qa run 118).
 * For a set of drawdown depths: the gain needed to get back to the peak,
 * how many losses in a row at a fixed risk % produce that drawdown, and how
 * many wins at that risk % and reward-to-risk climb back out. Fixed-fractional
 * risk on the current balance (each loss = -r%, each win = +r% x RR).
 * Pure functions are exported for tests; the widget is wired on
 * risk-management.html.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxDrawdownRecovery = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DEPTHS = [5, 10, 15, 20, 25, 30, 40, 50, 75];
  const EPS = 1e-9;

  // Gain (%) needed after a d% drawdown to return to the starting balance.
  function gainNeeded(d) {
    return (d / (100 - d)) * 100;
  }

  // Smallest k with (1 - r)^k <= 1 - d.
  function lossesToReach(d, r) {
    const k = Math.log(1 - d / 100) / Math.log(1 - r / 100);
    return Math.max(1, Math.ceil(k - EPS));
  }

  // Smallest k with (1 + r x RR)^k >= 1 / (1 - d).
  function winsToRecover(d, r, rr) {
    const k = Math.log(1 / (1 - d / 100)) / Math.log(1 + (r * rr) / 100);
    return Math.max(1, Math.ceil(k - EPS));
  }

  function validate({ riskPct, rr, drawdown, balance }) {
    if (!Number.isFinite(riskPct) || riskPct < 0.1 || riskPct > 20) return 'Enter a risk per trade between 0.1% and 20%.';
    if (!Number.isFinite(rr) || rr < 0.1 || rr > 20) return 'Enter a reward-to-risk between 0.1 and 20.';
    if (drawdown != null && (!Number.isFinite(drawdown) || drawdown < 0.1 || drawdown > 99)) return 'Enter a drawdown between 0.1% and 99%.';
    if (balance != null && (!Number.isFinite(balance) || balance <= 0 || balance > 1e12)) return 'Enter a starting balance above 0, or leave it empty.';
    return '';
  }

  function rows({ riskPct, rr, drawdown = null, balance = null }) {
    const error = validate({ riskPct, rr, drawdown, balance });
    if (error) return { error };
    const depths = DEPTHS.slice();
    const mine = drawdown == null ? null : Math.round(drawdown * 10) / 10;
    if (mine != null && !depths.includes(mine)) depths.push(mine);
    depths.sort((a, b) => a - b);
    return {
      rows: depths.map((d) => ({
        drawdown: d,
        yours: d === mine,
        gain: gainNeeded(d),
        losses: lossesToReach(d, riskPct),
        wins: winsToRecover(d, riskPct, rr),
        left: balance == null ? null : balance * (1 - d / 100),
        needed: balance == null ? null : balance * (d / 100),
      })),
    };
  }

  function parseNumber(text) {
    const cleaned = String(text == null ? '' : text).replace(/[,$%\s]/g, '');
    if (cleaned === '') return null;
    if (!/^\d*\.?\d+$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  function pct(v) {
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '') + '%';
  }

  function money(v) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : 2 });
  }

  function mount(doc) {
    const box = doc.getElementById('ddrBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('ddrStatus'), body = f('ddrBody'), note = f('ddrNote'), balHead = f('ddrBalHead');
    function render() {
      const riskPct = parseNumber(f('ddrRisk').value);
      const rr = parseNumber(f('ddrRR').value);
      const drawdown = parseNumber(f('ddrDepth').value);
      const balance = parseNumber(f('ddrBalance').value);
      const res = rows({ riskPct: riskPct == null ? NaN : riskPct, rr: rr == null ? NaN : rr, drawdown, balance });
      body.textContent = '';
      if (res.error) {
        status.textContent = res.error;
        status.hidden = false;
        note.textContent = '';
        return;
      }
      status.hidden = true;
      const showBal = balance != null;
      balHead.hidden = !showBal;
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.yours) tr.className = 'ddr-yours';
        const cells = [pct(r.drawdown), pct(r.gain), String(r.losses), String(r.wins)];
        if (showBal) cells.splice(1, 0, money(r.left));
        cells.forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          if (i === 0 && r.yours) {
            const tag = doc.createElement('span');
            tag.className = 'ddr-tag';
            tag.textContent = 'yours';
            td.appendChild(tag);
          }
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      const ref = res.rows.find((r) => r.yours) || res.rows.find((r) => r.drawdown === 20);
      note.textContent = `At ${riskPct}% risk, ${ref.losses} losses in a row take the account down about ${pct(ref.drawdown)}. Getting back needs a ${pct(ref.gain)} gain: about ${ref.wins} wins in a row at ${rr}R, or more trades with losses in between.` +
        (showBal ? ` On ${money(balance)} that is ${money(ref.needed)} lost and ${money(ref.left)} left.` : '');
    }
    box.addEventListener('input', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { DEPTHS, gainNeeded, lossesToReach, winsToRecover, rows, parseNumber, validate };
});
