/* FYNX Terminal plugin: analyst desk. Two pages built on SEC EDGAR financials, Yahoo Finance prices and headlines.
 *
 * VALUE      Valuation workbench: discounted cash flow with bear/base/bull cases, a reverse DCF (the growth the price
 *            already assumes), a WACC × terminal-growth sensitivity grid, trading comparables against sector peers,
 *            a simple leveraged-buyout check and a football field of every range.
 * COMMITTEE  An investment committee in the style of multi-agent research systems such as TradingAgents, but with
 *            transparent rules instead of language models: fundamentals, valuation, technical, news and market analysts
 *            score the stock with evidence, bull and bear researchers argue, a risk team sizes the position at three
 *            risk levels, and the portfolio manager writes a memo you can copy or download.
 * Headlines are summarised here with their source named; nothing sends the reader to another site. Not advice. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, store, empty, finite, report} = T;
  const QL = T.QuantLab, QR = T.QuantResearch;
  if (!QL || !QR) return;
  const {loadCloses, kpis, SECTOR_OF, UNIVERSE} = QL;
  const {loadBars} = QR;
  const {frame, label, lineChart, heatmap, card, chartBox, note, chips, symbolBox} = QR.ui;
  const SYM_RE = /^[A-Z0-9.\-]{1,12}$/;
  const pct = (v, d = 1) => finite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const spct = (v, d = 1) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—';
  const usd = v => !finite(v) ? '—' : '$' + (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', {maximumFractionDigits: 0}) : v.toFixed(2));
  const big = v => !finite(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e12 ? (Math.abs(v) / 1e12).toFixed(2) + 'T' : Math.abs(v) >= 1e9 ? (Math.abs(v) / 1e9).toFixed(1) + 'B' : Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(0) + 'M' : Math.abs(v).toFixed(0));
  const x = v => finite(v) ? v.toFixed(1) + '×' : '—';
  const GREEN = '#3ecf8e', RED = '#ff5a4f', AMBER = '#ffb000', BLUE = '#5b8def', GREY = '#7d8a83';
  const median = a => { const s = a.filter(finite).sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
  const mean = a => { const s = a.filter(finite); return s.length ? s.reduce((p, q) => p + q, 0) / s.length : NaN; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const st = el('style'); st.id = 'fx-analyst-style';
  st.textContent = `
.fx-an-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.fx-an-tbl{width:100%;border-collapse:collapse;font:500 11.5px 'IBM Plex Mono',monospace}
.fx-an-tbl th{text-align:right;color:var(--mu);font-weight:600;padding:4px 6px;border-bottom:1px solid var(--ln);white-space:nowrap}
.fx-an-tbl td{text-align:right;padding:3px 6px;border-bottom:1px solid #141b19;white-space:nowrap}
.fx-an-tbl th:first-child,.fx-an-tbl td:first-child{text-align:left}
.fx-an-scroll{overflow:auto;max-height:340px}
.fx-an-agents{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.fx-an-agent{padding:10px 12px;background:#0d1312;border:1px solid var(--ln);border-top:3px solid var(--c,#7d8a83)}
.fx-an-agent h4{margin:0 0 4px;font:700 11px 'IBM Plex Mono',monospace;letter-spacing:.06em;color:#e8ecea;display:flex;justify-content:space-between;gap:8px}
.fx-an-agent h4 b{color:var(--c)}
.fx-an-agent ul{margin:6px 0 0;padding-left:16px;color:#c9d2cd;font-size:12px;line-height:1.5}
.fx-an-debate{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fx-an-side{padding:10px 12px;border:1px solid var(--ln);background:#0d1312}
.fx-an-side h4{margin:0 0 6px;font:700 11px 'IBM Plex Mono',monospace;letter-spacing:.06em}
.fx-an-side ol{margin:0;padding-left:18px;color:#c9d2cd;font-size:12px;line-height:1.55}
.fx-an-memo{white-space:pre-wrap;font:12px/1.6 'IBM Plex Mono',monospace;color:#d7dfda;background:#0b0f0e;border:1px solid var(--ln);padding:12px;max-height:420px;overflow:auto}
.fx-an-news li{margin-bottom:4px}.fx-an-news small{color:var(--mu)}
.fx-an-scenario{display:grid;gap:8px}
.fx-an-scenario-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr));gap:8px}
.fx-an-scenario-fields label{display:grid;gap:4px;color:var(--tx);font-size:12px}
.fx-an-scenario .fx-an-in,.fx-an-scenario .fx-ql-btn{min-height:44px}
.fx-an-scenario .fx-an-in{width:100%;box-sizing:border-box}
.fx-an-in{background:#0d1312;border:1px solid #26302c;color:var(--tx);font:12px 'IBM Plex Mono',monospace;padding:5px 8px;min-height:30px;width:72px}
@media (max-width:900px){.fx-an-grid,.fx-an-debate{grid-template-columns:1fr}}`;
  document.head.append(st);

  /* ============================================== valuation maths ============================================== */
  // Pull the latest annual facts into a compact profile. Returns null if the filing data cannot support a DCF.
  function profile(fin) {
    const P = fin?.periods || [], A = fin?.annual || {}, val = (p, k) => A[p]?.[k]?.value;
    const years = P.filter(p => finite(val(p, 'revenue'))).slice(0, 6);
    if (years.length < 2) return null;
    const p0 = years[0], rev = years.map(p => val(p, 'revenue')), fcf = years.map(p => finite(val(p, 'operatingCash')) ? val(p, 'operatingCash') - (val(p, 'capex') || 0) : NaN);
    const income = val(p0, 'income'), eps = val(p0, 'eps'), shares = finite(income) && finite(eps) && Math.abs(eps) > 0.01 && income / eps > 0 ? income / eps : NaN;
    const n = Math.min(3, rev.length - 1), cagr = rev[n] > 0 && rev[0] > 0 ? Math.pow(rev[0] / rev[n], 1 / n) - 1 : NaN;
    const margins = years.slice(0, 3).map((p, i) => fcf[i] / rev[i]).filter(finite);
    const debt = (val(p0, 'longTermDebt') || 0) + (val(p0, 'currentDebt') || 0), cash = val(p0, 'cash') || 0;
    return {name: fin.name, year: p0, years, rev, fcf, income, eps, shares, cagr, fcfMargin: median(margins), netDebt: debt - cash, debt, cash, equity: val(p0, 'equity'), capexMissing: !finite(val(p0, 'capex')),
      netMargin: finite(income) && rev[0] ? income / rev[0] : NaN, epsPrev: val(years[1], 'eps'), revPrev: rev[1]};
  }
  // Ten-year FCF DCF: growth fades linearly from g0 to the terminal rate, margin constant, Gordon terminal value.
  function dcf({rev0, g0, margin, wacc, tg, netDebt, shares, years = 10}) {
    if (!(wacc > tg)) return NaN;
    let r = rev0, pv = 0; const path = [];
    for (let t = 1; t <= years; t++) { const g = g0 + (tg - g0) * (t - 1) / (years - 1); r *= 1 + g; const f = r * margin; pv += f / Math.pow(1 + wacc, t); path.push({t, rev: r, fcf: f, g}); }
    const tv = path[years - 1].fcf * (1 + tg) / (wacc - tg), pvTv = tv / Math.pow(1 + wacc, years), ev = pv + pvTv;
    return {ev, equity: ev - netDebt, perShare: (ev - netDebt) / shares, pvTv, tvShare: pvTv / ev, path};
  }
  const CUSTOM_FIELDS = [
    ['g0', 'Year-one revenue growth (%)', -99, 300],
    ['margin', 'Free-cash-flow margin (%)', -100, 100],
    ['wacc', 'Discount rate (WACC, %)', 0.1, 100],
    ['tg', 'Terminal growth (%)', -20, 20]
  ];
  function customDcf(base, values) {
    const custom = {...base};
    for (const [key, label, min, max] of CUSTOM_FIELDS) {
      const raw = values[key], value = typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
      if (!finite(value) || value < min || value > max) return {error: `${label} must be between ${min} and ${max}.`};
      custom[key] = value / 100;
    }
    if (custom.wacc - custom.tg < 0.001 - 1e-12) return {error: 'WACC must be at least 0.1 percentage point above terminal growth.'};
    const result = dcf(custom);
    return finite(result?.perShare) ? {result} : {error: 'This scenario could not be calculated from the available filings.'};
  }
  // Growth the current price implies (base margin, WACC and terminal rate), by bisection.
  function impliedGrowth(base, price) {
    let lo = -0.3, hi = 0.8; const f = g => dcf({...base, g0: g}).perShare - price;
    if (f(lo) > 0 || f(hi) < 0) return NaN;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }
  // A simple buyout: pay a premium, borrow against cash flow, use free cash flow to repay debt, exit at the entry multiple.
  // fcf0 = last reported free cash flow; fcfPath = projected free cash flow for each holding year.
  function lbo({mcap, netDebt, fcf0, fcfPath, premium = 0.25, leverage = 5, rate = 0.08, tax = 0.21}) {
    const years = fcfPath.length, entryEv = mcap * (1 + premium) + netDebt;
    if (!(fcf0 > 0) || !(entryEv > 0) || !years) return null;
    const debt0 = Math.min(leverage * fcf0, 0.65 * entryEv), equity0 = entryEv - debt0, multiple = entryEv / fcf0; let debt = debt0;
    for (let t = 0; t < years; t++) { const interest = debt * rate; debt = Math.max(0, debt - (fcfPath[t] - interest * (1 - tax))); }
    const exitEv = multiple * fcfPath[years - 1], equity1 = exitEv - debt;
    return {entryEv, debt0, equity0, multiple, exitEv, debt1: debt, equity1, irr: equity1 > 0 ? Math.pow(equity1 / equity0, 1 / years) - 1 : -1, moic: equity1 / equity0};
  }
  function betaOf(a, b) { const n = Math.min(a.length, b.length); if (n < 60) return NaN; const ra = [], rb = []; for (let i = 1; i < n; i++) { ra.push(Math.log(a[i] / a[i - 1])); rb.push(Math.log(b[i] / b[i - 1])); } const ma = mean(ra), mb = mean(rb); let c = 0, v = 0; for (let i = 0; i < ra.length; i++) { c += (ra[i] - ma) * (rb[i] - mb); v += (rb[i] - mb) ** 2; } return v ? c / v : NaN; }
  const RF = 0.043, ERP = 0.05, KD = 0.055, TAX = 0.21;
  function scenarios(pf, price, beta) {
    const mcap = price * pf.shares, b = clamp(finite(beta) ? beta : 1, 0.6, 2), ke = RF + b * ERP, D = Math.max(0, pf.debt), wacc = (mcap * ke + D * KD * (1 - TAX)) / (mcap + D);
    const g = clamp(finite(pf.cagr) ? pf.cagr : 0.04, -0.05, 0.25), m = clamp(finite(pf.fcfMargin) ? pf.fcfMargin : 0.08, -0.1, 0.6);
    const common = {rev0: pf.rev[0], netDebt: pf.netDebt, shares: pf.shares};
    const S = {bear: {...common, g0: Math.max(-0.05, g - 0.04), margin: m * 0.85, wacc: wacc + 0.01, tg: 0.02}, base: {...common, g0: g, margin: m, wacc, tg: 0.025}, bull: {...common, g0: g + 0.04, margin: m * 1.1, wacc: Math.max(0.05, wacc - 0.0075), tg: 0.03}};
    const out = Object.fromEntries(Object.entries(S).map(([k, s]) => [k, {...s, ...dcf(s)}]));
    return {wacc, ke, beta: b, mcap, g, m, cases: out, implied: impliedGrowth(S.base, price)};
  }

  /* ============================================== data loading ============================================== */
  const memo = new Map();
  const cached = (key, fn) => { if (!memo.has(key)) memo.set(key, fn().catch(e => { memo.delete(key); throw e; })); return memo.get(key); };
  const peersOf = sym => { const sec = SECTOR_OF[sym]?.name; return sec ? UNIVERSE.filter(s => s !== sym && SECTOR_OF[s]?.name === sec).slice(0, 6) : []; };
  async function valueRun(sym, peerList) {
    const fin = await T.loadFin(sym); const pf = profile(fin);
    if (!pf) throw new Error(`${sym}: SEC filings do not have enough annual US-GAAP data for a valuation (funds, foreign filers and many banks are not covered).`);
    if (!finite(pf.shares)) throw new Error(`${sym}: could not derive the share count from the latest 10-K.`);
    const B = await loadBars(sym, '1d'), price = B.c[B.c.length - 1];
    let beta = NaN, spyB = null; try { spyB = await loadBars('SPY', '1d'); const n = 504, a = B.c.slice(-n), s = spyB.c.slice(-n); beta = betaOf(a, s); } catch (_) {}
    const sc = scenarios(pf, price, beta);
    const grid = [-0.01, -0.005, 0, 0.005, 0.01].map(dw => [0.015, 0.02, 0.025, 0.03, 0.035].map(tg => dcf({...sc.cases.base, wacc: sc.cases.base.wacc + dw, tg}).perShare));
    // comparables
    const peers = (peerList && peerList.length ? peerList : peersOf(sym)).filter(p => p !== sym).slice(0, 8);
    const comps = [];
    if (peers.length) {
      const px = await loadCloses(peers, '1y').catch(() => null);
      const rows = await Promise.all(peers.map(async p => { try { const f = profile(await T.loadFin(p)); const m = px?.series.get(p); const last = m ? [...m.values()].pop() : NaN; if (!f || !finite(f.shares) || !finite(last)) return null; const cap = last * f.shares; return {sym: p, name: f.name, price: last, cap, pe: f.eps > 0 ? last / f.eps : NaN, ps: cap / f.rev[0], pfcf: f.fcf[0] > 0 ? cap / f.fcf[0] : NaN, margin: f.netMargin, growth: f.rev[0] / f.revPrev - 1, fcfMargin: f.fcfMargin}; } catch (_) { return null; } }));
      comps.push(...rows.filter(Boolean));
    }
    const self = {sym, name: pf.name, price, cap: sc.mcap, pe: pf.eps > 0 ? price / pf.eps : NaN, ps: sc.mcap / pf.rev[0], pfcf: pf.fcf[0] > 0 ? sc.mcap / pf.fcf[0] : NaN, margin: pf.netMargin, growth: pf.rev[0] / pf.revPrev - 1, fcfMargin: pf.fcfMargin};
    const med = k => median(comps.map(c => c[k])), q = (k, p) => { const s = comps.map(c => c[k]).filter(finite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
    const perShare = {pe: pf.eps, ps: pf.rev[0] / pf.shares, pfcf: pf.fcf[0] / pf.shares};
    const implied = Object.fromEntries(['pe', 'ps', 'pfcf'].map(k => [k, {lo: q(k, 0.25) * perShare[k], mid: med(k) * perShare[k], hi: q(k, 0.75) * perShare[k]}]));
    // buyout check with the base-case cash flows
    const bo = lbo({mcap: sc.mcap, netDebt: pf.netDebt, fcf0: pf.fcf[0], fcfPath: sc.cases.base.path.slice(0, 5).map(p => p.fcf)});
    const hi52 = Math.max(...B.c.slice(-252)), lo52 = Math.min(...B.c.slice(-252));
    return {sym, pf, B, price, sc, grid, comps, self, med, implied, bo, hi52, lo52, beta, spy: spyB};
  }
  const valueGet = (sym, peers) => cached(['value', sym, (peers || []).join(',')].join('|'), () => valueRun(sym, peers));

  /* ============================================ valuation page ============================================ */
  const VV = (() => { let s = {}; try { s = JSON.parse(store.get('value') || '{}') || {}; } catch (_) {} return {sym: SYM_RE.test(s.sym || '') ? s.sym : 'AAPL', peers: typeof s.peers === 'string' ? s.peers.slice(0, 120) : ''}; })();
  const saveV = () => store.set('value', JSON.stringify(VV));
  const peerArr = () => [...new Set(VV.peers.toUpperCase().split(/[\s,]+/).filter(s => SYM_RE.test(s)))].slice(0, 8);
  function table(head, rows, colorFn) { const t = el('table', 'fx-an-tbl'), hr = el('tr'); head.forEach(h => hr.append(el('th', '', h))); t.append(hr); rows.forEach((r, i) => { const tr = el('tr'); r.forEach((c, j) => { const td = el('td', '', c); const col = colorFn?.(i, j); if (col) td.style.color = col; tr.append(td); }); t.append(tr); }); const w = el('div', 'fx-an-scroll'); w.append(t); return w; }
  function football(box, r) {
    const rows = [['DCF (bear–bull)', r.sc.cases.bear.perShare, r.sc.cases.bull.perShare, r.sc.cases.base.perShare, AMBER], ['Peers P/E', r.implied.pe.lo, r.implied.pe.hi, r.implied.pe.mid, BLUE], ['Peers P/S', r.implied.ps.lo, r.implied.ps.hi, r.implied.ps.mid, BLUE], ['Peers P/FCF', r.implied.pfcf.lo, r.implied.pfcf.hi, r.implied.pfcf.mid, BLUE], ['52-week range', r.lo52, r.hi52, NaN, GREY]].filter(x => finite(x[1]) && finite(x[2]) && x[2] > 0);
    const {w, h, s} = frame(box, 'Valuation football field', 60 + rows.length * 34), padL = 120, padR = 70, padT = 8, iw = w - padL - padR, rh = (h - padT - 18) / Math.max(1, rows.length);
    // Scale to the useful range: outliers beyond 4× the price are cut off and marked with their true value.
    const all = rows.flatMap(x => [x[1], x[2]]).concat(r.price).filter(v => finite(v) && v > 0), lo = Math.max(0, Math.min(...all) * 0.9), hi = Math.min(Math.max(...all), r.price * 4) * 1.04, X = v => padL + (clamp(v, lo, hi) - lo) / (hi - lo) * iw;
    rows.forEach(([name, a, b, mid, col], i) => {
      const y = padT + i * rh + rh * 0.2, lo2 = Math.min(a, b), hi2 = Math.max(a, b), x0 = X(lo2), x1 = X(hi2), cut = hi2 > hi;
      label(s, 8, y + rh * 0.35, name, {fill: '#c9d2cd'});
      s.append(svg('rect', {x: x0, y, width: Math.max(2, x1 - x0), height: rh * 0.55, fill: col, 'fill-opacity': 0.55, rx: 2}));
      if (finite(mid) && mid <= hi) s.append(svg('line', {x1: X(mid), x2: X(mid), y1: y - 2, y2: y + rh * 0.55 + 2, stroke: '#fff', 'stroke-width': 2}));
      if (x0 - padL > 56) label(s, x0 - 4, y + rh * 0.4, usd(lo2), {'text-anchor': 'end'}); else label(s, x0 + 4, y + rh * 0.4, usd(lo2), {fill: '#0b0f0e'});
      label(s, x1 + 4, y + rh * 0.4, (cut ? '→ ' : '') + usd(hi2));
    });
    s.append(svg('line', {x1: X(r.price), x2: X(r.price), y1: padT - 4, y2: h - 14, stroke: AMBER, 'stroke-dasharray': '4 3', 'stroke-width': 1.5})); label(s, X(r.price), h - 3, 'price ' + usd(r.price), {'text-anchor': 'middle', fill: AMBER});
    box.replaceChildren(s);
  }
  function customDcfCard(r) {
    const base = r.sc.cases.base;
    const form = el('form', 'fx-an-scenario'), fields = el('div', 'fx-an-scenario-fields');
    const actions = el('div', 'fx-ql-row'), result = note('');
    form.noValidate = true;
    result.setAttribute('role', 'status');
    result.setAttribute('aria-atomic', 'true');
    const entries = CUSTOM_FIELDS.map(([key, label, min, max]) => {
      const field = el('label', '', label), input = el('input', 'fx-an-in');
      input.type = 'number'; input.step = 'any'; input.min = min; input.max = max;
      input.defaultValue = String(+(base[key] * 100).toFixed(8));
      field.append(input); fields.append(field);
      return [key, input];
    });
    const update = () => {
      const calc = customDcf(base, Object.fromEntries(entries.map(([k, input]) => [k, input.value])));
      if (calc.error) { result.textContent = calc.error; return; }
      const perShare = calc.result.perShare;
      const compared = r.price > 0 && finite(r.price) ? ` · ${spct(perShare / r.price - 1)} vs the reference close (${usd(r.price)})` : '';
      const modeled = perShare < 0 ? '−' + usd(-perShare) : usd(perShare);
      result.textContent = `Modeled value per share: ${modeled}${compared}.`;
    };
    const run = el('button', 'fx-ql-btn pri', 'Calculate scenario'); run.type = 'submit';
    const reset = el('button', 'fx-ql-btn', 'Reset to base case'); reset.type = 'button';
    reset.addEventListener('click', () => {
      entries.forEach(([, input]) => { input.value = input.defaultValue; }); update();
    });
    form.addEventListener('input', () => { result.textContent = 'Assumptions changed. Calculate to update the modeled value.'; });
    form.addEventListener('submit', e => { e.preventDefault(); update(); });
    actions.append(run, reset); form.append(fields, actions, result);
    update();
    return card('CUSTOM DCF SCENARIO', note('Starts with this company’s base-case assumptions. Changes apply only here, not to the standard cases, charts or saved data.'), form);
  }
  async function renderValue(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { VV.sym = String(arg).toUpperCase(); saveV(); }
    PG.setHead('VALUE', 'Valuation workbench', 'DCF bear/base/bull, the growth the price implies, sensitivity, trading comparables and a buyout check, from SEC filings');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap); const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'COMPANY'));
    ic.append(symbolBox(VV.sym, s => { VV.sym = s; VV.peers = ''; saveV(); rerun(); }, 'US stock: AAPL, MSFT, NVDA, KO, XOM'));
    ic.append(chips([['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet'], ['KO', 'Coca-Cola'], ['XOM', 'Exxon'], ['COST', 'Costco']], VV.sym, s => { VV.sym = s; VV.peers = ''; saveV(); rerun(); }));
    const pf = el('form', 'fx-ql-row'), pi = el('input', 'fx-an-in'); pi.style.width = '320px'; pi.value = VV.peers || peersOf(VV.sym).join(' '); pi.placeholder = 'Peers, e.g. MSFT GOOGL META'; pi.setAttribute('aria-label', 'Peers');
    pf.style.marginTop = '8px'; pf.append(el('label', '', 'Peers'), pi, btn('Use peers', 'fx-ql-btn')); pf.addEventListener('submit', e => { e.preventDefault(); VV.peers = pi.value; saveV(); rerun(); }); ic.append(pf); wrap.append(ic);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note(`Reading ${VV.sym}’s 10-K data from SEC EDGAR, prices and peers…`));
    let r; try { r = await valueGet(VV.sym, peerArr()); } catch (e) { report('value', e); return out.replaceChildren(el('div', 'fx-sl-err', e.message || 'Valuation data unavailable.')); }
    if (!out.isConnected) return; out.replaceChildren();
    const C = r.sc.cases, up = C.base.perShare / r.price - 1, color = up > 0.15 ? GREEN : up < -0.15 ? RED : AMBER;
    const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', up > 0.15 ? 'BASE CASE: UNDERVALUED' : up < -0.15 ? 'BASE CASE: OVERVALUED' : 'BASE CASE: FAIRLY VALUED'); s0.style.color = color;
    hd.append(s0, el('span', 'fx-ql-sub', `${r.pf.name} at ${usd(r.price)}: base-case DCF ${usd(C.base.perShare)} (${spct(up, 0)}), range ${usd(C.bear.perShare)} to ${usd(C.bull.perShare)}. Fiscal year ${r.pf.year.slice(0, 4)} filings.`)); out.append(hd);
    kpis(out, [['BEAR', usd(C.bear.perShare), spct(C.bear.perShare / r.price - 1, 0), RED], ['BASE', usd(C.base.perShare), spct(up, 0), color], ['BULL', usd(C.bull.perShare), spct(C.bull.perShare / r.price - 1, 0), GREEN], ['PRICE IMPLIES', finite(r.sc.implied) ? spct(r.sc.implied, 1) + '/yr' : '—', `revenue growth fading to 2.5% · history ${spct(r.pf.cagr, 1)}`, finite(r.sc.implied) && r.sc.implied > r.pf.cagr + 0.05 ? RED : GREEN], ['WACC', pct(r.sc.wacc, 1), `beta ${r.sc.beta.toFixed(2)} · cost of equity ${pct(r.sc.ke, 1)}`], ['MARKET CAP', big(r.sc.mcap), `net ${r.pf.netDebt >= 0 ? 'debt' : 'cash'} ${big(Math.abs(r.pf.netDebt))}`]]);
    const imp = r.sc.implied, hist = r.pf.cagr;
    const v = el('div', 'fx-ql-verdict'); v.style.borderColor = color;
    v.textContent = `${finite(imp) ? `To justify ${usd(r.price)}, revenue would need to ${imp >= 0 ? 'grow' : 'shrink'} about ${pct(Math.abs(imp), 1)} a year at first (fading to 2.5%) with a ${pct(r.sc.m, 0)} free-cash-flow margin, against ${pct(hist, 1)} a year over the last ${Math.min(3, r.pf.rev.length - 1)} years. ${imp > hist + 0.05 ? 'The market is pricing in faster growth than the company has delivered.' : imp < hist - 0.05 ? 'The market is pricing in a slowdown; if growth simply continues, the shares look cheap.' : 'The price is roughly consistent with recent growth.'} ` : ''}The terminal value is ${pct(C.base.tvShare, 0)} of the base-case value, so long-run assumptions dominate${r.pf.capexMissing ? '; capital spending was not reported in the standard tag, so free cash flow may be overstated' : ''}. A DCF is a map of assumptions, not a price target.`;
    out.append(v, customDcfCard(r));
    const ff = chartBox(80 + 5 * 34); out.append(card('FOOTBALL FIELD · VALUE PER SHARE BY METHOD (WHITE TICK = MIDPOINT, DASHED = PRICE)', ff));
    const two = el('div', 'fx-an-grid'), sg = chartBox(220), pc = chartBox(220); out.append(two);
    two.append(card('SENSITIVITY · VALUE PER SHARE (ROWS: WACC CHANGE IN POINTS, COLUMNS: TERMINAL GROWTH)', sg, note(`Centre cell: WACC ${pct(C.base.wacc, 1)}, terminal growth 2.5%. Green cells are above today’s price.`)), card('BASE-CASE FREE CASH FLOW, HISTORY AND 10-YEAR PROJECTION', pc));
    const casesTbl = table(['Assumption', 'Bear', 'Base', 'Bull'], [['Revenue growth, year 1', pct(C.bear.g0, 1), pct(C.base.g0, 1), pct(C.bull.g0, 1)], ['FCF margin', pct(C.bear.margin, 1), pct(C.base.margin, 1), pct(C.bull.margin, 1)], ['WACC', pct(C.bear.wacc, 1), pct(C.base.wacc, 1), pct(C.bull.wacc, 1)], ['Terminal growth', pct(C.bear.tg, 1), pct(C.base.tg, 1), pct(C.bull.tg, 1)], ['Enterprise value', big(C.bear.ev), big(C.base.ev), big(C.bull.ev)], ['Equity value', big(C.bear.equity), big(C.base.equity), big(C.bull.equity)], ['Per share', usd(C.bear.perShare), usd(C.base.perShare), usd(C.bull.perShare)], ['vs price', spct(C.bear.perShare / r.price - 1, 0), spct(up, 0), spct(C.bull.perShare / r.price - 1, 0)]]);
    const t2 = el('div', 'fx-an-grid'); out.append(t2);
    t2.append(card('DCF CASES', casesTbl), card('FROM THE FILINGS (SEC EDGAR, ANNUAL)', table(['Fiscal year', 'Revenue', 'Free cash flow', 'FCF margin'], r.pf.years.map((y, i) => [y.slice(0, 4), big(r.pf.rev[i]), big(r.pf.fcf[i]), pct(r.pf.fcf[i] / r.pf.rev[i], 1)]))));
    if (r.comps.length) {
      const m = r.med, rows = [r.self, ...r.comps].map(c => [c.sym, big(c.cap), x(c.pe), x(c.ps), x(c.pfcf), pct(c.margin, 0), spct(c.growth, 0)]);
      rows.push(['Peer median', '', x(m('pe')), x(m('ps')), x(m('pfcf')), pct(m('margin'), 0), spct(m('growth'), 0)]);
      out.append(card(`TRADING COMPARABLES · ${r.comps.length} PEERS`, table(['Company', 'Market cap', 'P/E', 'P/S', 'P/FCF', 'Net margin', 'Revenue growth'], rows, (i, j) => i === 0 ? AMBER : i === rows.length - 1 ? '#aeb9b3' : null), note(`At the peer median multiples ${r.sym} would be worth ${usd(r.implied.pe.mid)} on earnings, ${usd(r.implied.ps.mid)} on sales and ${usd(r.implied.pfcf.mid)} on free cash flow. Peers default to the same sector; edit them above.`)));
    } else out.append(note('No peers with SEC data were found for comparables. Add peers above.'));
    if (r.bo) out.append(card('BUYOUT CHECK (SIMPLE LBO)', table(['Item', 'Value'], [['Entry value (25% premium + net debt)', big(r.bo.entryEv)], ['Debt raised (≤ 5× FCF, ≤ 65% of price)', big(r.bo.debt0)], ['Sponsor equity', big(r.bo.equity0)], ['Debt left after 5 years', big(r.bo.debt1)], ['Exit value (same FCF multiple)', big(r.bo.exitEv)], ['Equity multiple', x(r.bo.moic)], ['IRR', pct(r.bo.irr, 1)]], (i, j) => i === 6 && j === 1 ? (r.bo.irr >= 0.2 ? GREEN : r.bo.irr >= 0.12 ? AMBER : RED) : null), note(`Private-equity buyers usually want 20%+ a year. ${r.bo.irr >= 0.2 ? 'At this price a leveraged buyer could make that work, a sign the shares are not expensive.' : r.bo.irr >= 0.12 ? 'A buyer would earn a modest return.' : 'A leveraged buyer could not earn a typical return at this price.'} Base-case cash flows, 8% interest, all spare cash repays debt.`)));
    out.append(card('METHOD', ...['Free cash flow = operating cash flow − capital expenditure, from 10-K XBRL facts on SEC EDGAR. Shares = net income ÷ diluted EPS. Net debt = long-term debt (incl. current portion) − cash.', 'Base case: revenue growth starts at the 3-year average (capped at −5% to 25%) and fades in a straight line to 2.5% by year 10; free-cash-flow margin is the 3-year median; WACC uses CAPM (4.3% risk-free + beta × 5% equity premium, beta from 2 years of daily returns vs the S&P 500, bounded 0.6–2) and 5.5% pre-tax debt cost. Bear: growth −4 pts, margin −15%, WACC +1 pt, 2% terminal growth. Bull: growth +4 pts, margin +10%, WACC −0.75 pt, 3% terminal growth.', 'Reverse DCF solves for the starting growth that makes the base-case value equal the price. Comparables use the latest annual figures and 1-year prices. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      football(ff, r);
      heatmap(sg, {rows: ['−1.0', '−0.5', 'base', '+0.5', '+1.0'], cols: ['1.5%', '2.0%', '2.5%', '3.0%', '3.5%'], cells: r.grid, scale: v => { if (!finite(v)) return '#0b0f0e'; const t = clamp((v / r.price - 1) / 0.5, -1, 1); return t >= 0 ? `rgba(62,207,142,${0.15 + 0.7 * t})` : `rgba(255,90,79,${0.15 + 0.7 * -t})`; }, fmt: v => usd(v), aria: 'DCF sensitivity', title: (v, a, b) => `${usd(v)} per share`});
      const histYears = [...r.pf.years].reverse(), proj = C.base.path, xs = [...histYears.map(y => y.slice(0, 4)), ...proj.map(p => String(+r.pf.year.slice(0, 4) + p.t))];
      lineChart(pc, {series: [{v: [...[...r.pf.fcf].reverse(), ...proj.map(() => NaN)], color: '#e8ecea', width: 1.8, name: 'Reported FCF'}, {v: [...histYears.map((_, i) => i === histYears.length - 1 ? r.pf.fcf[0] : NaN), ...proj.map(p => p.fcf)], color: AMBER, width: 1.8, name: 'Base case'}], xs, yfmt: v => big(v), aria: 'Free cash flow history and projection'});
    });
  }

  /* ============================================= committee maths ============================================= */
  const POS = ['beat', 'beats', 'surge', 'surges', 'soar', 'soars', 'record', 'upgrade', 'upgraded', 'raises', 'raised', 'strong', 'growth', 'profit', 'gain', 'gains', 'jumps', 'jump', 'rally', 'rallies', 'outperform', 'bullish', 'expands', 'wins', 'approval', 'approved', 'partnership', 'boost', 'boosts', 'tops', 'exceeds', 'rises', 'rise', 'higher', 'buyback', 'dividend', 'breakthrough', 'optimistic', 'accelerates'];
  const NEG = ['miss', 'misses', 'missed', 'plunge', 'plunges', 'falls', 'fall', 'drop', 'drops', 'downgrade', 'downgraded', 'cuts', 'cut', 'weak', 'loss', 'losses', 'lawsuit', 'probe', 'investigation', 'recall', 'bearish', 'slump', 'slumps', 'warns', 'warning', 'decline', 'declines', 'layoffs', 'fraud', 'delay', 'delays', 'lower', 'sinks', 'sink', 'tumble', 'tumbles', 'crash', 'concerns', 'fears', 'antitrust', 'fine', 'fined', 'halt', 'halts', 'bankruptcy', 'default', 'slows', 'slowdown'];
  function headlineTone(t) { const w = String(t).toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/); let s = 0; w.forEach((x, i) => { const neg = i > 0 && /^(not|no|never|without)$/.test(w[i - 1]) ? -1 : 1; if (POS.includes(x)) s += neg; else if (NEG.includes(x)) s -= neg; }); return Math.max(-2, Math.min(2, s)); }
  function technicals(B) {
    const c = B.c, n = c.length, last = c[n - 1], sma = k => mean(c.slice(-k)), r = []; for (let i = Math.max(1, n - 252); i < n; i++) r.push(Math.log(c[i] / c[i - 1]));
    const vol = Math.sqrt(mean(r.map(v => v * v)) * 252), m3 = last / c[n - 64] - 1, m12 = c[n - 22] / c[n - 253] - 1, hi = Math.max(...c.slice(-252)), dd = last / hi - 1;
    let g = 0, l = 0; for (let i = n - 14; i < n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    const tr = []; for (let i = n - 14; i < n; i++) tr.push(Math.max(B.h[i] - B.l[i], Math.abs(B.h[i] - c[i - 1]), Math.abs(B.l[i] - c[i - 1])));
    return {last, s50: sma(50), s200: sma(200), vol, m3, m12, dd, rsi, atr: mean(tr), hi};
  }
  function committee(sym, v, B, spy, news) {
    const t = technicals(B), pf = v?.pf, C = v?.sc?.cases, agents = [];
    const agent = (name, role, items) => { const score = clamp(items.reduce((s, i) => s + i[0], 0), -2, 2); agents.push({name, role, score, items}); };
    if (pf) {
      const it = [];
      if (finite(pf.cagr)) it.push([pf.cagr > 0.1 ? 1 : pf.cagr < 0 ? -1 : 0, `Revenue grew ${pct(pf.cagr, 1)} a year over ${Math.min(3, pf.rev.length - 1)} years (${big(pf.rev[0])} in FY${pf.year.slice(0, 4)}).`]);
      if (finite(pf.netMargin)) it.push([pf.netMargin > 0.15 ? 1 : pf.netMargin < 0 ? -1 : 0, `Net margin ${pct(pf.netMargin, 1)}.`]);
      if (finite(pf.fcfMargin)) it.push([pf.fcfMargin > 0.1 ? 0.5 : pf.fcfMargin < 0 ? -1 : 0, `Free-cash-flow margin ${pct(pf.fcfMargin, 1)} (3-year median).`]);
      if (finite(pf.eps) && finite(pf.epsPrev) && pf.epsPrev > 0) it.push([pf.eps > pf.epsPrev * 1.05 ? 0.5 : pf.eps < pf.epsPrev * 0.95 ? -0.5 : 0, `Diluted EPS ${usd(pf.eps)} vs ${usd(pf.epsPrev)} a year earlier.`]);
      if (pf.fcf[0] > 0) it.push([pf.netDebt / pf.fcf[0] > 4 ? -1 : pf.netDebt < 0 ? 0.5 : 0, pf.netDebt < 0 ? `Net cash of ${big(-pf.netDebt)}.` : `Net debt is ${(pf.netDebt / pf.fcf[0]).toFixed(1)}× annual free cash flow.`]);
      agent('Fundamentals analyst', 'SEC 10-K facts', it);
      const up = C.base.perShare / t.last - 1, vi = [[up > 0.2 ? 1.5 : up > 0.05 ? 0.5 : up < -0.3 ? -1.5 : up < -0.1 ? -0.5 : 0, `Base-case DCF ${usd(C.base.perShare)} vs price ${usd(t.last)} (${spct(up, 0)}); bear ${usd(C.bear.perShare)}, bull ${usd(C.bull.perShare)}.`]];
      if (finite(v.sc.implied) && finite(pf.cagr)) vi.push([v.sc.implied > pf.cagr + 0.08 ? -0.5 : v.sc.implied < pf.cagr - 0.03 ? 0.5 : 0, `The price implies ${pct(v.sc.implied, 1)} early revenue growth vs ${pct(pf.cagr, 1)} delivered.`]);
      if (v.comps.length && finite(v.self.pe) && finite(v.med('pe'))) vi.push([v.self.pe < v.med('pe') * 0.85 ? 0.5 : v.self.pe > v.med('pe') * 1.3 ? -0.5 : 0, `P/E ${x(v.self.pe)} vs peer median ${x(v.med('pe'))}.`]);
      agent('Valuation analyst', 'DCF, reverse DCF, peers', vi);
    }
    agent('Technical analyst', 'Trend, momentum, RSI', [
      [t.last > t.s200 ? (t.s50 > t.s200 ? 1 : 0.5) : (t.s50 < t.s200 ? -1 : -0.5), `Price ${t.last > t.s200 ? 'above' : 'below'} its 200-day average (${usd(t.s200)}); 50-day ${t.s50 > t.s200 ? 'above' : 'below'} 200-day.`],
      [t.m12 > 0.15 ? 0.5 : t.m12 < -0.1 ? -0.5 : 0, `12-month momentum (skipping the last month) ${spct(t.m12, 0)}; 3-month ${spct(t.m3, 0)}.`],
      [t.rsi > 75 ? -0.5 : t.rsi < 25 ? 0.5 : 0, `RSI(14) ${t.rsi.toFixed(0)}${t.rsi > 70 ? ', overbought' : t.rsi < 30 ? ', oversold' : ''}.`],
      [t.dd < -0.25 ? -0.5 : 0, `${pct(-t.dd, 0)} below its 52-week high.`]]);
    if (news.length) {
      const tones = news.map(n => headlineTone(n.title)), avg = mean(tones), posN = tones.filter(v => v > 0).length, negN = tones.filter(v => v < 0).length;
      agent('News analyst', 'headline tone from finance word lists', [[avg > 0.4 ? 1 : avg < -0.4 ? -1 : 0, `${news.length} recent headlines: ${posN} positive, ${negN} negative, ${news.length - posN - negN} neutral by finance word lists.`]]);
    }
    if (spy) { const s = technicals(spy); agent('Market analyst', 'S&P 500 backdrop', [[s.last > s.s200 ? 0.5 : -0.5, `S&P 500 ${s.last > s.s200 ? 'above' : 'below'} its 200-day average.`], [s.vol > 0.25 ? -0.5 : 0, `Market volatility ${pct(s.vol, 0)} a year${s.vol > 0.25 ? ', elevated' : ''}.`]]); }
    const W = {'Fundamentals analyst': 1, 'Valuation analyst': 1.2, 'Technical analyst': 0.9, 'News analyst': 0.5, 'Market analyst': 0.6};
    const wsum = agents.reduce((s, a) => s + (W[a.name] || 1), 0), score = agents.reduce((s, a) => s + a.score * (W[a.name] || 1), 0) / wsum;
    const pros = agents.flatMap(a => a.items.filter(i => i[0] > 0).map(i => [i[0], i[1], a.name])).sort((a, b) => b[0] - a[0]);
    const cons = agents.flatMap(a => a.items.filter(i => i[0] < 0).map(i => [i[0], i[1], a.name])).sort((a, b) => a[0] - b[0]);
    const decision = score > 0.6 ? 'BUY' : score > 0.2 ? 'ACCUMULATE' : score < -0.6 ? 'SELL' : score < -0.2 ? 'REDUCE' : 'HOLD';
    const sizes = [['Aggressive', 0.25, 0.1], ['Neutral', 0.15, 0.06], ['Conservative', 0.08, 0.03]].map(([n, tv, cap]) => ({name: n, size: Math.min(cap, tv / Math.max(0.1, t.vol) * 0.25), stop: t.last - 2 * t.atr * (n === 'Aggressive' ? 1.5 : n === 'Neutral' ? 1 : 0.75)}));
    const conviction = Math.min(1, Math.abs(score) / 1.2) * (agents.filter(a => Math.sign(a.score) === Math.sign(score) && a.score).length / agents.length);
    return {t, agents, score, pros, cons, decision, sizes, conviction};
  }
  function memoText(sym, name, cm, v, news) {
    const L = [], n = new Date().toISOString().slice(0, 10), sz = cm.sizes[1];
    L.push(`INVESTMENT COMMITTEE MEMO · ${sym} · ${n}`, `${name}`, '', `DECISION: ${cm.decision}  (committee score ${cm.score >= 0 ? '+' : ''}${cm.score.toFixed(2)} on −2…+2, conviction ${pct(cm.conviction, 0)})`, `Position (neutral risk): ${pct(sz.size, 1)} of portfolio · stop ${usd(sz.stop)} · price ${usd(cm.t.last)}`, '');
    L.push('ANALYST SCORES'); cm.agents.forEach(a => L.push(`- ${a.name} (${a.role}): ${a.score >= 0 ? '+' : ''}${a.score.toFixed(1)}`)); L.push('');
    L.push('BULL CASE'); (cm.pros.slice(0, 4).length ? cm.pros.slice(0, 4) : [[0, 'No strong positives found.']]).forEach((p, i) => L.push(`${i + 1}. ${p[1]}`)); L.push('');
    L.push('BEAR CASE'); (cm.cons.slice(0, 4).length ? cm.cons.slice(0, 4) : [[0, 'No strong negatives found.']]).forEach((p, i) => L.push(`${i + 1}. ${p[1]}`)); L.push('');
    if (v) { const C = v.sc.cases; L.push('VALUATION', `DCF per share: bear ${usd(C.bear.perShare)} · base ${usd(C.base.perShare)} · bull ${usd(C.bull.perShare)} · WACC ${pct(v.sc.wacc, 1)}`, finite(v.sc.implied) ? `Price implies ${pct(v.sc.implied, 1)} early revenue growth vs ${pct(v.pf.cagr, 1)} historical.` : '', ''); }
    L.push('RISK TEAM'); cm.sizes.forEach(s => L.push(`- ${s.name}: ${pct(s.size, 1)} of portfolio, stop ${usd(s.stop)}`)); L.push(`Volatility ${pct(cm.t.vol, 0)} a year; ATR(14) ${usd(cm.t.atr)}.`, '');
    if (news.length) { L.push('RECENT HEADLINES (summarised by source)'); news.slice(0, 5).forEach(x => L.push(`- ${x.publisher || 'Source'}: ${x.title}`)); L.push(''); }
    L.push('Rules-based research summary generated by the FYNX Terminal from SEC EDGAR filings, Yahoo Finance prices and headlines. Not investment advice.');
    return L.filter(l => l !== undefined).join('\n');
  }

  /* ============================================= committee page ============================================= */
  const CV = (() => { let s = {}; try { s = JSON.parse(store.get('committee') || '{}') || {}; } catch (_) {} return {sym: SYM_RE.test(s.sym || '') ? s.sym : 'MSFT'}; })();
  const saveC = () => store.set('committee', JSON.stringify(CV));
  async function committeeRun(sym) {
    const [vr, B, spy, nr] = await Promise.allSettled([valueGet(sym, []), loadBars(sym, '1d'), loadBars('SPY', '1d'), T.fnMarket({op: 'search', q: sym})]);
    if (B.status !== 'fulfilled' || !B.value?.c || B.value.c.length < 260) throw new Error(`Not enough price history for ${sym}.`);
    const v = vr.status === 'fulfilled' ? vr.value : null, news = nr.status === 'fulfilled' ? (nr.value.news || []).filter(n => n.title).slice(0, 10) : [];
    const cm = committee(sym, v, B.value, spy.status === 'fulfilled' ? spy.value : null, news);
    return {sym, v, B: B.value, news, cm, name: v?.pf?.name || B.value.name || sym, valueError: vr.status === 'rejected' ? vr.reason?.message : null};
  }
  const committeeGet = sym => cached('committee|' + sym, () => committeeRun(sym));
  const DCOL = {BUY: GREEN, ACCUMULATE: GREEN, HOLD: AMBER, REDUCE: RED, SELL: RED};
  async function renderCommitteePanel() {
    const host = panel('committee'); empty(host, `The committee is reviewing ${CV.sym}…`);
    let r; try { r = await committeeGet(CV.sym); } catch (e) { report('committee', e); return empty(host, e.message); }
    if (!$('tp-committee')) return; host.replaceChildren(); setText('n-committee', `${CV.sym} · ${r.cm.decision.toLowerCase()}`);
    const w = el('div', 'fx-ql'); host.append(w);
    kpis(w, [['DECISION', r.cm.decision, `score ${r.cm.score >= 0 ? '+' : ''}${r.cm.score.toFixed(2)}`, DCOL[r.cm.decision]], ['CONVICTION', pct(r.cm.conviction, 0), `${r.cm.agents.length} analysts`], ['SIZE (NEUTRAL)', pct(r.cm.sizes[1].size, 1), `stop ${usd(r.cm.sizes[1].stop)}`]]);
    const g = el('div', 'fx-an-agents'); r.cm.agents.forEach(a => { const c = el('div', 'fx-an-agent'), h = el('h4'); c.style.setProperty('--c', a.score > 0.25 ? GREEN : a.score < -0.25 ? RED : GREY); h.append(a.name, el('b', '', (a.score >= 0 ? '+' : '') + a.score.toFixed(1))); c.append(h); g.append(c); }); w.append(g);
  }
  async function renderCommittee(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { CV.sym = String(arg).toUpperCase(); saveC(); }
    PG.setHead('COMMITTEE', 'AI investment committee', 'Analysts score the stock with evidence, bull and bear researchers argue, the risk team sizes it, the portfolio manager decides and writes the memo');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap); const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'STOCK UNDER REVIEW'));
    ic.append(symbolBox(CV.sym, s => { CV.sym = s; saveC(); rerun(); }, 'US stock: MSFT, NVDA, AAPL, JPM'));
    ic.append(chips([['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AAPL', 'Apple'], ['AMZN', 'Amazon'], ['META', 'Meta'], ['JPM', 'JPMorgan'], ['XOM', 'Exxon'], ['TSLA', 'Tesla']], CV.sym, s => { CV.sym = s; saveC(); rerun(); }));
    wrap.append(ic);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note(`Five analysts are reading ${CV.sym}’s filings, prices and headlines…`));
    let r; try { r = await committeeGet(CV.sym); } catch (e) { report('committee', e); return out.replaceChildren(el('div', 'fx-sl-err', e.message || 'Data unavailable.')); }
    if (!out.isConnected) return; out.replaceChildren();
    const cm = r.cm, col = DCOL[cm.decision];
    const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', 'COMMITTEE: ' + cm.decision); s0.style.color = col;
    hd.append(s0, el('span', 'fx-ql-sub', `${r.name}: weighted score ${cm.score >= 0 ? '+' : ''}${cm.score.toFixed(2)} on a −2 to +2 scale from ${cm.agents.length} analysts, conviction ${pct(cm.conviction, 0)}.${r.valueError ? ' Fundamentals unavailable: ' + r.valueError : ''}`)); out.append(hd);
    kpis(out, [['DECISION', cm.decision, `conviction ${pct(cm.conviction, 0)}`, col], ...cm.sizes.map(s => [s.name.toUpperCase() + ' SIZE', pct(s.size, 1), `stop ${usd(s.stop)}`]), ['PRICE', usd(cm.t.last), `vol ${pct(cm.t.vol, 0)}/yr · ATR ${usd(cm.t.atr)}`]]);
    const ag = el('div', 'fx-an-agents');
    cm.agents.forEach(a => { const c = el('div', 'fx-an-agent'), h = el('h4'), ul = el('ul'); c.style.setProperty('--c', a.score > 0.25 ? GREEN : a.score < -0.25 ? RED : GREY); h.append(a.name.toUpperCase(), el('b', '', (a.score >= 0 ? '+' : '') + a.score.toFixed(1))); a.items.forEach(i => { const li = el('li', '', i[1]); if (i[0] > 0) li.style.color = '#bfeedd'; if (i[0] < 0) li.style.color = '#ffc9c4'; ul.append(li); }); c.append(h, el('small', '', a.role), ul); ag.append(c); });
    out.append(card('1 · ANALYST TEAM', ag));
    const db = el('div', 'fx-an-debate'), bull = el('div', 'fx-an-side'), bear = el('div', 'fx-an-side'), ob = el('ol'), oe = el('ol');
    bull.append(el('h4', '', 'BULL RESEARCHER'), ob); bull.firstChild.style.color = GREEN; bear.append(el('h4', '', 'BEAR RESEARCHER'), oe); bear.firstChild.style.color = RED;
    (cm.pros.length ? cm.pros.slice(0, 5) : [[0, 'Finds no strong positive in the evidence.', '']]).forEach(p => ob.append(el('li', '', p[1] + (p[2] ? ` (${p[2].split(' ')[0]})` : ''))));
    (cm.cons.length ? cm.cons.slice(0, 5) : [[0, 'Finds no strong negative in the evidence.', '']]).forEach(p => oe.append(el('li', '', p[1] + (p[2] ? ` (${p[2].split(' ')[0]})` : ''))));
    db.append(bull, bear); out.append(card('2 · BULL VS BEAR DEBATE', db, note(!cm.cons.length ? `The bull side brings ${cm.pros.length} supporting points and the bear researcher found no negative evidence, which itself deserves scepticism: check what the data cannot see.` : !cm.pros.length ? `The bear side brings ${cm.cons.length} points and the bull researcher found no positive evidence.` : cm.pros.length >= cm.cons.length ? `The bull side brings ${cm.pros.length} supporting points against ${cm.cons.length}. The strongest bear point: “${cm.cons[0][1]}”` : `The bear side brings ${cm.cons.length} points against ${cm.pros.length}. The strongest bull point: “${cm.pros[0][1]}”`)));
    out.append(card('3 · RISK TEAM', table(['Risk profile', 'Position size', 'Stop', 'Loss at stop'], cm.sizes.map(s => [s.name, pct(s.size, 1) + ' of portfolio', usd(s.stop), pct(s.size * (1 - s.stop / cm.t.last), 2) + ' of portfolio'])), note('Size targets a share of portfolio risk from the stock’s own volatility (25%, 15% or 8% volatility budgets, capped at 10%, 6% and 3%). Stops are 1.5, 1 and 0.75 × 2 ATR below the price.')));
    if (r.news.length) { const ul = el('ul', 'fx-an-news'); r.news.slice(0, 8).forEach(n => { const tone = headlineTone(n.title), li = el('li'); li.append(el('span', '', n.title), el('small', '', ` · ${n.publisher || 'source'}${n.publishedAt ? ' · ' + n.publishedAt.slice(0, 10) : ''} · tone ${tone > 0 ? '+' : ''}${tone}`)); if (tone > 0) li.style.color = '#bfeedd'; if (tone < 0) li.style.color = '#ffc9c4'; ul.append(li); }); out.append(card('HEADLINES THE NEWS ANALYST READ (SUMMARISED HERE, SOURCE NAMED)', ul)); }
    const memo = memoText(r.sym, r.name, cm, r.v, r.news), pre = el('div', 'fx-an-memo', memo), row = el('div', 'fx-ql-row');
    T.lastMemo = {sym: r.sym, text: memo};
    row.append(btn('Copy memo', 'fx-ql-btn pri', async () => { try { await navigator.clipboard.writeText(memo); T.say?.('Memo copied.'); } catch (_) { T.say?.('Copy failed: select the text instead.'); } }), btn('Download .txt', 'fx-ql-btn', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([memo], {type: 'text/plain'})); a.download = `${r.sym}-committee-memo.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }), btn('Full valuation ▸', 'fx-ql-btn', () => T.openPage('value', r.sym)), btn('Compliance check ▸', 'fx-ql-btn', () => T.openPage('comply')));
    out.append(card('4 · PORTFOLIO MANAGER · INVESTMENT COMMITTEE MEMO', row, pre));
    out.append(card('HOW THE COMMITTEE WORKS', ...['Inspired by multi-agent research frameworks such as TradingAgents, where specialist agents analyse, debate and hand off to a trader and a risk team. Here every agent is a transparent rule set, so each score can be traced to the evidence listed under it; no language model invents facts.', 'Weights: valuation 1.2, fundamentals 1.0, technicals 0.9, market 0.6, news 0.5. Decision: above +0.6 buy, above +0.2 accumulate, below −0.2 reduce, below −0.6 sell, otherwise hold. Conviction falls when the analysts disagree.', 'Not backtested as a whole (fundamental data is not point-in-time). Test the technical rules in BTEST. Not advice.'].map(note)));
  }

  /* ------------------------------------------------ register ------------------------------------------------ */
  T.PANELS.committee = ['COMMITTEE', 'AI investment committee', 'committee']; T.PANEL_DESC.committee = 'Analysts, bull/bear debate, risk team, memo'; T.LINK_LABEL.committee = 'Full'; T.RENDER.committee = renderCommitteePanel;
  if (PG) {
    for (const [n, cat, label, page] of [['value', 'analysis', 'Valuation workbench', renderValue], ['dcf', 'analysis', 'Valuation workbench', renderValue], ['comps', 'analysis', 'Valuation workbench', renderValue], ['committee', 'ai', 'AI investment committee', renderCommittee], ['memo', 'ai', 'AI investment committee', renderCommittee], ['agents', 'ai', 'AI investment committee', renderCommittee]]) { T.premium?.(n, cat, label, [n === 'value' || n === 'dcf' || n === 'comps' ? 'value' : 'committee']); PG.add(n, label, page); }
    T.PAGE_NAMES.push('VALUE', 'DCF', 'COMPS', 'COMMITTEE', 'MEMO', 'AGENTS');
  }
  const grp = T.EXTRA_GROUPS.find(g => g[0] === 'AI lab'); if (grp) grp[1].push('committee'); else T.EXTRA_GROUPS.push(['AI lab', ['committee']]);
  T.Analyst = {profile, dcf, customDcf, impliedGrowth, lbo, scenarios, betaOf, headlineTone, technicals, committee, memoText};
});
