/* FYNX Terminal plugin: EARNINGS. An earnings preview and event study built from public filings:
 * - every 8-K that reported results (SEC Item 2.02) over the last two years, placed in the right trading session;
 * - the tone of each press release (finance word counts) and whether guidance was raised, lowered or maintained;
 * - quarterly diluted EPS from XBRL with the year-earlier quarter, and consensus beats and misses where Nasdaq answers;
 * - how the stock reacted: abnormal return against the S&P 500 on the reaction day, over three days and the drift after;
 * - the next report from the earnings calendar with the consensus, and the move the options market is pricing.
 * Company text is never shown; only counts and FYNX's own summary. Not advice. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, store, empty, finite, report} = T;
  const QL = T.QuantLab, QR = T.QuantResearch;
  if (!QL || !QR) return;
  const {kpis} = QL;
  const {loadBars} = QR;
  const {frame, label, lineChart, card, chartBox, note, chips, symbolBox} = QR.ui;
  const GREEN = '#3ecf8e', RED = '#ff5a4f', AMBER = '#ffb000', BLUE = '#5b8def', GREY = '#7d8a83';
  const SYM_RE = /^[A-Z][A-Z.\-]{0,9}$/;
  const pct = (v, d = 1) => finite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const spct = (v, d = 1) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—';
  const usd = v => finite(v) ? (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2) : '—';
  const mean = a => { const s = a.filter(finite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN; };
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  // Same read-only research service on two routes (Cloud Function, then the Vercel copy), as the Research desk uses.
  const RES = local ? ['/api/research'] : ['https://us-central1-fynx-c7a28.cloudfunctions.net/webResearchData', /(^|\.)vercel\.app$/.test(location.hostname) ? '/fn/research.js' : 'https://fynxfinanceworld.vercel.app/fn/research.js'];
  async function fetchEarnings(cik, sym) {
    let last = null;
    for (const base of RES) { try { const d = await T.getJSON(`${base}?action=earnings&cik=${cik}&symbol=${encodeURIComponent(sym)}`, {timeout: 60000}); if (d?.releases) return d; } catch (e) { last = e; report('earnings', e); } }
    throw new Error(last && /HTTP 400/.test(last.message) && RES.length === 1 ? 'That company could not be read from SEC EDGAR.' : 'Earnings filings are unavailable right now. Try again shortly.');
  }
  const fmtDay = d => { const x = new Date(d + 'T12:00:00Z'); return x.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'}); };
  const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length); o.forEach(([, i], k) => { r[i] = k; }); return r; };
  const spearman = (x, y) => { const n = x.length; if (n < 4) return NaN; const rx = rank(x), ry = rank(y); let d = 0; for (let i = 0; i < n; i++) d += (rx[i] - ry[i]) ** 2; return 1 - 6 * d / (n * (n * n - 1)); };

  /* -------------------------------------------- analysis -------------------------------------------- */
  // Place each release on its reaction day and measure abnormal returns against the S&P 500.
  function study(d, B, SPY) {
    const spy = new Map(SPY.day.map((x, i) => [x, i])), N = B.c.length;
    const ar = i => { const j = spy.get(B.day[i]); return i > 0 && j > 0 ? Math.log(B.c[i] / B.c[i - 1]) - Math.log(SPY.c[j] / SPY.c[j - 1]) : NaN; };
    const rows = [];
    for (const r of d.releases || []) {
      let i0 = B.day.findIndex(x => r.session === 'after close' ? x > r.filed : x >= r.filed);
      if (i0 < 22) continue;
      const sum = (a, b) => { let s = 0; for (let k = a; k <= b; k++) { const v = ar(k); if (!finite(v)) return NaN; s += v; } return s; };
      const path = []; let c = 0; for (let t = -5; t <= 10; t++) { const k = i0 + t; if (k >= N || k < 1) { path.push(NaN); continue; } const v = ar(k); c += finite(v) ? v : 0; path.push(c); }
      const vAvg = B.v ? mean(B.v.slice(i0 - 21, i0 - 1)) : NaN;
      const sp = (d.surprises || []).find(s => Math.abs(Date.parse(s.date) - Date.parse(r.filed)) <= 4 * 86400000);
      rows.push({...r, i0, day: B.day[i0], raw: Math.log(B.c[i0] / B.c[i0 - 1]), react: ar(i0), car3: i0 + 1 < N ? sum(i0 - 1, i0 + 1) : NaN, drift: i0 + 10 < N ? sum(i0 + 1, i0 + 10) : NaN, volx: vAvg > 0 ? B.v[i0] / vAvg : NaN, path, surprise: sp || null});
    }
    rows.sort((a, b) => a.filed.localeCompare(b.filed));
    const withTone = rows.filter(r => r.tone && finite(r.react));
    const beats = rows.filter(r => r.surprise && finite(r.surprise.surprisePct)), beatN = beats.filter(r => r.surprise.surprisePct > 0).length;
    const avgPath = Array.from({length: 16}, (_, t) => mean(rows.map(r => r.path[t])));
    const group = f => { const g = rows.filter(f); return g.length >= 2 ? Array.from({length: 16}, (_, t) => mean(g.map(r => r.path[t]))) : null; };
    const skip = new Set(); rows.forEach(r => { for (let k = r.i0 - 1; k <= r.i0 + 1; k++) skip.add(k); });
    const nr = []; for (let i = Math.max(1, N - 250); i < N; i++) if (!skip.has(i)) { const x = Math.log(B.c[i] / B.c[i - 1]); if (finite(x)) nr.push(x); }
    const nm = mean(nr), normalVol = nr.length > 40 ? Math.sqrt(nr.reduce((q, x) => q + (x - nm) ** 2, 0) / (nr.length - 1)) : NaN;
    return {normalVol, rows, avgMove: mean(rows.map(r => Math.abs(r.raw))), avgAbn: mean(rows.map(r => Math.abs(r.react))), ups: rows.filter(r => r.raw > 0).length,
      avgPath, pathPos: group(r => r.tone && r.tone.tone > 0.2), pathNeg: group(r => r.tone && r.tone.tone <= 0.2),
      rho: spearman(withTone.map(r => r.tone.tone), withTone.map(r => r.react)), rhoN: withTone.length,
      beats: beats.length, beatN, beatReact: mean(beats.filter(r => r.surprise.surprisePct > 0).map(r => r.react)), missReact: mean(beats.filter(r => r.surprise.surprisePct <= 0).map(r => r.react))};
  }
  function upcoming(sym, rows) {
    const ev = (T.S.earn?.events || []).find(e => e.symbol === sym || e.symbol === sym.replace('-', '.'));
    if (ev) return {date: ev.date, time: ev.time, confirmed: true, eps: ev.epsForecast, ests: ev.estimates, lastYear: ev.lastYearEPS, quarter: ev.fiscalQuarter};
    if (rows.length >= 2) { const gaps = rows.slice(1).map((r, i) => (Date.parse(r.filed) - Date.parse(rows[i].filed)) / 86400000).sort((a, b) => a - b), g = gaps[Math.floor(gaps.length / 2)], last = rows[rows.length - 1].filed; let t = Date.parse(last) + g * 86400000; while (t < Date.now()) t += g * 86400000; const wd = new Date(t).getUTCDay(); if (wd === 6) t += 2 * 86400000; else if (wd === 0) t += 86400000; return {date: new Date(t).toISOString().slice(0, 10), confirmed: false}; }
    return null;
  }
  // A straddle that expires after the report prices the report plus every ordinary day until expiry. The ordinary part is
  // taken out using the last expiry before the report (same volatility per day) or, failing that, the stock's own
  // volatility on non-earnings days, leaving the move priced for the report itself (straddle ÷ price ≈ expected |move|).
  function impliedMove(sym, next, normalVol) {
    const u = T.S.opts?.underlyings?.[sym]; if (!u || !next?.date) return u ? {post: null, beyond: false, asOf: T.S.opts.generatedAt} : null;
    const ex = u.expiries.filter(x => finite(x.movePercent) && x.dte >= 1), after = /after/i.test(next.time || '');
    const post = ex.find(x => after ? x.date > next.date : x.date >= next.date), pre = [...ex].reverse().find(x => after ? x.date <= next.date : x.date < next.date);
    if (!post) return {post: null, beyond: ex.length > 0 && ex[ex.length - 1].date < next.date, last: ex[ex.length - 1]?.date, asOf: T.S.opts.generatedAt};
    const m2 = post.movePercent / 100, td = d => Math.max(1, Math.round(d * 252 / 365));
    let ord = NaN, method = 'raw';
    if (pre) { ord = (pre.movePercent / 100) ** 2 * post.dte / pre.dte; method = 'pre'; }
    else if (finite(normalVol)) { ord = 0.64 * normalVol ** 2 * Math.max(0, td(post.dte) - 1); method = 'history'; }
    const ev = finite(ord) ? Math.sqrt(Math.max(0, m2 * m2 - ord)) : m2;
    return {post: {date: post.date, dte: post.dte, raw: m2, move: ev, method, pre: pre?.date}, beyond: false, asOf: T.S.opts.generatedAt};
  }
  const imSub = o => o?.post ? `report only: ${o.post.date} straddle ±${pct(o.post.raw, 1)}${o.post.method === 'pre' ? ` less the ${o.post.pre} expiry` : o.post.method === 'history' ? ' less normal days' : ''}` : o?.beyond ? `report falls after the last listed expiry (${o.last})` : o ? 'no expiry covers the report' : 'not in the options snapshot';
  const memo = new Map();
  async function run(sym) {
    const dir = await T.loadDirectory(), co = dir.find(c => c.symbol === sym || c.symbol === sym.replace('-', '.'));
    if (!co) throw new Error(`${sym} is not a US-listed company with SEC filings (funds, ADRs filing 6-K and indexes are not covered).`);
    const [d, B, SPY] = await Promise.all([fetchEarnings(co.cik, sym), loadBars(sym, '1d'), loadBars('SPY', '1d')]);
    if (!d?.releases) throw new Error('Earnings filings are unavailable right now. Try again shortly.');
    if (!B?.c || B.c.length < 260) throw new Error(`Not enough price history for ${sym}.`);
    return {sym, d, B, s: study(d, B, SPY), name: d.name || co.name};
  }
  // The calendar and option snapshots refresh on their own schedule, so the next date and implied move are read at render time.
  async function get(sym) { if (!memo.has(sym)) memo.set(sym, run(sym).catch(e => { memo.delete(sym); throw e; })); const r = await memo.get(sym), next = upcoming(sym, r.s.rows); return {...r, next, opt: impliedMove(sym, next, r.s.normalVol)}; }

  /* ------------------------------------------------ charts ------------------------------------------------ */
  function barsChart(box, rows) {
    const {w, h, s} = frame(box, 'Reaction to each release', 240), pl = 44, pr = 8, pt = 10, pb = 30, iw = w - pl - pr, ih = h - pt - pb, vals = rows.map(r => r.react);
    const hi = Math.max(0.02, ...vals.filter(finite).map(Math.abs)) * 1.15, Y = v => pt + (hi - v) / (2 * hi) * ih, bw = iw / Math.max(1, rows.length), step = Math.max(1, Math.ceil(46 / bw));
    for (const v of [-hi, 0, hi]) { s.append(svg('line', {x1: pl, x2: w - pr, y1: Y(v), y2: Y(v), stroke: v ? '#1b2421' : '#3a4641'})); label(s, pl - 4, Y(v) + 3, spct(v, 0), {'text-anchor': 'end'}); }
    rows.forEach((r, i) => { if (!finite(r.react)) return; const x = pl + i * bw, col = r.surprise ? (r.surprise.surprisePct > 0 ? GREEN : RED) : r.tone ? (r.tone.tone > 0.2 ? GREEN : r.tone.tone < -0.2 ? RED : AMBER) : GREY; const rect = svg('rect', {x: x + bw * 0.2, y: Math.min(Y(r.react), Y(0)), width: bw * 0.6, height: Math.max(1, Math.abs(Y(r.react) - Y(0))), fill: col, 'fill-opacity': 0.85}); const t = svg('title'); t.textContent = `${r.day}: ${spct(r.react)} vs the S&P 500`; rect.append(t); s.append(rect); if ((rows.length - 1 - i) % step === 0) label(s, x + bw / 2, h - 12, new Date(r.day + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', year: '2-digit', timeZone: 'UTC'}), {'text-anchor': 'middle'}); });
    box.replaceChildren(s);
  }

  /* ------------------------------------------------- page ------------------------------------------------- */
  const EV = (() => { let s = {}; try { s = JSON.parse(store.get('earnings') || '{}') || {}; } catch (_) {} return {sym: SYM_RE.test(s.sym || '') ? s.sym : 'AAPL'}; })();
  const save = () => store.set('earnings', JSON.stringify(EV));
  async function renderPanel() {
    const host = panel('earnprev'); empty(host, `Reading ${EV.sym}’s earnings filings…`);
    let r; try { r = await get(EV.sym); } catch (e) { report('earnings', e); return empty(host, e.message); }
    if (!$('tp-earnprev')) return; host.replaceChildren(); setText('n-earnprev', `${EV.sym} · ${r.next ? fmtDay(r.next.date) : 'no date'}`);
    const w = el('div', 'fx-ql'); host.append(w);
    kpis(w, [['NEXT REPORT', r.next ? fmtDay(r.next.date) : '—', r.next ? (r.next.confirmed ? r.next.time || 'scheduled' : 'estimated') : 'not scheduled'], ['OPTIONS PRICE', r.opt?.post ? '±' + pct(r.opt.post.move, 1) : '—', r.opt?.post ? 'move priced for the report' : r.opt?.beyond ? 'report after listed expiries' : 'not available'], ['PAST AVERAGE', '±' + pct(r.s.avgMove, 1), `${r.s.rows.length} releases`]]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb); requestAnimationFrame(() => barsChart(cb, r.s.rows));
  }
  async function renderPage(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { EV.sym = String(arg).toUpperCase(); save(); }
    PG.setHead('EARNINGS', 'Earnings preview and event study', 'Release tone, EPS history, consensus beats and misses, the move options are pricing and how the stock really reacted, from SEC filings');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap); const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'COMPANY'));
    ic.append(symbolBox(EV.sym, s => { EV.sym = s; save(); rerun(); }, 'US stock: AAPL, NVDA, JPM, NKE'));
    const soon = (T.S.earn?.events || []).filter(e => e.marketCap > 5e10).slice(0, 6).map(e => [e.symbol, `${e.symbol} · ${e.date.slice(5)}`]);
    ic.append(chips(soon.length ? soon : [['AAPL', 'Apple'], ['NVDA', 'Nvidia'], ['MSFT', 'Microsoft'], ['JPM', 'JPMorgan'], ['NKE', 'Nike'], ['COST', 'Costco']], EV.sym, s => { EV.sym = s; save(); rerun(); }));
    wrap.append(ic);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note(`Reading two years of ${EV.sym} earnings releases from SEC EDGAR (about 10 seconds the first time)…`));
    let r; try { r = await get(EV.sym); } catch (e) { report('earnings', e); return out.replaceChildren(el('div', 'fx-sl-err', e.message || 'Earnings data unavailable.')); }
    if (!out.isConnected) return; out.replaceChildren();
    const S = r.s, n = r.next, last = S.rows[S.rows.length - 1], im = r.opt?.post?.move, rich = finite(im) && finite(S.avgMove) ? im / S.avgMove : NaN;
    const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', n ? `NEXT EARNINGS ${fmtDay(n.date).toUpperCase()}` : 'NO REPORT SCHEDULED'); s0.style.color = AMBER;
    hd.append(s0, el('span', 'fx-ql-sub', `${r.name}${n ? ` · ${n.confirmed ? (n.time || 'time not set') + (n.quarter ? ' · quarter ending ' + n.quarter : '') : 'date estimated from the usual reporting rhythm'}` : ''} · ${S.rows.length} past releases studied.`)); out.append(hd);
    const growth = n && finite(n.eps) && finite(n.lastYear) && n.lastYear ? (n.eps - n.lastYear) / Math.abs(n.lastYear) : NaN;
    kpis(out, [
      ['CONSENSUS EPS', n && finite(n.eps) ? usd(n.eps) : '—', n && finite(n.lastYear) ? `year ago ${usd(n.lastYear)} · ${spct(growth, 0)}${n.ests ? ' · ' + n.ests + ' estimates' : ''}` : 'not available'],
      ['OPTIONS-IMPLIED MOVE', finite(im) ? '±' + pct(im, 1) : '—', imSub(r.opt), AMBER],
      ['AVERAGE PAST MOVE', '±' + pct(S.avgMove, 1), `up after ${S.ups} of ${S.rows.length} · vs market ±${pct(S.avgAbn, 1)}`],
      ['OPTIONS VS HISTORY', finite(rich) ? rich.toFixed(2) + '×' : '—', finite(rich) ? (rich > 1.2 ? 'options look rich' : rich < 0.8 ? 'options look cheap' : 'in line') : '', finite(rich) ? (rich > 1.2 ? RED : rich < 0.8 ? GREEN : null) : null],
      ['BEAT RATE', S.beats ? `${S.beatN} / ${S.beats}` : '—', S.beats ? `after beats ${spct(S.beatReact)} · after misses ${spct(S.missReact)}` : 'consensus history unavailable'],
      ['LAST RELEASE TONE', last?.tone ? (last.tone.tone >= 0 ? '+' : '') + last.tone.tone.toFixed(2) : '—', last?.tone ? `guidance ${last.tone.guidance} · ${fmtDay(last.filed)}` : 'press release not read', last?.tone ? (last.tone.tone > 0.2 ? GREEN : last.tone.tone < -0.2 ? RED : AMBER) : null]]);
    const prevTones = S.rows.slice(0, -1).filter(x => x.tone).map(x => x.tone.tone), toneTrend = last?.tone && prevTones.length ? last.tone.tone - mean(prevTones) : NaN;
    const v = el('div', 'fx-ql-verdict'); v.style.borderColor = AMBER;
    v.textContent = `${finite(im) ? `Options are pricing a move of about ±${pct(im, 1)} through the report, ${finite(rich) ? (rich > 1.2 ? 'more than' : rich < 0.8 ? 'less than' : 'close to') : ''} the ±${pct(S.avgMove, 1)} the stock has moved on average on its last ${S.rows.length} reaction days. ` : `The stock has moved ±${pct(S.avgMove, 1)} on average on its last ${S.rows.length} reaction days. `}${S.beats ? `It beat the consensus ${S.beatN} of ${S.beats} times; ` : ''}${finite(toneTrend) ? `the last press release was ${toneTrend > 0.1 ? 'more upbeat' : toneTrend < -0.1 ? 'more cautious' : 'about as upbeat'} than the ones before, with guidance ${last.tone.guidance}. ` : ''}${finite(S.rho) ? `Across releases, a more positive tone went with ${S.rho > 0.3 ? 'better' : S.rho < -0.3 ? 'worse' : 'no consistently different'} reactions (rank correlation ${S.rho.toFixed(2)}, ${S.rhoN} releases, too few to rely on). ` : ''}A move after earnings depends on guidance and expectations more than the headline number.`;
    out.append(v);
    const two = el('div', 'fx-qr-two'); out.append(two);
    const ec = chartBox(260), bc = chartBox(260);
    two.append(card('EVENT STUDY · AVERAGE RETURN VS THE S&P 500 FROM 5 DAYS BEFORE TO 10 AFTER', ec, note('Day 0 is the first session after the release (the next day for after-close reports); the shaded band is days −1 to +1. Green: upbeat releases; red: neutral or cautious ones, when both groups exist.')), card('REACTION-DAY RETURN VS THE S&P 500 · GREEN BEAT / RED MISS (OR TONE)', bc));
    const t = el('table', 'fx-ql-tbl'), hr = el('tr'); t.style.whiteSpace = 'nowrap'; ['Release', 'Session', 'Quarter EPS', 'vs year ago', 'Consensus', 'Tone', 'Guidance', 'Reaction', '3 days', 'Next 10 days', 'Volume'].forEach(x => hr.append(el('th', '', x))); t.append(hr);
    for (const x of [...S.rows].reverse()) {
      const tr = el('tr'), c = (txt, col) => { const td = el('td', '', txt); if (col) td.style.color = col; return td; }, tone = x.tone?.tone;
      tr.append(c(fmtDay(x.filed)), c(x.session), c(x.eps ? usd(x.eps.eps) : '—'), c(x.eps && finite(x.eps.yoy) ? spct(x.eps.yoy, 0) : '—', x.eps && finite(x.eps.yoy) ? (x.eps.yoy >= 0 ? GREEN : RED) : null),
        c(x.surprise && finite(x.surprise.consensus) ? `${usd(x.surprise.consensus)} (${x.surprise.surprisePct >= 0 ? 'beat' : 'miss'} ${Math.abs(x.surprise.surprisePct).toFixed(1)}%)` : '—', x.surprise ? (x.surprise.surprisePct > 0 ? GREEN : RED) : null),
        c(finite(tone) ? (tone >= 0 ? '+' : '') + tone.toFixed(2) : '—', finite(tone) ? (tone > 0.2 ? GREEN : tone < -0.2 ? RED : AMBER) : null), c(x.tone?.guidance || '—', x.tone?.guidance === 'raised' ? GREEN : x.tone?.guidance === 'lowered' ? RED : null),
        c(spct(x.react), x.react >= 0 ? GREEN : RED), c(spct(x.car3)), c(spct(x.drift)), c(finite(x.volx) ? x.volx.toFixed(1) + '×' : '—'));
      t.append(tr);
    }
    const tw = el('div'); tw.style.cssText = 'overflow:auto;max-height:360px'; tw.append(t);
    out.append(card('RELEASE HISTORY (SEC 8-K ITEM 2.02) · RETURNS ARE ABNORMAL: STOCK MINUS S&P 500', tw));
    out.append(card('HOW IT WORKS', ...[`Releases: every 8-K reporting Item 2.02 (results of operations) in the last two years from SEC EDGAR, with the SEC acceptance time, so after-close reports are measured on the next session. Tone: the Exhibit 99.1 press release is read on the server and only word counts are kept: (positive − negative) ÷ (positive + negative) using FYNX finance word lists with negation handling, plus whether the outlook was raised, lowered, maintained or given. FinBERT-style language models need a GPU server; word lists are transparent and fast.`, 'EPS: three-month diluted EPS from the company’s XBRL filings, matched to the release, with the same quarter a year earlier. Consensus and surprises come from Nasdaq when available. Implied move: the at-the-money straddle for the first expiry after the report, divided by the price (Cboe delayed), with the ordinary days before expiry taken out using the last expiry before the report (or the stock’s volatility on non-earnings days), so what is left is the move priced for the report itself. Average past move: the absolute reaction-day return.', `Event study: abnormal return = stock log return − S&P 500 log return, cumulated from 5 days before to 10 after. With ${S.rows.length} events, averages are noisy. ${r.d.source}. Not advice.`].map(note)));
    requestAnimationFrame(() => {
      const xs = Array.from({length: 16}, (_, i) => (i - 5 > 0 ? '+' : '') + (i - 5)), series = [{v: S.avgPath, color: AMBER, width: 2.2, name: 'All releases'}];
      if (S.pathPos && S.pathNeg) series.push({v: S.pathPos, color: GREEN, width: 1.4, name: 'Upbeat tone'}, {v: S.pathNeg, color: RED, width: 1.4, name: 'Neutral or cautious'});
      lineChart(ec, {series, xs, yfmt: x => spct(x, 1), hline: [{v: 0, color: '#3a4641'}], shade: [{from: 4, to: 6, color: 'rgba(255,176,0,.08)'}], aria: 'Average abnormal return around earnings'});
      barsChart(bc, S.rows);
    });
  }
  T.PANELS.earnprev = ['EARNINGS', 'Earnings preview', 'earnprev']; T.PANEL_DESC.earnprev = 'Release tone, EPS, beats, implied move, event study'; T.LINK_LABEL.earnprev = 'Full'; T.RENDER.earnprev = renderPanel;
  if (PG) { for (const name of ['earnprev', 'earnings-preview', 'eventstudy']) { T.premium?.(name, 'ai', 'Earnings preview', ['earnings']); PG.add(name, 'Earnings preview', renderPage); } T.PAGE_NAMES.push('EARNPREV', 'EVENTSTUDY'); }
  const grp = T.EXTRA_GROUPS.find(g => g[0] === 'AI lab'); if (grp) grp[1].push('earnprev'); else T.EXTRA_GROUPS.push(['AI lab', ['earnprev']]);
  T.Earnings = {study, upcoming, impliedMove, spearman};
});
