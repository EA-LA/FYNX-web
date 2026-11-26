/* FYNX Terminal plugin: FACTORLOOP. An automated factor-research loop in the spirit of RD-Agent(Q): each round
 * proposes factor hypotheses, implements them as formulas on 50 large US stocks, evaluates them on the research
 * period, and feeds the results back into the next round (keep the best, mutate it, combine winners, try new ideas).
 * The winner is then tested once on the later years it never saw, and judged against the number of factors tried.
 * Transparent formulas, no language model. Delayed Yahoo Finance closes. Not advice. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, store, empty, finite, report} = T;
  const QL = T.QuantLab, QR = T.QuantResearch;
  if (!QL || !QR) return;
  const {loadCloses, alignedReturns, kpis, UNIVERSE} = QL;
  const {frame, label, lineChart, card, chartBox, note, chips} = QR.ui;
  const GREEN = '#3ecf8e', RED = '#ff5a4f', AMBER = '#ffb000', BLUE = '#5b8def', GREY = '#7d8a83';
  const pct = (v, d = 1) => finite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const spct = (v, d = 1) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—';
  const num = (v, d = 2) => finite(v) ? (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) : '—';
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
  const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : NaN; };
  const ncdf = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? 1 - p : p; };
  const rng = seed => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  /* ------------------------------------------- factor grammar ------------------------------------------- */
  // Each family: parameter choices, a plain-English hypothesis and a formula computed from returns up to day t.
  const FAM = {
    mom: {P: [[63, 126, 252], [0, 5, 21]], say: ([L, k]) => `Stocks that rose most over ${L} days${k ? `, skipping the last ${k}` : ''}, keep rising`, f: (R, i, t, [L, k]) => sum(R[i], t - L + 1, t - k)},
    rev: {P: [[5, 10, 21]], say: ([L]) => `Last ${L} days’ losers bounce back (short-term reversal)`, f: (R, i, t, [L]) => -sum(R[i], t - L + 1, t)},
    lowvol: {P: [[21, 63, 126]], say: ([L]) => `Calmer stocks (low ${L}-day volatility) earn more per unit of risk`, f: (R, i, t, [L]) => -std(R[i], t - L + 1, t)},
    lottery: {P: [[21, 63]], say: ([L]) => `Stocks with a recent lottery-like jump (highest day in ${L}) disappoint`, f: (R, i, t, [L]) => -max(R[i], t - L + 1, t)},
    high: {P: [[126, 252]], say: ([L]) => `Stocks near their ${L}-day high keep going (anchoring)`, f: (R, i, t, [L], Pr) => Math.log(Pr[i][t] / maxP(Pr[i], t - L + 1, t))},
    lowbeta: {P: [[63, 126, 252]], say: ([L]) => `Low-beta stocks beat high-beta ones (betting against beta, ${L} days)`, f: (R, i, t, [L], Pr, M) => -beta(R[i], M, t - L + 1, t)},
    idio: {P: [[63, 126]], say: ([L]) => `Low idiosyncratic volatility (${L} days) outperforms`, f: (R, i, t, [L], Pr, M) => -idio(R[i], M, t - L + 1, t)},
    skew: {P: [[63, 126]], say: ([L]) => `Positively skewed stocks (${L} days) are overpriced`, f: (R, i, t, [L]) => -skew(R[i], t - L + 1, t)},
    steady: {P: [[63, 126]], say: ([L]) => `Steady climbers (share of up days over ${L}) keep climbing`, f: (R, i, t, [L]) => { let u = 0; for (let k = t - L + 1; k <= t; k++) u += R[i][k] > 0; return u / L; }}
  };
  function sum(a, s, e) { let v = 0; for (let k = Math.max(1, s); k <= e; k++) v += a[k]; return v; }
  function std(a, s, e) { let m = 0, n = 0; for (let k = s; k <= e; k++) { m += a[k]; n++; } m /= n; let q = 0; for (let k = s; k <= e; k++) q += (a[k] - m) ** 2; return Math.sqrt(q / (n - 1)); }
  function max(a, s, e) { let v = -Infinity; for (let k = s; k <= e; k++) v = Math.max(v, a[k]); return v; }
  function maxP(a, s, e) { let v = 0; for (let k = s; k <= e; k++) v = Math.max(v, a[k]); return v; }
  function beta(a, m, s, e) { let ma = 0, mm = 0, n = e - s + 1; for (let k = s; k <= e; k++) { ma += a[k]; mm += m[k]; } ma /= n; mm /= n; let c = 0, v = 0; for (let k = s; k <= e; k++) { c += (a[k] - ma) * (m[k] - mm); v += (m[k] - mm) ** 2; } return v ? c / v : 0; }
  function idio(a, m, s, e) { const b = beta(a, m, s, e); let q = 0, n = 0, mu = 0; for (let k = s; k <= e; k++) mu += a[k] - b * m[k]; mu /= e - s + 1; for (let k = s; k <= e; k++) { q += (a[k] - b * m[k] - mu) ** 2; n++; } return Math.sqrt(q / (n - 1)); }
  function skew(a, s, e) { const n = e - s + 1; let m = 0; for (let k = s; k <= e; k++) m += a[k]; m /= n; let m2 = 0, m3 = 0; for (let k = s; k <= e; k++) { const d = a[k] - m; m2 += d * d; m3 += d * d * d; } m2 /= n; m3 /= n; return m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0; }
  const keyOf = c => c.parts.map(p => ((p.s || 1) < 0 ? '−' : '') + p.fam + '(' + p.p.join(',') + ')').join(' + ');
  const sayOf = c => c.parts.length === 1 ? FAM[c.parts[0].fam].say(c.parts[0].p) : 'Combine: ' + c.parts.map(p => ((p.s || 1) < 0 ? 'the opposite of: ' : '') + FAM[p.fam].say(p.p).replace(/^./, s => s.toLowerCase())).join(' AND ');
  const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length); let i = 0; while (i < o.length) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  function spearman(x, y) { const rx = rank(x), ry = rank(y), mx = mean(rx), my = mean(ry); let c = 0, a = 0, b = 0; for (let i = 0; i < x.length; i++) { c += (rx[i] - mx) * (ry[i] - my); a += (rx[i] - mx) ** 2; b += (ry[i] - my) ** 2; } return a && b ? c / Math.sqrt(a * b) : 0; }

  /* --------------------------------------------- evaluation --------------------------------------------- */
  // Monthly cross-sectional test: at each rebalance day, rank stocks by the factor and compare with the next 21 days.
  function evaluate(D, cand, dates, windows) {
    const ics = [], ls = [];
    for (const t of dates) {
      const vals = [], fwd = [];
      for (let i = 0; i < D.N; i++) {
        let v = 0, ok = true;
        for (const p of cand.parts) { const z = D.cache(p, t)[i]; if (!finite(z)) { ok = false; break; } v += (p.s || 1) * z; }
        if (ok && finite(D.fwd[t][i])) { vals.push(v); fwd.push(D.fwd[t][i]); }
      }
      if (vals.length < 20) continue;
      ics.push(spearman(vals, fwd));
      const o = vals.map((v, i) => [v, fwd[i]]).sort((a, b) => a[0] - b[0]), q = Math.max(1, Math.floor(o.length / 5));
      const spread = mean(o.slice(-q).map(x => x[1])) - mean(o.slice(0, q).map(x => x[1]));
      ls.push(spread);
      if (windows) windows.push({from: D.dates[t], through: D.dates[t + D.step], n: vals.length, ic: ics[ics.length - 1], spread});
    }
    const m = mean(ics), s = sd(ics), n = ics.length;
    return {ic: m, t: s > 0 ? m / s * Math.sqrt(n) : 0, n, ls: mean(ls), lsSeries: ls, hit: ics.filter(v => v > 0).length / Math.max(1, n)};
  }
  function prepare(A) {
    const N = A.symbols.length, Tn = A.prices[0].length, Pr = A.prices, R = A.prices.map(p => { const r = new Float64Array(Tn); for (let k = 1; k < Tn; k++) r[k] = Math.log(p[k] / p[k - 1]); return r; });
    const M = new Float64Array(Tn); for (let k = 1; k < Tn; k++) { let s = 0; for (let i = 0; i < N; i++) s += R[i][k]; M[k] = s / N; }
    const start = 260, step = 21, days = []; for (let t = start; t + step < Tn; t += step) days.push(t);
    const fwd = {}; days.forEach(t => { fwd[t] = Pr.map(p => Math.log(p[t + step] / p[t])); });
    const memo = new Map();
    // cross-sectional z-scores of one factor on one day, so factors can be added together
    const cache = (part, t) => { const k = part.fam + part.p.join(',') + '@' + t; if (memo.has(k)) return memo.get(k); const raw = Array.from({length: N}, (_, i) => { try { return FAM[part.fam].f(R, i, t, part.p, Pr, M); } catch (_) { return NaN; } }); const ok = raw.filter(finite), m = mean(ok), s = sd(ok) || 1, z = raw.map(v => finite(v) ? Math.max(-3, Math.min(3, (v - m) / s)) : NaN); memo.set(k, z); return z; };
    const cut = Math.floor(days.length * 0.6);
    return {N, Tn, R, M, Pr, days, step, fwd, cache, isDays: days.slice(0, cut), oosDays: days.slice(cut), symbols: A.symbols, dates: A.dates};
  }
  function randomPart(rand, fam) { const f = fam || Object.keys(FAM)[Math.floor(rand() * Object.keys(FAM).length)]; return {fam: f, p: FAM[f].P.map(ch => ch[Math.floor(rand() * ch.length)])}; }
  function mutate(rand, c) { const parts = c.parts.map(p => ({fam: p.fam, p: [...p.p], s: p.s || 1})), j = Math.floor(rand() * parts.length), P = FAM[parts[j].fam].P, k = Math.floor(rand() * P.length), opts = P[k].filter(v => v !== parts[j].p[k]); if (opts.length) parts[j].p[k] = opts[Math.floor(rand() * opts.length)]; return {parts}; }
  async function loop(D, seed, rounds = 5) {
    const rand = rng(seed), log = [], tried = new Map(); let pool = [];
    const test = (cand, round, origin) => { const k = keyOf(cand); if (tried.has(k)) return null; const r = {cand, key: k, say: sayOf(cand), round, origin, is: evaluate(D, cand, D.isDays)}; tried.set(k, r); log.push(r); return r; };
    for (let round = 1; round <= rounds; round++) {
      const props = [];
      if (round === 1) { const fams = Object.keys(FAM).sort(() => rand() - 0.5).slice(0, 6); fams.forEach(f => props.push([{parts: [randomPart(rand, f)]}, 'new idea'])); }
      else {
        const best = pool.slice(0, 2);
        best.forEach(b => { props.push([mutate(rand, b.cand), `tweak of ${b.key}`]); props.push([mutate(rand, b.cand), `tweak of ${b.key}`]); });
        // combine the leaders, each pointing the way it worked
        if (best.length === 2) {
          const seen = new Set(), parts = best.flatMap(b => b.cand.parts.map(p => ({fam: p.fam, p: [...p.p], s: (p.s || 1) * (b.is.ic < 0 ? -1 : 1)}))).filter(p => { const k = p.fam + p.p.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
          if (parts.length > 1 && parts.length <= 3) props.push([{parts}, 'combine the two leaders']);
        }
        props.push([{parts: [randomPart(rand)]}, 'new idea'], [{parts: [randomPart(rand)]}, 'new idea']);
      }
      for (const [c, o] of props) test(c, round, o);
      pool = [...tried.values()].sort((a, b) => Math.abs(b.is.t) - Math.abs(a.is.t));
      log.filter(l => l.round === round).forEach(l => { l.kept = pool.slice(0, 2).includes(l); });
      await new Promise(r => setTimeout(r, 0));
    }
    const best = pool[0], sign = best.is.ic < 0 ? -1 : 1, windows = [], oos = evaluate(D, best.cand, D.oosDays, windows);
    const evidence = windows.map(w => ({...w, ic: sign * w.ic, spread: sign * w.spread}));
    const all = [...tried.values()].map(l => ({...l, oos: evaluate(D, l.cand, D.oosDays)}));
    const bonf = Math.min(1, 2 * (1 - ncdf(Math.abs(best.is.t))) * all.length);
    const corr = spearman(all.map(a => a.is.ic), all.map(a => a.oos.ic));
    return {log, best, sign, evidence, oos: {...oos, ic: sign * oos.ic, t: sign * oos.t, ls: sign * oos.ls, lsSeries: oos.lsSeries.map(v => sign * v), hit: sign > 0 ? oos.hit : 1 - oos.hit}, isS: {...best.is, ic: sign * best.is.ic, t: sign * best.is.t, ls: sign * best.is.ls, lsSeries: best.is.lsSeries.map(v => sign * v)}, all, bonf, corr, tried: all.length};
  }

  /* ------------------------------------------------- page ------------------------------------------------- */
  const FV = (() => { let s = {}; try { s = JSON.parse(store.get('factorloop') || '{}') || {}; } catch (_) {} return {seed: Number.isInteger(s.seed) && s.seed > 0 && s.seed < 1e6 ? s.seed : 1, rounds: [3, 5, 8].includes(s.rounds) ? s.rounds : 5}; })();
  const save = () => store.set('factorloop', JSON.stringify(FV));
  const memo = new Map();
  let dataP = null;
  const data = () => dataP || (dataP = loadCloses(UNIVERSE, '5y').then(d => { const A = alignedReturns(d.series, UNIVERSE);
    if (!A || A.symbols.length < 30 || A.dates.length < 700) throw new Error('Not enough stock history right now.');
    // alignedReturns labels its returns from index 1 but keeps the first close. Restore the offset for price-indexed dates.
    return prepare({...A, dates: [null, ...A.dates]}); }).catch(e => { dataP = null; throw e; }));
  const get = () => { const k = FV.seed + '|' + FV.rounds; if (!memo.has(k)) memo.set(k, data().then(D => loop(D, FV.seed, FV.rounds).then(r => ({...r, D}))).catch(e => { memo.delete(k); throw e; })); return memo.get(k); };
  const cum = rs => { let e = 1; return rs.map(v => (e *= Math.exp(v))); };
  function scatter(box, pts, {xl, yl, aria}) {
    const {w, h, s} = frame(box, aria), padL = 46, padR = 10, padT = 10, padB = 28, iw = w - padL - padR, ih = h - padT - padB;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(0, ...xs), x1 = Math.max(0, ...xs), y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys), X = v => padL + (v - x0) / ((x1 - x0) || 1) * iw, Y = v => padT + (y1 - v) / ((y1 - y0) || 1) * ih;
    s.append(svg('line', {x1: X(0), x2: X(0), y1: padT, y2: padT + ih, stroke: '#2a3530'}), svg('line', {x1: padL, x2: padL + iw, y1: Y(0), y2: Y(0), stroke: '#2a3530'}));
    [...pts].sort((a, b) => (a.big ? 1 : 0) - (b.big ? 1 : 0)).forEach(p => { const c = svg('circle', {cx: X(p.x), cy: Y(p.y), r: p.big ? 6 : 3.5, fill: p.color, 'fill-opacity': 0.85, stroke: p.big ? '#fff' : 'none'}); const t = svg('title'); t.textContent = p.title; c.append(t); s.append(c); });
    label(s, padL + iw, padT + ih + 22, xl, {'text-anchor': 'end'}); label(s, padL + 2, padT + 8, yl);
    [y0, y1].forEach(v => label(s, padL - 4, Y(v) + 3, v.toFixed(2), {'text-anchor': 'end'})); [x0, x1].forEach((v, j) => label(s, X(v), padT + ih + 12, v.toFixed(2), {'text-anchor': j ? 'end' : 'start'}));
    box.replaceChildren(s);
  }
  async function renderPanel() {
    const host = panel('factorloop'); empty(host, 'Running the factor research loop…');
    let r; try { r = await get(); } catch (e) { report('factorloop', e); return empty(host, e.message); }
    if (!$('tp-factorloop')) return; host.replaceChildren(); setText('n-factorloop', `${r.tried} factors tried`);
    const w = el('div', 'fx-ql'), good = r.oos.t > 2 && r.bonf < 0.05; host.append(w);
    kpis(w, [['WINNER', r.best.key.length > 22 ? r.best.key.slice(0, 22) + '…' : r.best.key, `research IC ${num(r.isS.ic, 3)}`], ['OUT OF SAMPLE', `IC ${num(r.oos.ic, 3)}`, `t ${num(r.oos.t)}`, r.oos.t > 2 ? GREEN : r.oos.t > 0 ? AMBER : RED], ['VERDICT', good ? 'SURVIVED' : r.oos.t > 0 ? 'WEAKER' : 'FAILED', `${r.tried} tried`, good ? GREEN : r.oos.t > 0 ? AMBER : RED]]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb);
    requestAnimationFrame(() => lineChart(cb, {series: [{v: [...cum(r.isS.lsSeries), ...r.oos.lsSeries.map(() => NaN)], color: BLUE, width: 1.5, name: 'Research'}, {v: [...r.isS.lsSeries.map((_, i, a) => i === a.length - 1 ? cum(r.isS.lsSeries)[i] : NaN), ...cum(r.oos.lsSeries).map(v => v * cum(r.isS.lsSeries).slice(-1)[0])], color: AMBER, width: 1.5, name: 'Unseen'}], xs: [...r.D.isDays, ...r.D.oosDays].map(t => r.D.dates[t]), log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Long-short growth of the winning factor'}));
  }
  function evidenceCard(r) {
    const details = el('details', 'fx-factor-evidence'), summary = el('summary', '', `Show ${r.evidence.length} validation windows`);
    summary.style.cssText = 'min-height:44px;align-content:center;cursor:pointer';
    const scroller = el('div'); scroller.style.overflowX = 'auto';
    const table = el('table', 'fx-ql-tbl'), head = el('thead'), row = el('tr'), body = el('tbody');
    table.setAttribute('aria-label', 'Winning factor validation windows');
    for (const label of ['Rank date', 'Return through', 'Stocks', 'Rank IC', 'Long–short log spread']) {
      const th = el('th', '', label); th.scope = 'col'; row.append(th);
    }
    head.append(row); table.append(head, body); scroller.append(table);
    for (const w of [...r.evidence].reverse()) {
      const tr = el('tr'), first = el('th', '', w.from || '—'); first.scope = 'row';
      tr.append(first, el('td', '', w.through || '—'), el('td', '', String(w.n)), el('td', '', num(w.ic, 3)), el('td', '', spct(w.spread, 2)));
      body.append(tr);
    }
    details.append(summary, scroller);
    return card('WINNER · VALIDATION BY WINDOW',
      note('Later data only. Each row compares the factor ranking on one date with returns over the next 21 trading days. The spread is the difference in average log return between the two groups, before costs.'),
      r.evidence.length ? details : note('No validation windows had enough stocks.'));
  }
  async function renderPage(host) {
    PG.setHead('FACTORLOOP', 'Automated factor research loop', 'Propose, implement, evaluate, feed back: a research loop in the spirit of RD-Agent(Q) on 50 US stocks, then one honest test on unseen years');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap); const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'LOOP SETTINGS'));
    ic.append(chips([[3, '3 rounds'], [5, '5 rounds'], [8, '8 rounds']].map(([v, t]) => [String(v), t]), String(FV.rounds), v => { FV.rounds = +v; save(); rerun(); }));
    const row = el('div', 'fx-ql-row'); row.style.marginTop = '8px';
    row.append(btn('↻ Run a new loop (new ideas)', 'fx-ql-btn pri', () => { FV.seed = 1 + Math.floor(Math.random() * 99998); save(); rerun(); }), el('span', 'fx-ql-sub', `Loop #${FV.seed}. Each loop explores different ideas; the test on unseen years is always the same.`));
    ic.append(row); wrap.append(ic);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note('Loading 5 years of prices for 50 stocks and running the research loop…'));
    let r; try { r = await get(); } catch (e) { report('factorloop', e); return out.replaceChildren(el('div', 'fx-sl-err', e.message || 'Data unavailable.')); }
    if (!out.isConnected) return; out.replaceChildren();
    const D = r.D, survived = r.oos.t > 2, strong = survived && r.bonf < 0.05, col = strong ? GREEN : r.oos.t > 0 ? AMBER : RED;
    const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', strong ? 'WINNER SURVIVED' : survived ? 'SURVIVED, BUT MANY TRIED' : r.oos.t > 0 ? 'WINNER WEAKENED' : 'WINNER FAILED'); s0.style.color = col;
    hd.append(s0, el('span', 'fx-ql-sub', `After ${r.tried} factors over ${FV.rounds} rounds, the loop picked “${r.best.say}${r.sign < 0 ? ' (reversed: the opposite worked)' : ''}”.`)); out.append(hd);
    kpis(out, [['FACTORS TRIED', String(r.tried), `${FV.rounds} rounds`], ['RESEARCH IC', num(r.isS.ic, 3), `t ${num(r.isS.t)} · ${D.isDays.length} months`, BLUE], ['UNSEEN-YEARS IC', num(r.oos.ic, 3), `t ${num(r.oos.t)} · ${D.oosDays.length} months`, col], ['LONG–SHORT / MONTH', spct(r.oos.ls, 2), 'top minus bottom fifth, unseen', r.oos.ls > 0 ? GREEN : RED], ['MULTIPLE-TESTING p', r.bonf < 0.001 ? '< 0.001' : r.bonf.toFixed(3), `Bonferroni over ${r.tried}`, r.bonf < 0.05 ? GREEN : AMBER], ['RESEARCH → UNSEEN', num(r.corr), 'rank correlation of all ICs', r.corr > 0.3 ? GREEN : RED]]);
    const v = el('div', 'fx-ql-verdict'); v.style.borderColor = col;
    v.textContent = `On the research years the winner had an information coefficient of ${num(r.isS.ic, 3)} (t = ${num(r.isS.t)}). On the ${D.oosDays.length} later months it never saw, the IC was ${num(r.oos.ic, 3)} (t = ${num(r.oos.t)}) and a long–short portfolio made ${spct(r.oos.ls, 2)} a month. ${strong ? 'It held up, and stays significant after accounting for every factor tried.' : survived ? `It held up, but with ${r.tried} factors tried the research result is not significant after a Bonferroni correction, so part of it may be luck.` : 'It did not hold up: the classic fate of a factor found by searching.'} Across all candidates, research and unseen ICs had a rank correlation of ${num(r.corr)}${r.corr < 0.3 ? ', so ranking factors on past data told you little about the future' : ''}.`;
    out.append(v, evidenceCard(r));
    const two = el('div', 'fx-ml-grid'); two.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px'; out.append(two);
    const gc = chartBox(260), sc = chartBox(260);
    two.append(card('WINNER · GROWTH OF A MONTHLY LONG–SHORT PORTFOLIO (BLUE RESEARCH, AMBER UNSEEN)', gc), card('EVERY FACTOR: RESEARCH IC (ACROSS) VS UNSEEN IC (UP)', sc, note('If research performance predicted the future, the dots would line up from bottom-left to top-right. White ring = the winner.')));
    const t = el('table', 'fx-ml-tbl'), hr = el('tr'); ['Round', 'Hypothesis', 'Formula', 'Origin', 'Research IC', 't', 'Unseen IC', 'Kept'].forEach(x => hr.append(el('th', '', x))); t.append(hr);
    t.style.cssText = 'width:100%;border-collapse:collapse;font:500 11.5px "IBM Plex Mono",monospace';
    r.all.sort((a, b) => a.round - b.round || Math.abs(b.is.t) - Math.abs(a.is.t)).forEach(l => {
      const tr = el('tr'), cells = [String(l.round), l.say, l.key, l.origin, num(l.is.ic, 3), num(l.is.t), num(l.oos.ic, 3), l.key === r.best.key ? 'WINNER' : l.kept ? 'kept' : '—'];
      cells.forEach((c, j) => { const td = el('td', '', c); td.style.cssText = `padding:3px 6px;border-bottom:1px solid #141b19;text-align:${j === 1 || j === 2 || j === 3 ? 'left' : 'right'};${j === 1 ? 'white-space:normal;min-width:260px' : 'white-space:nowrap'}`; if (j === 7 && l.key === r.best.key) td.style.color = AMBER; if (j === 6) td.style.color = Math.sign(l.oos.ic) === Math.sign(l.is.ic) ? GREEN : RED; tr.append(td); });
      t.append(tr);
    });
    const sw = el('div'); sw.style.cssText = 'max-height:380px;overflow:auto'; sw.append(t);
    out.append(card(`RESEARCH LOG · ${r.tried} HYPOTHESES (GREEN UNSEEN IC = SAME SIGN AS IN RESEARCH)`, sw));
    out.append(card('HOW THE LOOP WORKS', ...[`Data: daily closes of ${D.N} large US stocks over 5 years. Every 21 trading days each factor ranks the stocks; the information coefficient (IC) is the rank correlation between the factor and the next 21 days’ returns. The first 60% of months are for research, the last 40% are held back.`, 'Round 1 proposes six ideas from different families (momentum, reversal, low volatility, lottery, 52-week high, low beta, idiosyncratic volatility, skewness, steady climbers). Each later round keeps the two leaders, tweaks their parameters, combines them and tries two new ideas, like the propose → implement → evaluate → feedback cycle of RD-Agent(Q). A factor that works in reverse is flipped.', 'Only the final winner’s unseen result matters. The Bonferroni p multiplies its research p-value by the number of factors tried, the simplest guard against data snooping. Delayed Yahoo Finance data. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      const isC = cum(r.isS.lsSeries), last = isC[isC.length - 1], oC = cum(r.oos.lsSeries).map(v => v * last);
      lineChart(gc, {series: [{v: [...isC, ...r.oos.lsSeries.map(() => NaN)], color: BLUE, width: 1.7, name: 'Research'}, {v: [...isC.map((v, i) => i === isC.length - 1 ? v : NaN), ...oC], color: AMBER, width: 1.7, name: 'Unseen years'}], xs: [...D.isDays, ...D.oosDays].map(tt => D.dates[tt]), log: true, yfmt: x => x.toFixed(2) + '×', aria: 'Winner long-short growth'});
      scatter(sc, r.all.map(a => ({x: a.is.ic, y: a.oos.ic, color: a.key === r.best.key ? AMBER : Math.sign(a.oos.ic) === Math.sign(a.is.ic) ? GREEN : RED, big: a.key === r.best.key, title: `${a.key}: research ${a.is.ic.toFixed(3)}, unseen ${a.oos.ic.toFixed(3)}`})), {xl: 'research IC', yl: 'unseen IC', aria: 'Research vs unseen IC'});
    });
  }

  T.PANELS.factorloop = ['FACTORLOOP', 'Factor research loop', 'factorloop']; T.PANEL_DESC.factorloop = 'RD-Agent-style propose → test → feedback, then unseen years'; T.LINK_LABEL.factorloop = 'Full'; T.RENDER.factorloop = renderPanel;
  if (PG) { for (const n of ['factorloop', 'rdagent', 'factorlab']) { T.premium?.(n, 'ai', 'Factor research loop', ['factorloop']); PG.add(n, 'Factor research loop', renderPage); } T.PAGE_NAMES.push('FACTORLOOP', 'RDAGENT', 'FACTORLAB'); }
  const grp = T.EXTRA_GROUPS.find(g => g[0] === 'AI lab'); if (grp) grp[1].push('factorloop'); else T.EXTRA_GROUPS.push(['AI lab', ['factorloop']]);
  T.FactorLoop = {FAM, prepare, evaluate, loop, spearman, rank, keyOf, sayOf};
});
