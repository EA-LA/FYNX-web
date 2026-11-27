/* FYNX Terminal plugin: OFLOW — live order flow and order book imbalance predictor.
 * Streams the public Kraken WebSocket v2 order book (100 levels each side) and every trade for a crypto pair,
 * straight from the browser. Shows a liquidity heatmap (resting size by price over time), the trade tape as
 * aggressor bubbles, the depth ladder, order book imbalance (OBI) and cumulative volume delta (CVD), and
 * tests live whether OBI predicts the next mid-price move at 1 s, 5 s, 15 s and 60 s horizons.
 * Only crypto: exchanges sell real-time stock, futures and FX order books (e.g. Nasdaq TotalView, CME MDP 3.0);
 * crypto exchanges publish theirs free. Nothing is stored or sent anywhere; it all runs in this tab. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, tabs, store, empty, finite, report} = T;
  const URL_WS = 'wss://ws.kraken.com/v2';
  const PAIRS = [['BTC/USD', 'Bitcoin'], ['ETH/USD', 'Ether'], ['SOL/USD', 'Solana'], ['XRP/USD', 'XRP'], ['DOGE/USD', 'Dogecoin'], ['ADA/USD', 'Cardano'], ['LINK/USD', 'Chainlink'], ['LTC/USD', 'Litecoin'], ['AVAX/USD', 'Avalanche'], ['DOT/USD', 'Polkadot'], ['BCH/USD', 'Bitcoin Cash'], ['XLM/USD', 'Stellar']];
  const DEPTH = 100, SAMPLE_MS = 250, COLS = 1440, KEEP_SAMPLES = 4 * 60 * 60 * 2; // 6 min of heatmap, 2 h of samples
  const HORIZONS = [[1000, '1s'], [5000, '5s'], [15000, '15s'], [60000, '60s']];
  const TOP_N = 10;

  /* --- state ------------------------------------------------------------------------------------------- */
  const OF = {pair: PAIRS.some(p => p[0] === store.get('oflow-pair')) ? store.get('oflow-pair') : 'BTC/USD', ws: null, status: 'idle', statusText: 'Not connected', bids: new Map(), asks: new Map(),
    cols: [], trades: [], samples: {t: [], mid: [], obi: [], cvd: []}, tickRebase: true, cvd: 0, buyVol: 0, sellVol: 0, lastMsg: 0, retry: 0, timer: 0, sampler: 0, zoom: 1, wanted: false, since: 0};
  const resetData = () => { OF.tickRebase = true; OF.bids.clear(); OF.asks.clear(); OF.cols = []; OF.trades = []; OF.samples = {t: [], mid: [], obi: [], cvd: []}; OF.cvd = 0; OF.buyVol = 0; OF.sellVol = 0; OF.since = Date.now(); };
  const bestBid = () => { let b = -Infinity; for (const p of OF.bids.keys()) if (p > b) b = p; return b; };
  const bestAsk = () => { let a = Infinity; for (const p of OF.asks.keys()) if (p < a) a = p; return a; };
  function sortedSide(map, desc) { return [...map.entries()].sort((a, b) => desc ? b[0] - a[0] : a[0] - b[0]); }
  function obi(n = TOP_N) {
    const b = sortedSide(OF.bids, true).slice(0, n), a = sortedSide(OF.asks, false).slice(0, n);
    const sb = b.reduce((s, x) => s + x[1], 0), sa = a.reduce((s, x) => s + x[1], 0);
    return sb + sa > 0 ? (sb - sa) / (sb + sa) : 0;
  }
  function truncate() {
    if (OF.bids.size > DEPTH) for (const [p] of sortedSide(OF.bids, true).slice(DEPTH)) OF.bids.delete(p);
    if (OF.asks.size > DEPTH) for (const [p] of sortedSide(OF.asks, false).slice(DEPTH)) OF.asks.delete(p);
  }

  /* --- connection ---------------------------------------------------------------------------------- */
  function setStatus(s, text) { OF.status = s; OF.statusText = text; document.querySelectorAll('.of-status').forEach(n => { n.textContent = text; n.dataset.s = s; }); }
  function connect() {
    if (OF.ws && OF.ws.readyState <= 1) return;
    clearTimeout(OF.timer); setStatus('connecting', 'Connecting to Kraken…');
    let ws; try { ws = new WebSocket(URL_WS); } catch (e) { report('oflow-ws', e); return scheduleRetry(); }
    OF.ws = ws;
    ws.onopen = () => {
      OF.retry = 0; resetData(); setStatus('live', `Live · Kraken ${OF.pair}`);
      ws.send(JSON.stringify({method: 'subscribe', params: {channel: 'book', symbol: [OF.pair], depth: DEPTH, snapshot: true}}));
      ws.send(JSON.stringify({method: 'subscribe', params: {channel: 'trade', symbol: [OF.pair], snapshot: false}}));
      startSampler();
    };
    ws.onmessage = ev => { OF.lastMsg = Date.now(); let m; try { m = JSON.parse(ev.data); } catch (_) { return; } handle(m); };
    ws.onerror = () => { setStatus('error', 'Connection problem — retrying'); };
    ws.onclose = () => { if (OF.ws === ws) { OF.ws = null; stopSampler(); if (OF.wanted) scheduleRetry(); else setStatus('idle', 'Paused (panel not visible)'); } };
  }
  function scheduleRetry() { const wait = Math.min(30000, 1000 * 2 ** OF.retry++); setStatus('error', `Reconnecting in ${Math.round(wait / 1000)} s…`); clearTimeout(OF.timer); OF.timer = setTimeout(() => { if (OF.wanted) connect(); }, wait); }
  function disconnect() { OF.wanted = false; clearTimeout(OF.timer); stopSampler(); if (OF.ws) { const w = OF.ws; OF.ws = null; try { w.close(); } catch (_) {} } setStatus('idle', 'Paused (panel not visible)'); }
  function switchPair(p) { OF.pair = p; store.set('oflow-pair', p); if (OF.ws) { const w = OF.ws; OF.ws = null; try { w.close(); } catch (_) {} } resetData(); if (OF.wanted) connect(); draw(true); }
  function handle(m) {
    if (m.channel === 'book' && Array.isArray(m.data)) {
      for (const d of m.data) {
        if (d.symbol !== OF.pair) continue;
        if (m.type === 'snapshot') { OF.bids.clear(); OF.asks.clear(); }
        for (const l of d.bids || []) { if (!finite(l.price)) continue; if (l.qty > 0) OF.bids.set(l.price, l.qty); else OF.bids.delete(l.price); }
        for (const l of d.asks || []) { if (!finite(l.price)) continue; if (l.qty > 0) OF.asks.set(l.price, l.qty); else OF.asks.delete(l.price); }
        truncate();
      }
    } else if (m.channel === 'trade' && Array.isArray(m.data)) {
      for (const t of m.data) {
        if (t.symbol !== OF.pair || !finite(t.price) || !finite(t.qty)) continue;
        const at = Date.parse(t.timestamp) || Date.now(), buy = t.side === 'buy';
        OF.trades.push({t: at, p: t.price, q: t.qty, buy}); OF.cvd += buy ? t.qty : -t.qty; if (buy) OF.buyVol += t.qty; else OF.sellVol += t.qty;
      }
      const cut = Date.now() - COLS * SAMPLE_MS; while (OF.trades.length && OF.trades[0].t < cut) OF.trades.shift();
    } else if (m.method === 'subscribe' && m.success === false) {
      setStatus('error', 'Kraken refused the subscription: ' + (m.error || 'unknown error'));
    }
  }
  function startSampler() {
    stopSampler();
    OF.sampler = setInterval(() => {
      if (!OF.bids.size || !OF.asks.size) return;
      if (Date.now() - OF.lastMsg > 20000) { setStatus('error', 'No data for 20 s — reconnecting'); try { OF.ws?.close(); } catch (_) {} return; }
      const bb = bestBid(), ba = bestAsk(); if (!(ba > bb)) return;
      const now = Date.now(), mid = (bb + ba) / 2, o = obi();
      const S = OF.samples; S.t.push(now); S.mid.push(mid); S.obi.push(o); S.cvd.push(OF.cvd);
      if (S.t.length > KEEP_SAMPLES) for (const k of Object.keys(S)) S[k].splice(0, S[k].length - KEEP_SAMPLES);
      // heatmap column: every level as (price, qty, side)
      const bids = sortedSide(OF.bids, true), asks = sortedSide(OF.asks, false), col = new Float64Array((bids.length + asks.length) * 2);
      let k = 0; for (const [p, q] of bids) { col[k++] = p; col[k++] = q; } for (const [p, q] of asks) { col[k++] = p; col[k++] = -q; }
      OF.cols.push({t: now, mid, bb, ba, lv: col}); if (OF.cols.length > COLS) OF.cols.shift();
      draw();
    }, SAMPLE_MS);
  }
  function stopSampler() { clearInterval(OF.sampler); OF.sampler = 0; }
  // Run only while a panel or page shows the tool.
  setInterval(() => {
    const visible = !!document.querySelector('.of-canvas,.of-dom') && !document.hidden;
    if (visible && !OF.wanted) { OF.wanted = true; connect(); }
    else if (!visible && OF.wanted) { clearTimeout(OF.hideTimer); OF.hideTimer = setTimeout(() => { if (!document.querySelector('.of-canvas,.of-dom') || document.hidden) disconnect(); }, document.hidden ? 60000 : 3000); }
  }, 1000);

  /* --- signal test --------------------------------------------------------------------------------------- */
  // For each horizon h: non-overlapping samples every h, forward mid return in basis points, Pearson IC with OBI,
  // hit rate of sign(OBI) vs sign(move), mean move when OBI > +0.3 vs < −0.3, and a t-statistic for the IC.
  function signalTest() {
    const S = OF.samples, n = S.t.length, out = [];
    for (const [h, label] of HORIZONS) {
      const xs = [], ys = []; let j = 0, nextT = S.t[0] || 0;
      for (let i = 0; i < n; i++) {
        if (S.t[i] < nextT) continue;
        const target = S.t[i] + h; while (j < n && S.t[j] < target) j++;
        if (j >= n) break;
        xs.push(S.obi[i]); ys.push((S.mid[j] / S.mid[i] - 1) * 1e4); nextT = S.t[i] + h;
      }
      const N = xs.length;
      if (N < 12) { out.push({label, h, N, ready: false}); continue; }
      const mx = xs.reduce((a, b) => a + b, 0) / N, my = ys.reduce((a, b) => a + b, 0) / N;
      let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < N; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
      const ic = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, tstat = ic * Math.sqrt(Math.max(1, N - 2) / Math.max(1e-9, 1 - ic * ic));
      let hit = 0, moves = 0; for (let i = 0; i < N; i++) if (ys[i] !== 0 && xs[i] !== 0) { moves++; if (Math.sign(ys[i]) === Math.sign(xs[i])) hit++; }
      const hiA = ys.filter((_, i) => xs[i] > 0.3), loA = ys.filter((_, i) => xs[i] < -0.3), avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
      out.push({label, h, N, ready: N >= 30, ic, tstat, hit: moves ? hit / moves : null, moves, up: avg(hiA), down: avg(loA), nUp: hiA.length, nDown: loA.length});
    }
    return out;
  }

  /* --- styles ----------------------------------------------------------------------------------------- */
  const st = el('style'); st.id = 'fx-oflow-style';
  st.textContent = `
.fx-of{display:flex;flex-direction:column;height:100%;min-height:0;gap:6px;padding:6px 8px}
.fx-of-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fx-of-bar select{background:#0d1312!important;border:1px solid #26302c!important;color:var(--tx)!important;font:600 12px 'IBM Plex Mono',monospace;padding:4px 6px;min-height:28px}
.fx-of-status{font:600 10.5px 'IBM Plex Mono',monospace;color:var(--mu);display:inline-flex;align-items:center;gap:6px}
.fx-of-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#56635c}
.fx-of-status[data-s=live]{color:#3ecf8e}.fx-of-status[data-s=live]::before{background:#3ecf8e;box-shadow:0 0 8px #3ecf8e;animation:ofPulse 1.6s infinite}
.fx-of-status[data-s=connecting]::before{background:#ffb000}.fx-of-status[data-s=error]{color:#ff9f1c}.fx-of-status[data-s=error]::before{background:#ff3b30}
@keyframes ofPulse{50%{opacity:.35}}
.fx-of-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:3px}
.fx-of-kpis div{padding:4px 7px;background:var(--p2);border:1px solid var(--ln)}
.fx-of-kpis small{display:block;color:var(--mu);font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.08em}
.fx-of-kpis b{display:block;font:700 13px 'IBM Plex Mono',monospace}
.fx-of-stage{position:relative;flex:1;min-height:180px;background:#05070a;border:1px solid var(--ln)}
.fx-of-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.fx-of-tip{position:absolute;z-index:2;pointer-events:none;padding:5px 7px;background:rgba(8,11,10,.95);border:1px solid var(--ln2);font:500 10.5px/1.5 'IBM Plex Mono',monospace;color:var(--tx);white-space:nowrap}
.fx-of-zoom{position:absolute;right:6px;top:6px;z-index:2;display:flex;gap:3px}
.fx-of-zoom button{width:26px;height:24px;padding:0;background:rgba(8,11,10,.85);border:1px solid #2a3530;color:var(--tx);font:700 13px Inter,Arial,sans-serif;cursor:pointer}
@media (pointer:coarse){.fx-of-zoom button{width:44px;height:44px}}
.fx-of-sig{width:100%;border-collapse:collapse;font:500 12px 'IBM Plex Mono',monospace}
.fx-of-sig th,.fx-of-sig td{padding:6px 8px;border-top:1px solid var(--ln);text-align:right}
.fx-of-sig th{color:var(--mu);font-size:10px;font-weight:600;letter-spacing:.05em}
.fx-of-sig th:first-child,.fx-of-sig td:first-child{text-align:left}
.fx-of-note{margin:0;color:var(--mu);font-size:11px;line-height:1.5}
.fx-of-page .fx-of-stage{min-height:520px}
.fx-of-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px}
.fx-of-card{padding:10px 12px;background:var(--p2);border:1px solid var(--ln)}
.fx-of-card h3{margin:0 0 8px;font:700 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:var(--am)}
.fx-of-card{min-width:0}.of-sig{overflow-x:auto;-webkit-overflow-scrolling:touch}
.fx-of-tape{max-height:300px;overflow:auto;font:500 11.5px 'IBM Plex Mono',monospace}
.fx-of-tape div{display:grid;grid-template-columns:70px 1fr 1fr;gap:8px;padding:2px 4px;border-bottom:1px solid #111816}
@media (max-width:900px){.fx-of-grid{grid-template-columns:1fr}.fx-of-page .fx-of-stage{min-height:380px}}
@media (prefers-reduced-motion:reduce){.fx-of-status[data-s=live]::before{animation:none}}
.fx-dom{display:flex;flex-direction:column;min-height:0;height:100%;font:500 11.5px 'IBM Plex Mono',monospace}
.fx-dom-top{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;margin:4px 0}
.fx-dom-top div{padding:3px 6px;background:var(--p2);border:1px solid var(--ln);min-width:0}.fx-dom-top small{display:block;color:var(--mu);font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.08em}.fx-dom-top b{display:block;font:700 12px 'IBM Plex Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-dom-body{flex:1;min-height:0;overflow:hidden}
.fx-dom-row{display:grid;grid-template-columns:1fr 1.05fr 1fr;height:18px;align-items:stretch;border-bottom:1px solid #111816}
.fx-dom-head{height:20px;color:var(--mu);font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.06em}.fx-dom-head span{display:flex;align-items:center;justify-content:center}
.fx-dom-b,.fx-dom-a{position:relative;display:flex;align-items:center;overflow:hidden}.fx-dom-b{justify-content:flex-end}.fx-dom-a{justify-content:flex-start}
.fx-dom-b i,.fx-dom-a i{position:absolute;top:2px;bottom:2px}.fx-dom-b i{right:0;background:rgba(46,160,90,.55)}.fx-dom-a i{left:0;background:rgba(214,69,58,.55)}
.fx-dom-b em,.fx-dom-a em{position:relative;font-style:normal;padding:0 6px;color:#e7ece9}
.fx-dom-p{display:flex;align-items:center;justify-content:center;color:#c5d0ca;background:#0b100f;border-left:1px solid #111816;border-right:1px solid #111816}
.fx-dom-row.bb .fx-dom-p{background:rgba(46,160,90,.35);color:#fff;font-weight:700}.fx-dom-row.ba .fx-dom-p{background:rgba(214,69,58,.35);color:#fff;font-weight:700;outline:1px solid #ffb000;outline-offset:-1px}
.fx-dom-row.gap .fx-dom-p{color:var(--mu)}
.fx-dom-big .fx-dom-row{height:21px;font-size:12.5px}
.tp-b>.fx-dom{padding:0 6px}`;
  document.head.append(st);

  /* --- drawing ------------------------------------------------------------------------------------------- */
  // Heat palette: deep blue → cyan → yellow → white, like professional liquidity maps.
  const PAL = (() => { const stops = [[0, [8, 14, 40]], [0.25, [18, 60, 140]], [0.5, [20, 170, 200]], [0.75, [250, 210, 60]], [1, [255, 255, 255]]], out = []; for (let i = 0; i < 256; i++) { const x = i / 255; let k = 0; while (k < stops.length - 2 && x > stops[k + 1][0]) k++; const [x0, c0] = stops[k], [x1, c1] = stops[k + 1], f = (x - x0) / (x1 - x0); out.push(`rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(',')})`); } return out; })();
  let lastDraw = 0, rafQ = 0, hover = null;
  function draw(force) {
    const now = performance.now(); if (!force && now - lastDraw < 120) { if (!rafQ) rafQ = requestAnimationFrame(() => { rafQ = 0; draw(true); }); return; }
    lastDraw = now;
    const cvs = [...document.querySelectorAll('.of-canvas')].filter(c => c.offsetParent !== null), doms = [...document.querySelectorAll('.of-dom')].filter(d => d.offsetParent !== null);
    if (!cvs.length && !doms.length) return;
    doms.forEach(domUpdate); cvs.forEach(paint); document.querySelectorAll('.of-kpis').forEach(kpiUpdate); document.querySelectorAll('.of-sig').forEach(sigUpdate); document.querySelectorAll('.of-tape').forEach(tapeUpdate);
  }
  function paint(cv) {
    const box = cv.parentElement, w = Math.max(200, box.clientWidth), h = Math.max(120, box.clientHeight), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#05070a'; c.fillRect(0, 0, w, h);
    const big = cv.dataset.big === '1', ladderW = big ? 110 : 56, axisW = big ? 70 : 52, subH = big ? 110 : Math.min(54, h * 0.28), mainH = h - subH - 4, plotW = w - ladderW - axisW;
    const cols = OF.cols;
    if (!cols.length) { c.fillStyle = '#8e9b94'; c.font = "600 12px 'IBM Plex Mono', monospace"; c.textAlign = 'center'; c.fillText(OF.status === 'live' ? 'Waiting for the first order book…' : OF.statusText, w / 2, h / 2); return; }
    const last = cols.at(-1), mid = last.mid, baseSpan = Math.max(mid * 0.0012, (last.ba - last.bb) * 30) / OF.zoom, lo = mid - baseSpan, hi = mid + baseSpan;
    const Y = p => (hi - p) / (hi - lo) * mainH, nCols = Math.min(cols.length, Math.floor(plotW / (big ? 1 : 1))), colW = plotW / Math.min(COLS / (big ? 1 : 2), Math.max(nCols, 120));
    const shown = cols.slice(-Math.floor(plotW / colW));
    // size normalisation: 97th percentile of visible sizes, log scale
    const sizes = []; for (const col of shown.slice(-60)) for (let i = 0; i < col.lv.length; i += 2) { const p = col.lv[i]; if (p >= lo && p <= hi) sizes.push(Math.abs(col.lv[i + 1])); }
    sizes.sort((a, b) => a - b); const ref = Math.log1p(sizes[Math.floor(sizes.length * 0.97)] || 1);
    // tick height: the typical gap between adjacent levels
    let gap = Infinity; { const lv = last.lv; for (let i = 2; i < lv.length; i += 2) { const d = Math.abs(lv[i] - lv[i - 2]); if (d > 0 && d < gap) gap = d; } } if (!finite(gap)) gap = mid * 0.0001;
    const cellH = Math.max(1.5, gap / (hi - lo) * mainH);
    shown.forEach((col, ci) => {
      const x = ci * colW;
      for (let i = 0; i < col.lv.length; i += 2) { const p = col.lv[i]; if (p < lo || p > hi) continue; const v = Math.min(1, Math.log1p(Math.abs(col.lv[i + 1])) / ref); c.fillStyle = PAL[Math.floor(v * 255)]; c.globalAlpha = 0.25 + 0.75 * v; c.fillRect(x, Y(p) - cellH / 2, Math.ceil(colW) + 0.5, cellH); }
    });
    c.globalAlpha = 1;
    // best bid / ask and mid
    const stepLine = (key, color) => { c.beginPath(); shown.forEach((col, ci) => { const y = Y(col[key]); if (ci) c.lineTo(ci * colW, y); else c.moveTo(0, y); c.lineTo((ci + 1) * colW, y); }); c.strokeStyle = color; c.lineWidth = 1.2; c.stroke(); };
    stepLine('bb', '#3ecf8e'); stepLine('ba', '#ff5a4f');
    // trades
    const t0 = shown[0].t, tN = shown.at(-1).t + SAMPLE_MS, X = t => (t - t0) / (tN - t0) * plotW;
    const qs = OF.trades.filter(t => t.t >= t0).map(t => t.q).sort((a, b) => a - b), qRef = qs[Math.floor(qs.length * 0.9)] || 1;
    for (const t of OF.trades) { if (t.t < t0 || t.p < lo || t.p > hi) continue; const r = Math.max(1.5, Math.min(big ? 16 : 10, 2.5 * Math.sqrt(t.q / qRef) * (big ? 3 : 2))); c.beginPath(); c.arc(X(t.t), Y(t.p), r, 0, Math.PI * 2); c.fillStyle = t.buy ? 'rgba(62,207,142,.55)' : 'rgba(255,90,79,.55)'; c.fill(); c.lineWidth = 0.8; c.strokeStyle = t.buy ? '#3ecf8e' : '#ff5a4f'; c.stroke(); }
    // price axis
    c.fillStyle = '#0a0e0d'; c.fillRect(plotW, 0, axisW, mainH);
    c.font = `500 ${big ? 10.5 : 9.5}px 'IBM Plex Mono', monospace`; c.textAlign = 'left'; c.fillStyle = '#8e9b94';
    const digits = mid >= 1000 ? 1 : mid >= 10 ? 2 : mid >= 1 ? 4 : 5;
    for (let k = 0; k <= 6; k++) { const p = lo + (hi - lo) * k / 6; c.fillText(p.toFixed(digits), plotW + 4, Y(p) + 3); }
    c.fillStyle = '#ffb000'; c.fillRect(plotW, Y(mid) - 8, axisW, 16); c.fillStyle = '#000'; c.font = `700 ${big ? 11 : 10}px 'IBM Plex Mono', monospace`; c.fillText(mid.toFixed(digits), plotW + 4, Y(mid) + 4);
    // depth ladder
    const lx = plotW + axisW, lv = last.lv; let maxQ = 0; for (let i = 0; i < lv.length; i += 2) if (lv[i] >= lo && lv[i] <= hi) maxQ = Math.max(maxQ, Math.abs(lv[i + 1]));
    for (let i = 0; i < lv.length; i += 2) { const p = lv[i]; if (p < lo || p > hi) continue; const q = lv[i + 1], len = Math.abs(q) / (maxQ || 1) * (ladderW - 4); c.fillStyle = q > 0 ? 'rgba(62,207,142,.75)' : 'rgba(255,90,79,.75)'; c.fillRect(lx + 2, Y(p) - Math.max(1, cellH) / 2, len, Math.max(1, cellH - 0.5)); }
    // sub chart: OBI (amber, −1…+1) and CVD (blue, scaled)
    const sy = mainH + 4, S = OF.samples, n = S.t.length;
    c.fillStyle = '#080b0a'; c.fillRect(0, sy, plotW + axisW + ladderW, subH);
    c.strokeStyle = '#1d2824'; c.beginPath(); c.moveTo(0, sy + subH / 2); c.lineTo(plotW, sy + subH / 2); c.stroke();
    const startI = S.t.findIndex(t => t >= t0), seg = startI < 0 ? [] : S.t.slice(startI).map((t, k) => k + startI);
    if (seg.length > 1) {
      c.beginPath(); seg.forEach((i, k) => { const x = X(S.t[i]), y = sy + subH / 2 - S.obi[i] * (subH / 2 - 4); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.strokeStyle = '#ffb000'; c.lineWidth = 1.2; c.stroke();
      let cmin = Infinity, cmax = -Infinity; for (const i of seg) { cmin = Math.min(cmin, S.cvd[i]); cmax = Math.max(cmax, S.cvd[i]); }
      c.beginPath(); seg.forEach((i, k) => { const x = X(S.t[i]), y = sy + subH - 4 - (S.cvd[i] - cmin) / ((cmax - cmin) || 1) * (subH - 8); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.strokeStyle = '#5b8def'; c.lineWidth = 1.1; c.stroke();
    }
    c.font = "600 9.5px 'IBM Plex Mono', monospace"; c.textAlign = 'left'; c.fillStyle = '#ffb000'; c.fillText(`OBI top ${TOP_N} ${S.obi.length ? (S.obi.at(-1) >= 0 ? '+' : '') + S.obi.at(-1).toFixed(2) : ''}`, 4, sy + 11); c.fillStyle = '#5b8def'; c.fillText('CVD', 4, sy + 23);
    // time labels
    c.fillStyle = '#6f7c75'; c.textAlign = 'right'; c.fillText(new Date(shown.at(-1).t).toLocaleTimeString(), plotW - 4, mainH - 4); c.textAlign = 'left'; c.fillText(new Date(t0).toLocaleTimeString(), 4, mainH - 4);
    // hover crosshair
    if (hover && hover.cv === cv && hover.x < plotW && hover.y < mainH) { const p = hi - hover.y / mainH * (hi - lo), ci = Math.floor(hover.x / colW), col = shown[ci]; let q = 0; if (col) for (let i = 0; i < col.lv.length; i += 2) if (Math.abs(col.lv[i] - p) <= gap / 2) q = col.lv[i + 1]; c.strokeStyle = 'rgba(255,255,255,.35)'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, hover.y); c.lineTo(plotW, hover.y); c.moveTo(hover.x, 0); c.lineTo(hover.x, mainH); c.stroke(); c.setLineDash([]); const tip = box.querySelector('.fx-of-tip'); if (tip && col) { tip.hidden = false; tip.textContent = `${new Date(col.t).toLocaleTimeString()} · ${p.toFixed(digits)} · ${q ? (q > 0 ? 'bid ' : 'ask ') + Math.abs(q).toFixed(4) : 'no resting size'}`; tip.style.left = Math.min(w - 260, hover.x + 12) + 'px'; tip.style.top = Math.max(0, hover.y - 28) + 'px'; } }
  }
  function kpiUpdate(k) {
    if (!OF.cols.length) return;
    const last = OF.cols.at(-1), spreadBps = (last.ba - last.bb) / last.mid * 1e4, S = OF.samples, o = S.obi.at(-1) ?? 0;
    const min = OF.trades.filter(t => t.t > Date.now() - 60000), buyPct = OF.buyVol + OF.sellVol ? OF.buyVol / (OF.buyVol + OF.sellVol) : null;
    const set = (id, v, color) => { const n = k.querySelector(`[data-k=${id}] b`); if (n) { n.textContent = v; n.style.color = color || ''; } };
    const digits = last.mid >= 1000 ? 2 : last.mid >= 1 ? 4 : 6;
    set('mid', last.mid.toFixed(digits)); set('spr', spreadBps.toFixed(2) + ' bp');
    // Tick highlighting on the streamed mid and best bid/ask. The first sample after a (re)connect or pair switch
    // is a new baseline, never a tick.
    // Each sample is recorded once; every KPI block showing it (panel and page) flashes once for it.
    const TK = window.FynxTick;
    if (TK) {
      if (OF.tickAt !== last.t) {
        const o = {digits, silent: OF.tickRebase, ts: last.t, src: 'kraken:' + OF.pair};
        OF.tickAt = last.t; OF.tickRebase = false; OF.tickShown = new WeakSet();
        OF.tickDirs = {mid: TK.ingest(`oflow:${OF.pair}:mid`, last.mid, o), spr: TK.ingest(`oflow:${OF.pair}:spr`, spreadBps, {...o, digits: 2})};
      }
      if (!OF.tickShown.has(k)) { OF.tickShown.add(k); for (const [id, dir] of Object.entries(OF.tickDirs)) if (dir) TK.flash(k.querySelector(`[data-k=${id}] b`), dir); }
    } set('obi', (o >= 0 ? '+' : '') + o.toFixed(2), o > 0.15 ? '#3ecf8e' : o < -0.15 ? '#ff5a4f' : '');
    set('cvd', (OF.cvd >= 0 ? '+' : '') + OF.cvd.toFixed(OF.cvd && Math.abs(OF.cvd) < 10 ? 3 : 1), OF.cvd >= 0 ? '#3ecf8e' : '#ff5a4f'); set('tpm', String(min.length)); set('buy', buyPct === null ? '—' : Math.round(buyPct * 100) + '%');
  }
  function sigUpdate(host) {
    if (host._last && Date.now() - host._last < 2000) return; host._last = Date.now();
    const rows = signalTest(), tbl = el('table', 'fx-of-sig'), hr = el('tr');
    for (const hh of ['HORIZON', 'SAMPLES', 'IC (CORR)', 't-STAT', 'HIT RATE', 'MOVE WHEN OBI>+0.3', 'MOVE WHEN OBI<−0.3']) hr.append(el('th', '', hh)); tbl.append(hr);
    for (const r of rows) {
      const tr = el('tr'); tr.append(el('td', '', r.label), el('td', '', String(r.N)));
      if (!r.ready) { const td = el('td', '', r.N < 12 ? 'collecting…' : 'need ≥ 30'); td.colSpan = 5; td.style.color = '#8e9b94'; tr.append(td); }
      else { const sig = Math.abs(r.tstat) >= 2; const ic = el('td', '', (r.ic >= 0 ? '+' : '') + r.ic.toFixed(3)); ic.style.color = sig ? (r.ic > 0 ? '#3ecf8e' : '#ff5a4f') : ''; tr.append(ic, el('td', '', r.tstat.toFixed(2)), el('td', '', r.hit === null ? '—' : Math.round(r.hit * 100) + '% of ' + r.moves), el('td', '', r.up === null ? '—' : (r.up >= 0 ? '+' : '') + r.up.toFixed(2) + ' bp (' + r.nUp + ')'), el('td', '', r.down === null ? '—' : (r.down >= 0 ? '+' : '') + r.down.toFixed(2) + ' bp (' + r.nDown + ')')); }
      tbl.append(tr);
    }
    const best = rows.filter(r => r.ready).sort((a, b) => Math.abs(b.tstat) - Math.abs(a.tstat))[0];
    const v = el('p', 'fx-of-note');
    v.textContent = !best ? `Collecting data since ${new Date(OF.since).toLocaleTimeString()}. The test needs at least 30 independent samples per horizon (about ${Math.ceil(30 * 60 / 60)} minutes for the 60 s horizon).` : Math.abs(best.tstat) >= 2 ? `So far the imbalance has a statistically significant ${best.ic > 0 ? 'positive' : 'negative'} link with the next ${best.label} move (IC ${best.ic.toFixed(3)}, t ${best.tstat.toFixed(1)}, ${best.N} samples). ${best.ic > 0 ? 'Buy-heavy books tended to be followed by rises.' : 'The book has been leaning against the next move.'} Small ICs are normal for this signal and costs can erase them.` : `No reliable predictive power yet at any horizon (best |t| ${Math.abs(best.tstat).toFixed(1)} < 2). Keep the page open to collect more samples.`;
    host.replaceChildren(tbl, v);
  }
  function tapeUpdate(host) {
    const digits = OF.cols.at(-1)?.mid >= 1000 ? 1 : 4;
    host.replaceChildren(...OF.trades.slice(-60).reverse().map(t => { const r = el('div'); r.append(el('span', '', new Date(t.t).toLocaleTimeString()), el('span', t.buy ? 'fx-up' : 'fx-dn', t.p.toFixed(digits)), el('span', '', (t.buy ? 'BUY ' : 'SELL ') + t.q.toFixed(4))); return r; }));
  }

  function view(host, big) {
    const wrap = el('div', 'fx-of' + (big ? ' fx-of-page' : '')); host.append(wrap);
    const bar = el('div', 'fx-of-bar'), sel = el('select'); sel.setAttribute('aria-label', 'Crypto pair');
    for (const [p, n] of PAIRS) { const o = el('option', '', `${p} · ${n}`); o.value = p; if (p === OF.pair) o.selected = true; sel.append(o); }
    sel.addEventListener('change', () => switchPair(sel.value));
    const status = el('span', 'fx-of-status of-status', OF.statusText); status.dataset.s = OF.status; status.setAttribute('role', 'status');
    bar.append(sel, status); wrap.append(bar);
    const k = el('div', 'fx-of-kpis of-kpis');
    for (const [id, label] of [['mid', 'MID'], ['spr', 'SPREAD'], ['obi', `OBI TOP ${TOP_N}`], ['cvd', 'CVD (SESSION)'], ['tpm', 'TRADES / MIN'], ['buy', 'TAKER BUY %']]) { const d = el('div'); d.dataset.k = id; d.append(el('small', '', label), el('b', '', '—')); k.append(d); }
    wrap.append(k);
    const stage = el('div', 'fx-of-stage'), cv = el('canvas', 'of-canvas'); cv.dataset.big = big ? '1' : '0'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Liquidity heatmap: resting order size by price over time, with trades as bubbles');
    const tip = el('div', 'fx-of-tip'); tip.hidden = true;
    const zoom = el('div', 'fx-of-zoom'); zoom.append(btn('+', '', () => { OF.zoom = Math.min(8, OF.zoom * 1.5); draw(true); }, 'Zoom in'), btn('−', '', () => { OF.zoom = Math.max(0.25, OF.zoom / 1.5); draw(true); }, 'Zoom out'));
    stage.append(cv, tip, zoom);
    cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); hover = {cv, x: e.clientX - r.left, y: e.clientY - r.top}; draw(true); });
    cv.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; draw(true); });
    wrap.append(stage);
    return wrap;
  }

  function renderPanel() {
    const host = panel('oflow');
    setText('n-oflow', OF.pair);
    view(host, false);
    const n = el('p', 'fx-of-note', 'Kraken public order book · green/red bubbles = aggressive buys/sells · crypto only'); n.style.padding = '0 8px 4px'; host.append(n);
    requestAnimationFrame(() => draw(true));
  }
  async function renderPage(host) {
    PG.setHead('OFLOW', 'Order flow & book imbalance', 'Live Kraken order book · liquidity heatmap · does imbalance predict the next move?');
    const wrap = view(host, true);
    const grid = el('div', 'fx-of-grid'), c1 = el('div', 'fx-of-card'), c2 = el('div', 'fx-of-card');
    c1.append(el('h3', '', 'DOES IMBALANCE PREDICT THE NEXT MOVE? (LIVE TEST)')); const sig = el('div', 'of-sig'); c1.append(sig);
    c1.append(el('p', 'fx-of-note', `OBI = (bid size − ask size) ÷ (bid size + ask size) over the best ${TOP_N} levels, sampled every ${SAMPLE_MS} ms. For each horizon the test takes non-overlapping samples, measures the next mid-price move in basis points and reports the correlation (IC), its t-statistic (|t| ≥ 2 ≈ significant), how often the move went the way the book leaned, and the average move after strongly buy- or sell-heavy books.`));
    c2.append(el('h3', '', 'TRADE TAPE')); const tape = el('div', 'fx-of-tape of-tape'); c2.append(tape);
    grid.append(c1, c2); wrap.append(grid);
    const how = el('div', 'fx-of-card'); how.append(el('h3', '', 'READING THE MAP'));
    for (const t of ['Heatmap: each column is a snapshot of the order book every quarter second. Brighter = more resting size at that price. Walls that persist show where large orders sit; walls that vanish before price reaches them may be spoofing.', 'Lines: green is the best bid, red the best ask. Bubbles are trades: green when a buyer crossed the spread, red when a seller did; bigger = larger trade.', 'Bottom: amber is order book imbalance (+1 all bids, −1 all asks), blue is cumulative volume delta (aggressive buys minus sells since you opened the page).', 'Why only crypto? Exchanges sell real-time stock, futures and FX order books (for example Nasdaq TotalView or CME market depth) under paid licences. Crypto exchanges publish their full books free, so this tool streams Kraken directly in your browser. Nothing is stored.']) how.append(el('p', 'fx-of-note', t));
    wrap.append(how);
    requestAnimationFrame(() => draw(true));
  }

  /* --- DOM: depth-of-market price ladder ---------------------------------------------------------------------
   * The classic trading ladder: one row per price level, resting bid size (green bars) left, ask size (red bars)
   * right, best bid and best ask highlighted, built from the same live Kraken book (100 levels a side). Levels
   * are grouped to a tick size chosen from the price (×1 / ×5 / ×10 coarser on request). Rows are created once and
   * updated in place every quarter second; the ladder only re-centres when the inside market drifts towards an
   * edge, so it does not jump. Crypto only: futures and stock depth (e.g. CME, Nasdaq TotalView) are paid feeds. */
  const TICKS = [1e-6, 5e-6, 1e-5, 5e-5, 1e-4, 5e-4, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50];
  const domTick = (mid, mult) => (TICKS.find(t => t >= mid * 1e-5) || 50) * mult;
  const decimals = g => Math.max(0, Math.min(8, Math.ceil(-Math.log10(g) - 1e-9)));
  const sizeFmt = q => !(q > 0) ? '' : q >= 1000 ? (q / 1000).toFixed(1) + 'k' : q >= 100 ? q.toFixed(0) : q >= 1 ? q.toFixed(2) : q.toFixed(4);
  function domView(big) {
    const rows = big ? 34 : 22, wrap = el('div', 'fx-dom of-dom' + (big ? ' fx-dom-big' : ''));
    const bar = el('div', 'fx-of-bar'), sel = el('select'); sel.setAttribute('aria-label', 'Crypto pair');
    for (const [p, n] of PAIRS) { const o = el('option', '', `${p} · ${n}`); o.value = p; if (p === OF.pair) o.selected = true; sel.append(o); }
    sel.addEventListener('change', () => switchPair(sel.value));
    const grp = el('select'); grp.setAttribute('aria-label', 'Price grouping');
    for (const [v, l] of [['1', 'Tick ×1'], ['5', 'Tick ×5'], ['10', 'Tick ×10']]) { const o = el('option', '', l); o.value = v; if (v === (store.get('dom-mult') || '1')) o.selected = true; grp.append(o); }
    grp.addEventListener('change', () => { store.set('dom-mult', grp.value); wrap._center = null; domUpdate(wrap); });
    const status = el('span', 'fx-of-status of-status', OF.statusText); status.dataset.s = OF.status; status.setAttribute('role', 'status');
    bar.append(sel, grp, status); wrap.append(bar);
    const top = el('div', 'fx-dom-top');
    for (const [id, label] of [['bid', 'BEST BID'], ['ask', 'BEST ASK'], ['spr', 'SPREAD'], ['tick', 'TICK']]) { const d = el('div'); d.dataset.d = id; d.append(el('small', '', label), el('b', '', '—')); top.append(d); }
    wrap.append(top);
    const head = el('div', 'fx-dom-row fx-dom-head'); head.append(el('span', '', 'Bid'), el('span', '', 'Price'), el('span', '', 'Ask')); wrap.append(head);
    const body = el('div', 'fx-dom-body'); body.setAttribute('role', 'table'); body.setAttribute('aria-label', 'Depth of market ladder');
    wrap._rows = [];
    for (let i = 0; i < rows; i++) {
      const r = el('div', 'fx-dom-row'), b = el('span', 'fx-dom-b'), bb = el('i'), bt = el('em'), pr = el('span', 'fx-dom-p'), a = el('span', 'fx-dom-a'), ab = el('i'), at = el('em');
      b.append(bb, bt); a.append(ab, at); r.append(b, pr, a); body.append(r); wrap._rows.push({r, bb, bt, pr, ab, at, key: ''});
    }
    wrap.append(body);
    return wrap;
  }
  function domUpdate(w) {
    if (!w._rows || !OF.bids.size || !OF.asks.size) return;
    const bb = bestBid(), ba = bestAsk(); if (!(ba > bb)) return;
    const mid = (bb + ba) / 2, g = domTick(mid, Number(store.get('dom-mult') || 1)), dg = decimals(g), N = w._rows.length, half = Math.floor(N / 2);
    const key = p => Math.round(p / g);
    const bidK = Math.floor(bb / g + 1e-9), askK = Math.ceil(ba / g - 1e-9);
    // Re-centre only when the inside market reaches the outer 30% of the ladder (or the grouping changed).
    if (w._center == null || w._g !== g || bidK > w._center + Math.floor(N * 0.2) || bidK < w._center - Math.floor(N * 0.2)) { w._center = bidK; w._g = g; }
    const topK = w._center + half, bids = new Map(), asks = new Map();
    for (const [p, q] of OF.bids) { const k = Math.floor(p / g + 1e-9); bids.set(k, (bids.get(k) || 0) + q); }
    for (const [p, q] of OF.asks) { const k = Math.ceil(p / g - 1e-9); asks.set(k, (asks.get(k) || 0) + q); }
    let max = 0; for (let i = 0; i < N; i++) { const k = topK - i; max = Math.max(max, bids.get(k) || 0, asks.get(k) || 0); }
    for (let i = 0; i < N; i++) {
      const row = w._rows[i], k = topK - i, bq = k <= bidK ? bids.get(k) || 0 : 0, aq = k >= askK ? asks.get(k) || 0 : 0;
      const price = (k * g).toLocaleString('en-US', {minimumFractionDigits: dg, maximumFractionDigits: dg}), cls = 'fx-dom-row' + (k === bidK ? ' bb' : '') + (k === askK ? ' ba' : '') + (k > bidK && k < askK ? ' gap' : '');
      if (row.r.className !== cls) row.r.className = cls;
      if (row.pr.textContent !== price) row.pr.textContent = price;
      const bt = sizeFmt(bq), at = sizeFmt(aq);
      if (row.bt.textContent !== bt) row.bt.textContent = bt; if (row.at.textContent !== at) row.at.textContent = at;
      row.bb.style.width = (max ? bq / max * 100 : 0).toFixed(1) + '%'; row.ab.style.width = (max ? aq / max * 100 : 0).toFixed(1) + '%';
    }
    const set = (id, v) => { const n = w.querySelector(`[data-d=${id}] b`); if (n && n.textContent !== v) n.textContent = v; return n; };
    // The inside market at the exchange's own precision (never rounded to the grouping tick).
    const decOf = v => Math.min(8, (String(v).split('.')[1] || '').length), pd = Math.max(decOf(bb), decOf(ba), decimals(domTick(mid, 1)));
    const px = v => v.toLocaleString('en-US', {minimumFractionDigits: pd, maximumFractionDigits: pd});
    const bidN = set('bid', `${px(bb)} × ${sizeFmt(OF.bids.get(bb))}`), askN = set('ask', `${px(ba)} × ${sizeFmt(OF.asks.get(ba))}`);
    set('spr', `${px(ba - bb)} (${((ba - bb) / mid * 1e4).toFixed(2)} bp)`); set('tick', g.toFixed(dg));
    // Tick highlighting on the inside market (each sample once, every ladder on screen flashes for it).
    const TK = window.FynxTick; if (!TK) return;
    if (OF.domTickAt !== OF.lastMsg) {
      const o = {digits: pd, silent: OF.domRebase !== OF.pair + OF.since, src: 'kraken:' + OF.pair};
      OF.domRebase = OF.pair + OF.since; OF.domTickAt = OF.lastMsg; OF.domShown = new WeakSet();
      OF.domDirs = {bid: TK.ingest(`dom:${OF.pair}:bid`, bb, o), ask: TK.ingest(`dom:${OF.pair}:ask`, ba, o)};
    }
    if (!OF.domShown.has(w)) { OF.domShown.add(w); if (OF.domDirs.bid) TK.flash(bidN, OF.domDirs.bid); if (OF.domDirs.ask) TK.flash(askN, OF.domDirs.ask); }
  }
  function renderDomPanel() {
    const host = panel('dom'); setText('n-dom', OF.pair);
    host.append(domView(false));
    const n = el('p', 'fx-of-note', 'Kraken public order book · live · crypto only'); n.style.padding = '0 8px 4px'; host.append(n);
    requestAnimationFrame(() => draw(true));
  }
  function renderDomPage(host) {
    PG.setHead('DOM', 'Depth of market', 'Live bids and asks: the Kraken order book as a price ladder');
    const g = el('div', 'fx-of-grid'), c1 = el('div', 'fx-of-card'), c2 = el('div', 'fx-of-card');
    c1.append(domView(true));
    c2.append(el('h3', '', 'READING THE LADDER'));
    for (const t of ['Each row is one price level. Green bars on the left are resting buy orders (bids), red bars on the right resting sell orders (asks), sized against the largest level on screen.', 'The highlighted rows are the inside market: the best bid (green) and best ask (red). Their prices flash green or red as the inside market ticks up or down.', 'Grouping adds up every order inside a tick bucket. Use ×5 or ×10 to see larger walls further from the price.', 'Live and free for crypto because exchanges publish their books. Full depth for futures and stocks (CME MDP 3.0, Nasdaq TotalView) is a paid exchange feed, so it is not shown here.'])
      c2.append(el('p', 'fx-of-note', t));
    c2.append(el('h3', '', 'TRADE TAPE')); c2.append(el('div', 'fx-of-tape of-tape'));
    c2.append(btn('Liquidity heatmap & order flow ▸', 'fx-chip fx-chip-link', () => PG.open('orderflow')));
    g.append(c1, c2); host.append(g);
    requestAnimationFrame(() => draw(true));
  }
  T.PANELS.dom = ['DOM', 'Depth of market', 'dom'];
  T.PANEL_DESC.dom = 'Live price ladder: bids and asks at every level (Kraken, crypto)';
  T.LINK_LABEL.dom = 'Ladder';
  T.RENDER.dom = renderDomPanel;
  T.EXTRA_GROUPS.push(['Order book', ['dom']]);
  if (PG) { PG.add('dom', 'Depth of market', renderDomPage); T.PAGE_NAMES.push('DOM'); }

  T.PANELS.oflow = ['OFLOW', 'Order flow · live book', 'orderflow'];
  T.PANEL_DESC.oflow = 'Live crypto order book heatmap, imbalance and trade flow';
  T.LINK_LABEL.orderflow = 'Full';
  T.RENDER.oflow = renderPanel;
  if (PG) { PG.add('orderflow', 'Order flow', renderPage); PG.add('oflow', 'Order flow', renderPage); T.PAGE_NAMES.push('OFLOW', 'ORDERFLOW'); }
  // Crypto desk: live order flow in place of the static top-of-book box.
  const cd = T.DESK_DEFS?.crypto; if (cd && !cd.slots.includes('oflow')) cd.slots = cd.slots.map(s => s === 'books' ? 'oflow' : s);
  // Follow the workspace focus: a focused crypto market that Kraken lists switches the book and the ladder to it.
  // Anything else (stocks, FX, unlisted coins) leaves the book on its own pair, labelled as such.
  const pairFor = sym => { const m = /^([A-Z0-9]{2,10})-USD$/.exec(String(sym || '')); const p = m ? `${m[1]}/USD` : null; return p && PAIRS.some(x => x[0] === p) ? p : null; };
  window.addEventListener('fynx:focus', e => { const p = e.detail?.cls === 'crypto' ? pairFor(e.detail.symbol) : null; if (p && p !== OF.pair) switchPair(p); });
  T.OrderFlow = {state: OF, signalTest, handle, pairFor};
});
