/* FYNX rate-gap carry estimate (site-qa run 116).
 * Turns the gap between two published policy rates into the theoretical
 * interest a held currency position would earn or pay, before broker markup.
 * Pure function `carry()` is exported for tests; the page widget listens for
 * `fynx:rate-difference` events from macro-data.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxRateCarry = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const LOT_UNITS = 100000;
  const PERIODS = [['1 day', 1], ['1 week (7 days)', 7], ['30 days', 30], ['1 year (365 days)', 365]];

  // Long base/quote: hold base (earns base rate), fund it in quote (pays quote rate).
  // Per day, measured in base currency: units x (baseRate - quoteRate) / 100 / 365.
  function carry({ lots, direction, baseRate, quoteRate }) {
    if (!Number.isFinite(lots) || lots < 0.01 || lots > 10000) return { error: 'Enter a position size between 0.01 and 10,000 lots.' };
    if (!Number.isFinite(baseRate) || !Number.isFinite(quoteRate)) return { error: 'Both published rates are needed.' };
    const units = lots * LOT_UNITS;
    const gap = baseRate - quoteRate;
    const sign = direction === 'short' ? -1 : 1;
    const perDay = sign * units * gap / 100 / 365;
    return {
      units,
      gap,
      perDay,
      periods: PERIODS.map(([label, days]) => ({ label, days, amount: perDay * days })),
      earns: perDay > 0,
      zero: perDay === 0,
    };
  }

  function parseLots(text) {
    const cleaned = String(text == null ? '' : text).replace(/,/g, '').replace(/lots?$/i, '').trim();
    if (!/^\d*\.?\d+$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  function money(value, ccy) {
    const abs = Math.abs(value);
    const digits = abs >= 1000 ? 0 : 2;
    return (value < 0 ? '−' : value > 0 ? '+' : '') + abs.toLocaleString('en', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' ' + ccy;
  }

  function mount(doc) {
    const box = doc.getElementById('rateCarry');
    if (!box) return;
    const lotsInput = doc.getElementById('carryLots');
    const dirInput = doc.getElementById('carryDirection');
    const out = doc.getElementById('carryResult');
    const status = doc.getElementById('carryStatus');
    let last = null;

    function draw() {
      out.replaceChildren();
      if (!last || !Number.isFinite(last.baseRate) || !Number.isFinite(last.quoteRate)) {
        status.textContent = 'Needs a published rate for both currencies. Nothing is estimated when a rate is missing.';
        return;
      }
      if (last.base === last.quote) {
        status.textContent = 'Pick two different currencies to see a carry estimate.';
        return;
      }
      const r = carry({ lots: parseLots(lotsInput.value), direction: dirInput.value, baseRate: last.baseRate, quoteRate: last.quoteRate });
      if (r.error) { status.textContent = r.error; return; }
      const pair = last.base + '/' + last.quote;
      const side = dirInput.value === 'short' ? 'Short' : 'Long';
      status.textContent = r.zero
        ? 'The two published rates are equal, so this gap adds no carry either way.'
        : side + ' ' + pair + ' ' + (r.earns ? 'would earn' : 'would pay') + ' about ' + money(r.perDay, last.base).replace(/^[+−]/, '') + ' a day on ' + r.units.toLocaleString('en') + ' ' + last.base + ' (policy-rate gap ' + (r.gap >= 0 ? '+' : '−') + Math.abs(r.gap).toFixed(3) + ' points), before your broker’s markup.';
      const table = doc.createElement('table');
      table.className = 'carry-table';
      const cap = doc.createElement('caption');
      cap.textContent = side + ' ' + pair + ', ' + r.units.toLocaleString('en') + ' ' + last.base + ', in ' + last.base;
      const head = doc.createElement('thead');
      head.innerHTML = '<tr><th scope="col">Held for</th><th scope="col">Theoretical carry</th></tr>';
      const body = doc.createElement('tbody');
      r.periods.forEach(p => {
        const tr = doc.createElement('tr');
        const th = doc.createElement('th'); th.scope = 'row'; th.textContent = p.label;
        const td = doc.createElement('td'); td.textContent = money(p.amount, last.base);
        tr.append(th, td); body.append(tr);
      });
      table.append(cap, head, body);
      out.append(table);
    }

    doc.addEventListener('fynx:rate-difference', e => { last = e.detail; draw(); });
    lotsInput.addEventListener('input', draw);
    dirInput.addEventListener('change', draw);
    draw();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }
  return { carry, parseLots, money, LOT_UNITS };
});
