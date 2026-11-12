/* FYNX Terminal plugin: Market Scanner (SCAN).
 * Screens every US-listed stock (Nasdaq, NYSE, NYSE American) and ETF, the top 500 crypto assets and
 * FYNX's 157 cross-asset markets (FX, futures, commodities, indices, yields, funds) by price, change,
 * volume, market cap, sector, industry, country, theme and trend. Ready-made scans work like broker
 * scanners ("AI stocks under $3", "penny movers", "unusual moves vs normal"); custom scans can be saved.
 * Data: scanner.json on the terminal-data branch (Nasdaq screeners, CoinGecko) + live terminal quotes. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  if (!PG) return;
  const {S, el, btn, signed, tone, fmt, finite, store} = T;
  const read = (k, d) => { try { return JSON.parse(store.get(k) || 'null') ?? d; } catch { return d; } };
  const save = (k, v) => store.set(k, JSON.stringify(v));
  let DATA = null, loading = null;
  const load = () => DATA ? Promise.resolve(DATA) : (loading ||= T.getJSON(T.TDATA + 'scanner.json', {bust: true, timeout: 30000}).then(d => (DATA = d)).catch(e => { T.report('scanner', e); loading = null; return null; }));
  const big = n => !finite(n) ? '—' : n >= 1e12 ? (n / 1e12).toFixed(2) + 'T' : n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(Math.round(n));
  const price = p => !finite(p) ? '—' : p >= 1000 ? p.toLocaleString('en-US', {maximumFractionDigits: 2}) : p >= 1 ? p.toFixed(2) : p >= 0.01 ? p.toFixed(4) : p.toPrecision(3);
  const pct = v => finite(v) ? signed(v, 2, '%') : '—';
  const CAPS = [['', 'Any size'], ['mega', 'Mega > $200B', 2e11, Infinity], ['large', 'Large $10–200B', 1e10, 2e11], ['mid', 'Mid $2–10B', 2e9, 1e10], ['small', 'Small $300M–2B', 3e8, 2e9], ['micro', 'Micro $50–300M', 5e7, 3e8], ['nano', 'Nano < $50M', 0, 5e7]];
  const CRYPTO_CATS = {ai: 'AI', meme: 'Meme', l1: 'Layer 1', l2: 'Layer 2', defi: 'DeFi', rwa: 'Real-world assets', gaming: 'Gaming', solana: 'Solana ecosystem', depin: 'DePIN', stable: 'Stablecoins'};
  const ETF_THEMES = {ai: 'AI & robotics', semis: 'Semiconductors', crypto: 'Crypto', nuclear: 'Uranium & nuclear', clean: 'Clean energy', ev: 'EV & lithium', cyber: 'Cybersecurity', gold: 'Gold & precious metals', oil: 'Oil & energy', bonds: 'Bonds', dividend: 'Dividend & income', leveraged: 'Leveraged & inverse', international: 'International', covered: 'Covered call & buffer'};
  const YEAR = new Date().getUTCFullYear();

  // Ready-made scans. f = filters, s = [sort key, direction].
  const PRESETS = {
    stocks: [
      ['gainers', 'Top % gainers', {priceMin: 1, volMin: 100000}, ['chg', -1]], ['losers', 'Top % losers', {priceMin: 1, volMin: 100000}, ['chg', 1]],
      ['active', 'Most active', {}, ['vol', -1]], ['dollar', 'Most traded $', {}, ['dvol', -1]],
      ['ai3', 'AI stocks under $3', {theme: 'ai', priceMax: 3}, ['vol', -1]], ['penny', 'Penny movers < $5', {priceMax: 5, volMin: 1000000}, ['chg', -1]],
      ['mega', 'Mega & large caps', {cap: 'mega|large'}, ['chg', -1]], ['small', 'Small-cap gainers', {cap: 'small', volMin: 200000}, ['chg', -1]],
      ['ipo', 'Recent IPOs', {ipo: true}, ['chg', -1]], ['semis', 'Chip stocks', {theme: 'semis'}, ['chg', -1]], ['quantum', 'Quantum computing', {theme: 'quantum'}, ['chg', -1]],
      ['nuclear', 'Nuclear & uranium', {theme: 'nuclear'}, ['chg', -1]], ['cryptostk', 'Bitcoin & crypto stocks', {theme: 'crypto'}, ['chg', -1]], ['space', 'Space', {theme: 'space'}, ['chg', -1]]
    ],
    etfs: [['gainers', 'Top % gainers', {noLev: true}, ['chg', -1]], ['losers', 'Top % losers', {noLev: true}, ['chg', 1]], ['year', 'Best 1 year', {noLev: true}, ['y1', -1]], ['worst', 'Worst 1 year', {noLev: true}, ['y1', 1]],
      ['ai', 'AI & robotics ETFs', {theme: 'ai'}, ['chg', -1]], ['crypto', 'Crypto ETFs', {theme: 'crypto'}, ['chg', -1]], ['gold', 'Gold & metals ETFs', {theme: 'gold'}, ['chg', -1]], ['leveraged', 'Leveraged & inverse', {theme: 'leveraged'}, ['chg', -1]], ['dividend', 'Dividend & income', {theme: 'dividend'}, ['y1', -1]]],
    crypto: [['gainers', 'Top 24h gainers', {volMin: 1000000}, ['c24', -1]], ['losers', 'Top 24h losers', {volMin: 1000000}, ['c24', 1]], ['hour', 'Moving now (1h)', {volMin: 1000000}, ['c1', -1]], ['week', 'Best 7 days', {volMin: 1000000}, ['c7', -1]], ['volume', 'Highest volume', {}, ['vol', -1]],
      ['ath', 'Near all-time high', {athMin: -15}, ['ath', -1]], ['under1', 'Under $1 (top 300)', {priceMax: 1, rankMax: 300}, ['c24', -1]], ['ai', 'AI coins', {theme: 'ai'}, ['c24', -1]], ['meme', 'Meme coins', {theme: 'meme'}, ['c24', -1]], ['l1', 'Layer 1', {theme: 'l1'}, ['cap', -1]], ['defi', 'DeFi', {theme: 'defi'}, ['c24', -1]]],
    markets: [['unusual', 'Unusual moves vs normal', {}, ['z', -2]], ['highs', 'Near 12-month highs', {nearHigh: 2}, ['fromHigh', -1]], ['lows', 'Near 12-month lows', {nearLow: 2}, ['fromLow', 1]],
      ['up1m', 'Strongest month', {}, ['m1', -1]], ['dn1m', 'Weakest month', {}, ['m1', 1]], ['ytd', 'Best year to date', {}, ['ytd', -1]]]
  };
  const ASSETS = [['stocks', 'US stocks'], ['etfs', 'ETFs'], ['crypto', 'Crypto'], ['markets', 'FX · futures · indices']];
  const deskAsset = () => ({crypto: 'crypto', funds: 'etfs', forex: 'markets', commodities: 'markets', futures: 'markets', bonds: 'markets', indices: 'markets', economy: 'markets', world: 'markets'}[S.deskKey] || 'stocks');
  const deskGroup = () => ({forex: 'FX', commodities: 'commod', futures: 'futures', bonds: 'rates', indices: 'equity'}[S.deskKey] || '');

  /* ---------- Universe rows: one normalised shape per asset class ---------- */
  function rowsFor(asset) {
    if (asset === 'stocks' && DATA?.stocks) return DATA.stocks.rows.map(r => ({sym: r[0], name: r[1], price: r[2], chg: r[3], vol: r[4], cap: r[5], sector: r[6], industry: r[7], country: r[8], ipo: r[9], themes: r[10], dvol: finite(r[2]) && finite(r[4]) ? r[2] * r[4] : null, open: r[0]}));
    if (asset === 'etfs' && DATA?.etfs) return DATA.etfs.rows.map(r => ({sym: r[0], name: r[1], price: r[2], chg: r[3], y1: r[4], themes: r[5], open: r[0]}));
    if (asset === 'crypto' && DATA?.crypto) return DATA.crypto.rows.map(r => ({sym: r[1], name: r[2], price: r[3], c1: r[4], c24: r[5], c7: r[6], cap: r[7], vol: r[8], rank: r[9], ath: r[10], themes: r[11], open: r[1] + '-USD'}));
    if (asset === 'markets') return Object.values(S.mk?.quotes || {}).filter(q => finite(q.price) && Array.isArray(q.history) && q.history.length > 30).map(q => {
      const h = q.history, last = h.length - 1, back = n => h[Math.max(0, last - n)][1], y0 = h.find(x => String(x[0]).startsWith(String(h[last][0]).slice(0, 4)))?.[1];
      const live = T.quoteFor(q.symbol) || q, p = live.price ?? q.price, cp = live.changePercent ?? q.changePercent;
      const hi = Math.max(...h.slice(-252).map(x => x[1]), p), lo = Math.min(...h.slice(-252).map(x => x[1]), p);
      return {sym: q.symbol, name: q.name, group: q.group, price: p, chg: cp, z: finite(cp) && q.vol20 > 0 ? cp / q.vol20 : null, m1: (p / back(21) - 1) * 100, ytd: y0 ? (p / y0 - 1) * 100 : null, fromHigh: (p / hi - 1) * 100, fromLow: (p / lo - 1) * 100, open: q.symbol};
    });
    return [];
  }
  function apply(rows, f, asset) {
    const capR = f.cap ? CAPS.filter(c => f.cap.split('|').includes(c[0])) : null, q = (f.q || '').trim().toLowerCase();
    return rows.filter(r => {
      if (q && !(r.sym.toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q) || (r.industry || '').toLowerCase().includes(q))) return false;
      if (f.priceMin != null && f.priceMin !== '' && !(r.price >= +f.priceMin)) return false;
      if (f.priceMax != null && f.priceMax !== '' && !(r.price <= +f.priceMax)) return false;
      if (f.volMin && !(r.vol >= +f.volMin)) return false;
      if (f.chgMin != null && f.chgMin !== '' && !((asset === 'crypto' ? r.c24 : r.chg) >= +f.chgMin)) return false;
      if (f.chgMax != null && f.chgMax !== '' && !((asset === 'crypto' ? r.c24 : r.chg) <= +f.chgMax)) return false;
      if (capR && !capR.some(c => r.cap >= c[2] && r.cap < c[3])) return false;
      if (f.theme && !(r.themes || []).includes(f.theme)) return false;
      if (f.sector && r.sector !== f.sector) return false;
      if (f.country && r.country !== f.country) return false;
      if (f.ipo && !(r.ipo >= YEAR - 1)) return false;
      if (f.noSpac && (r.themes || []).includes('spac')) return false;
      if (f.noLev && (r.themes || []).includes('leveraged')) return false;
      if (f.rankMax && !(r.rank <= +f.rankMax)) return false;
      if (f.athMin != null && f.athMin !== '' && !(r.ath >= +f.athMin)) return false;
      if (f.group && !matchGroup(r.group, f.group)) return false;
      if (f.nearHigh && !(r.fromHigh >= -f.nearHigh)) return false;
      if (f.nearLow && !(r.fromLow <= f.nearLow)) return false;
      return true;
    });
  }
  const GROUPS = [['', 'All markets'], ['FX', 'Currencies'], ['equity', 'Stock indices'], ['futures', 'Futures'], ['commod', 'Commodities'], ['rates', 'Rates & bonds'], ['Crypto', 'Crypto'], ['funds', 'Funds'], ['Stocks', 'Mega-cap stocks']];
  function matchGroup(g, f) {
    g = String(g || '');
    if (f === 'FX') return /^FX|Dollar|Currency/.test(g); if (f === 'equity') return /Americas|Europe|Asia|Equity futures/.test(g);
    if (f === 'futures') return /futures/i.test(g); if (f === 'commod') return /Energy|Metals|Agriculture|Commodity/.test(g);
    if (f === 'rates') return /Yields|Rate|Bond/.test(g); if (f === 'funds') return /funds/i.test(g); return g === f;
  }
  function sortRows(rows, [key, dir]) {
    const v = r => key === 'z' ? Math.abs(r.z ?? NaN) : r[key];
    return rows.slice().sort((a, b) => { const x = v(a), y = v(b); if (!finite(x) && !finite(y)) return 0; if (!finite(x)) return 1; if (!finite(y)) return -1; return (dir < 0 ? y - x : x - y); });
  }

  /* ---------- Columns ---------- */
  const COLS = {
    stocks: [['sym', 'SYMBOL'], ['name', 'NAME'], ['price', 'PRICE', price], ['chg', 'CHG %', pct, true], ['vol', 'VOLUME', big], ['dvol', '$ VOLUME', big], ['cap', 'MKT CAP', big], ['industry', 'INDUSTRY'], ['themes', 'THEMES']],
    etfs: [['sym', 'SYMBOL'], ['name', 'NAME'], ['price', 'PRICE', price], ['chg', 'CHG %', pct, true], ['y1', '1Y %', pct, true], ['themes', 'THEMES']],
    crypto: [['sym', 'SYMBOL'], ['name', 'NAME'], ['price', 'PRICE', price], ['c1', '1H %', pct, true], ['c24', '24H %', pct, true], ['c7', '7D %', pct, true], ['cap', 'MKT CAP', big], ['vol', 'VOLUME', big], ['ath', 'FROM ATH', pct, true], ['themes', 'CATEGORIES']],
    markets: [['sym', 'SYMBOL'], ['name', 'NAME'], ['group', 'GROUP'], ['price', 'PRICE', null], ['chg', 'DAY %', pct, true], ['z', 'VS NORMAL', v => finite(v) ? signed(v, 1, 'σ') : '—', true], ['m1', '1M %', pct, true], ['ytd', 'YTD %', pct, true], ['fromHigh', 'FROM 12M HIGH', pct, true]]
  };
  const themeLabel = (asset, id) => asset === 'crypto' ? CRYPTO_CATS[id] : asset === 'etfs' ? ETF_THEMES[id] : DATA?.themes?.find(t => t.id === id)?.label || id;

  function table(asset, rows, sort, onSort, limit) {
    const tb = el('table', 'fx-table pg-table sc-table'), h = el('tr');
    for (const [k, label, , num] of COLS[asset]) {
      const th = el('th', num || /price|vol|cap|dvol|y1/.test(k) ? 'fx-num' : ''), b = btn(label + (sort[0] === k ? (sort[1] < 0 ? ' ▼' : ' ▲') : ''), 'sc-sort', () => onSort(k), `Sort by ${label.toLowerCase()}`);
      th.setAttribute('aria-sort', sort[0] === k ? (sort[1] < 0 ? 'descending' : 'ascending') : 'none'); th.append(b); h.append(th);
    }
    tb.append(h);
    for (const r of rows.slice(0, limit)) {
      const tr = el('tr', 'pg-click'); tr.tabIndex = 0; tr.setAttribute('aria-label', `Open ${r.sym} ${r.name}`);
      const go = () => T.setSymbol({symbol: r.open, name: r.name}); tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      for (const [k, , f, num] of COLS[asset]) {
        const v = r[k];
        if (k === 'sym') { tr.append(el('th', 'sc-sym', v)); continue; }
        if (k === 'themes') { const td = el('td', 'sc-tags'); (v || []).slice(0, 3).forEach(t => td.append(el('span', 'sc-tag', themeLabel(asset, t) || t))); tr.append(td); continue; }
        if (asset === 'markets' && k === 'price') { tr.append(el('td', 'fx-num', fmt(v, T.digitsOf(r.sym)))); continue; }
        tr.append(el('td', (f ? 'fx-num ' : '') + (num ? tone(v) : '') + (k === 'name' || k === 'industry' ? ' sc-text' : ''), f ? f(v) : String(v ?? '—')));
      }
      tb.append(tr);
    }
    return tb;
  }
  function csv(asset, rows) {
    const cols = COLS[asset], lines = [cols.map(c => c[1]).join(',')];
    rows.forEach(r => lines.push(cols.map(([k]) => { const v = Array.isArray(r[k]) ? r[k].join(' ') : r[k]; return /[",\n]/.test(String(v ?? '')) ? '"' + String(v).replace(/"/g, '""') + '"' : (v ?? ''); }).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type: 'text/csv'})); a.download = `fynx-scan-${asset}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- Page ---------- */
  function control(label, input) { const l = el('label', 'sc-ctl'); l.append(el('span', '', label), input); return l; }
  function select(options, value, onChange) { const s = document.createElement('select'); s.className = 'sc-in'; options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.append(o); }); s.value = value ?? ''; s.addEventListener('change', () => onChange(s.value)); return s; }
  function number(value, placeholder, onChange) { const i = document.createElement('input'); i.type = 'number'; i.inputMode = 'decimal'; i.step = 'any'; i.className = 'sc-in'; i.placeholder = placeholder; i.value = value ?? ''; i.addEventListener('change', () => onChange(i.value === '' ? '' : Number(i.value))); return i; }

  PG.add('scan', 'Market scanner', async (host, arg, alive) => {
    let st = read('scan-state', null);
    const argAsset = ASSETS.find(a => a[0] === String(arg || '').toLowerCase())?.[0];
    const presetArg = arg && !argAsset ? String(arg).toLowerCase() : null;
    if (!st || argAsset || presetArg) {
      const asset = argAsset || (presetArg && Object.keys(PRESETS).find(a => PRESETS[a].some(p => p[0] === presetArg || (a === 'stocks' && presetArg === p[0])))) || (st ? st.asset : deskAsset());
      const p = PRESETS[asset].find(x => x[0] === presetArg) || PRESETS[asset][0];
      st = {asset, preset: p[0], f: {...p[2], ...(asset === 'markets' && deskGroup() ? {group: deskGroup()} : {})}, sort: p[3], limit: 100};
    }
    const setSt = next => { st = {...st, ...next}; save('scan-state', st); PG.rerender(); };
    PG.setHead('SCAN', 'Market scanner', 'Screen every US stock and ETF, the top 500 crypto assets and FYNX’s cross-asset markets');
    host.append(el('p', 'fx-empty', 'Loading the market universe…'));
    const d = await load(); if (!alive()) return; host.replaceChildren();
    if (!d && st.asset !== 'markets') return host.append(el('p', 'fx-empty', 'The scanner universe is being published; FX, futures and index scans work now.'), PG.chips([btn('Scan FX · futures · indices', 'fx-chip fx-chip-link', () => setSt({asset: 'markets', preset: 'unusual', f: {}, sort: ['z', -2]}))]));
    // Asset class tabs and ready-made scans.
    host.append(PG.pageTabs(ASSETS, st.asset, a => { const p = PRESETS[a][0]; setSt({asset: a, preset: p[0], f: {...p[2]}, sort: p[3], limit: 100}); }));
    const pre = el('div', 'fx-chips sc-presets');
    PRESETS[st.asset].forEach(([id, label, f, s]) => { const b = btn(label, 'fx-chip' + (st.preset === id ? ' on' : ''), () => setSt({preset: id, f: {...f, ...(st.f.q ? {q: st.f.q} : {})}, sort: s, limit: 100})); b.setAttribute('aria-pressed', String(st.preset === id)); pre.append(b); });
    const saved = read('scan-saved', []).filter(x => x.asset === st.asset);
    saved.forEach(x => { const b = btn('★ ' + x.name, 'fx-chip sc-saved' + (st.preset === 'saved:' + x.name ? ' on' : ''), () => setSt({preset: 'saved:' + x.name, f: x.f, sort: x.sort, limit: 100}), 'Saved scan ' + x.name); pre.append(b); });
    host.append(pre);
    // Filters.
    const f = st.f, upd = patch => setSt({preset: 'custom', f: {...f, ...patch}, limit: 100});
    const box = el('div', 'sc-filters');
    const q = document.createElement('input'); q.type = 'search'; q.className = 'sc-in'; q.placeholder = st.asset === 'stocks' ? 'Symbol, company or industry' : 'Symbol or name'; q.value = f.q || ''; q.addEventListener('change', () => upd({q: q.value}));
    box.append(control('Search', q));
    if (st.asset === 'stocks') {
      box.append(control('Theme', select([['', 'Any theme'], ...(d.themes || []).map(t => [t.id, t.label])], f.theme, v => upd({theme: v}))));
      const sectors = [...new Set(d.stocks.rows.map(r => r[6]).filter(Boolean))].sort();
      box.append(control('Sector', select([['', 'Any sector'], ...sectors.map(s => [s, s])], f.sector, v => upd({sector: v}))));
      box.append(control('Market cap', select(CAPS.map(c => [c[0], c[1]]).concat([['mega|large', 'Large & mega'], ['small|micro|nano', 'Small & below']]), f.cap, v => upd({cap: v}))));
      const countries = Object.entries(d.stocks.rows.reduce((m, r) => (m[r[8]] = (m[r[8]] || 0) + 1, m), {})).filter(([c]) => c).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([c]) => [c, c]);
      box.append(control('Country', select([['', 'Any country'], ...countries], f.country, v => upd({country: v}))));
    }
    if (st.asset === 'etfs') box.append(control('Theme', select([['', 'Any theme'], ...Object.entries(ETF_THEMES)], f.theme, v => upd({theme: v}))));
    if (st.asset === 'crypto') box.append(control('Category', select([['', 'Any category'], ...Object.entries(CRYPTO_CATS)], f.theme, v => upd({theme: v}))), control('Market cap', select(CAPS.map(c => [c[0], c[1]]), f.cap, v => upd({cap: v}))));
    if (st.asset === 'markets') box.append(control('Group', select(GROUPS, f.group, v => upd({group: v}))));
    if (st.asset !== 'markets') {
      box.append(control('Price from', number(f.priceMin, 'min', v => upd({priceMin: v}))), control('Price to', number(f.priceMax, 'max', v => upd({priceMax: v}))));
      box.append(control(st.asset === 'crypto' ? '24h change ≥ %' : 'Change ≥ %', number(f.chgMin, 'e.g. 5', v => upd({chgMin: v}))), control(st.asset === 'crypto' ? '24h change ≤ %' : 'Change ≤ %', number(f.chgMax, 'e.g. -5', v => upd({chgMax: v}))));
    }
    const VOLS = st.asset === 'crypto' ? [['', 'Any'], ['1000000', '$1M'], ['10000000', '$10M'], ['50000000', '$50M'], ['100000000', '$100M'], ['1000000000', '$1B']] : [['', 'Any'], ['100000', '100K'], ['500000', '500K'], ['1000000', '1M'], ['5000000', '5M'], ['20000000', '20M']];
    if (st.asset === 'stocks' || st.asset === 'crypto') box.append(control(st.asset === 'crypto' ? '24h volume at least' : 'Volume at least', select(VOLS, f.volMin ? String(f.volMin) : '', v => upd({volMin: v ? +v : ''}))));
    if (st.asset === 'stocks') { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!f.noSpac; c.addEventListener('change', () => upd({noSpac: c.checked})); box.append(control('Hide SPACs', c)); }
    if (st.asset === 'etfs') { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!f.noLev; c.addEventListener('change', () => upd({noLev: c.checked})); box.append(control('Hide leveraged & inverse', c)); }
    // Filters fold away on phones so results come first; the count shows how many are set.
    const active = Object.entries(f).filter(([k, v]) => v !== '' && v != null && v !== false && k !== 'q').length;
    const fold = document.createElement('details'); fold.className = 'sc-fold'; fold.open = read('scan-filters-open', matchMedia('(min-width:601px)').matches);
    const sum = document.createElement('summary'); sum.textContent = `Filters${active ? ` · ${active} set` : ''}`; fold.append(sum, box);
    fold.addEventListener('toggle', () => save('scan-filters-open', fold.open));
    host.append(fold);
    // Results.
    const all = rowsFor(st.asset), hits = sortRows(apply(all, f, st.asset), st.sort);
    const bar = el('div', 'sc-bar');
    bar.append(el('b', '', `${hits.length.toLocaleString()} of ${all.length.toLocaleString()} ${st.asset === 'markets' ? 'markets' : st.asset === 'crypto' ? 'assets' : st.asset === 'etfs' ? 'ETFs' : 'stocks'} match`));
    bar.append(btn('Save scan', 'fx-chip', () => { const name = prompt('Name this scan', PRESETS[st.asset].find(p => p[0] === st.preset)?.[1] || 'My scan'); if (!name) return; const list = read('scan-saved', []).filter(x => !(x.asset === st.asset && x.name === name)); list.unshift({asset: st.asset, name: name.slice(0, 40), f: st.f, sort: st.sort}); save('scan-saved', list.slice(0, 30)); setSt({preset: 'saved:' + name.slice(0, 40)}); }),
      btn('Export CSV', 'fx-chip', () => csv(st.asset, hits)), btn('Reset', 'fx-chip', () => { const p = PRESETS[st.asset][0]; setSt({preset: p[0], f: {...p[2]}, sort: p[3], limit: 100}); }));
    if (st.preset.startsWith('saved:')) bar.append(btn('Delete saved scan', 'fx-chip', () => { save('scan-saved', read('scan-saved', []).filter(x => !(x.asset === st.asset && 'saved:' + x.name === st.preset))); const p = PRESETS[st.asset][0]; setSt({preset: p[0], f: {...p[2]}, sort: p[3]}); }));
    host.append(bar);
    if (!hits.length) { host.append(el('p', 'pg-lead', 'No market matches every filter. Loosen one filter — for example widen the price range or clear the theme.')); }
    else {
      const wrap = el('div', 'pg-scroll sc-wrap'); wrap.append(table(st.asset, hits, st.sort, k => setSt({sort: [k, st.sort[0] === k ? -st.sort[1] : -1]}), st.limit)); host.append(wrap);
      if (hits.length > st.limit) host.append(PG.chips([btn(`Show ${Math.min(100, hits.length - st.limit)} more`, 'fx-chip fx-chip-link', () => setSt({limit: st.limit + 100}))]));
    }
    const src = st.asset === 'markets' ? `FYNX market snapshot (${S.mk?.source || 'Yahoo Finance, delayed'}). “Vs normal” = today’s move ÷ its 20-day typical daily move.`
      : `${d.sources[st.asset]} · as of ${new Date(d[st.asset]?.asOf || d.generatedAt).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}${d[st.asset]?.stale ? ' (last saved copy)' : ''}.` + (st.asset === 'stocks' ? ' Themes come from exchange-reported industry, words in the registered company name or short curated member lists — check the company before trading.' : st.asset === 'crypto' ? ' Categories from CoinGecko.' : '') + ' Click a row to load everything for that market.';
    host.append(PG.sourceNote(src));
  });

  // Command line: SCAN · SCAN CRYPTO · SCAN AI3 · SCAN PENNY …
  T.PAGE_NAMES.push('SCAN');
  // Panel: the last scan's top results.
  T.PANELS.scan = ['SCAN', 'Market scanner', 'scan'];
  T.PANEL_DESC.scan = 'Top results of your last scan — gainers, AI stocks under $3, crypto movers and more';
  T.LINK_LABEL.scan = 'Open scanner';
  T.RENDER.scan = async () => {
    const host = T.panel('scan'); host.append(el('p', 'fx-empty', 'Loading scanner…'));
    await load(); if (!host.isConnected) return; host.replaceChildren();
    const st = read('scan-state', null) || (() => { const a = deskAsset(), p = PRESETS[a][0]; return {asset: a, preset: p[0], f: {...p[2]}, sort: p[3]}; })();
    const hits = sortRows(apply(rowsFor(st.asset), st.f, st.asset), st.sort).slice(0, 10);
    host.append(el('p', 'pm-lead', (PRESETS[st.asset].find(p => p[0] === st.preset)?.[1] || (st.preset.startsWith('saved:') ? st.preset.slice(6) : 'Custom scan')) + ' · ' + ASSETS.find(a => a[0] === st.asset)[1]));
    const key = st.asset === 'crypto' ? 'c24' : 'chg';
    for (const r of hits) { const b = T.rowButton('pm-c4', () => T.setSymbol({symbol: r.open, name: r.name}), `${r.sym} ${r.name}`); b.append(el('b', '', r.sym), el('span', 'fx-num', price(r.price)), el('span', 'fx-num ' + tone(r[key]), pct(r[key])), el('span', 'fx-num fx-dim', st.asset === 'markets' ? (finite(r.z) ? signed(r.z, 1, 'σ') : '') : big(r.vol ?? r.cap))); host.append(b); }
    if (!hits.length) host.append(el('p', 'fx-empty', 'No matches for this scan — open the scanner to adjust it.'));
  };
  T.EXTRA_GROUPS.push(['Scanners', ['scan']]);
  // A Scanner button beside “Find any market”.
  const find = document.getElementById('fx-find-btn');
  if (find && !document.getElementById('fx-scan-btn')) { const b = document.createElement('button'); b.type = 'button'; b.id = 'fx-scan-btn'; b.className = find.className; b.textContent = '⚲ Scanner'; b.setAttribute('aria-label', 'Open the market scanner'); b.addEventListener('click', () => T.openPage('scan')); find.after(b); }
});
