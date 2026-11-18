/* FYNX Terminal plugin: HEAT — five live heat maps.
 *  AIMAP  AI bubble map        Scanner "Artificial intelligence" stocks; bubble = market value, colour = today's move
 *  SECT   Stocks by sector     Scanner US stocks over $10B, squarified treemap by sector; size = market value
 *  FUTMAP Futures heat map     Terminal futures by complex; colour = move, intensity = move vs 20-day normal (σ)
 *  NEWSMAP News heat map       Live headline counts per market topic; tile = 24 h count, colour = how fast it is heating up
 *  CFX    Crypto & currencies  CoinGecko top coins by market value + FX majors / crosses / emerging
 * Data is only what the Terminal already loads (scanner.json, markets snapshot, live quotes, live headlines).
 * Text is inserted with textContent only. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {S, el, btn, svg, signed, big, finite, quoteFor, universe, shortOf, nameOf, focusOn, panel, setText, inspect, kv, ago, loadNews, headlineRow, store} = T;

  /* --- data ------------------------------------------------------------------------------------ */
  let SCAN = null, scanLoading = null;
  const loadScan = () => T.loadScanner ? T.loadScanner() : SCAN ? Promise.resolve(SCAN)
    : (scanLoading ||= T.getJSON(T.TDATA + 'scanner.json', {bust: true, timeout: 30000}).then(d => (SCAN = d)).catch(e => { T.report('heatmaps', e); scanLoading = null; return null; }));
  const baseName = n => String(n || '').replace(/\s*[-–,]?\s*(Class [A-Z]\b.*|Common Stock.*|Ordinary Shares.*|American Depositary.*|Capital Stock.*)$/i, '').replace(/\s+(Inc\.?|Corp(oration)?\.?|Ltd\.?|plc|N\.V\.|S\.A\.)$/i, '').trim();
  function stocks(d) {
    const s = d?.stocks; if (!s?.rows) return [];
    const f = Object.fromEntries(s.fields.map((k, i) => [k, i])), seen = new Set(), out = [];
    for (const r of [...s.rows].sort((a, b) => (b[f.marketCap] || 0) - (a[f.marketCap] || 0))) {
      const cap = r[f.marketCap], chg = r[f.changePct]; if (!finite(cap) || cap <= 0 || !finite(chg)) continue;
      const key = baseName(r[f.name]).toLowerCase(); if (seen.has(key)) continue; seen.add(key); // one tile per company (GOOGL/GOOG)
      out.push({sym: r[f.symbol], name: r[f.name], price: r[f.price], chg, cap, vol: r[f.volume], sector: r[f.sector] || 'Other', industry: r[f.industry] || '', themes: r[f.themes] || []});
    }
    return out;
  }
  function coins(d) {
    const c = d?.crypto; if (!c?.rows) return [];
    const f = Object.fromEntries(c.fields.map((k, i) => [k, i]));
    const stable = /^(USDT|USDC|DAI|FDUSD|TUSD|USDE|PYUSD|USDS|USD1|BUSD|FRAX|USDD|RLUSD|GUSD|USDP|EURC|USD0)$/i;
    // Leave out stablecoins, wrapped/staked copies and tokenised dollars, gold, bonds or loans: they are not crypto price moves.
    const notCrypto = r => stable.test(r[f.symbol]) || /^(USD|EUR)|USD$/i.test(r[f.symbol]) || (r[f.categories] || []).some(c => c === 'stable' || c === 'rwa')
      || /wrapped|staked|bridged|\bUSD\b|dollar|euro\b|treasur|yield|heloc|\bgold\b|tokeni[sz]ed|\bbond|money market/i.test(r[f.name]);
    return c.rows.filter(r => finite(r[f.marketCap]) && finite(r[f.change24h]) && !notCrypto(r))
      .map(r => ({sym: String(r[f.symbol]).toUpperCase(), name: r[f.name], price: r[f.price], chg: r[f.change24h], chg7: r[f.change7d], cap: r[f.marketCap], vol: r[f.volume], open: String(r[f.symbol]).toUpperCase() + '-USD'}));
  }

  /* --- drawing helpers ------------------------------------------------------------------------- */
  // Colour scale: ±3 % (or ±3σ) is full intensity. Green up, red down, neutral grey for flat.
  const heat = (v, full = 3) => { if (!finite(v)) return '#1b2420'; const a = Math.min(1, Math.abs(v) / full); return v >= 0 ? `rgb(${Math.round(24 + a * 6)},${Math.round(52 + a * 108)},${Math.round(40 + a * 38)})` : `rgb(${Math.round(56 + a * 158)},${Math.round(36 + a * 22)},${Math.round(36 + a * 16)})`; };
  const pct = v => finite(v) ? signed(v, Math.abs(v) >= 10 ? 1 : 2, '%') : '—';
  // Squarified treemap (Bruls, Huizing, van Wijk). items: [{value, ...}] → [{x, y, w, h, item}]
  function squarify(items, x, y, w, h) {
    const total = items.reduce((a, b) => a + b.value, 0); if (!total || w <= 0 || h <= 0) return [];
    const scale = w * h / total, out = [], rest = items.map(it => ({it, a: it.value * scale}));
    let rx = x, ry = y, rw = w, rh = h;
    const worst = (row, side) => { const s = row.reduce((a, b) => a + b.a, 0), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
    while (rest.length) {
      const side = Math.min(rw, rh), row = [rest.shift()];
      while (rest.length && worst([...row, rest[0]], side) <= worst(row, side)) row.push(rest.shift());
      const s = row.reduce((a, b) => a + b.a, 0);
      if (rw >= rh) { const cw = s / rh; let cy = ry; for (const r of row) { const ch = r.a / cw; out.push({x: rx, y: cy, w: cw, h: ch, item: r.it}); cy += ch; } rx += cw; rw -= cw; }
      else { const ch = s / rw; let cx = rx; for (const r of row) { const cw = r.a / ch; out.push({x: cx, y: ry, w: cw, h: ch, item: r.it}); cx += cw; } ry += ch; rh -= ch; }
    }
    return out;
  }
  // Bubble packing: largest first; each new circle goes to the free spot nearest the centre that touches two
  // existing circles (exact tangent positions), so the cluster stays tight and round.
  function pack(items, aspect = 1.3) {
    const placed = [], gap = 1.5;
    const free = (x, y, r) => placed.every(q => (q.x - x) ** 2 + (q.y - y) ** 2 >= (q.r + r + gap) ** 2 - 0.01);
    const score = (x, y) => (x / aspect) ** 2 + y * y;
    for (const it of items) {
      const r = it.r;
      if (!placed.length) { placed.push({...it, x: 0, y: 0}); continue; }
      if (placed.length === 1) { placed.push({...it, x: placed[0].r + r + gap, y: 0}); continue; }
      let best = null, bestS = Infinity;
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j], da = a.r + r + gap, db = b.r + r + gap, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (!d || d > da + db || d < Math.abs(da - db)) continue;
        const l = (da * da - db * db + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, da * da - l * l)), mx = a.x + l * dx / d, my = a.y + l * dy / d;
        for (const sgn of [1, -1]) { const x = mx - sgn * hh * dy / d, y = my + sgn * hh * dx / d, sc = score(x, y); if (sc < bestS && free(x, y, r)) { best = {x, y}; bestS = sc; } }
      }
      if (!best) { const far = Math.max(...placed.map(q => Math.hypot(q.x, q.y) + q.r)); best = {x: far + r + gap, y: 0}; }
      placed.push({...it, ...best});
    }
    return placed;
  }
  function stage(host, h) { const box = el('div', 'hm-stage'); box.style.height = h + 'px'; host.append(box); return box; }
  const sizeOf = box => ({w: Math.max(120, box.clientWidth || box.parentElement?.clientWidth || 300), h: Math.max(110, box.clientHeight || 200)});
  // Redraw when the panel resizes (only while it is on screen).
  function onResize(box, draw) { let last = ''; const ro = new ResizeObserver(() => { if (!box.isConnected) return ro.disconnect(); const s = sizeOf(box), k = s.w + 'x' + s.h; if (k !== last) { last = k; draw(s); } }); ro.observe(box); }
  function tileSVG(w, h) { const sv = svg('svg', {viewBox: `0 0 ${w} ${h}`, width: '100%', height: '100%', class: 'hm-svg', role: 'img'}); return sv; }
  function tile(sv, r, {label, sub, fill, title, onClick, labelMin = 26}) {
    const g = svg('g', {class: 'hm-tile', tabindex: '0', role: 'button', 'aria-label': title});
    g.append(svg('rect', {x: r.x + 0.5, y: r.y + 0.5, width: Math.max(0, r.w - 1), height: Math.max(0, r.h - 1), fill}));
    if (r.w > labelMin && r.h > 14) {
      const fs = Math.max(9, Math.min(22, Math.min(r.w / Math.max(3, label.length) * 1.5, r.h / 2.6)));
      const t = svg('text', {x: r.x + r.w / 2, y: r.y + r.h / 2 + (sub && r.h > fs * 2.4 ? -fs * 0.2 : fs * 0.35), 'text-anchor': 'middle', 'font-size': fs.toFixed(1), class: 'hm-l'}); t.textContent = label; g.append(t);
      if (sub && r.h > fs * 2.4 && r.w > 34) { const s2 = svg('text', {x: r.x + r.w / 2, y: r.y + r.h / 2 + fs * 0.95, 'text-anchor': 'middle', 'font-size': (fs * 0.72).toFixed(1), class: 'hm-s'}); s2.textContent = sub; g.append(s2); }
    }
    const tt = svg('title'); tt.textContent = title; g.append(tt);
    g.addEventListener('click', onClick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
    sv.append(g); return g;
  }
  const openSym = (sym, name) => T.setSymbol ? T.setSymbol({symbol: sym, name}) : focusOn(sym);
  const legend = (txt) => el('p', 'hm-legend', txt);
  const scaleBar = (full, unit) => { const d = el('div', 'hm-scale'); for (const v of [-full, -full / 2, 0, full / 2, full]) { const s = el('span', '', (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + unit); s.style.background = heat(v, full); d.append(s); } return d; };

  /* --- 1. AI bubble map ------------------------------------------------------------------------ */
  async function aiMap(host, {big: large = false} = {}) {
    host.append(el('p', 'fx-empty', 'Loading AI stocks…'));
    const d = await loadScan(); if (!host.isConnected) return; host.replaceChildren();
    const list = stocks(d).filter(s => s.themes.includes('ai')).slice(0, large ? 60 : 36);
    if (!list.length) return host.append(el('p', 'fx-empty', 'The scanner universe is being published; the AI map appears when it is ready.'));
    const capSum = list.reduce((a, b) => a + b.cap, 0), wavg = list.reduce((a, b) => a + b.chg * b.cap, 0) / capSum, up = list.filter(s => s.chg > 0).length;
    setText('n-aimap', `${big(capSum)} · ${pct(wavg)} wtd`);
    const head = el('div', 'hm-kpis'); [['AI BASKET', big(capSum)], ['WEIGHTED MOVE', pct(wavg)], ['UP / DOWN', `${up} / ${list.length - up}`], ['LEADER', `${list.slice().sort((a, b) => b.chg - a.chg)[0].sym} ${pct(list.slice().sort((a, b) => b.chg - a.chg)[0].chg)}`]].forEach(([k, v]) => { const x = el('div'); x.append(el('span', '', k), el('b', k === 'WEIGHTED MOVE' ? (wavg >= 0 ? 'fx-up' : 'fx-down') : '', v)); head.append(x); });
    if (large) host.append(head);
    const box = stage(host, large ? (innerWidth < 700 ? 440 : 560) : 0); box.classList.add('hm-fill');
    onResize(box, ({w, h}) => {
      box.replaceChildren(); const maxCap = list[0].cap;
      const base = list.map(s => ({...s, r: Math.max(6, Math.sqrt(s.cap / maxCap) * 60)}));
      const placed = pack(base, Math.max(0.8, Math.min(2.2, w / h)));
      const minX = Math.min(...placed.map(p => p.x - p.r)), maxX = Math.max(...placed.map(p => p.x + p.r)), minY = Math.min(...placed.map(p => p.y - p.r)), maxY = Math.max(...placed.map(p => p.y + p.r));
      const k = Math.min((w - 8) / (maxX - minX), (h - 8) / (maxY - minY)), ox = (w - (maxX - minX) * k) / 2 - minX * k, oy = (h - (maxY - minY) * k) / 2 - minY * k;
      const sv = tileSVG(w, h); sv.setAttribute('aria-label', `AI stocks bubble map, ${list.length} companies`);
      for (const p of placed) {
        const cx = p.x * k + ox, cy = p.y * k + oy, r = p.r * k;
        const g = svg('g', {class: 'hm-tile hm-bubble', tabindex: '0', role: 'button', 'aria-label': `${p.sym} ${p.name}: ${pct(p.chg)}, market value ${big(p.cap)}`});
        g.append(svg('circle', {cx, cy, r: Math.max(1, r - 0.8), fill: heat(p.chg)}));
        if (r > 11) { const fs = Math.max(8, Math.min(20, r / 2.2)); const t = svg('text', {x: cx, y: cy + (r > 22 ? -fs * 0.15 : fs * 0.35), 'text-anchor': 'middle', 'font-size': fs.toFixed(1), class: 'hm-l'}); t.textContent = p.sym; g.append(t);
          if (r > 22) { const s2 = svg('text', {x: cx, y: cy + fs * 0.95, 'text-anchor': 'middle', 'font-size': (fs * 0.72).toFixed(1), class: 'hm-s'}); s2.textContent = pct(p.chg); g.append(s2); } }
        const tt = svg('title'); tt.textContent = `${p.name} (${p.sym}) · ${pct(p.chg)} · ${big(p.cap)} · ${p.industry}`; g.append(tt);
        const go = () => openSym(p.sym, p.name); g.addEventListener('click', go); g.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        sv.append(g);
      }
      box.append(sv);
    });
    host.append(scaleBar(3, '%'), legend(!large ? `Size = market value · colour = today · ${ago(d.stocks?.asOf || d.generatedAt)}` : `Bubble size = market value, colour = today’s move. ${list.length} largest stocks in FYNX’s rule-based AI theme (exchange industry, company name or a short curated list). ${d.sources?.stocks || 'Nasdaq screener'}, ${ago(d.stocks?.asOf || d.generatedAt)}. Click a bubble to open it.`));
  }

  /* --- 2. Stocks by sector --------------------------------------------------------------------- */
  async function sectorMap(host, {big: large = false} = {}) {
    host.append(el('p', 'fx-empty', 'Loading US stocks…'));
    const d = await loadScan(); if (!host.isConnected) return; host.replaceChildren();
    const all = stocks(d).filter(s => s.cap >= 1e10 && s.sector !== 'Miscellaneous');
    if (!all.length) return host.append(el('p', 'fx-empty', 'The scanner universe is being published; the sector map appears when it is ready.'));
    const by = {}; for (const s of all) (by[s.sector] ||= []).push(s);
    const secs = Object.entries(by).map(([name, list]) => ({name, list: list.slice(0, large ? 60 : 28), value: list.reduce((a, b) => a + b.cap, 0), wchg: list.reduce((a, b) => a + b.chg * b.cap, 0) / list.reduce((a, b) => a + b.cap, 0)})).sort((a, b) => b.value - a.value);
    const best = secs.slice().sort((a, b) => b.wchg - a.wchg);
    setText('n-sectmap', `${all.length} stocks · best ${best[0].name.split(' ')[0]} ${pct(best[0].wchg)}`);
    const strip = el('div', 'hm-secstrip'); for (const s of best) { const b = btn('', 'hm-secchip', () => inspect(`${s.name} · ${pct(s.wchg)}`, body => { kv(body, [['Stocks shown', s.list.length], ['Market value', big(s.value)], ['Cap-weighted move', pct(s.wchg)]]); for (const x of s.list.slice(0, 15)) { const r = T.rowButton('pm-c4', () => openSym(x.sym, x.name), `${x.sym} ${x.name}`); r.append(el('b', '', x.sym), el('span', 'fx-dim', x.name.slice(0, 26)), el('span', 'fx-num ' + (x.chg >= 0 ? 'fx-up' : 'fx-down'), pct(x.chg)), el('span', 'fx-num fx-dim', big(x.cap))); body.append(r); } }), `${s.name} ${pct(s.wchg)}`); b.style.background = heat(s.wchg, 2); b.append(el('span', '', s.name.replace('Consumer ', 'Cons. ').replace('Telecommunications', 'Telecom').replace('Basic Materials', 'Materials')), el('b', '', pct(s.wchg))); strip.append(b); }
    host.append(strip);
    const box = stage(host, large ? 620 : 0); box.classList.add('hm-fill');
    onResize(box, ({w, h}) => {
      box.replaceChildren(); const sv = tileSVG(w, h); sv.setAttribute('aria-label', 'US stocks by sector treemap');
      for (const sec of squarify(secs, 0, 0, w, h)) {
        const s = sec.item, headH = sec.h > 40 && sec.w > 50 ? 13 : 0;
        sv.append(svg('rect', {x: sec.x, y: sec.y, width: sec.w, height: sec.h, class: 'hm-secbox'}));
        if (headH) { const t = svg('text', {x: sec.x + 4, y: sec.y + 10, class: 'hm-sech', 'font-size': '9.5'}); t.textContent = `${s.name.toUpperCase()} ${pct(s.wchg)}`; sv.append(t); }
        for (const r of squarify(s.list.map(x => ({...x, value: x.cap})), sec.x + 1, sec.y + headH + 1, sec.w - 2, sec.h - headH - 2))
          tile(sv, r, {label: r.item.sym, sub: pct(r.item.chg), fill: heat(r.item.chg), title: `${r.item.name} (${r.item.sym}) · ${pct(r.item.chg)} · ${big(r.item.cap)} · ${r.item.industry}`, onClick: () => openSym(r.item.sym, r.item.name)});
      }
      box.append(sv);
    });
    host.append(scaleBar(3, '%'), legend(!large ? `Size = market value · ${ago(d.stocks?.asOf || d.generatedAt)}` : `US-listed companies over $10B by exchange-reported sector. Tile size = market value, colour = today’s move; chips show each sector’s cap-weighted move. ${d.sources?.stocks || 'Nasdaq screener'}, ${ago(d.stocks?.asOf || d.generatedAt)}.`));
  }

  /* --- 3. Futures heat map --------------------------------------------------------------------- */
  const COMPLEX = [['Equity futures', 'EQUITY INDEX'], ['Rate futures', 'RATES'], ['Energy', 'ENERGY'], ['Metals', 'METALS'], ['Agriculture', 'GRAINS & SOFTS'], ['Currency futures', 'CURRENCIES']];
  function futMap(host, {big: large = false} = {}) {
    const mode = store.get('hm-fut-mode') === 'sigma' ? 'sigma' : 'pct';
    const rows = COMPLEX.map(([g, label]) => ({label, ids: universe([g]).filter(id => finite(quoteFor(id)?.changePercent))})).filter(r => r.ids.length);
    if (!rows.length) return host.append(el('p', 'fx-empty', 'Waiting for futures quotes…'));
    const all = rows.flatMap(r => r.ids), up = all.filter(id => quoteFor(id).changePercent > 0).length;
    setText('n-futmap', `${up} up · ${all.length - up} down`);
    const tabsRow = el('div', 'hm-tabs'); for (const [k, l] of [['pct', 'Move %'], ['sigma', 'Vs normal (σ)']]) { const b = btn(l, 'fx-chip' + (mode === k ? ' hm-on' : ''), () => { store.set('hm-fut-mode', k); host.replaceChildren(); futMap(host, {big: large}); }); b.setAttribute('aria-pressed', String(mode === k)); tabsRow.append(b); }
    host.append(tabsRow);
    const grid = el('div', 'hm-fut' + (large ? ' hm-fut-lg' : ''));
    for (const r of rows) {
      const sec = el('div', 'hm-futrow'), avg = r.ids.reduce((a, id) => a + quoteFor(id).changePercent, 0) / r.ids.length;
      const lab = el('div', 'hm-futlab'); lab.append(el('b', '', r.label), el('span', avg >= 0 ? 'fx-up' : 'fx-down', pct(avg))); sec.append(lab);
      const tiles = el('div', 'hm-futtiles');
      for (const id of r.ids.sort((a, b) => Math.abs(quoteFor(b).changePercent) - Math.abs(quoteFor(a).changePercent))) {
        const q = quoteFor(id), z = finite(q.vol20) && q.vol20 > 0 ? q.changePercent / q.vol20 : null, v = mode === 'sigma' ? z : q.changePercent;
        const t = btn('', 'hm-ftile', () => focusOn(id), `${nameOf(id)}: ${pct(q.changePercent)}${finite(z) ? `, ${signed(z, 1, 'σ')} vs its normal day` : ''}`);
        t.style.background = heat(v, mode === 'sigma' ? 3 : 2.5);
        t.append(el('b', '', shortOf(id)), el('span', '', pct(q.changePercent)), el('small', '', finite(z) ? signed(z, 1, 'σ') : nameOf(id).slice(0, 14)));
        if (finite(z) && Math.abs(z) >= 2) t.classList.add('hm-hot');
        tiles.append(t);
      }
      sec.append(tiles); grid.append(sec);
    }
    host.append(grid, scaleBar(mode === 'sigma' ? 3 : 2.5, mode === 'sigma' ? 'σ' : '%'), legend(!large ? 'Outlined = moving 2σ+ vs normal' : `Front-month futures, ${S.mk?.source || 'Yahoo Finance, delayed'}. σ = today’s move ÷ its 20-day typical daily move; outlined tiles are moving 2σ or more. Click a tile to chart it.`));
  }

  /* --- 4. News heat map ------------------------------------------------------------------------ */
  const TOPICS = [
    ['Fed & rates', /\b(fed|fomc|powell|rate (cut|hike)s?|interest rates?|treasur(y|ies)|bond yields?)\b/i],
    ['Inflation', /\b(inflation|cpi|pce|prices? rose|price pressures?)\b/i],
    ['Jobs', /\b(jobs? report|payrolls?|unemployment|jobless|labor market|hiring|layoffs?)\b/i],
    ['AI & chips', /\b(ai|artificial intelligence|nvidia|chips?|semiconductors?|openai|gpu|data cent(er|re)s?)\b/i],
    ['Big Tech', /\b(apple|microsoft|alphabet|google|amazon|meta|tesla)\b/i],
    ['Earnings', /\b(earnings|quarterly results|revenue|guidance|profit (warning|beat)|eps)\b/i],
    ['Oil & gas', /\b(oil|crude|opec|brent|wti|natural gas|lng|gasoline)\b/i],
    ['Gold & metals', /\b(gold|silver|copper|platinum|metals?)\b/i],
    ['Crypto', /\b(bitcoin|crypto|ethereum|stablecoins?|btc|eth|solana)\b/i],
    ['Dollar & FX', /\b(dollar|yen|euro|yuan|sterling|currenc(y|ies)|forex)\b/i],
    ['China', /\b(china|chinese|beijing|xi jinping|pboc)\b/i],
    ['Europe & ECB', /\b(ecb|lagarde|eurozone|euro area|europe(an)?|germany|france)\b/i],
    ['Japan & BoJ', /\b(japan|boj|bank of japan|ueda|nikkei)\b/i],
    ['Trade & tariffs', /\b(tariffs?|trade (war|deal|talks)|export controls?|sanctions?)\b/i],
    ['Geopolitics', /\b(war|missile|strike|military|ukraine|russia|israel|iran|gaza|taiwan)\b/i],
    ['Banks & credit', /\b(banks?|lenders?|credit|default|bankruptcy|private credit|debt)\b/i],
    ['Housing', /\b(housing|mortgages?|home (sales|prices)|real estate)\b/i],
    ['Recession & growth', /\b(recession|gdp|slowdown|growth|economy)\b/i],
    ['M&A & IPOs', /\b(merger|acquisitions?|takeover|buyout|ipo|deal to buy)\b/i],
    ['Policy & politics', /\b(congress|white house|trump|election|budget|shutdown|regulators?|sec)\b/i]];
  const NEWS_FEEDS = ['all', 'stocks', 'economics', 'technology', 'commodities', 'energy', 'crypto', 'forex', 'politics', 'world', 'finance'];
  async function newsMap(host, {big: large = false} = {}) {
    host.append(el('p', 'fx-empty', 'Reading live headlines…'));
    await Promise.allSettled(NEWS_FEEDS.map(c => loadNews(c)));
    if (!host.isConnected) return; host.replaceChildren();
    const seen = new Set(), items = [];
    for (const c of NEWS_FEEDS) for (const h of (c === 'all' ? S.briefing : S.desks[c]?.items) || []) { const k = (h.url || h.title || '').toLowerCase(); if (!h?.title || seen.has(k)) continue; seen.add(k); items.push(h); }
    const now = Date.now(), recent = items.filter(h => { const t = Date.parse(h.publishedAt); return !finite(t) || now - t < 86400000; });
    if (!recent.length) return host.append(el('p', 'fx-empty', 'No live headlines yet. They refresh every two minutes.'));
    const tiles = TOPICS.map(([name, re]) => { const hits = recent.filter(h => re.test(h.title)), fresh = hits.filter(h => now - Date.parse(h.publishedAt) < 3 * 3600000).length; return {name, hits, value: hits.length, fresh, heat: hits.length ? fresh / hits.length : 0}; }).filter(t => t.value).sort((a, b) => b.value - a.value);
    if (!tiles.length) return host.append(el('p', 'fx-empty', 'No headline matched the tracked topics yet.'));
    setText('n-newsmap', `${recent.length} headlines · hottest ${tiles.slice().sort((a, b) => b.heat * Math.sqrt(b.value) - a.heat * Math.sqrt(a.value))[0].name}`);
    const box = stage(host, large ? 560 : 0); box.classList.add('hm-fill');
    // Colour: share of the topic's headlines published in the last 3 hours (0 % cool blue → 100 % hot amber/red).
    const hot = v => { const a = Math.max(0, Math.min(1, v)); return `rgb(${Math.round(30 + a * 190)},${Math.round(60 + a * 60 - a * a * 50)},${Math.round(90 - a * 60)})`; };
    onResize(box, ({w, h}) => {
      box.replaceChildren(); const sv = tileSVG(w, h); sv.setAttribute('aria-label', 'News heat map by topic');
      for (const r of squarify(tiles, 0, 0, w, h)) tile(sv, r, {label: r.item.name, sub: `${r.item.value} · ${Math.round(r.item.heat * 100)}% last 3h`, fill: hot(r.item.heat), labelMin: 40,
        title: `${r.item.name}: ${r.item.value} headlines in 24 h, ${r.item.fresh} in the last 3 h`,
        onClick: () => inspect(`${r.item.name} · ${r.item.value} headlines`, body => { for (const hd of r.item.hits.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 25)) body.append(headlineRow(hd)); })});
      box.append(sv);
    });
    const sc = el('div', 'hm-scale'); for (const [v, l] of [[0, 'older'], [0.33, ''], [0.66, ''], [1, 'all last 3h']]) { const s = el('span', '', l); s.style.background = hot(v); sc.append(s); }
    host.append(sc, legend(!large ? `${recent.length} headlines · 24 h · click a topic` : `${recent.length} unique headlines from FYNX’s live news feeds in the last 24 hours, matched to market topics by keywords (one headline can count for several topics). Tile size = headline count, colour = share published in the last 3 hours. Click a topic for its headlines.`));
  }

  /* --- 5. Crypto & currencies ------------------------------------------------------------------ */
  async function cfxMap(host, {big: large = false} = {}) {
    const mode = store.get('hm-cfx-mode') || (S.deskKey === 'forex' ? 'fx' : 'crypto');
    const tabsRow = el('div', 'hm-tabs'); for (const [k, l] of [['crypto', 'Crypto'], ['fx', 'Currencies']]) { const b = btn(l, 'fx-chip' + (mode === k ? ' hm-on' : ''), () => { store.set('hm-cfx-mode', k); host.replaceChildren(); cfxMap(host, {big: large}); }); b.setAttribute('aria-pressed', String(mode === k)); tabsRow.append(b); }
    host.append(tabsRow);
    if (mode === 'fx') {
      const groups = [['FX majors', 'MAJORS'], ['FX crosses', 'CROSSES'], ['FX emerging', 'EMERGING']].map(([g, l]) => ({l, ids: universe([g]).filter(id => finite(quoteFor(id)?.changePercent))})).filter(g => g.ids.length);
      if (!groups.length) return host.append(el('p', 'fx-empty', 'Waiting for FX quotes…'));
      setText('n-cfx', `${groups.reduce((a, g) => a + g.ids.length, 0)} pairs`);
      const grid = el('div', 'hm-fut' + (large ? ' hm-fut-lg' : ''));
      for (const g of groups) { const sec = el('div', 'hm-futrow'), lab = el('div', 'hm-futlab'); lab.append(el('b', '', g.l)); sec.append(lab); const tiles = el('div', 'hm-futtiles');
        for (const id of g.ids) { const q = quoteFor(id), z = finite(q.vol20) && q.vol20 > 0 ? q.changePercent / q.vol20 : null; const t = btn('', 'hm-ftile', () => focusOn(id), `${nameOf(id)} ${pct(q.changePercent)}`); t.style.background = heat(q.changePercent, 1); t.append(el('b', '', shortOf(id)), el('span', '', pct(q.changePercent)), el('small', '', finite(z) ? signed(z, 1, 'σ') : '')); if (finite(z) && Math.abs(z) >= 2) t.classList.add('hm-hot'); tiles.append(t); }
        sec.append(tiles); grid.append(sec); }
      return host.append(grid, scaleBar(1, '%'), legend('Spot FX, quoted as listed (e.g. EURUSD up = euro stronger; USDJPY up = dollar stronger). Colour = today’s move, ±1% is full colour. σ = move vs its 20-day normal.'));
    }
    host.append(el('p', 'fx-empty', 'Loading crypto…'));
    const d = await loadScan(); if (!host.isConnected) return; host.lastChild.remove();
    const list = coins(d).slice(0, large ? 80 : 40);
    if (!list.length) return host.append(el('p', 'fx-empty', 'The crypto universe is being published.'));
    const capSum = list.reduce((a, b) => a + b.cap, 0), wavg = list.reduce((a, b) => a + b.chg * b.cap, 0) / capSum;
    setText('n-cfx', `${list.length} coins · ${pct(wavg)} wtd`);
    const box = stage(host, large ? 560 : 0); box.classList.add('hm-fill');
    onResize(box, ({w, h}) => {
      box.replaceChildren(); const sv = tileSVG(w, h); sv.setAttribute('aria-label', 'Crypto treemap by market value');
      for (const r of squarify(list.map(c => ({...c, value: c.cap})), 0, 0, w, h)) tile(sv, r, {label: r.item.sym, sub: pct(r.item.chg), fill: heat(r.item.chg, 6), title: `${r.item.name} (${r.item.sym}) · 24h ${pct(r.item.chg)} · 7d ${pct(r.item.chg7)} · ${big(r.item.cap)}`, onClick: () => openSym(r.item.open, r.item.name)});
      box.append(sv);
    });
    host.append(scaleBar(6, '%'), legend(!large ? `Size = market value · 24 h · ${ago(d.crypto?.asOf || d.generatedAt)}` : `Top ${list.length} coins by market value (stablecoins and wrapped tokens left out). Tile size = market value, colour = 24-hour move (±6% full colour). ${d.sources?.crypto || 'CoinGecko'}, ${ago(d.crypto?.asOf || d.generatedAt)}.`));
  }

  /* --- register: panels, a full HEAT page, desk layouts ---------------------------------------- */
  const MAPS = [
    ['aimap', 'AIMAP', 'AI bubble map', 'AI and big-tech stocks as bubbles: size = market value, colour = today’s move', aiMap],
    ['sectmap', 'SECT', 'Stocks by sector', 'US stocks over $10B grouped by sector, sized by market value', sectorMap],
    ['futmap', 'FUTMAP', 'Futures heat map', 'Every futures complex, coloured by move or by move vs normal (σ)', futMap],
    ['newsmap', 'NEWSMAP', 'News heat map', 'Which market topics dominate live headlines and which are heating up', newsMap],
    ['cfx', 'CFX', 'Crypto & currencies', 'Top coins by market value and FX majors, crosses and emerging currencies', cfxMap]];
  for (const [id, code, title, desc, fn] of MAPS) {
    T.PANELS[id] = [code, title, 'heatmaps'];
    T.PANEL_DESC[id] = desc;
    T.LINK_LABEL[id] = 'All heat maps';
    T.RENDER[id] = async () => { const host = panel(id); try { await fn(host); } catch (e) { T.report('heat-' + id, e); } };
  }
  T.EXTRA_GROUPS.push(['Heat maps', MAPS.map(m => m[0])]);
  if (PG) {
    PG.add('heatmaps', 'Heat maps', async (host, arg) => {
      const key = MAPS.find(m => m[0] === String(arg || '').toLowerCase() || m[1] === String(arg || '').toUpperCase())?.[0] || store.get('hm-page') || 'aimap';
      PG.setHead('HEAT', 'Heat maps', 'AI bubbles, sectors, futures, news and crypto & currencies — live, colour-coded, click anything to open it');
      host.append(PG.pageTabs(MAPS.map(m => [m[0], m[2]]), key, k => { store.set('hm-page', k); PG.rerender(); }));
      const body = el('div', 'hm-page'); host.append(body);
      await MAPS.find(m => m[0] === key)[4](body, {big: true});
    });
    T.PAGE_NAMES.push('HEATMAPS');
  }
  // Default layouts: the ALL desk gets a full heat-map row; other desks swap the plain grid for their own map.
  const D = T.DESK_DEFS || {};
  if (D.all && !D.all.slots.includes('aimap')) D.all.slots = [...D.all.slots, ...['aimap', 'sectmap', 'futmap', 'newsmap', 'cfx', 'scan'].filter(x => !D.all.slots.includes(x))];
  const swap = (desk, from, to) => { const d = D[desk]; if (d && d.slots.includes(from) && !d.slots.includes(to)) d.slots = d.slots.map(s => s === from ? to : s); };
  swap('stocks', 'heat', 'sectmap'); swap('stocks', 'xa', 'aimap'); swap('futures', 'heat', 'futmap'); swap('commodities', 'heat', 'futmap');
  swap('crypto', 'heat', 'cfx'); swap('forex', 'heat', 'cfx'); swap('indices', 'heat', 'newsmap');
  // Quote refreshes redraw the quote-driven maps; news maps follow the headline refresh.
  setInterval(() => { if (document.hidden) return; for (const k of ['futmap', 'cfx']) if (document.getElementById('tp-' + k)) T.R(k); }, 60000);
  setInterval(() => { if (document.hidden) return; for (const k of ['newsmap', 'aimap', 'sectmap']) if (document.getElementById('tp-' + k)) T.R(k); }, 300000);
});
