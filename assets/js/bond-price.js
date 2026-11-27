/* FYNX bond price and yield example (site-qa run 119).
 * Clean price of a plain fixed-rate bond on a coupon date (no accrued
 * interest, no credit or option features): the coupons and the face value
 * discounted at the market yield, compounded per coupon period.
 * Pure functions are exported for tests; the widget is wired on the
 * "Bond Prices and Yields Explained" lesson.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxBondPrice = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const SHIFTS = [-2, -1, -0.5, 0, 0.5, 1, 2];
  const EPS = 1e-9;

  function periodsFor(years, freq) {
    const n = years * freq;
    return Math.abs(n - Math.round(n)) < EPS ? Math.round(n) : NaN;
  }

  // Price per the face value given, for an annual coupon and yield in percent.
  function price({ face, couponPct, years, freq, yieldPct }) {
    const n = periodsFor(years, freq);
    const c = (face * couponPct) / 100 / freq;
    const y = yieldPct / 100 / freq;
    if (Math.abs(y) < EPS) return c * n + face;
    const v = Math.pow(1 + y, -n);
    return (c * (1 - v)) / y + face * v;
  }

  function validate({ face, couponPct, years, freq, yieldPct }) {
    if (!Number.isFinite(face) || face <= 0 || face > 1e9) return 'Enter a face value above 0.';
    if (!Number.isFinite(couponPct) || couponPct < 0 || couponPct > 50) return 'Enter a coupon rate from 0% to 50% (0 for a zero-coupon bond).';
    if (freq !== 1 && freq !== 2 && freq !== 4 && freq !== 12) return 'Choose how often the coupon is paid.';
    if (!Number.isFinite(years) || years <= 0 || years > 100) return 'Enter years to maturity above 0 and up to 100.';
    if (!Number.isFinite(periodsFor(years, freq))) return freq === 1 ? 'With annual coupons, enter whole years to maturity.' : `Enter years that are a whole number of coupon periods (steps of ${+(1 / freq).toFixed(4)} years).`;
    if (!Number.isFinite(yieldPct) || yieldPct < 0 || yieldPct > 50) return 'Enter a market yield from 0% to 50%.';
    return '';
  }

  function analyse(input) {
    const error = validate(input);
    if (error) return { error };
    const base = price(input);
    const annualCoupon = (input.face * input.couponPct) / 100;
    const rows = [];
    for (const s of SHIFTS) {
      const y = Math.round((input.yieldPct + s) * 1e6) / 1e6;
      if (y < 0) continue;
      const p = price({ ...input, yieldPct: y });
      rows.push({ shift: s, yieldPct: y, yours: s === 0, price: p, change: p - base, changePct: ((p - base) / base) * 100 });
    }
    const up = rows.find((r) => r.shift === 1);
    const down = rows.find((r) => r.shift === -1);
    const diff = base - input.face;
    return {
      price: base,
      pctOfFace: (base / input.face) * 100,
      vsFace: Math.abs(diff) < 0.005 ? 'par' : diff < 0 ? 'discount' : 'premium',
      diff,
      currentYield: annualCoupon > 0 ? (annualCoupon / base) * 100 : null,
      annualCoupon,
      periods: periodsFor(input.years, input.freq),
      rows,
      up,
      down,
    };
  }

  function parseNumber(text) {
    const cleaned = String(text == null ? '' : text).replace(/[,$%\s]/g, '');
    if (cleaned === '') return NaN;
    if (!/^\d*\.?\d+$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  const money = (v) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signedMoney = (v) => (Math.abs(v) < 0.005 ? '$0.00' : (v > 0 ? '+' : '') + money(v));
  const pct = (v, dp = 2) => v.toFixed(dp).replace(/\.?0+$/, '') + '%';
  const signedPct = (v) => (Math.abs(v) < 0.005 ? '0.00%' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%');
  const shiftLabel = (s) => (s === 0 ? 'Your yield' : (s > 0 ? '+' : '−') + Math.abs(s) + ' pt');

  function mount(doc) {
    const box = doc.getElementById('bondBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('bondStatus'), out = f('bondResult'), body = f('bondBody'), note = f('bondNote');
    function render() {
      const input = {
        face: parseNumber(f('bondFace').value),
        couponPct: parseNumber(f('bondCoupon').value),
        years: parseNumber(f('bondYears').value),
        freq: Number(f('bondFreq').value),
        yieldPct: parseNumber(f('bondYield').value),
      };
      const res = analyse(input);
      body.textContent = '';
      if (res.error) {
        status.textContent = res.error;
        status.hidden = false;
        out.hidden = true;
        return;
      }
      status.hidden = true;
      out.hidden = false;
      f('bondPrice').textContent = money(res.price);
      f('bondPctFace').textContent = pct(res.pctOfFace) + ' of face';
      f('bondVsFace').textContent = res.vsFace === 'par' ? 'At par' : (res.vsFace === 'discount' ? 'Discount of ' : 'Premium of ') + money(Math.abs(res.diff));
      f('bondCurrent').textContent = res.currentYield == null ? 'No coupon' : pct(res.currentYield);
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.yours) tr.className = 'bond-yours';
        [shiftLabel(r.shift), pct(r.yieldPct), money(r.price), r.yours ? '—' : signedMoney(r.change), r.yours ? '—' : signedPct(r.changePct)].forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      const parts = [];
      if (res.vsFace === 'discount') parts.push(`The market yield (${pct(input.yieldPct)}) is above the coupon rate (${pct(input.couponPct)}), so the bond trades below its face value.`);
      else if (res.vsFace === 'premium') parts.push(`The coupon rate (${pct(input.couponPct)}) is above the market yield (${pct(input.yieldPct)}), so buyers pay more than face value for it.`);
      else parts.push('The coupon rate equals the market yield, so the bond is priced at its face value.');
      if (res.up && res.down) {
        parts.push(`If yields rise 1 point the price falls ${Math.abs(res.up.changePct).toFixed(2)}%; if they fall 1 point it rises ${res.down.changePct.toFixed(2)}%.` +
          (res.down.changePct - Math.abs(res.up.changePct) >= 0.005 ? ' The rise is bigger than the fall: price and yield do not move in a straight line (convexity).' : ''));
      } else if (res.up) {
        parts.push(`If yields rise 1 point the price falls ${Math.abs(res.up.changePct).toFixed(2)}%.`);
      }
      parts.push('The promised payments do not change; only what the market pays for them today does.');
      note.textContent = parts.join(' ');
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-bond-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [face, coupon, years, freq, yld] = btn.getAttribute('data-bond-preset').split(',');
        f('bondFace').value = face; f('bondCoupon').value = coupon; f('bondYears').value = years; f('bondFreq').value = freq; f('bondYield').value = yld;
        render();
      });
    });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { SHIFTS, price, validate, analyse, parseNumber, periodsFor };
});
