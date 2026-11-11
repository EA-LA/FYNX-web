/* FYNX Terminal plugin: the WORLD desk. A live globe where every country (and every US state) has a light:
 * red = something big is happening, yellow = worth watching, green = quiet, grey = no live signal for it.
 * Lights come from fixed rules over live data (central bank dates, the economic calendar, market moves vs normal,
 * news bursts, FEMA disasters, state jobs data). Ships come from AIS when the AISStream key is configured.
 * Clicking a country opens its own terminal page. Text is inserted with textContent only. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const G = window.FynxGeo;
  if (!G || !PG) return;
  const {S, M, el, btn, link, svg, signed, tone, fmt, ago, day, big, finite, rowButton, kv, shortOf, quoteFor, digitsOf} = T;
  const W = S.world = {countries: null, states: null, ships: null, topo: null, us: null, feats: null, statesFeat: null, rot: [20, -22], scale: 1, flat: false, layers: {lights: true, tankers: true, cargo: true, other: false, chokes: true, lanes: true}, sel: null};
  const EUROZONE = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'IE', 'AT', 'PT', 'GR', 'FI', 'SK', 'SI', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY', 'HR'];
  const MKT = {US: {ccy: 'USD', bank: 'Fed', idx: '^GSPC', area: 'US'}, GB: {ccy: 'GBP', bank: 'BoE', idx: '^FTSE', fx: 'GBPUSD=X', area: 'GB'}, JP: {ccy: 'JPY', bank: 'BoJ', idx: '^N225', fx: 'JPY=X', area: 'JP'}, CH: {ccy: 'CHF', bank: 'SNB', fx: 'CHF=X'},
    CA: {ccy: 'CAD', bank: 'BoC', idx: '^GSPTSE', fx: 'CAD=X'}, AU: {ccy: 'AUD', bank: 'RBA', idx: '^AXJO', fx: 'AUDUSD=X'}, NZ: {ccy: 'NZD', bank: 'RBNZ', fx: 'NZDUSD=X'}, CN: {ccy: 'CNY', idx: '000001.SS', fx: 'CNY=X'}, HK: {ccy: 'HKD', idx: '^HSI'}, KR: {ccy: 'KRW', idx: '^KS11'},
    IN: {ccy: 'INR', idx: '^NSEI', fx: 'INR=X'}, BR: {ccy: 'BRL', idx: '^BVSP', fx: 'BRL=X'}, MX: {ccy: 'MXN', fx: 'MXN=X'}, ZA: {ccy: 'ZAR', fx: 'ZAR=X'}, TR: {ccy: 'TRY', fx: 'TRY=X'}};
  for (const c of EUROZONE) MKT[c] = {ccy: 'EUR', bank: 'ECB', fx: 'EURUSD=X', area: 'EA', idx: c === 'DE' ? '^GDAXI' : c === 'FR' ? '^FCHI' : '^STOXX50E'};
  const OIL = ['SA', 'AE', 'KW', 'QA', 'IQ', 'IR', 'OM', 'NG', 'NO', 'RU', 'VE', 'LY', 'DZ', 'AO', 'KZ'];
  const FIPS = {'01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY'};
  const COLOR = {red: '#ff6b5f', yellow: '#ffb000', green: '#3ecf8e', grey: '#56635c'};
  const TINT = {red: '#4a2622', yellow: '#3f3519', green: '#16302a', grey: '#17221f'};
  const ALERT = /\b(war|attack|strike[s]?|missile|invasion|coup|default|sanctions?|earthquake|flood(?:s|ing)?|hurricane|typhoon|cyclone|protests?|riots?|blackout|crisis|collapse|explosion|evacuat\w*|shutdown|recession|devaluation)\b/i;
  const LANES = [[[-74, 40.4], [-50, 42], [-20, 46], [-6, 48.5], [3, 51.5]], [[-79.9, 9.3], [-60, 18], [-30, 33], [-9, 36]], [[-9, 36], [5, 37.5], [20, 34], [32.3, 31.3]], [[32.5, 29.9], [35.5, 25], [43.3, 12.6], [52, 13], [57, 18], [58, 23], [56.3, 26.4], [50.6, 26.7]],
    [[56.3, 26.4], [62, 20], [72, 10], [80, 6], [95, 6], [100.5, 3.5], [104, 1.3], [110, 8], [114, 22], [122, 31], [130, 34], [140, 35]], [[-95, 28.5], [-88, 25], [-82, 24], [-78, 27], [-74, 40.4]], [[18.5, -34.5], [5, -20], [-15, 0], [-25, 20], [-9, 36]], [[-118.2, 33.7], [-140, 30], [-170, 32], [160, 35], [140, 35]], [[104, 1.3], [80, -10], [40, -30], [18.5, -34.5]]];

  /* --- data --------------------------------------------------------------------------- */
  async function getJSON(url) { return T.getJSON(url, {bust: url.startsWith('https:'), timeout: 30000}); }
  async function loadGeo() {
    if (!W.topo) { W.topo = await getJSON('/assets/data/world/countries-110m.json'); W.feats = G.feature(W.topo, W.topo.objects.countries).features.filter(f => f.properties.name !== 'Antarctica'); }
    return W.feats;
  }
  async function loadUS() { if (!W.us) { W.us = await getJSON('/assets/data/world/us-states-albers.json'); W.statesFeat = G.feature(W.us, W.us.objects.states).features; } return W.statesFeat; }
  async function loadWorld(force) {
    const jobs = [];
    if (force || !W.countries) jobs.push(getJSON(T.WDATA + 'countries.json').then(d => { if (d?.countries) W.countries = d; }).catch(e => T.report('countries', e)));
    if (force || !W.ships) jobs.push(getJSON(T.WDATA + 'ships.json').then(d => { if (d?.version) W.ships = d; }).catch(e => T.report('ships', e)));
    if (force || !W.states) jobs.push(getJSON(T.WDATA + 'states.json').then(d => { if (d?.states) W.states = d; }).catch(e => T.report('states', e)));
    jobs.push(loadGeo());
    await Promise.allSettled(jobs);
    S.feeds.world = Boolean(W.countries);
  }
  const C = iso => W.countries?.countries?.[iso] || null;
  const nameOfC = iso => C(iso)?.name || W.feats?.find(f => f.properties.iso2 === iso)?.properties.name || iso;

  /* --- status rules ------------------------------------------------------------------------ */
  function countryStatus(iso) {
    const m = MKT[iso], reasons = [], now = Date.now(); let level = 0, signal = false;
    const bump = (l, text) => { level = Math.max(level, l); reasons.push({l, text}); };
    if (m?.bank) {
      signal = true; const b = S.schedule?.banks?.find(x => x.short === m.bank), n = b && M.nextDecision(b);
      if (n) { const days = n.at ? (n.at - now) / 86400000 : n.daysAway; if (days <= 2) bump(2, `${b.name} decides ${days < 1 ? 'today' : 'in ' + Math.ceil(days) + ' days'}`); else if (days <= 7) bump(1, `${b.name} decides ${day(n.date)}`); }
    }
    if (m?.ccy) {
      for (const e of S.calendar?.events || []) {
        if (e.currency !== m.ccy || e.impact !== 'high') continue; signal = true;
        const h = (Date.parse(e.time) - now) / 3600000; if (h < -6 || h > 7 * 24) continue;
        if (h <= 48) bump(2, `${e.title} ${h < 0 ? 'released' : h < 24 ? 'in ' + Math.max(1, Math.round(h)) + 'h' : new Date(e.time).toLocaleDateString([], {weekday: 'short'})}`); else bump(1, `${e.title} ${new Date(e.time).toLocaleDateString([], {weekday: 'short'})}`);
      }
    }
    for (const [sym, label] of [[m?.idx, 'Stock index'], [m?.fx, 'Currency']]) {
      const q = sym && quoteFor(sym); if (!q || !finite(q.changePercent)) continue; signal = true;
      const z = finite(q.vol20) && q.vol20 > 0 ? Math.abs(q.changePercent) / q.vol20 : Math.abs(q.changePercent) / 1.2;
      // A shared currency (the euro) moves for every member at once, so for them it can only make a country yellow.
      const cap = label === 'Currency' && m.ccy === 'EUR' ? 1 : 2;
      if (z >= 2) bump(cap, `${label} ${shortOf(sym)} ${signed(q.changePercent, 2, '%')} (${z.toFixed(1)}× normal)`); else if (z >= 1.2) bump(1, `${label} ${shortOf(sym)} ${signed(q.changePercent, 2, '%')}`);
    }
    if (iso === 'US') { const ten = S.desk?.liveUS?.quotes?.find(q => q.tenor === '10Y'); if (ten) { const bp = (ten.price - ten.previousClose) * 100; if (Math.abs(bp) >= 8) bump(2, `10-year yield ${signed(bp, 0, ' bp')}`); else if (Math.abs(bp) >= 4) bump(1, `10-year yield ${signed(bp, 0, ' bp')}`); } }
    if (OIL.includes(iso)) { const q = quoteFor('BZ=F'); if (q && finite(q.changePercent) && Math.abs(q.changePercent) >= 2.5) bump(1, `Brent crude ${signed(q.changePercent, 2, '%')}`); }
    const news = C(iso)?.news?.items || [];
    if (news.length) { signal = true; const hits = news.filter(n => ALERT.test(n.title)); if (hits.length >= 4) bump(2, `${hits.length} alert headlines in 24 h`); else if (hits.length >= 2) bump(1, `${hits.length} alert headlines in 24 h`); }
    const lv = level === 2 ? 'red' : level === 1 ? 'yellow' : signal ? 'green' : 'grey';
    return {level: lv, reasons: reasons.sort((a, b) => b.l - a.l).map(r => r.text), signal};
  }
  function stateStatus(code) {
    const s = W.states?.states?.[code]; if (!s) return {level: 'grey', reasons: []};
    const reasons = []; let level = 0; const now = Date.now();
    for (const d of s.disasters || []) { const days = (now - Date.parse(d.date)) / 86400000; if (days <= 14) { level = 2; reasons.push(`FEMA ${d.type} declaration ${day(d.date)}`); } else if (days <= 60) { level = Math.max(level, 1); reasons.push(`FEMA ${d.type} declaration ${day(d.date)}`); } }
    const u = s.unemployment || []; if (u.length >= 4) { const ch = u.at(-1).value - u.at(-4).value; if (ch >= 0.3) { level = 2; reasons.push(`Unemployment up ${ch.toFixed(1)} pts in 3 months to ${u.at(-1).value}%`); } else if (ch >= 0.1) { level = Math.max(level, 1); reasons.push(`Unemployment up ${ch.toFixed(1)} pts in 3 months`); } }
    return {level: level === 2 ? 'red' : level === 1 ? 'yellow' : 'green', reasons};
  }
  function allStatuses() {
    const out = []; for (const f of W.feats || []) { const iso = f.properties.iso2; if (!iso) continue; out.push({iso, name: nameOfC(iso), ...countryStatus(iso)}); }
    const rank = {red: 0, yellow: 1, green: 2, grey: 3}; return out.sort((a, b) => rank[a.level] - rank[b.level] || (C(b.iso)?.data?.gdp?.value || 0) - (C(a.iso)?.data?.gdp?.value || 0));
  }

  /* --- globe panel --------------------------------------------------------------------------- */
  let draw = null;
  function projection(w, h) {
    if (W.flat) return G.geoNaturalEarth1().fitExtent([[6, 6], [w - 6, h - 6]], {type: 'Sphere'}).scale(G.geoNaturalEarth1().fitExtent([[6, 6], [w - 6, h - 6]], {type: 'Sphere'}).scale() * W.scale).rotate([W.rot[0], 0]);
    return G.geoOrthographic().translate([w / 2, h / 2]).scale((Math.min(w, h) / 2 - 10) * W.scale).rotate(W.rot).clipAngle(90).precision(0.4);
  }
  async function renderGlobe() {
    const host = T.panel('globe'); host.classList.add('fx-globe');
    T.setText('t-globe', 'Live world · click any light');
    host.append(el('p', 'fx-empty', 'Loading the globe…'));
    await loadWorld(); if (!host.isConnected) return; host.replaceChildren();
    const stage = el('div', 'fx-gstage'), card = el('div', 'fx-gcard'); card.hidden = true;
    const tools = el('div', 'fx-gtools');
    tools.append(btn(W.flat ? 'Globe' : 'Flat map', 'fx-gbtn', () => { W.flat = !W.flat; W.scale = 1; renderGlobe(); }), btn('+', 'fx-gbtn', () => { W.scale = Math.min(8, W.scale * 1.4); draw?.(); }, 'Zoom in'), btn('−', 'fx-gbtn', () => { W.scale = Math.max(0.7, W.scale / 1.4); draw?.(); }, 'Zoom out'), btn('Reset', 'fx-gbtn', () => { W.rot = [20, -22]; W.scale = 1; draw?.(); }));
    const layers = el('div', 'fx-glayers');
    for (const [k, l] of [['lights', 'Country lights'], ['tankers', 'Tankers'], ['cargo', 'Cargo ships'], ['other', 'Other ships'], ['chokes', 'Chokepoints'], ['lanes', 'Main sea routes']]) { const lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.checked = W.layers[k]; cb.addEventListener('change', () => { W.layers[k] = cb.checked; draw?.(); }); lab.append(cb, document.createTextNode(l)); layers.append(lab); }
    const legend = el('div', 'fx-glegend'); for (const [k, l] of [['red', 'Big event'], ['yellow', 'Watch'], ['green', 'Quiet'], ['grey', 'No live signal']]) { const s = el('span'); const i = el('i'); i.style.background = COLOR[k]; s.append(i, document.createTextNode(l)); legend.append(s); }
    const shipNote = el('span', 'fx-gnote', W.ships?.status === 'not-configured' ? 'Ships: waiting for the AIS key' : W.ships?.vessels?.length ? `Ships: ${W.ships.total.toLocaleString()} from AIS · ${T.ago(W.ships.generatedAt)}` : 'Ships: loading');
    legend.append(shipNote);
    stage.append(tools, layers, legend, card); host.append(stage);
    const sv = svg('svg', {class: 'fx-gsvg', role: 'img', 'aria-label': 'World globe with country status lights, ships and chokepoints. Use the country list for keyboard access.'}); stage.prepend(sv);
    const statuses = new Map(allStatuses().map(s => [s.iso, s]));
    const gSphere = svg('path', {class: 'g-sphere'}), gGrat = svg('path', {class: 'g-grat'}), gLand = svg('g'), gLanes = svg('g'), gShips = svg('g'), gChokes = svg('g'), gLights = svg('g');
    sv.append(gSphere, gGrat, gLand, gLanes, gShips, gChokes, gLights);
    const paths = W.feats.map(f => { const st = statuses.get(f.properties.iso2); const p = svg('path', {class: 'g-land', fill: TINT[st?.level || 'grey']}); const t = svg('title'); t.textContent = `${f.properties.name}${st ? ' · ' + st.level : ''}`; p.append(t); p.addEventListener('click', () => select(f.properties.iso2)); gLand.append(p); return [f, p]; });
    const lanePaths = LANES.map(pts => { const seg = []; for (let i = 0; i < pts.length - 1; i++) { const it = G.geoInterpolate(pts[i], pts[i + 1]); for (let t = 0; t <= 1.0001; t += 0.05) seg.push(it(t)); } const p = svg('path', {class: 'g-lane'}); gLanes.append(p); return [{type: 'LineString', coordinates: seg}, p]; });
    const centroid = f => { const fix = {US: [-98, 39], RU: [45, 56], CA: [-100, 56], NO: [9, 61], FR: [2.5, 46.5], IT: [12.5, 42.8], CL: [-71, -33], GB: [-1.5, 52.5], NZ: [172, -41], ID: [113, -1]}[f.properties.iso2]; return fix || G.geoCentroid(f); };
    const lights = W.feats.filter(f => f.properties.iso2).map(f => { const st = statuses.get(f.properties.iso2), big2 = st && st.level !== 'grey' && st.level !== 'green'; const g = svg('g', {class: 'g-light'}); const ring = svg('circle', {r: 11, fill: 'none', stroke: COLOR[st?.level || 'grey'], 'stroke-opacity': 0.5, 'stroke-width': 2}); const dot = svg('circle', {r: big2 ? 6 : st?.level === 'green' ? 4.2 : 3, fill: COLOR[st?.level || 'grey'], stroke: '#06080a', 'stroke-width': 1.5}); const t = svg('title'); t.textContent = `${nameOfC(f.properties.iso2)}: ${st?.level === 'grey' ? 'no live signal' : st?.level}`; g.append(t); if (big2) g.append(ring); g.append(dot); g.addEventListener('click', e => { e.stopPropagation(); select(f.properties.iso2); }); gLights.append(g); return [centroid(f), g, f.properties.iso2]; });
    const chokes = Object.entries(W.ships?.chokepoints || {}).map(([n, [[a, b], [c, d]]]) => { const g = svg('g', {class: 'g-choke'}); const r = svg('rect', {width: 10, height: 10, x: -5, y: -5, transform: 'rotate(45)'}); const t = svg('text', {x: 9, y: 14}); const cnt = W.ships?.counts?.[n]; t.textContent = cnt ? `${n} · ${cnt.ships}` : n; g.append(r, t); gChokes.append(g); return [[(b + d) / 2, (a + c) / 2], g]; });
    const vessels = (W.ships?.vessels || []).slice(0, 4000);
    draw = () => {
      const w = sv.clientWidth || 800, h = sv.clientHeight || 600; sv.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const proj = projection(w, h), path = G.geoPath(proj), center = W.flat ? null : [-W.rot[0], -W.rot[1]];
      const visible = ll => W.flat || G.geoDistance(ll, center) < Math.PI / 2 - 0.02;
      gSphere.setAttribute('d', path({type: 'Sphere'}) || ''); gGrat.setAttribute('d', path(G.geoGraticule10()) || '');
      for (const [f, p] of paths) p.setAttribute('d', path(f) || '');
      gLanes.style.display = W.layers.lanes ? '' : 'none'; for (const [ls, p] of lanePaths) p.setAttribute('d', path(ls) || '');
      gLights.style.display = W.layers.lights ? '' : 'none';
      for (const [ll, g] of lights) { if (!visible(ll)) { g.style.display = 'none'; continue; } const [x, y] = proj(ll); g.style.display = ''; g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); }
      gChokes.style.display = W.layers.chokes ? '' : 'none'; for (const [ll, g] of chokes) { if (!visible(ll)) { g.style.display = 'none'; continue; } const [x, y] = proj(ll); g.style.display = ''; g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); }
      gShips.replaceChildren();
      const frag = document.createDocumentFragment(), sz = Math.max(1.6, 1.4 * Math.sqrt(W.scale));
      for (const v of vessels) {
        const on = v.kind === 'tanker' ? W.layers.tankers : v.kind === 'cargo' ? W.layers.cargo : W.layers.other; if (!on) continue;
        const ll = [v.lon, v.lat]; if (!visible(ll)) continue; const p = proj(ll); if (!p) continue;
        frag.append(svg('circle', {cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: v.kind === 'tanker' ? sz * 1.25 : sz, class: 'g-ship g-' + v.kind}));
      }
      gShips.append(frag);
      if (W.sel) place(W.sel);
    };
    function place(iso) {
      const f = W.feats.find(x => x.properties.iso2 === iso); if (!f) return;
      const w = sv.clientWidth, h = sv.clientHeight, proj = projection(w, h), ll = centroid(f), p = proj(ll);
      if (!p || (!W.flat && G.geoDistance(ll, [-W.rot[0], -W.rot[1]]) > Math.PI / 2)) { card.hidden = true; return; }
      card.style.left = Math.min(w - 330, Math.max(8, p[0] + 16)) + 'px'; card.style.top = Math.min(h - 220, Math.max(48, p[1] - 30)) + 'px';
    }
    function select(iso) {
      if (!iso) return; W.sel = iso; const st = statuses.get(iso) || countryStatus(iso), c = C(iso), m = MKT[iso];
      card.replaceChildren(); card.hidden = false;
      const head = el('div', 'fx-gc-head'); head.append(el('b', 'fx-gc-iso', iso), el('strong', '', nameOfC(iso)), el('span', 'fx-pill fx-pill-' + st.level, st.level === 'grey' ? 'NO SIGNAL' : st.level.toUpperCase()), btn('✕', 'fx-gc-x', () => { card.hidden = true; W.sel = null; }, 'Close'));
      card.append(head);
      if (st.reasons.length) { const ul = el('ul'); st.reasons.slice(0, 3).forEach(r => ul.append(el('li', '', r))); card.append(ul); } else card.append(el('p', '', st.level === 'grey' ? 'No live market or news feed covers this country yet.' : 'Quiet: no unusual move and no major event this week.'));
      const facts = el('div', 'fx-gc-facts'), fact = (k, v) => { if (v === null || v === undefined) return; const s = el('span'); s.append(el('small', '', k), el('b', '', v)); facts.append(s); };
      if (m?.idx && quoteFor(m.idx)) fact(shortOf(m.idx), signed(quoteFor(m.idx).changePercent, 2, '%'));
      if (m?.fx && quoteFor(m.fx)) fact(shortOf(m.fx), fmt(quoteFor(m.fx).price, digitsOf(m.fx)));
      if (m?.ccy) { const r = M.policyRate(m.ccy, S.desk); if (r) fact('POLICY', r.display); }
      if (c?.data?.growth) fact(`GDP ${c.data.growth.year}`, signed(c.data.growth.value, 1, '%'));
      if (c?.data?.inflation) fact(`CPI ${c.data.inflation.year}`, c.data.inflation.value.toFixed(1) + '%');
      card.append(facts);
      const top = c?.news?.items?.[0]; if (top) card.append(el('p', 'fx-gc-news', top.title));
      card.append(btn(`Open ${nameOfC(iso)} terminal ▸`, 'fx-gc-open', () => T.openPage('ctry', iso)));
      place(iso);
    }
    // interaction: drag to spin, wheel to zoom
    let drag = null;
    sv.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY, rot: [...W.rot], moved: false}; sv.setPointerCapture?.(e.pointerId); });
    sv.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; const k = 0.35 / W.scale; W.rot = W.flat ? [drag.rot[0] + dx * k, 0] : [drag.rot[0] + dx * k, Math.max(-80, Math.min(80, drag.rot[1] - dy * k))]; requestAnimationFrame(() => draw?.()); });
    sv.addEventListener('pointerup', () => { drag = null; });
    sv.addEventListener('wheel', e => { e.preventDefault(); W.scale = Math.max(0.7, Math.min(8, W.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); requestAnimationFrame(() => draw?.()); }, {passive: false});
    W.focusOn = iso => { const f = W.feats.find(x => x.properties.iso2 === iso); if (!f) return; const ll = centroid(f); W.rot = W.flat ? [-ll[0], 0] : [-ll[0], -ll[1]]; W.scale = Math.max(W.scale, 1.6); draw(); select(iso); };
    W.focusPoint = ll => { W.rot = W.flat ? [-ll[0], 0] : [-ll[0], -ll[1]]; W.scale = 5; draw(); };
    new ResizeObserver(() => draw?.()).observe(sv);
    draw();
    if (W.sel) select(W.sel);
  }

  /* --- side panels -------------------------------------------------------------------------- */
  let watchFilter = '';
  async function renderWatch() {
    const host = T.panel('cwatch'); await loadWorld(); if (!host.isConnected) return; host.replaceChildren();
    const all = allStatuses(), counts = {red: 0, yellow: 0, green: 0, grey: 0}; all.forEach(s => counts[s.level]++);
    T.setText('n-cwatch', `${counts.red} red · ${counts.yellow} yellow`);
    const f = el('input', 'fx-wfilter'); f.type = 'search'; f.placeholder = 'Filter countries…'; f.value = watchFilter; f.setAttribute('aria-label', 'Filter countries');
    const list = el('div'); host.append(f, list);
    const draw2 = () => {
      list.replaceChildren(); const q = watchFilter.toLowerCase(); let last = '';
      for (const s of all) {
        if (q && !s.name.toLowerCase().includes(q) && !s.iso.toLowerCase().includes(q)) continue;
        if (!q && s.level === 'grey') continue;
        if (s.level !== last) { list.append(el('div', 'fx-th1 fx-th-' + s.level, {red: 'RED · BIG THINGS HAPPENING', yellow: 'YELLOW · WORTH WATCHING', green: 'GREEN · QUIET', grey: 'NO LIVE SIGNAL'}[s.level])); last = s.level; }
        const r = rowButton('fx-wrow', () => { if (W.focusOn) W.focusOn(s.iso); else T.openPage('ctry', s.iso); }, `${s.name}: ${s.level}`);
        const dot = el('i'); dot.style.background = COLOR[s.level];
        const t = el('span', 'fx-sym'); t.append(el('b', '', s.name), el('small', '', s.reasons[0] || (s.level === 'green' ? 'No unusual move or major event' : '')));
        r.append(dot, el('b', 'fx-wiso', s.iso), t, btn('▸', 'fx-wopen', e => { e.stopPropagation(); T.openPage('ctry', s.iso); }, `Open ${s.name} terminal`)); list.append(r);
      }
      if (!q) list.append(el('p', 'fx-foot', `${counts.grey} countries have no live market or news feed yet; type to find them.`));
    };
    f.addEventListener('input', () => { watchFilter = f.value; draw2(); }); draw2();
  }
  async function renderShips() {
    const host = T.panel('ships'); await loadWorld(); if (!host.isConnected) return; host.replaceChildren();
    const sd = W.ships;
    if (!sd || sd.status === 'not-configured') {
      T.setText('t-ships', 'Ships & chokepoints');
      host.append(el('p', 'fx-sub', 'Live tanker and cargo tracking turns on when the free AISStream key is added to the site’s GitHub settings as the secret AISSTREAM_API_KEY. The map then refreshes ship positions every hour.'));
      for (const n of Object.keys(sd?.chokepoints || {})) { const r = rowButton('fx-c3', () => W.focusPoint?.(mid(sd.chokepoints[n])), n); r.append(el('b', '', n), el('span', 'fx-dim', '—'), el('span', 'fx-dim', '—')); host.append(r); }
      return;
    }
    T.setText('t-ships', `Ships · ${sd.total.toLocaleString()} tracked`);
    const k = sd.vessels.reduce((a, v) => (a[v.kind] = (a[v.kind] || 0) + 1, a), {});
    const out = el('div', 'fx-calcout'); [['TANKERS', k.tanker || 0], ['CARGO', k.cargo || 0], ['OTHER', (k.other || 0) + (k.passenger || 0) + (k.unknown || 0)], ['SNAPSHOT', T.ago(sd.generatedAt)]].forEach(([a, b]) => { const d = el('div'); d.append(el('span', '', a), el('b', '', typeof b === 'number' ? b.toLocaleString() : b)); out.append(d); }); host.append(out);
    const head = el('div', 'fx-th fx-c4'); head.append(el('span', '', 'CHOKEPOINT'), el('span', '', 'SHIPS'), el('span', '', 'TANKER'), el('span', '', 'CARGO')); host.append(head);
    for (const [n, c] of Object.entries(sd.counts || {})) { const r = rowButton('fx-c4 fx-choke', () => W.focusPoint?.(mid(sd.chokepoints[n])), `${n}: ${c.ships} ships`); r.append(el('b', '', n), el('span', 'fx-num', c.ships), el('span', 'fx-num', c.tankers), el('span', 'fx-num', c.cargo)); host.append(r); }
    host.append(el('p', 'fx-foot', `${sd.source}. Counts are ships reporting inside each area during a ${sd.sampleSeconds}-second sample.`));
  }
  const mid = ([[a, b], [c, d]]) => [(b + d) / 2, (a + c) / 2];
  async function renderCNews() {
    const host = T.panel('cnews'); await loadWorld(); if (!host.isConnected) return; host.replaceChildren();
    const rows = [];
    for (const s of allStatuses().filter(x => x.level === 'red' || x.level === 'yellow').slice(0, 14)) for (const n of (C(s.iso)?.news?.items || []).slice(0, 2)) rows.push({s, n});
    if (!rows.length) for (const iso of ['US', 'CN', 'DE', 'JP', 'GB', 'IN']) for (const n of (C(iso)?.news?.items || []).slice(0, 2)) rows.push({s: {iso, level: countryStatus(iso).level}, n});
    if (!rows.length) return host.append(el('p', 'fx-empty', W.countries ? 'No country headlines in the last 24 hours.' : 'Loading world headlines…'));
    for (const {s, n} of rows) { const a = link('', n.url, 'fx-row fx-cnrow'); const iso = el('b', '', s.iso); iso.style.color = COLOR[s.level]; const t = el('span', 'fx-sym'); t.append(el('span', 'fx-ht', n.title), el('small', '', `${n.source}${n.publishedAt ? ' · ' + ago(n.publishedAt) : ''} ↗`)); a.append(iso, t); host.append(a); }
    host.append(el('p', 'fx-foot', 'Country headlines from Google News search (GDELT as backup), last 24 hours, refreshed hourly.'));
  }
  async function renderCData() {
    const host = T.panel('cdata'); await loadWorld(); if (!host.isConnected) return; host.replaceChildren();
    const list = Object.values(W.countries?.countries || {}).filter(c => c.data?.gdp).sort((a, b) => b.data.gdp.value - a.data.gdp.value).slice(0, 30);
    if (!list.length) return host.append(el('p', 'fx-empty', 'Loading country data…'));
    const t = el('table', 'fx-table'), h = el('tr'); ['COUNTRY', 'GDP', 'GROWTH', 'CPI', 'JOBLESS'].forEach(x => h.append(el('th', '', x))); t.append(h);
    for (const c of list) { const tr = el('tr', 'pg-click'); tr.addEventListener('click', () => T.openPage('ctry', c.iso2)); const st = countryStatus(c.iso2), th = el('th'); const dot = el('i', 'fx-dot'); dot.style.background = COLOR[st.level]; th.append(dot, document.createTextNode(' ' + c.name)); tr.append(th, el('td', 'fx-num', big(c.data.gdp.value)), el('td', 'fx-num ' + tone(c.data.growth?.value), finite(c.data.growth?.value) ? signed(c.data.growth.value, 1, '%') : '—'), el('td', 'fx-num', finite(c.data.inflation?.value) ? c.data.inflation.value.toFixed(1) + '%' : '—'), el('td', 'fx-num', finite(c.data.unemployment?.value) ? c.data.unemployment.value.toFixed(1) + '%' : '—')); t.append(tr); }
    host.append(t, el('p', 'fx-foot', 'World Bank, latest year reported per indicator. Click a country for its terminal page.'));
  }

  /* --- register panels and the WORLD desk ------------------------------------------------------- */
  Object.assign(T.PANELS, {globe: ['WORLD', 'Live world', 'world'], cwatch: ['WATCH', 'Countries by status', 'world'], ships: ['SHIP', 'Ships & chokepoints'], cnews: ['WNEWS', 'World headlines', 'news'], cdata: ['ECON', 'Economies at a glance', 'world']});
  Object.assign(T.PANEL_DESC, {globe: 'Interactive globe: country lights, ships, chokepoints', cwatch: 'Every country ranked red, yellow, green', ships: 'Live tankers and cargo ships, chokepoint counts', cnews: 'Headlines for countries with events', cdata: 'GDP, growth, inflation, jobless by country'});
  Object.assign(T.RENDER, {globe: () => renderGlobe(), cwatch: () => renderWatch(), ships: () => renderShips(), cnews: () => renderCNews(), cdata: () => renderCData()});
  T.EXTRA_GROUPS.push(['World', ['globe', 'cwatch', 'ships', 'cnews', 'cdata']]);
  T.DESK_DEFS.world = {label: 'WORLD', noun: 'World', who: 'global macro traders', slots: ['cwatch', 'ships', 'globe', 'cnews', 'cb', 'xa', 'eco', 'cdata', 'intel'],
    grid: {cols: '1.1fr 1fr 1fr 1fr 1fr 1.1fr', areas: ['s1 s3 s3 s3 s3 s2', 's1 s3 s3 s3 s3 s2', 's4 s5 s6 s7 s8 s9']},
    mkts: [['MACRO', ['Dollar', 'Yields', 'Energy', 'Metals']], ['IDX', ['Americas', 'Europe', 'Asia-Pacific']]], focus: 'DX-Y.NYB', heat: ['Americas', 'Europe', 'Asia-Pacific'], movers: ['Americas', 'Europe', 'Asia-Pacific', 'FX majors', 'FX emerging'],
    news: 'world', newsTabs: ['world', 'politics', 'economics', 'energy', 'commodities'], xa: ['DX-Y.NYB', '^TNX', 'BZ=F', 'CL=F', 'GC=F', 'HG=F', '^GSPC', '^GDAXI', '^N225', '^HSI'], calc: 'real', storyKind: 'macro', anchors: [['DX-Y.NYB', 'Dollar'], ['BZ=F', 'Brent'], ['GC=F', 'Gold']],
    onLoad: () => loadWorld(true)};
  T.DESK_ORDER.splice(1, 0, 'world');
  if (!T.DESK_DEFS.economy.slots.includes('cdata')) T.DESK_DEFS.economy.slots = T.DESK_DEFS.economy.slots.map(s => s === 'pos' ? 'cdata' : s);
  T.KEYS.find(k => k[0] === 'F12').splice(1, 2, 'World', 'world');
  T.PAGE_NAMES.push('WORLD', 'CTRY', 'STATE');

  /* --- pages -------------------------------------------------------------------------------------- */
  PG.add('world', 'World', async (host, arg, alive) => {
    PG.setHead('WORLD', 'Live world', 'Every country and US state lit by live data · click a light, or use the list');
    host.append(PG.chips([btn('Open the WORLD desk ▸', 'fx-chip fx-chip-link pg-primary', () => { PG.closeAll(); T.setDesk('world'); })]));
    await loadWorld(); if (!alive()) return;
    const all = allStatuses(), g = PG.grid('pg-g2');
    for (const lv of ['red', 'yellow']) { const s = PG.section(lv === 'red' ? 'Red: big things happening' : 'Yellow: worth watching'); const rows = all.filter(x => x.level === lv); if (!rows.length) s.append(el('p', 'fx-empty', 'None right now.')); rows.forEach(x => { const r = rowButton('pg-crow', () => T.openPage('ctry', x.iso), x.name); const d = el('i'); d.style.background = COLOR[lv]; r.append(d, el('b', '', x.name), el('span', '', x.reasons.join(' · '))); s.append(r); }); g.append(s); }
    host.append(g);
    const rules = PG.section('How the lights work');
    kv(rules, [['Red', 'A central bank decision or high-impact release within 48 hours, a stock index or currency move at least 2× its normal daily size, a 10-year yield move of 8 bp+, or 4+ alert headlines (war, default, sanctions, disasters…) in 24 hours.'], ['Yellow', 'The same signals but smaller: a decision or release within 7 days, a 1.2–2× move, 2–3 alert headlines, or a 2.5%+ oil move for oil exporters.'], ['Green', 'Covered by live data, nothing unusual.'], ['Grey', 'No live market or news feed for this country yet.'], ['US states', 'Red: FEMA disaster declared in the last 14 days, or unemployment up 0.3 points in 3 months. Yellow: declaration in 60 days, or up 0.1 points.'], ['Sources', 'Central bank calendars, Forex Factory calendar, Yahoo Finance quotes, GDELT news, World Bank, BLS, FEMA, AISStream ships.']]);
    host.append(rules);
  });

  PG.add('ctry', 'Country', async (host, iso, alive) => {
    iso = String(iso || 'US').toUpperCase();
    await loadWorld(); if (!alive()) return;
    const c = C(iso), m = MKT[iso], st = countryStatus(iso), name = nameOfC(iso);
    PG.setHead('CTRY', name, [c?.region, c?.income, c?.capital ? 'Capital ' + c.capital : null, m?.ccy].filter(Boolean).join(' · '));
    const pill = el('span', 'fx-pill fx-pill-' + st.level, st.level === 'grey' ? 'NO LIVE SIGNAL' : st.level.toUpperCase());
    const brief = PG.section(''); brief.classList.add('pg-brief'); brief.append(pill);
    const lines = [];
    if (st.reasons.length) lines.push(`${st.level === 'red' ? 'Big things happening' : 'Worth watching'}: ${st.reasons.join('; ')}.`);
    else lines.push(st.level === 'grey' ? 'No live market or news feed covers this country yet; its economic profile is below.' : 'Quiet today: no unusual market move and no major scheduled event this week.');
    const d = c?.data || {};
    const econ = [d.gdp && `GDP ${big(d.gdp.value)} (${d.gdp.year})`, d.growth && `growth ${signed(d.growth.value, 1, '%')}`, d.inflation && `inflation ${d.inflation.value.toFixed(1)}%`, d.unemployment && `unemployment ${d.unemployment.value.toFixed(1)}%`].filter(Boolean);
    if (econ.length) lines.push(`Economy: ${econ.join(', ')} (World Bank, latest year).`);
    const iq = m?.idx && quoteFor(m.idx), fq = m?.fx && quoteFor(m.fx);
    if (iq || fq) lines.push(`Markets: ${[iq && `${shortOf(m.idx)} ${fmt(iq.price, 2)} (${signed(iq.changePercent, 2, '%')})`, fq && `${shortOf(m.fx)} ${fmt(fq.price, digitsOf(m.fx))} (${signed(fq.changePercent, 2, '%')})`].filter(Boolean).join(', ')}.`);
    brief.append(el('h1', 'pg-title', `${name}: ${st.level === 'red' ? 'big things happening' : st.level === 'yellow' ? 'worth watching' : st.level === 'green' ? 'quiet' : 'profile'}`), el('p', 'pg-lead', lines.join(' ')));
    brief.append(PG.chips([m?.idx ? btn(`Load every box for ${shortOf(m.idx)} ▸`, 'fx-chip fx-chip-link pg-primary', () => T.setSymbol({symbol: m.idx})) : null, m?.fx ? btn(`Load ${shortOf(m.fx)} ▸`, 'fx-chip fx-chip-link', () => T.setSymbol({symbol: m.fx})) : null, m?.bank ? PG.go(`${m.bank} page`, 'cb', m.bank) : null, PG.go('Show on globe', 'world')]));
    host.append(brief);
    const ind = [['GDP', d.gdp && big(d.gdp.value), d.gdp?.year], ['GDP GROWTH', d.growth && signed(d.growth.value, 1, '%'), d.growth?.year], ['INFLATION', d.inflation && d.inflation.value.toFixed(1) + '%', d.inflation?.year], ['UNEMPLOYMENT', d.unemployment && d.unemployment.value.toFixed(1) + '%', d.unemployment?.year], ['POPULATION', d.population && (d.population.value / 1e6).toFixed(1) + 'M', d.population?.year], ['GDP PER PERSON', d.gdpPerCapita && '$' + Math.round(d.gdpPerCapita.value).toLocaleString(), d.gdpPerCapita?.year], ['CURRENT ACCOUNT', d.currentAccount && signed(d.currentAccount.value, 1, '% GDP'), d.currentAccount?.year], ['GOVT DEBT', d.debt && d.debt.value.toFixed(0) + '% GDP', d.debt?.year], ['EXPORTS', d.exports && d.exports.value.toFixed(0) + '% GDP', d.exports?.year]];
    const pol = m?.ccy && M.policyRate(m.ccy, S.desk);
    host.append(PG.cards([...(pol ? [['POLICY RATE', pol.display, '', pol.observationDate]] : []), ...ind.filter(x => x[1]).map(([k, v, y]) => [k, v, '', y ? String(y) : ''])]));
    const g = PG.grid('pg-g2');
    for (const [sym, label] of [[m?.idx, 'Stock index'], [m?.fx, 'Currency']]) {
      if (!sym) continue; const s = PG.section(`${label}: ${shortOf(sym)} · 1 year`); g.append(s);
      T.symHistory(sym, '1y').then(h => { if (h?.rows?.length && alive()) s.append(T.lineChart(h.rows.slice(-252), {digits: digitsOf(sym), W: 620, H: 220, label: shortOf(sym), last: quoteFor(sym)?.price, source: h.source || 'Yahoo Finance'})); });
    }
    if (m?.area && S.desk?.curves?.[m.area]) { const cc = T.curveChart(m.area, {W: 620, H: 200}); if (cc) { const s = PG.section(`${M.AREAS[m.area].label} yield curve`); s.append(cc.chart, T.tenorGrid(m.area, cc.view, cc.curve)); g.append(s); } }
    if (m?.ccy) { const s = PG.section(`${m.ccy} calendar this week`), ev = (S.calendar?.events || []).filter(e => e.currency === m.ccy).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)); if (ev.length) ev.forEach(e => s.append(T.ecoRow(e))); else s.append(el('p', 'fx-empty', 'No scheduled releases this week.')); g.append(s); }
    host.append(g);
    const news = PG.section(`${name} headlines`), items = c?.news?.items || [];
    for (const n of items) { const a = link('', n.url, 'fx-row fx-cnrow'); const t = el('span', 'fx-sym'); t.append(el('span', 'fx-ht', n.title), el('small', '', `${n.source}${n.publishedAt ? ' · ' + ago(n.publishedAt) : ''} ↗`)); a.append(el('b', '', '•'), t); news.append(a); }
    const room = PG.matchNews([name], 8); room.forEach(h => news.append(T.headlineRow(h)));
    if (!items.length && !room.length) news.append(el('p', 'fx-empty', 'No headlines for this country in the last 24 hours.'));
    host.append(news);
    const f = W.feats.find(x => x.properties.iso2 === iso);
    if (f && W.ships?.vessels?.length) {
      const [[w0, s0], [e0, n0]] = G.geoBounds(f), near = W.ships.vessels.filter(v => v.lat >= s0 - 1.5 && v.lat <= n0 + 1.5 && (w0 <= e0 ? v.lon >= w0 - 1.5 && v.lon <= e0 + 1.5 : v.lon >= w0 - 1.5 || v.lon <= e0 + 1.5));
      const s = PG.section('Ships near this country'); s.append(PG.cards([['SHIPS', near.length.toLocaleString()], ['TANKERS', near.filter(v => v.kind === 'tanker').length.toLocaleString()], ['CARGO', near.filter(v => v.kind === 'cargo').length.toLocaleString()]]), PG.sourceNote(`Ships reporting inside this country’s map box (approximate) in the ${T.ago(W.ships.generatedAt)} AIS sample.`)); host.append(s);
    }
    if (iso === 'US') {
      const s = PG.section('States: each one has its own light'); host.append(s);
      const feats = await loadUS(); if (!alive()) return;
      const path = G.geoPath(), map = svg('svg', {viewBox: '0 0 975 610', class: 'pg-usmap', role: 'img', 'aria-label': 'US states colored by status'});
      for (const sf of feats) { const code = FIPS[sf.id], ss = stateStatus(code); const p = svg('path', {d: path(sf), fill: TINT[ss.level], stroke: COLOR[ss.level], 'stroke-width': ss.level === 'green' ? 0.6 : 1.4, class: 'pg-state'}); const t = svg('title'); t.textContent = `${sf.properties.name}: ${ss.level}${ss.reasons[0] ? ' · ' + ss.reasons[0] : ''}`; p.append(t); p.addEventListener('click', () => T.openPage('state', code)); map.append(p); }
      s.append(map);
      const list = el('div', 'pg-statelist'); for (const sf of [...feats].sort((a, b) => a.properties.name.localeCompare(b.properties.name))) { const code = FIPS[sf.id], ss = stateStatus(code); const b = btn('', 'pg-statebtn', () => T.openPage('state', code), `${sf.properties.name} ${ss.level}`); const dot = el('i'); dot.style.background = COLOR[ss.level]; b.append(dot, document.createTextNode(code)); list.append(b); }
      s.append(list, PG.sourceNote(W.states ? `${W.states.sources.unemployment}; ${W.states.sources.disasters}. Updated ${new Date(W.states.generatedAt).toLocaleDateString()}.` : 'State data is loading.'));
    }
    host.append(PG.sourceNote([W.countries?.sources?.profile, W.countries?.sources?.news, 'quotes: Yahoo Finance (delayed)', 'rates: central banks, BIS'].filter(Boolean).join(' · ')));
  });

  PG.add('state', 'State', async (host, code, alive) => {
    code = String(code || 'NY').toUpperCase(); await loadWorld(); await loadUS(); if (!alive()) return;
    const sf = W.statesFeat.find(f => FIPS[f.id] === code), name = sf?.properties.name || code, s = W.states?.states?.[code], st = stateStatus(code);
    PG.setHead('STATE', name, `United States · ${code}`);
    host.append(PG.chips([PG.go('United States terminal', 'ctry', 'US')]));
    const brief = PG.section(''); brief.append(el('span', 'fx-pill fx-pill-' + st.level, st.level.toUpperCase()), el('h1', 'pg-title', name), el('p', 'pg-lead', st.reasons.length ? st.reasons.join('; ') + '.' : 'Quiet: no recent federal disaster declaration and no jump in unemployment.')); host.append(brief);
    const u = s?.unemployment || [];
    if (u.length) {
      const last = u.at(-1), y = u.length > 12 ? u.at(-13) : u[0], q = u.length > 3 ? u.at(-4) : u[0];
      const others = Object.values(W.states.states).map(x => x.unemployment?.at(-1)?.value).filter(finite).sort((a, b) => a - b), rank = others.filter(v => v < last.value).length + 1;
      host.append(PG.cards([['UNEMPLOYMENT', last.value.toFixed(1) + '%', '', last.date], ['3-MONTH CHANGE', signed(last.value - q.value, 1, ' pts'), tone(-(last.value - q.value))], ['1-YEAR CHANGE', signed(last.value - y.value, 1, ' pts'), tone(-(last.value - y.value))], ['RANK', `${rank} of ${others.length}`, '', '1 = lowest rate']]));
      const sec = PG.section('Unemployment rate · 2 years'); sec.append(T.lineChart(u.map(p => ({date: p.date + '-01', close: p.value})), {digits: 1, W: 900, H: 220, label: `${name} unemployment rate`, source: 'BLS LAUS, seasonally adjusted'})); host.append(sec);
    }
    const dz = PG.section('Federal disaster declarations · last 120 days'); (s?.disasters || []).forEach(x => dz.append(el('p', 'pg-p', `${x.date} · ${x.type} · ${x.title} (#${x.number})`))); if (!s?.disasters?.length) dz.append(el('p', 'fx-empty', 'None in the last 120 days.')); dz.append(PG.chips([link('FEMA declarations ↗', 'https://www.fema.gov/disaster/declarations', 'fx-chip fx-chip-link')])); host.append(dz);
    const news = PG.section(`${name} headlines`); const hits = PG.matchNews([name], 12); hits.forEach(h => news.append(T.headlineRow(h))); if (!hits.length) news.append(el('p', 'fx-empty', 'No headlines mention this state in the current feeds.')); host.append(news);
  });

  // Command: CTRY JP · STATE TX
  const run0 = T.run;
  T.ctryCommand = cmd => { const [v, a] = cmd.trim().toUpperCase().split(/\s+/); if (v === 'CTRY' || v === 'COUNTRY') { T.openPage('ctry', a || 'US'); return true; } if (v === 'STATE') { T.openPage('state', a || 'NY'); return true; } return false; };
  void run0; void tone;
});
