/* FYNX core-satellite drift and overlap check (site-qa run 127).
 * For up to three hypothetical funds the reader enters a target weight, the
 * current value and (optionally) how much of that fund sits in one company the
 * funds share. With total T = sum of values:
 *   weight now  w_i = v_i / T
 *   drift       d_i = w_i - t_i                      (percentage points)
 *   rebalance   r_i = t_i * T - v_i                  (buy > 0, sell < 0; sums to 0)
 *   cash only   C   = max(0, max_i(v_i / t_i) - T)   new money so nothing is sold
 *               buy_i = t_i * (T + C) - v_i           (>= 0 for every fund)
 *   look-through share of the shared company = sum_i w_i * s_i
 * Funds with a 0% target are sold in full by a rebalance and make the
 * cash-only route impossible. Everything comes from the reader's inputs; no
 * prices, fund data or recommendations.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxCoreSatellite = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_ROWS = 3;
  const cents = (v) => Math.round(v * 100) / 100;
  const clean = (v) => Math.round(v * 1e8) / 1e8;

  function validate(funds, band) {
    if (!Array.isArray(funds) || funds.length === 0) return 'Enter a target and current value for at least one fund.';
    if (funds.length > MAX_ROWS) return `Enter up to ${MAX_ROWS} funds.`;
    for (let i = 0; i < funds.length; i++) {
      const f = funds[i], n = i + 1;
      if (!Number.isFinite(f.target) || f.target < 0 || f.target > 100) return `Fund ${n}: enter a target weight from 0 to 100%.`;
      if (!Number.isFinite(f.value) || f.value < 0 || f.value > 1e12) return `Fund ${n}: enter the current value as $0 or more.`;
      if (f.shared != null && (!Number.isFinite(f.shared) || f.shared < 0 || f.shared > 100)) return `Fund ${n}: enter the shared company's weight from 0 to 100%, or leave it blank.`;
    }
    const sum = funds.reduce((a, f) => a + f.target, 0);
    if (Math.abs(sum - 100) > 0.01) return `Target weights add up to ${(+sum.toFixed(2))}%. Make them add up to 100%.`;
    if (!(funds.reduce((a, f) => a + f.value, 0) > 0)) return 'Enter a current value above $0 for at least one fund.';
    if (!Number.isFinite(band) || band < 0.1 || band > 50) return 'Enter a rebalance band from 0.1 to 50 percentage points.';
    return '';
  }

  function analyse(funds, band) {
    const error = validate(funds, band);
    if (error) return { error };
    const total = clean(funds.reduce((a, f) => a + f.value, 0));
    const rows = funds.map((f, i) => {
      const now = (f.value / total) * 100;
      const drift = clean(now - f.target);
      const trade = cents((f.target / 100) * total - f.value);
      return { index: i, name: f.name, target: f.target, value: f.value, now: clean(now), drift, trade, outside: Math.abs(drift) > band + 1e-9 };
    });
    let worst = rows[0];
    for (const r of rows) if (Math.abs(r.drift) > Math.abs(worst.drift) + 1e-9) worst = r;

    // Cash-only route: the smallest new deposit that lets every fund reach its target without a sale.
    let cash = null;
    const zeroHeld = rows.filter((r) => r.target === 0 && r.value > 0);
    if (!zeroHeld.length) {
      let needTotal = total;
      for (const r of rows) if (r.target > 0) needTotal = Math.max(needTotal, r.value / (r.target / 100));
      const deposit = cents(Math.max(0, needTotal - total));
      const buys = rows.map((r) => cents(Math.max(0, (r.target / 100) * (total + deposit) - r.value)));
      cash = { deposit, buys, newTotal: cents(total + deposit) };
    }

    // Look-through weight of the one company the funds share.
    const withShared = funds.filter((f) => f.shared != null);
    let overlap = null;
    if (withShared.length) {
      const pctNow = clean(funds.reduce((a, f) => a + (f.shared == null ? 0 : (f.value / total) * f.shared), 0));
      const pctTarget = clean(funds.reduce((a, f) => a + (f.shared == null ? 0 : (f.target / 100) * f.shared), 0));
      const contributions = funds.map((f) => (f.shared == null ? 0 : cents((f.value * f.shared) / 100)));
      const largest = Math.max(...funds.map((f) => (f.shared == null ? 0 : f.shared)));
      overlap = { pctNow, pctTarget, dollars: cents((total * pctNow) / 100), contributions, largest, counted: withShared.length };
    }
    return { total, band, rows, worst, anyOutside: rows.some((r) => r.outside), cash, overlap, zeroHeld: zeroHeld.map((r) => r.index) };
  }

  function parseNumber(text) {
    const cleaned = String(text == null ? '' : text).replace(/[,$%\s]/g, '');
    if (cleaned === '' || !/^\d*\.?\d+$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }
  function parseOptional(text) {
    return String(text == null ? '' : text).trim() === '' ? null : parseNumber(text);
  }

  function money(v) {
    const a = Math.abs(v);
    const whole = a >= 100000;
    return (v < -0.004 ? '−$' : '$') + a.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  }
  const pct = (v) => (+v.toFixed(1)).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
  function pts(v) {
    const r = +v.toFixed(1);
    if (r === 0) return '0.0 pts';
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1) + ' pts';
  }
  function tradeText(v) {
    if (Math.abs(v) < 0.005) return 'Hold';
    return (v > 0 ? 'Buy ' : 'Sell ') + money(Math.abs(v));
  }
  const safeName = (text, n) => {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 32);
    return t || `Fund ${n}`;
  };

  function mount(doc) {
    const box = doc.getElementById('csBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('csStatus'), out = f('csResult'), body = f('csBody'), note = f('csNote');
    function read() {
      const list = [];
      for (let i = 1; i <= MAX_ROWS; i++) {
        const t = f('csTarget' + i).value, v = f('csValue' + i).value, s = f('csShared' + i).value;
        if (String(t).trim() === '' && String(v).trim() === '' && String(s).trim() === '') continue;
        list.push({ name: safeName(f('csName' + i).value, i), target: parseNumber(t), value: parseNumber(v), shared: parseOptional(s), row: i });
      }
      return list;
    }
    function render() {
      const funds = read();
      const res = analyse(funds, parseNumber(f('csBand').value));
      body.textContent = '';
      if (res.error) {
        status.textContent = res.error.replace(/^Fund (\d+)/, (m, n) => 'Fund ' + (funds[n - 1] ? funds[n - 1].row : n));
        status.hidden = false;
        out.hidden = true;
        return;
      }
      status.hidden = true;
      out.hidden = false;
      const w = res.worst;
      f('csTotal').textContent = money(res.total);
      f('csTotalSub').textContent = `${funds.length} fund${funds.length === 1 ? '' : 's'}`;
      f('csDrift').textContent = pts(w.drift);
      f('csDriftSub').textContent = `${w.name} · ` + (w.outside ? `outside your ±${(+res.band.toFixed(1))} band` : `inside your ±${(+res.band.toFixed(1))} band`);
      if (res.overlap) {
        f('csOverlap').textContent = pct(res.overlap.pctNow);
        f('csOverlapSub').textContent = `${money(res.overlap.dollars)} of the portfolio`;
      } else {
        f('csOverlap').textContent = '—';
        f('csOverlapSub').textContent = 'Add a shared company weight';
      }
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.outside) tr.className = 'lesson-yours';
        const cells = [r.name, pct(r.target), pct(r.now), pts(r.drift) + (r.outside ? ' ⚠' : ''), tradeText(r.trade)];
        cells.forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      const parts = [];
      const band = `±${(+res.band.toFixed(1))}`;
      const outside = res.rows.filter((r) => r.outside);
      if (outside.length) {
        parts.push(`${outside.map((r) => r.name).join(' and ')} ${outside.length === 1 ? 'has' : 'have'} drifted outside your ${band} point band, so your rule says rebalance.`);
        const sells = res.rows.filter((r) => r.trade <= -0.005), buys = res.rows.filter((r) => r.trade >= 0.005);
        parts.push(`Back to target with trades: ${sells.map((r) => `sell ${money(-r.trade)} of ${r.name}`).concat(buys.map((r) => `buy ${money(r.trade)} of ${r.name}`)).join(', ')} (the total stays ${money(res.total)}).`);
      } else {
        const exact = res.rows.every((r) => Math.abs(r.trade) < 0.005);
        parts.push(exact ? 'The portfolio is exactly on target, so there is nothing to rebalance.' : `Every fund is within your ${band} point band, so your rule says no trade yet. The table still shows what an exact rebalance would take.`);
      }
      if (res.cash) {
        if (res.cash.deposit >= 0.005) {
          const list = res.rows.map((r, i) => ({ r, b: res.cash.buys[i] })).filter((x) => x.b >= 0.005).map((x) => `${money(x.b)} into ${x.r.name}`);
          parts.push(`Without selling anything (sales can trigger tax and fees): adding ${money(res.cash.deposit)} of new cash, as ${list.join(' and ')}, brings every fund back to target at ${money(res.cash.newTotal)}.`);
        }
      } else {
        parts.push(`${res.zeroHeld.map((i) => res.rows[i].name).join(' and ')} ${res.zeroHeld.length === 1 ? 'has' : 'have'} a 0% target, so getting there means selling it; new cash alone cannot.`);
      }
      if (res.overlap) {
        const o = res.overlap;
        let line = `Looking through the funds, the shared company is ${pct(o.pctNow)} of the whole portfolio now (${money(o.dollars)}) and would be ${pct(o.pctTarget)} at your targets.`;
        const core = res.rows.reduce((a, r) => (r.value > a.value ? r : a), res.rows[0]);
        const coreShared = funds[core.index].shared;
        if (o.counted > 1 && coreShared != null && o.pctNow > coreShared + 0.05) line += ` That is more than the ${pct(coreShared)} you would see by looking at ${core.name} alone: different fund names, one company, and that exposure moves together whichever fund it sits in.`;
        parts.push(line);
      }
      parts.push('Fund holdings change over time, so check each fund’s published holdings before you rely on an overlap figure.');
      note.textContent = parts.join(' ');
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-cs-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [bandText, ...rows] = btn.getAttribute('data-cs-preset').split(';');
        f('csBand').value = bandText;
        for (let i = 1; i <= MAX_ROWS; i++) {
          const [name = '', t = '', v = '', s = ''] = (rows[i - 1] || '').split(',');
          f('csName' + i).value = name; f('csTarget' + i).value = t; f('csValue' + i).value = v; f('csShared' + i).value = s;
        }
        render();
      });
    });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { MAX_ROWS, validate, analyse, parseNumber, parseOptional, money, pct, pts, tradeText, safeName };
});
