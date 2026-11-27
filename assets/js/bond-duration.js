/* FYNX duration and convexity example (site-qa run 120).
 * For a plain fixed-rate bond on a coupon date (same assumptions as
 * bond-price.js): Macaulay duration, modified duration and convexity, and how
 * well "-modified duration x yield change" (plus the convexity term) predicts
 * the real repriced change. Also a quick "-D x change" estimate for two
 * hypothetical durations, as in the lesson's practice question.
 * Pure functions are exported for tests; the widget is wired on the
 * "Duration for Traders" lesson.
 */
(function (root, factory) {
  const bp = typeof module === 'object' && module.exports ? require('./bond-price.js') : root.FynxBondPrice;
  const api = factory(bp);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxBondDuration = api;
})(typeof self !== 'undefined' ? self : this, function (bp) {
  const MOVES = [-2, -1, -0.5, -0.25, 0.25, 0.5, 1, 2];
  const EPS = 1e-9;

  // Duration (years) and convexity (years^2) with yields compounded per coupon period.
  function measures({ face, couponPct, years, freq, yieldPct }) {
    const n = bp.periodsFor(years, freq);
    const c = (face * couponPct) / 100 / freq;
    const g = 1 + yieldPct / 100 / freq;
    let p = 0, t = 0, cx = 0;
    for (let k = 1; k <= n; k++) {
      const cf = c + (k === n ? face : 0);
      const pv = cf / Math.pow(g, k);
      p += pv;
      t += (k / freq) * pv;
      cx += (cf * k * (k + 1)) / Math.pow(g, k + 2);
    }
    const macaulay = t / p;
    return { price: p, macaulay, modified: macaulay / g, convexity: cx / (p * freq * freq) };
  }

  // Percent price change estimates for a yield move in percentage points.
  function estimates(m, movePts) {
    const dy = movePts / 100;
    const durationOnly = -m.modified * dy * 100;
    return { durationOnly, withConvexity: durationOnly + 0.5 * m.convexity * dy * dy * 100 };
  }

  function validateMove(move, yieldPct) {
    if (!Number.isFinite(move) || move === 0 || Math.abs(move) > 5) return 'Enter a yield change from −5 to +5 points (not 0), for example 0.5 or −0.25.';
    if (yieldPct + move < -EPS) return 'That move would take the yield below 0%. Choose a smaller fall.';
    return '';
  }

  function row(input, m, move, yours) {
    const y = Math.round((input.yieldPct + move) * 1e6) / 1e6;
    const actual = ((bp.price({ ...input, yieldPct: y }) - m.price) / m.price) * 100;
    const est = estimates(m, move);
    return { move, yours, yieldPct: y, actual, durationOnly: est.durationOnly, withConvexity: est.withConvexity, error: est.durationOnly - actual };
  }

  function analyse(input, move) {
    const error = bp.validate(input) || validateMove(move, input.yieldPct);
    if (error) return { error };
    const m = measures(input);
    const moves = MOVES.filter((s) => Math.abs(s - move) > EPS && input.yieldPct + s >= -EPS);
    moves.push(move);
    moves.sort((a, b) => a - b);
    const rows = moves.map((s) => row(input, m, s, Math.abs(s - move) < EPS));
    return { ...m, rows, yours: rows.find((r) => r.yours) };
  }

  // The lesson's rule of thumb for two hypothetical modified durations.
  function quick(d1, d2, move) {
    for (const d of [d1, d2]) if (!Number.isFinite(d) || d < 0 || d > 100) return { error: 'Enter modified durations from 0 to 100.' };
    if (!Number.isFinite(move) || move === 0 || Math.abs(move) > 5) return { error: 'Enter a yield change from −5 to +5 points (not 0).' };
    const a = -d1 * move, b = -d2 * move;
    return { a, b, ratio: Math.abs(a) > EPS ? b / a : null };
  }

  function parseSigned(text) {
    const s = String(text == null ? '' : text).trim().replace(/^[−–]/, '-').replace(/^\+/, '');
    const neg = s.startsWith('-');
    const v = bp.parseNumber(neg ? s.slice(1) : s);
    return neg ? -v : v;
  }

  const fix = (v, dp) => (Math.abs(v) < 0.5 * Math.pow(10, -dp) ? 0 : v).toFixed(dp);
  const signedPct = (v, dp = 2) => { const s = fix(v, dp); return Number(s) === 0 ? (0).toFixed(dp) + '%' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(dp) + '%'; };
  const signedPts = (v, dp = 2) => { const s = fix(v, dp); return Number(s) === 0 ? (0).toFixed(dp) : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(dp); };
  const moveLabel = (s) => (s > 0 ? '+' : '−') + String(Math.abs(s)) + '\u00a0pt';

  function mount(doc) {
    const box = doc.getElementById('durBox');
    if (box) mountBond(doc, box);
    const q = doc.getElementById('durQuick');
    if (q) mountQuick(doc, q);
  }

  function mountBond(doc, box) {
    const f = (id) => doc.getElementById(id);
    const status = f('durStatus'), out = f('durResult'), body = f('durBody'), note = f('durNote');
    function render() {
      const input = {
        face: bp.parseNumber(f('durFace').value),
        couponPct: bp.parseNumber(f('durCoupon').value),
        years: bp.parseNumber(f('durYears').value),
        freq: Number(f('durFreq').value),
        yieldPct: bp.parseNumber(f('durYield').value),
      };
      const move = parseSigned(f('durMove').value);
      const res = analyse(input, move);
      body.textContent = '';
      if (res.error) {
        status.textContent = res.error;
        status.hidden = false;
        out.hidden = true;
        return;
      }
      status.hidden = true;
      out.hidden = false;
      f('durMac').textContent = res.macaulay.toFixed(2) + ' yrs';
      f('durMod').textContent = res.modified.toFixed(2);
      f('durConv').textContent = res.convexity.toFixed(1);
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.yours) tr.className = 'bond-yours';
        [moveLabel(r.move) + (r.yours ? ' (yours)' : ''), signedPct(r.actual), signedPct(r.durationOnly), signedPct(r.withConvexity), signedPts(r.error)].forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      const y = res.yours;
      const dir = y.move > 0 ? 'rise' : 'fall';
      note.textContent = `For a ${Math.abs(y.move)}-point ${dir} in yield, duration alone estimates ${signedPct(y.durationOnly)} (−${res.modified.toFixed(2)} × ${signedPts(y.move / 100, 4).replace(/^\+/, '')}); repricing every payment gives ${signedPct(y.actual)}. ` +
        `Adding convexity brings the estimate to ${signedPct(y.withConvexity)}. For a plain bond, duration alone always ${y.move > 0 ? 'overstates the loss' : 'understates the gain'}, and the gap grows with the size of the move, which is why it is used for small moves.`;
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-dur-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [face, coupon, years, freq, yld, mv] = btn.getAttribute('data-dur-preset').split(',');
        f('durFace').value = face; f('durCoupon').value = coupon; f('durYears').value = years; f('durFreq').value = freq; f('durYield').value = yld; f('durMove').value = mv;
        render();
      });
    });
    render();
  }

  function mountQuick(doc, q) {
    const f = (id) => doc.getElementById(id);
    function render() {
      const d1 = bp.parseNumber(f('durQ1').value), d2 = bp.parseNumber(f('durQ2').value), mv = parseSigned(f('durQMove').value);
      const r = quick(d1, d2, mv);
      const st = f('durQStatus'), out = f('durQResult');
      if (r.error) { st.textContent = r.error; st.hidden = false; out.hidden = true; return; }
      st.hidden = true; out.hidden = false;
      f('durQA').textContent = signedPct(r.a);
      f('durQB').textContent = signedPct(r.b);
      f('durQALabel').textContent = 'Duration ' + d1;
      f('durQBLabel').textContent = 'Duration ' + d2;
      const ratio = r.ratio == null ? '' : ` The duration ${d2} bond moves about ${Math.abs(r.ratio).toFixed(1)}× as much as the duration ${d1} bond.`;
      f('durQNote').textContent = `For a ${signedPts(mv)}-point yield move, approximate change = −duration × ${signedPts(mv / 100, 4).replace(/^\+/, '')}.` + ratio +
        ' This assumes a small, parallel move with no change in credit spread or curve shape; real returns also include coupon income and convexity.';
    }
    q.addEventListener('input', render);
    q.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { MOVES, measures, estimates, analyse, quick, parseSigned, validateMove };
});
