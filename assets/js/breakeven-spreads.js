/* [site-qa] run 115: Break-Even "Same trade, other spreads" table.
 * Pure maths in `spreadRows` (tested in scripts/test-breakeven-spreads.cjs); the browser part
 * only renders while the page's own result (#beMoves) is visible, so it never shows numbers
 * for inputs that were not calculated. Uses the same formulas as the inline calc():
 *   total cost = spread x pip value x lots + commission
 *   pips needed = total cost / (pip value x lots)
 *   break-even = entry +/- pips needed x pip size
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxBreakevenSpreads = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PRESETS = [0.2, 0.5, 1, 2, 3, 5, 10];

  function spreadRows(input) {
    const { type, entry, lot, pipSize, pipValue, commission, spread } = input;
    const nums = [entry, lot, pipSize, pipValue, commission, spread];
    if (!nums.every(Number.isFinite) || entry <= 0 || lot <= 0 || pipSize <= 0 || pipValue <= 0 || commission < 0 || spread < 0) return [];
    const dir = type === 'sell' ? -1 : 1;
    const perPip = pipValue * lot;
    const yours = Math.round(spread * 1e6) / 1e6;
    const list = PRESETS.filter((s) => Math.abs(s - yours) > 1e-9).map((s) => ({ spread: s, yours: false }));
    list.push({ spread: yours, yours: true });
    list.sort((a, b) => a.spread - b.spread);
    const own = (yours * perPip) + commission;
    return list.map((r) => {
      const cost = r.spread * perPip + commission;
      const pips = cost / perPip;
      const be = entry + dir * pips * pipSize;
      return { spread: r.spread, yours: r.yours, cost, pips, breakEven: be > 0 ? be : null, extra: cost - own };
    });
  }

  function money(v) {
    const sign = v < -0.004 ? '−' : v > 0.004 ? '+' : '';
    const d = Math.abs(v) >= 1000 ? 0 : 2;
    return sign + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function mount(doc) {
    const moves = doc.getElementById('beMoves');
    const box = doc.getElementById('beSpreads');
    const body = doc.getElementById('beSpreadsBody');
    if (!moves || !box || !body) return;
    const num = (id) => parseFloat(doc.getElementById(id).value);
    function render() {
      body.textContent = '';
      if (moves.hidden) { box.hidden = true; return; }
      const pipSize = doc.getElementById('pipSize').value === '0.01' ? 0.01 : 0.0001;
      const rows = spreadRows({
        type: doc.getElementById('type').value, entry: num('entry'), lot: num('lot'), pipSize,
        pipValue: num('pipValue'), commission: num('commission'), spread: num('spread')
      });
      if (!rows.length) { box.hidden = true; return; }
      const digits = pipSize === 0.01 ? 3 : 5;
      for (const r of rows) {
        const tr = doc.createElement('tr');
        if (r.yours) tr.className = 'be-row';
        const cells = [
          (+r.spread.toFixed(4)) + (r.yours ? ' (yours)' : ''),
          r.pips.toFixed(2),
          r.breakEven === null ? 'below 0' : r.breakEven.toFixed(digits),
          money(r.cost).replace(/^\+/, ''),
          r.yours ? '—' : money(r.extra)
        ];
        cells.forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      box.hidden = false;
    }
    new MutationObserver(render).observe(moves, { attributes: true, attributeFilter: ['hidden'], childList: true });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }
  return { spreadRows, PRESETS };
});
