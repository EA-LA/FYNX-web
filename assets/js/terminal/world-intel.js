/* FYNX Terminal plugin: Global Intelligence layers for the WORLD desk globe.
 * Adds an "Intelligence layers" panel (search, categories, live events list) and an "Event intelligence" card.
 *  Live layers
 *   Conflict events, Protests, Cyber threats  headlines from the last 72 h (hourly Google News search per country,
 *                                              plus the Terminal's live briefing), grouped by country and scored by rules
 *   Intel hotspots                             countries where several live signals stack up (see score in the card)
 *   Conflict zones                             live: countries with repeated conflict reports; reference: long-running areas
 *   Earthquakes                                USGS, M4.5+ in the past 7 days
 *   Natural alerts                             GDACS alerts and NASA EONET open events (storms, floods, fires, volcanoes…)
 *  Reference layers (curated, reviewed 2026-11, approximate positions)
 *   Military bases, Nuclear sites, Data centers, Pipelines, Major ports, Airports, Dams, Stock exchanges, Spaceports
 * Nothing is invented: every marker links to its source or says it is reference data. Text is inserted with textContent. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T) => {
  'use strict';
  const W = T.S.world, G = window.FynxGeo;
  if (!W || !G) return;
  const {el, btn, svg, finite, ago, quoteFor, signed, store} = T;
  const REF_URL = '/assets/data/world/intel-layers.json?v=20261119-intel-1';
  const SEV = {high: '#ff3b30', med: '#ff9f1c', low: '#ffd23f'};
  const SEV_LABEL = {high: 'HIGH', med: 'ELEVATED', low: 'LOW'};
  const HAZ = {storm: ['Severe storm', '#64b5f6'], flood: ['Flood', '#4fc3f7'], volcano: ['Volcano', '#ef5350'], wildfire: ['Wildfire', '#ff7043'], drought: ['Drought', '#d7a86e'], landslide: ['Landslide', '#bcaaa4'], heat: ['Extreme temperature', '#ff8a65'], dust: ['Dust & haze', '#d7ccc8'], snow: ['Snow', '#e0f7fa'], manmade: ['Man-made event', '#b0bec5']};

  /* --- icons (12 × 12 boxes) ------------------------------------------------------------------- */
  const polar = (r, a) => [6 + r * Math.cos(a), 6 + r * Math.sin(a)].map(v => v.toFixed(2)).join(' ');
  const blade = c => { const a = c * Math.PI / 180, w = Math.PI / 6; return `M${polar(1.9, a - w)}L${polar(5.4, a - w)}A5.4 5.4 0 0 1 ${polar(5.4, a + w)}L${polar(1.9, a + w)}A1.9 1.9 0 0 0 ${polar(1.9, a - w)}Z`; };
  const ICON = {
    megaphone: 'M1.4 4.3h2.6L9.3 1.4v9.2L4 7.7H1.4zM4.1 8.3l.9 2.6h1.5l-.9-2.6zM10.2 4.6h1.2v2.8h-1.2z',
    tri: 'M6 .9l5.4 9.9H.6zM6 4.4l-.9 1.9-2 .2 1.5 1.3-.4 2L6 8.8l1.8 1 -.4-2 1.5-1.3-2-.2z',
    rad: `M6 4.8a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 1 1 0-2.4z${blade(-90)}${blade(30)}${blade(150)}`,
    bolt: 'M7.2.5L2.3 7h3.2l-1 4.5L9.7 5H6.5z',
    server: 'M1.3 1h9.4v2.8H1.3zM1.3 4.6h9.4v2.8H1.3zM1.3 8.2h9.4V11H1.3z',
    anchor: 'M6 .9a1.3 1.3 0 1 1 0 2.6a1.3 1.3 0 1 1 0-2.6zM5.4 3.4h1.2v6.4H5.4zM3.4 4.9h5.2v1.1H3.4zM1.3 6.9c.4 2.6 2.4 4.2 4.7 4.2s4.3-1.6 4.7-4.2l-1.2-.2c-.4 1.9-1.8 3.2-3.5 3.2S2.9 8.6 2.5 6.7z',
    plane: 'M6 .6c.5 0 .8.5.8 1.2V4.9l4.4 2.5v1.3L6.8 7.4v2.4l1.4 1v.9L6 11.2l-2.2.5v-.9l1.4-1V7.4L.8 8.7V7.4l4.4-2.5V1.8c0-.7.3-1.2.8-1.2z',
    dam: 'M.8 1.4h10.4v2.5H.8zM1.9 4.8h8.2v2.5H1.9zM3 8.2h6v2.5H3z',
    candle: 'M1.7 4h2.2v5H1.7zM2.4 2h.8v8.6h-.8zM4.9 2.6h2.2v4.2H4.9zM5.6 1h.8v7.4h-.8zM8.1 5.2h2.2v4.4H8.1zM8.8 3.6h.8v7.6h-.8z',
    rocket: 'M6 .5c1.9 1.5 2.9 3.9 2.9 6.6l-1 1.9H4.1l-1-1.9C3.1 4.4 4.1 2 6 .5zM6 3.3a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM4.4 9.6h3.2L6 11.7zM2.4 6.6L.9 9.1h1.9zM9.6 6.6l1.5 2.5H9.2z',
    warn: 'M6 .7l5.5 10H.5z',
    pipe: 'M.5 4.8h11v2.4H.5z',
    zone: 'M6 1a5 5 0 1 1 0 10A5 5 0 1 1 6 1z',
    dot: 'M6 2.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z',
    target: 'M6 .8a5.2 5.2 0 1 1 0 10.4A5.2 5.2 0 1 1 6 .8zm0 1.6a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2zm0 1.9a1.7 1.7 0 1 1 0 3.4a1.7 1.7 0 1 1 0-3.4z',
    quake: 'M.5 6.6h2.2l1.2-3.4 1.6 6.4 1.6-8 1.4 5h3v1.2H7.4l-.6-2-1.6 7.6-1.6-6.2-.6 1.6H.5z',
    ship: 'M1 7.4h10L9.4 10.6H2.6zM3 4h6v2.6H3zM5.4 1.4h1.2V4H5.4z',
    light: 'M6 2a4 4 0 1 1 0 8a4 4 0 1 1 0-8z',
    lane: 'M.5 8.5C3 3 9 9 11.5 3.5', choke: 'M6 1.6l4.4 4.4L6 10.4 1.6 6z'
  };
  function iconSvg(name, color, size = 14) {
    const s = svg('svg', {viewBox: '0 0 12 12', width: size, height: size, 'aria-hidden': 'true', class: 'fx-ic'});
    if (name === 'lane') s.append(svg('path', {d: ICON.lane, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': '2 1.5'}));
    else s.append(svg('path', {d: ICON[name] || ICON.dot, fill: color, 'fill-rule': 'evenodd'}));
    return s;
  }

  /* --- layers ------------------------------------------------------------------------------------ */
  // [key, label, group, live?, color, icon, default on, what it shows / source]
  const LAYERS = [
    ['lights', 'Country lights', 'base', true, '#3ecf8e', 'light', null, 'Red, yellow or green for every country, based on rules applied to live data: central bank dates, the economic calendar, market moves and news bursts.'],
    ['tankers', 'Tankers', 'base', true, '#ff9f43', 'ship', null, 'Live tanker positions from AIS receivers (AISStream). Open-ocean coverage has gaps.'],
    ['cargo', 'Cargo ships', 'base', true, '#5b8def', 'ship', null, 'Live cargo ship positions from AIS.'],
    ['other', 'Other ships', 'base', true, '#8e9b94', 'ship', null, 'Every other vessel type reporting over AIS.'],
    ['chokes', 'Chokepoints', 'base', true, '#c9a7ff', 'choke', null, 'Strategic straits and canals, with live ship counts inside each one.'],
    ['lanes', 'Main sea routes', 'base', false, '#4f6b7a', 'lane', null, 'The main shipping lanes between the chokepoints.'],
    ['conflict', 'Conflict events', 'security', true, SEV.high, 'dot', true, 'Headlines from the last 72 h reporting fighting, strikes or attacks, grouped by country. Larger = more reports. Severity follows fixed rules (number of reports, casualties, missile or air strikes).'],
    ['zones', 'Conflict zones', 'security', true, '#ff5a4f', 'zone', true, 'Hatched countries have repeated conflict reports in the last 72 h. Dashed circles are long-running conflict areas from reference data (reviewed November 2026).'],
    ['protests', 'Protests', 'security', true, '#c77dff', 'megaphone', true, 'Headlines from the last 72 h about protests, riots or strikes, grouped by country.'],
    ['hotspots', 'Intel hotspots', 'security', true, '#ff6b5f', 'target', true, 'Countries where several live signals stack up: conflict, protest and cyber reports, a red country light, a long-running conflict area, strong earthquakes and red or orange disaster alerts.'],
    ['bases', 'Military bases', 'security', false, '#a5d66b', 'tri', false, 'Major military bases and fleet headquarters (reference).'],
    ['nuclear', 'Nuclear sites', 'security', false, '#ffe14d', 'rad', false, 'Largest nuclear power plants plus key enrichment, reprocessing and weapons-program sites (reference).'],
    ['cyber', 'Cyber threats', 'cyber', true, '#00e5ff', 'bolt', true, 'Headlines from the last 72 h about cyberattacks, hacks, ransomware, data breaches or cyber-espionage, grouped by country.'],
    ['datacenters', 'Data centers', 'cyber', false, '#4dd0e1', 'server', false, 'Largest data-center and AI-compute markets (reference).'],
    ['pipelines', 'Pipelines', 'infra', false, '#f4a261', 'pipe', false, 'Major oil (brown), gas (blue) and fuel (orange) pipelines. Dashed means offline or under construction. Routes are simplified.'],
    ['ports', 'Major ports', 'infra', false, '#80cbc4', 'anchor', false, 'The busiest container ports and key oil export terminals (reference).'],
    ['airports', 'Airports', 'infra', false, '#e6e6e6', 'plane', false, 'The world’s busiest passenger airports and the main air-cargo hubs (reference).'],
    ['dams', 'Dams', 'infra', false, '#4fc3f7', 'dam', false, 'Largest hydro dams and strategic river dams (reference).'],
    ['exchanges', 'Stock exchanges', 'infra', false, '#ffb000', 'candle', false, 'Major stock exchanges, with each one’s index move today where the Terminal tracks it.'],
    ['quakes', 'Earthquakes', 'natural', true, '#ff8a65', 'quake', true, 'USGS earthquakes of magnitude 4.5 or more in the past 7 days. Larger circle = stronger quake.'],
    ['alerts', 'Natural alerts', 'natural', true, '#ffca28', 'warn', true, 'Disaster alerts from GDACS (UN/EC) and open natural events from NASA EONET: storms, floods, wildfires, volcanoes, drought.'],
    ['spaceports', 'Spaceports', 'space', false, '#b388ff', 'rocket', false, 'Orbital and suborbital launch sites (reference).']
  ];
  const L = Object.fromEntries(LAYERS.map(l => [l[0], {key: l[0], label: l[1], group: l[2], live: l[3], color: l[4], icon: l[5], def: l[6], info: l[7]}]));
  const BASE = new Set(['lights', 'tankers', 'cargo', 'other', 'chokes', 'lanes']);
  const GROUPS = [['all', 'All'], ['security', 'Security'], ['cyber', 'Cyber'], ['infra', 'Infra'], ['natural', 'Natural'], ['space', 'Space'], ['base', 'Shipping']];
  const on = (() => { let saved = {}; try { saved = JSON.parse(store.get('globe-intel') || '{}') || {}; } catch (_) {} const o = {}; for (const l of LAYERS) if (!BASE.has(l[0])) o[l[0]] = typeof saved[l[0]] === 'boolean' ? saved[l[0]] : l[6]; return o; })();
  const isOn = k => BASE.has(k) ? !!W.layers[k] : !!on[k];
  function setOn(k, v) { if (BASE.has(k)) W.layers[k] = v; else { on[k] = v; store.set('globe-intel', JSON.stringify(on)); } }

  /* --- data -------------------------------------------------------------------------------------- */
  const D = W.intelData = {ref: null, haz: null, hazAt: null, hazSrc: '', events: [], byId: new Map(), loading: null, at: 0};
  async function loadRef() { if (!D.ref) try { D.ref = await T.getJSON(REF_URL, {timeout: 20000}); } catch (e) { T.report('intel-ref', e); } }
  async function loadHazards() {
    try { const h = await T.getJSON(T.WDATA + 'hazards.json', {bust: true, timeout: 30000}); if (Array.isArray(h?.quakes)) { D.haz = h; D.hazAt = h.generatedAt; D.hazSrc = 'world-data'; return; } } catch (_) {}
    // Fallback until the hourly snapshot exists: USGS serves this feed with open CORS.
    try {
      const u = await T.getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', {timeout: 20000});
      D.haz = {quakes: (u.features || []).map(f => ({id: f.id, mag: f.properties.mag, place: f.properties.place, time: new Date(f.properties.time).toISOString(), depth: f.geometry.coordinates[2], lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], tsunami: f.properties.tsunami === 1, alert: f.properties.alert, felt: f.properties.felt, url: f.properties.url})).filter(q => finite(q.mag)), alerts: D.haz?.alerts || []};
      D.hazAt = new Date().toISOString(); D.hazSrc = 'usgs';
    } catch (e) { T.report('intel-hazards', e); }
  }
  function load(force) {
    if (D.loading && !force) return D.loading;
    D.loading = Promise.allSettled([loadRef(), loadHazards()]).then(() => { build(); D.at = Date.now(); W.intelRedraw?.(); });
    return D.loading;
  }

  /* --- headline classification ------------------------------------------------------------------- */
  const RX = {
    conflict: /\b(air ?strikes?|missiles?|drone (?:strikes?|attacks?)|drones? hit|shell(?:ing|ed)|bombard\w*|bomb(?:ing|ings|ed)|artillery|clashes|gunmen|militants?|insurgents?|jihadists?|rebels?|troops|soldiers|army|military (?:strikes?|offensive)|offensive|invasion|invade[sd]?|ceasefire|truce|frontline|front line|warplanes?|killed in|killing|massacre|hostages?|militia|siege|war\b|attacks?|attacked)\b/i,
    conflictNot: /\b(trade war|price war|tariff war|war chest|culture war|war on (?:drugs|inflation|waste)|heart attack|panic attack|cyber ?attacks?|hackers?|ransomware|attack on (?:the )?(?:fed|central bank|independence|press)|verbal(?:ly)? attack|star wars|war of words|warcraft)\b/i,
    conflictHard: /\b(killed|dead|deaths|casualties|massacre|missiles?|air ?strikes?|drone strikes?|ballistic|shelling|bombing|invasion)\b/i,
    protest: /\b(protests?|protesters?|protestors?|demonstrat(?:ion|ions|ors|ed|e)|riots?|rioting|rall(?:y|ies) against|march(?:es|ed)? against|unrest|general strike|walkouts?|sit-ins?|uprising)\b/i,
    protestHard: /\b(violent|violence|killed|deaths|dead|clashes|curfew|tear gas|crackdown|arrested)\b/i,
    cyber: /\b(cyber ?attacks?|cyber-attacks?|cyber ?espionage|cyber-espionage|hack(?:ed|ers?|ing)|ransomware|data breach|breach(?:ed)? (?:of|at)|ddos|malware|spyware|phishing|zero-day|state-sponsored (?:hack|attack)|cyber ?security incident|outage caused by)\b/i,
    cyberHard: /\b(ransomware|espionage|stole|stolen|critical infrastructure|power grid|government (?:systems|networks|databases)|millions of|nationwide outage)\b/i
  };
  // Country names and common forms used in headlines (ISO-2). Matches pick the country a headline is about.
  const ALIAS = {US: 'United States|U\\.S\\.|USA|American|Washington|Pentagon', GB: 'United Kingdom|Britain|British|UK|England|London', RU: 'Russia|Russian|Moscow|Kremlin', UA: 'Ukraine|Ukrainian|Kyiv|Kharkiv|Odesa|Donbas', CN: 'China|Chinese|Beijing', TW: 'Taiwan|Taiwanese|Taipei',
    IR: 'Iran|Iranian|Tehran', IL: 'Israel|Israeli|IDF', PS: 'Gaza|Palestinian|West Bank|Hamas', LB: 'Lebanon|Lebanese|Hezbollah|Beirut', SY: 'Syria|Syrian|Damascus', IQ: 'Iraq|Iraqi|Baghdad', YE: 'Yemen|Yemeni|Houthis?', SA: 'Saudi', AE: 'UAE|Emirati|Abu Dhabi|Dubai', QA: 'Qatar|Qatari|Doha',
    KW: 'Kuwait|Kuwaiti', BH: 'Bahrain|Bahraini', OM: 'Oman|Omani', JO: 'Jordan|Jordanian', EG: 'Egypt|Egyptian|Cairo', TR: 'Turkey|Turkiye|Türkiye|Turkish|Ankara', SD: 'Sudan|Sudanese|Khartoum|Darfur|RSF', SS: 'South Sudan', ET: 'Ethiopia|Ethiopian|Tigray|Amhara', ER: 'Eritrea|Eritrean', SO: 'Somalia|Somali|al-Shabaab|Mogadishu',
    LY: 'Libya|Libyan|Tripoli', ML: 'Mali|Malian|Bamako', BF: 'Burkina Faso', NE: 'Niger\\b|Nigerien', NG: 'Nigeria|Nigerian|Boko Haram|Lagos|Abuja', CD: 'Congo|Congolese|DRC|M23|Goma|Kinshasa', CF: 'Central African Republic|CAR\\b', CM: 'Cameroon', TD: 'Chad|Chadian', MZ: 'Mozambique|Cabo Delgado', KE: 'Kenya|Kenyan|Nairobi', ZA: 'South Africa|Johannesburg|Pretoria',
    MA: 'Morocco|Moroccan', DZ: 'Algeria|Algerian', TN: 'Tunisia|Tunisian', AF: 'Afghanistan|Afghan|Taliban|Kabul', PK: 'Pakistan|Pakistani|Islamabad|Karachi', IN: 'India|Indian|New Delhi|Kashmir', BD: 'Bangladesh|Bangladeshi|Dhaka', MM: 'Myanmar|Burma|Burmese', TH: 'Thailand|Thai\\b|Bangkok', KH: 'Cambodia|Cambodian',
    PH: 'Philippines|Philippine|Filipino|Manila', ID: 'Indonesia|Indonesian|Jakarta', MY: 'Malaysia|Malaysian', VN: 'Vietnam|Vietnamese', KP: 'North Korea|North Korean|Pyongyang', KR: 'South Korea|South Korean|Seoul', JP: 'Japan|Japanese|Tokyo', AU: 'Australia|Australian|Canberra', NZ: 'New Zealand',
    FR: 'France|French|Paris', DE: 'Germany|German|Berlin', IT: 'Italy|Italian|Rome', ES: 'Spain|Spanish|Madrid', PL: 'Poland|Polish|Warsaw', NL: 'Netherlands|Dutch', BE: 'Belgium|Belgian|Brussels', SE: 'Sweden|Swedish', NO: 'Norway|Norwegian', FI: 'Finland|Finnish', DK: 'Denmark|Danish', GR: 'Greece|Greek|Athens',
    RS: 'Serbia|Serbian|Belgrade', XK: 'Kosovo', BG: 'Bulgaria|Bulgarian', RO: 'Romania|Romanian', HU: 'Hungary|Hungarian', CZ: 'Czech', MD: 'Moldova|Moldovan', BY: 'Belarus|Belarusian|Minsk', GE: 'Georgia\\b(?! state)|Tbilisi', AM: 'Armenia|Armenian', AZ: 'Azerbaijan|Azerbaijani|Baku',
    CA: 'Canada|Canadian|Ottawa', MX: 'Mexico|Mexican', VE: 'Venezuela|Venezuelan|Caracas', CO: 'Colombia|Colombian|Bogota', BR: 'Brazil|Brazilian', AR: 'Argentina|Argentine', CL: 'Chile|Chilean', PE: 'Peru|Peruvian', EC: 'Ecuador', BO: 'Bolivia', HT: 'Haiti|Haitian|Port-au-Prince', CU: 'Cuba|Cuban', SV: 'El Salvador', GT: 'Guatemala', HN: 'Honduras', NI: 'Nicaragua', PA: 'Panama'};
  const ALIAS_RX = Object.entries(ALIAS).map(([iso, a]) => [iso, new RegExp('\\b(?:' + a + ')', 'i')]);
  const mentions = title => ALIAS_RX.filter(([, rx]) => rx.test(title)).map(([iso]) => iso);
  function classify(title) {
    const out = [];
    if (RX.conflict.test(title) && !RX.conflictNot.test(title)) out.push('conflict');
    if (RX.protest.test(title)) out.push('protest');
    if (RX.cyber.test(title)) out.push('cyber');
    return out;
  }
  const norm = t => String(t || '').toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  /* --- building events ----------------------------------------------------------------------------- */
  const countryName = iso => W.feats?.find(f => f.properties.iso2 === iso)?.properties.name || W.countries?.countries?.[iso]?.name || iso;
  const countryRegion = iso => W.countries?.countries?.[iso]?.region || '';
  const centroid = iso => W.centroidOf?.(iso) || ((c => c && finite(c.lon) ? [c.lon, c.lat] : null)(W.countries?.countries?.[iso]));
  const KM = (a, b) => G.geoDistance(a, b) * 6371;
  function build() {
    const now = Date.now(), cutoff = now - 72 * 3600000, groups = new Map(), seen = new Set();
    const add = (iso, cat, h) => {
      if (!centroid(iso)) return;
      const key = iso + ':' + cat, n = norm(h.title); if (seen.has(key + n)) return; seen.add(key + n);
      if (!groups.has(key)) groups.set(key, {iso, cat, items: []});
      groups.get(key).items.push(h);
    };
    const consider = (h, feedIso) => {
      const t = Date.parse(h.publishedAt || h.at || h.time || ''); if (!h.title || (finite(t) && t < cutoff)) return;
      const cats = classify(h.title); if (!cats.length) return;
      const m = mentions(h.title), iso = feedIso && (m.includes(feedIso) || !m.length) ? feedIso : m[0];
      if (!iso) return;
      for (const c of cats) add(iso, c, {title: h.title, source: h.source || h.publisher || '', url: h.url || h.link || null, at: finite(t) ? new Date(t).toISOString() : null});
    };
    for (const [iso, c] of Object.entries(W.countries?.countries || {})) for (const h of c.news?.items || []) consider(h, iso);
    for (const h of T.S.briefing || []) consider(h, null);
    const events = [];
    for (const g of groups.values()) {
      g.items.sort((a, b) => (Date.parse(b.at || 0) || 0) - (Date.parse(a.at || 0) || 0));
      const n = g.items.length, hard = g.items.filter(h => (g.cat === 'conflict' ? RX.conflictHard : g.cat === 'protest' ? RX.protestHard : RX.cyberHard).test(h.title)).length;
      const sev = n >= 4 || (hard >= 2) || (hard >= 1 && n >= 3) ? 'high' : n >= 2 || hard >= 1 ? 'med' : 'low';
      const layer = g.cat === 'protest' ? 'protests' : g.cat;
      events.push({id: `${layer}-${g.iso}`, layer, iso: g.iso, ll: centroid(g.iso), sev, n, items: g.items, title: `${countryName(g.iso)}: ${n} ${g.cat === 'conflict' ? 'conflict' : g.cat === 'protest' ? 'protest' : 'cyber'} report${n === 1 ? '' : 's'}`, at: g.items[0]?.at});
    }
    // Live conflict zones: countries with repeated conflict reports.
    const liveZones = new Set(events.filter(e => e.layer === 'conflict' && e.n >= 2).map(e => e.iso));
    // Quakes and alerts.
    const quakes = (D.haz?.quakes || []).map(q => ({id: 'q-' + q.id, layer: 'quakes', ll: [q.lon, q.lat], sev: q.mag >= 7 || q.alert === 'red' || q.alert === 'orange' ? 'high' : q.mag >= 6 || q.tsunami || q.alert === 'yellow' ? 'med' : 'low', q, title: `M${q.mag.toFixed(1)} · ${q.place}`, at: q.time}));
    const alerts = (D.haz?.alerts || []).map(a => ({id: 'a-' + a.id, layer: 'alerts', ll: [a.lon, a.lat], sev: a.level, a, iso: a.iso2 || null, title: a.title, at: a.from}));
    // Hotspots: stack the signals per country.
    const zones = D.ref?.layers?.zones || [];
    const score = new Map(), why = new Map();
    const bump = (iso, pts, text) => { if (!iso || !centroid(iso)) return; score.set(iso, (score.get(iso) || 0) + pts); if (!why.has(iso)) why.set(iso, []); why.get(iso).push([pts, text]); };
    for (const e of events) bump(e.iso, (e.layer === 'conflict' ? 2 : 1) * Math.min(e.n, 4) + (e.sev === 'high' ? 2 : 0), `${e.n} ${e.layer === 'protests' ? 'protest' : e.layer} report${e.n === 1 ? '' : 's'} (${SEV_LABEL[e.sev].toLowerCase()})`);
    for (const z of zones) for (const iso of z.c.slice(0, 1)) bump(iso, 1, `Long-running conflict area: ${z.n}`);
    for (const q of quakes) if (q.q.mag >= 6) { const near = nearestCountry(q.ll); if (near) bump(near, q.q.mag >= 7 ? 3 : 1, `M${q.q.mag.toFixed(1)} earthquake nearby`); }
    for (const a of alerts) if (a.sev !== 'low') { const iso = a.iso || nearestCountry(a.ll); if (iso) bump(iso, a.sev === 'high' ? 3 : 1, `${(HAZ[a.a.type] || ['Alert'])[0]} alert: ${a.a.title}`); }
    const statuses = W.statusOf || (() => null);
    for (const iso of score.keys()) { const st = statuses(iso); if (st?.level === 'red') bump(iso, 2, 'Country light is red (market or event signal)'); }
    const hotspots = [...score.entries()].filter(([, s]) => s >= 6).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([iso, s]) => ({id: 'h-' + iso, layer: 'hotspots', iso, ll: centroid(iso), sev: s >= 12 ? 'high' : s >= 8 ? 'med' : 'low', score: s, why: why.get(iso).sort((a, b) => b[0] - a[0]), title: `${countryName(iso)} hotspot`}));
    D.events = [...events, ...hotspots, ...quakes, ...alerts];
    D.liveZones = liveZones;
    D.byId = new Map(D.events.map(e => [e.id, e]));
    const refs = D.ref?.layers || {};
    for (const k of ['bases', 'nuclear', 'datacenters', 'spaceports', 'dams', 'airports', 'ports', 'exchanges']) (refs[k] || []).forEach((r, i) => D.byId.set(`${k}-${i}`, {id: `${k}-${i}`, layer: k, ref: r, ll: r.ll, iso: r.c, title: r.n}));
    (refs.pipelines || []).forEach((p, i) => D.byId.set(`pipelines-${i}`, {id: `pipelines-${i}`, layer: 'pipelines', ref: p, ll: p.paths[0][Math.floor(p.paths[0].length / 2)], title: p.n + ' pipeline'}));
    zones.forEach((z, i) => D.byId.set(`zones-${i}`, {id: `zones-${i}`, layer: 'zones', ref: z, ll: z.ll, iso: z.c[0], title: z.n}));
    for (const iso of liveZones) { const e = events.find(x => x.layer === 'conflict' && x.iso === iso); D.byId.set('lz-' + iso, {...e, id: 'lz-' + iso, layer: 'zones', live: true, title: `${countryName(iso)}: active conflict reports`}); }
  }
  function nearestCountry(ll) {
    let best = null, bd = Infinity;
    for (const f of W.feats || []) { const iso = f.properties.iso2; if (!iso) continue; if (G.geoContains(f, ll)) return iso; const c = centroid(iso); if (!c) continue; const d = G.geoDistance(c, ll); if (d < bd) { bd = d; best = iso; } }
    return bd * 6371 < 900 ? best : null;
  }
  const countFor = k => {
    if (BASE.has(k)) return k === 'tankers' ? (W.ships?.vessels || []).filter(v => v.kind === 'tanker').length : k === 'cargo' ? (W.ships?.vessels || []).filter(v => v.kind === 'cargo').length : k === 'other' ? (W.ships?.vessels || []).filter(v => v.kind !== 'tanker' && v.kind !== 'cargo').length : k === 'chokes' ? Object.keys(W.ships?.chokepoints || {}).length : k === 'lights' ? (W.feats || []).length : null;
    if (k === 'zones') return (D.ref?.layers?.zones?.length || 0) + (D.liveZones?.size || 0);
    if (D.ref?.layers?.[k]) return D.ref.layers[k].length;
    return D.events.filter(e => e.layer === k).length;
  };

  /* --- styles ---------------------------------------------------------------------------------------- */
  const st = el('style'); st.id = 'fx-intel-style';
  st.textContent = `
.fx-ilp{position:absolute;top:8px;left:8px;z-index:4;width:236px;max-height:calc(100% - 56px);display:flex;flex-direction:column;background:rgba(6,9,10,.94);border:1px solid #2a3530;box-shadow:0 10px 30px rgba(0,0,0,.45);font-size:11.5px}
.fx-ilp.collapsed{width:auto;max-height:none}
.fx-ilp-head{display:flex;align-items:center;gap:6px;padding:7px 8px;border-bottom:1px solid #1f2825}
.fx-ilp-head b{flex:1;font:700 10.5px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:var(--am)}
.fx-ilp-head small{color:var(--mu);font:500 10px 'IBM Plex Mono',monospace}
.fx-ilp-head button{width:24px;height:22px;padding:0;background:none;border:1px solid #2a3530;color:var(--tx);font-size:12px;line-height:1}
.fx-ilp.collapsed .fx-ilp-body{display:none}
.fx-ilp-body{display:flex;flex-direction:column;min-height:0;flex:1}
.fx-ilp-tabs{display:flex;border-bottom:1px solid #1f2825}
.fx-ilp-tabs button{flex:1;padding:6px 0;background:none;border:0;border-bottom:2px solid transparent;color:var(--mu);font:600 10.5px 'IBM Plex Mono',monospace;letter-spacing:.05em}
.fx-ilp-tabs button.on{color:var(--tx);border-bottom-color:var(--am)}
.fx-ilp-search{margin:7px 8px 5px;padding:6px 8px;background:#0d1312;border:1px solid #26302c;color:var(--tx);font:12px Inter,Arial,sans-serif;width:auto}
.fx-ilp-search:focus{outline:1px solid var(--am);border-color:var(--am)}
html body.fx-terminal .fx-ilp-search{background:#0d1312!important;color:var(--tx)!important;border:1px solid #26302c!important;border-radius:0!important}
html body.fx-terminal .fx-ilp-search:focus{border-color:var(--am)!important}
.fx-ilp-chips{display:flex;flex-wrap:wrap;gap:3px;padding:0 8px 6px}
.fx-ilp-chips button{padding:2px 6px;min-height:20px;background:#121917;border:1px solid #26302c;color:#b9c4be;font:600 10px Inter,Arial,sans-serif}
.fx-ilp-chips button.on{background:var(--am);border-color:var(--am);color:#000}
.fx-ilp-list{overflow:auto;min-height:0;flex:1;padding:0 4px 4px;scrollbar-width:thin;scrollbar-color:#2a3530 transparent}
.fx-ilp-sec{padding:6px 4px 2px;color:#6f7c75;font:700 9.5px 'IBM Plex Mono',monospace;letter-spacing:.1em}
.fx-ilp-row{display:grid;grid-template-columns:16px 16px 1fr auto 18px;align-items:center;gap:6px;padding:3px 4px;min-height:24px;border-radius:2px}
.fx-ilp-row:hover{background:#111816}
.fx-ilp-row input{margin:0;width:13px;height:13px;accent-color:#ffb000;cursor:pointer}
.fx-ilp-row label{cursor:pointer;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-ilp-row .n{color:var(--mu);font:500 10px 'IBM Plex Mono',monospace}
.fx-ilp-row .live{display:inline-block;width:5px;height:5px;margin-left:5px;border-radius:50%;background:#3ecf8e;vertical-align:1px;box-shadow:0 0 6px #3ecf8e}
.fx-ilp-row .i{width:18px;height:18px;padding:0;border:1px solid #2a3530;border-radius:50%;background:none;color:var(--mu);font:600 10px Georgia,serif;line-height:1}
.fx-ilp-row .i[aria-expanded=true]{border-color:var(--am);color:var(--am)}
.fx-ilp-info{margin:0 4px 4px 26px;padding:6px 8px;background:#0e1513;border-left:2px solid var(--am);color:#c5cfca;font-size:11px;line-height:1.45}
.fx-ilp-foot{display:flex;gap:4px;padding:6px 8px;border-top:1px solid #1f2825}
.fx-ilp-foot button{flex:1;padding:4px 0;background:#121917;border:1px solid #26302c;color:#c5cfca;font:600 10.5px Inter,Arial,sans-serif}
.fx-ilp-foot button:hover,.fx-ilp-chips button:hover{border-color:var(--am)}
.fx-ilp-ev{display:grid;grid-template-columns:8px 1fr auto;gap:7px;align-items:start;width:100%;padding:6px 6px;background:none;border:0;border-bottom:1px solid #161e1b;text-align:left;color:var(--tx)}
.fx-ilp-ev:hover,.fx-ilp-ev:focus-visible{background:#111816}
.fx-ilp-ev i{width:8px;height:8px;margin-top:4px;border-radius:50%}
.fx-ilp-ev b{display:block;font-weight:600;font-size:11.5px;line-height:1.35}
.fx-ilp-ev small{display:block;color:var(--mu);font-size:10.5px;margin-top:1px}
.fx-ilp-ev em{font:600 9.5px 'IBM Plex Mono',monospace;font-style:normal;padding:1px 4px;color:#000}
.fx-ilp-empty{padding:12px 8px;color:var(--mu);font-size:11.5px;line-height:1.5}
.fx-ic{flex:none;display:block}
.g-intel .gi{cursor:pointer}
.g-intel .gi:hover .gi-bg,.g-intel .gi.sel .gi-bg{stroke:#ffb000;stroke-width:1.6}
.g-intel .gi.sel .gi-sel{display:block}
.g-intel .gi-sel{display:none}
.g-intel .gi-pulse{transform-box:fill-box;transform-origin:center;animation:giPulse 2.2s ease-out infinite;pointer-events:none}
@keyframes giPulse{0%{transform:scale(.6);opacity:.85}100%{transform:scale(2.4);opacity:0}}
.g-intel text{font:600 10px 'IBM Plex Mono',monospace;fill:#e7ece9;paint-order:stroke;stroke:#05080a;stroke-width:3px;pointer-events:none}
.g-zone-ref{fill:rgba(255,72,60,.10);stroke:#ff5a4f;stroke-width:1.1;stroke-dasharray:4 3;cursor:pointer}
.g-zone-ref:hover,.g-zone-ref.sel{fill:rgba(255,72,60,.2);stroke-width:1.8}
.g-zone-live{fill:url(#gi-hatch);stroke:#ff5a4f;stroke-width:.9;pointer-events:none}
.g-pipe{fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.g-pipe-hit{fill:none;stroke:transparent;stroke-width:10;cursor:pointer}
.g-pipe-hit:hover+.g-pipe,.g-pipe.sel{stroke-width:3.2}
@media (prefers-reduced-motion:reduce){.g-intel .gi-pulse{animation:none;display:none}}
.fx-icard{position:absolute;top:44px;right:8px;z-index:5;width:310px;max-height:calc(100% - 92px);display:flex;flex-direction:column;background:rgba(7,10,11,.97);border:1px solid var(--am);box-shadow:0 18px 40px rgba(0,0,0,.6)}
.fx-icard[hidden]{display:none}
.fx-ic-top{display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid #2a2f22}
.fx-ic-top b{flex:1;font:700 10.5px 'IBM Plex Mono',monospace;letter-spacing:.1em;color:var(--am)}
.fx-ic-top button{width:24px;height:22px;padding:0;background:none;border:1px solid #2a3530;color:var(--tx)}
.fx-ic-body{overflow:auto;padding:10px 12px 12px;display:flex;flex-direction:column;gap:9px;scrollbar-width:thin;scrollbar-color:#2a3530 transparent}
.fx-ic-title{display:flex;gap:9px;align-items:flex-start;padding:8px 9px;background:#11100b;border:1px solid #3a3420}
.fx-ic-title strong{font-size:14px;line-height:1.3;color:var(--tx)}
.fx-ic-kv{display:grid;grid-template-columns:92px 1fr;gap:4px 8px;margin:0;font-size:12px}
.fx-ic-kv dt{color:var(--mu)}
.fx-ic-kv dd{margin:0;color:var(--tx)}
.fx-ic-sev{display:inline-block;padding:1px 6px;font:700 10.5px 'IBM Plex Mono',monospace;color:#000}
.fx-ic-h{margin:2px 0 0;font:700 10.5px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:var(--am)}
.fx-ic-h small{color:var(--mu);font-weight:500;letter-spacing:0;margin-left:6px}
.fx-ic-p{margin:0;font-size:12px;line-height:1.5;color:#cfd8d3}
.fx-ic-src{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
.fx-ic-src li{display:grid;grid-template-columns:6px 1fr;gap:7px;font-size:11.5px;line-height:1.4}
.fx-ic-src li::before{content:"";width:5px;height:5px;margin-top:5px;border-radius:50%;background:#3ecf8e}
.fx-ic-src a{color:#e7ece9;text-decoration:none}
.fx-ic-src a:hover{color:var(--am);text-decoration:underline}
.fx-ic-src small{display:block;color:var(--mu);font-size:10.5px}
.fx-ic-why li::before{background:var(--am)}
.fx-ic-tags{display:flex;flex-wrap:wrap;gap:4px}
.fx-ic-tags button{padding:3px 7px;background:#121917;border:1px solid #2a3530;color:#c5cfca;font:600 10.5px Inter,Arial,sans-serif}
.fx-ic-tags button:hover{border-color:var(--am);color:var(--am)}
.fx-ic-act{display:flex;gap:5px}
.fx-ic-act button,.fx-ic-act a{flex:1;display:flex;align-items:center;justify-content:center;min-height:30px;padding:4px 8px;border:1px solid #2a3530;background:#121917;color:var(--tx);font:700 11.5px Inter,Arial,sans-serif;text-decoration:none}
.fx-ic-act .pri{background:var(--am);border-color:var(--am);color:#000}
.fx-ic-act .pri:hover{background:#ffc433}
.fx-ic-note{margin:0;color:#7d8a83;font-size:10.5px;line-height:1.45}
.fx-glegend .fx-gl-intel{display:inline-flex;gap:10px;flex-wrap:wrap;align-items:center}
.fx-glegend .fx-gl-intel span{gap:4px}
.fx-glegend .fx-gl-intel i.sq{border-radius:0;background:repeating-linear-gradient(45deg,#ff5a4f 0 2px,transparent 2px 4px)!important;border:1px solid #ff5a4f}
.fx-glegend .fx-gl-intel i.ln{height:2px;width:14px;border-radius:0}
@media (max-width:760px){.fx-ilp{width:auto;right:8px;top:44px;max-height:calc(100% - 96px)}.fx-icard{left:8px;right:8px;width:auto;top:auto;bottom:44px;max-height:60%}}
/* Phones: the open panel sits below the map buttons and the globe tile grows so the layer list has room
   (before, the list was squeezed to 0px on iPhone and no layer could be switched). Category chips scroll in one row. */
@media (max-width:760px){#tp-globe:has(.fx-ilp:not(.collapsed)){min-height:700px}.fx-ilp{top:60px}.fx-ilp:not(.collapsed){bottom:8px;max-height:none}
.fx-ilp-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.fx-ilp-chips::-webkit-scrollbar{display:none}.fx-ilp-chips button{flex:none}}
/* Touch screens: 44px tap targets in the layer panel and the event card. */
@media (pointer:coarse){
html body.fx-terminal .fx-ilp-head button,html body.fx-terminal .fx-ic-top button{width:44px;height:44px;min-height:44px}
html body.fx-terminal .fx-ilp-chips button{min-width:44px;min-height:44px}
html body.fx-terminal .fx-ilp-tabs button,html body.fx-terminal .fx-ilp-foot button,html body.fx-terminal .fx-ic-act button,html body.fx-terminal .fx-ic-act a,html body.fx-terminal .fx-ic-tags button{min-height:44px}
html body.fx-terminal .fx-ilp-row{grid-template-columns:22px 16px minmax(0,1fr) auto 44px;min-height:44px;padding:0 0 0 4px}
html body.fx-terminal .fx-ilp-row input{width:22px;height:22px}
html body.fx-terminal .fx-ilp-row label{align-self:stretch;line-height:44px}
html body.fx-terminal .fx-ilp-row .i{width:44px;height:44px;min-height:44px;border:0;border-radius:0;background:radial-gradient(circle,transparent 0 8px,#2a3530 8px 9px,transparent 9.5px)}
html body.fx-terminal .fx-ilp-row .i[aria-expanded=true]{background:radial-gradient(circle,transparent 0 8px,var(--am) 8px 9px,transparent 9.5px)}
html body.fx-terminal .fx-ic-src a{display:inline-block;min-height:44px;padding:4px 0;box-sizing:border-box}}`;
  document.head.append(st);

  /* --- panel --------------------------------------------------------------------------------------- */
  let ctx = null, tab = 'layers', group = 'all', query = '', openInfo = null;
  function panel({redraw}) {
    const box = el('div', 'fx-ilp');
    box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Intelligence layers');
    const narrow = () => (box.parentElement?.clientWidth || 1200) < 640;
    let collapsed = store.get('globe-ilp-collapsed') === '1';
    const head = el('div', 'fx-ilp-head'), count = el('small'), tog = btn(collapsed ? '+' : '–', '', () => { collapsed = !collapsed; store.set('globe-ilp-collapsed', collapsed ? '1' : '0'); paint(); }, 'Show or hide the layer panel');
    head.append(el('b', '', 'INTELLIGENCE LAYERS'), count, tog);
    const body = el('div', 'fx-ilp-body'), tabs = el('div', 'fx-ilp-tabs');
    const tL = btn('LAYERS', '', () => { tab = 'layers'; paint(); }), tE = btn('EVENTS', '', () => { tab = 'events'; paint(); });
    tabs.append(tL, tE);
    const search = el('input', 'fx-ilp-search'); search.type = 'search'; search.placeholder = 'Search layers, places, events…'; search.setAttribute('aria-label', 'Search layers, places and events'); search.value = query;
    search.addEventListener('input', () => { query = search.value; paintList(); });
    const chips = el('div', 'fx-ilp-chips'), list = el('div', 'fx-ilp-list'), foot = el('div', 'fx-ilp-foot');
    foot.append(btn('All on', '', () => { for (const l of LAYERS) if (inGroup(l[0])) setOn(l[0], true); redraw(); paint(); }), btn('Defaults', '', () => { for (const l of LAYERS) setOn(l[0], BASE.has(l[0]) ? ['lights', 'tankers', 'cargo', 'chokes', 'lanes'].includes(l[0]) : !!l[6]); redraw(); paint(); }), btn('None', '', () => { for (const l of LAYERS) if (inGroup(l[0])) setOn(l[0], false); redraw(); paint(); }));
    body.append(tabs, search, chips, list, foot); box.append(head, body);
    const inGroup = k => group === 'all' || L[k].group === group;
    function paint() {
      if (narrow() && store.get('globe-ilp-collapsed') === null) collapsed = true;
      box.classList.toggle('collapsed', collapsed); tog.textContent = collapsed ? '+' : '–'; tog.setAttribute('aria-expanded', String(!collapsed));
      count.textContent = `${LAYERS.filter(l => isOn(l[0])).length}/${LAYERS.length} on`;
      tL.classList.toggle('on', tab === 'layers'); tE.classList.toggle('on', tab === 'events'); tL.setAttribute('aria-pressed', String(tab === 'layers')); tE.setAttribute('aria-pressed', String(tab === 'events'));
      const liveN = D.events.filter(e => e.sev !== 'low' || e.layer === 'hotspots').length; tE.textContent = `EVENTS${liveN ? ' · ' + liveN : ''}`;
      chips.hidden = tab !== 'layers'; foot.hidden = tab !== 'layers';
      chips.replaceChildren(...GROUPS.map(([k, l]) => { const b = btn(l, group === k ? 'on' : '', () => { group = k; paint(); }); b.setAttribute('aria-pressed', String(group === k)); return b; }));
      paintList();
    }
    function paintList() {
      list.replaceChildren();
      const q = query.trim().toLowerCase();
      if (tab === 'events') return paintEvents(list, q);
      let any = false;
      for (const [gk, gl] of GROUPS.slice(1)) {
        if (group !== 'all' && group !== gk) continue;
        const rows = LAYERS.filter(l => l[2] === gk && (!q || l[1].toLowerCase().includes(q) || l[7].toLowerCase().includes(q)));
        if (!rows.length) continue; any = true;
        if (group === 'all') list.append(el('div', 'fx-ilp-sec', gl.toUpperCase()));
        for (const l of rows) {
          const k = l[0], row = el('div', 'fx-ilp-row'), id = 'ilp-' + k, cb = el('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = isOn(k);
          cb.addEventListener('change', () => { setOn(k, cb.checked); redraw(); count.textContent = `${LAYERS.filter(x => isOn(x[0])).length}/${LAYERS.length} on`; });
          const lab = el('label'); lab.htmlFor = id; lab.textContent = l[1]; if (l[3]) { const dot = el('span', 'live'); dot.title = 'Live data'; lab.append(dot); }
          const n = countFor(k), info = btn('i', 'i', () => { openInfo = openInfo === k ? null : k; paintList(); }, `About ${l[1]}`); info.setAttribute('aria-expanded', String(openInfo === k));
          row.append(cb, iconSvg(l[5], l[4]), lab, el('span', 'n', n === null || n === undefined ? '' : n.toLocaleString()), info); list.append(row);
          if (openInfo === k) list.append(el('p', 'fx-ilp-info', l[7] + (l[3] ? '' : ` ${D.ref?.note ? 'Reference data, reviewed ' + monthOf(D.ref.reviewed) + '.' : ''}`)));
        }
      }
      // Places and events that match the search.
      if (q.length >= 3) {
        const hits = [...D.byId.values()].filter(x => (x.title || '').toLowerCase().includes(q) || countryName(x.iso || '').toLowerCase().includes(q)).slice(0, 12);
        if (hits.length) { list.append(el('div', 'fx-ilp-sec', 'MATCHING PLACES & EVENTS')); for (const h of hits) list.append(eventRow(h)); any = true; }
      }
      if (!any) list.append(el('p', 'fx-ilp-empty', 'Nothing matches that search.'));
    }
    function paintEvents(host, q) {
      const order = {high: 0, med: 1, low: 2};
      const evs = D.events.filter(e => (e.layer === 'hotspots' || e.sev !== 'low' || (e.layer === 'conflict')) && (!q || (e.title || '').toLowerCase().includes(q) || countryName(e.iso || '').toLowerCase().includes(q)))
        .sort((a, b) => order[a.sev] - order[b.sev] || (b.layer === 'hotspots') - (a.layer === 'hotspots') || (Date.parse(b.at || 0) || 0) - (Date.parse(a.at || 0) || 0)).slice(0, 80);
      if (!D.at) { host.append(el('p', 'fx-ilp-empty', 'Loading live events…')); return; }
      if (!evs.length) { host.append(el('p', 'fx-ilp-empty', 'No elevated live events right now. Low-severity items are still on the map.')); return; }
      for (const e of evs) host.append(eventRow(e));
      host.append(el('p', 'fx-ilp-empty', `Headlines from the last 72 h · quakes and alerts ${D.hazAt ? 'updated ' + ago(D.hazAt) : 'loading'}. Click any event to open it on the globe.`));
    }
    function eventRow(e) {
      const b = el('button', 'fx-ilp-ev'); b.type = 'button';
      const dot = el('i'); dot.style.background = e.sev ? SEV[e.sev] : L[e.layer]?.color || '#999';
      const t = el('span'); t.append(el('b', '', e.title)); t.append(el('small', '', [L[e.layer]?.label, e.iso ? countryName(e.iso) : '', e.at ? ago(e.at) : ''].filter(Boolean).join(' · ')));
      const pill = el('em', '', e.sev ? SEV_LABEL[e.sev] : 'REF'); pill.style.background = e.sev ? SEV[e.sev] : '#56635c';
      b.append(dot, t, pill); b.addEventListener('click', () => openItem(e.id, {zoom: true})); return b;
    }
    box._paint = paint; paint();
    return box;
  }
  const monthOf = ym => { const [y, m] = String(ym || '').split('-').map(Number); return y && m ? new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(undefined, {month: 'long', year: 'numeric'}) : ''; };

  /* --- mount + draw ---------------------------------------------------------------------------------- */
  function mount(m) {
    ctx = {...m, sel: null};
    const defs = svg('defs'), pat = svg('pattern', {id: 'gi-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'});
    pat.append(svg('rect', {width: 6, height: 6, fill: 'rgba(255,72,60,.10)'}), svg('line', {x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#ff5a4f', 'stroke-width': 1.6, 'stroke-opacity': 0.7}));
    defs.append(pat); m.sv.prepend(defs);
    const card = el('div', 'fx-icard'); card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Event intelligence'); m.stage.append(card); ctx.card = card;
    const pick = e => { if (W.lastMoved) return; const t = e.target.closest?.('[data-id]'); if (t) { e.stopPropagation(); openItem(t.dataset.id); } };
    for (const g of [m.gIntel, m.gZones, m.gPipes]) g.addEventListener('click', pick);
    m.gIntel.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.id) { e.preventDefault(); openItem(e.target.dataset.id); } });
    W.intelRedraw = () => { if (!m.sv.isConnected) return; m.redraw(); m.layersBox?._paint?.(); legend(m.legend); if (ctx.selId && !card.hidden) openItem(ctx.selId, {keep: true}); };
    if (!D.at) load(); else build();
    legend(m.legend);
  }
  function legend(host) {
    if (!host) return; host.querySelector('.fx-gl-intel')?.remove();
    const wrap = el('span', 'fx-gl-intel'), it = (cls, color, label) => { const s = el('span'), i = el('i', cls); if (color) i.style.background = color; s.append(i, document.createTextNode(label)); wrap.append(s); };
    if (['conflict', 'protests', 'cyber', 'quakes', 'alerts', 'hotspots'].some(k => on[k])) { it('', SEV.high, 'Event high'); it('', SEV.med, 'Elevated'); it('', SEV.low, 'Low'); }
    if (on.zones) it('sq', null, 'Conflict zone');
    if (on.pipelines) { it('ln', '#c08a4e', 'Oil'); it('ln', '#4fc3f7', 'Gas'); }
    if (!wrap.childElementCount) return;
    const note = host.querySelector('.fx-gnote'); host.insertBefore(wrap, note || null);
  }
  const PIPE_COLOR = {oil: '#c08a4e', gas: '#4fc3f7', fuel: '#f4a261'};
  const OFFSET = {conflict: [0, 0], protests: [-11, -9], cyber: [11, -9], hotspots: [0, 0]};
  function draw(proj, path, visible) {
    if (!ctx) return;
    const {gIntel, gZones, gPipes} = ctx, refs = D.ref?.layers || {}, k = Math.min(1.7, 0.85 + 0.12 * W.scale), labels = W.scale >= 2.6, refLabels = W.scale >= 4.5;
    // zones
    const zf = document.createDocumentFragment();
    if (on.zones) {
      // Hatch countries with repeated conflict reports; very large countries are left to the reference circles,
      // because shading all of Russia or the US would overstate where fighting is.
      for (const iso of D.liveZones || []) { const f = W.feats?.find(x => x.properties.iso2 === iso); if (!f || bigCountry(f)) continue; const d = path(f); if (d) zf.append(svg('path', {d, class: 'g-zone-live'})); }
      (refs.zones || []).forEach((z, i) => { const d = path({type: 'Polygon', coordinates: [circle(z.ll, z.r)]}); if (d) zf.append(svg('path', {d, class: 'g-zone-ref' + (ctx.selId === `zones-${i}` ? ' sel' : ''), 'data-id': `zones-${i}`}, )); });
    }
    gZones.replaceChildren(zf);
    // pipelines
    const pf = document.createDocumentFragment();
    if (on.pipelines) (refs.pipelines || []).forEach((p, i) => {
      const off = /offline|damaged|construction|varies/i.test(p.s), id = `pipelines-${i}`;
      for (const pts of p.paths) {
        const d = path({type: 'LineString', coordinates: densify(pts)}); if (!d) continue;
        pf.append(svg('path', {d, class: 'g-pipe-hit', 'data-id': id}), svg('path', {d, class: 'g-pipe' + (ctx.selId === id ? ' sel' : ''), stroke: PIPE_COLOR[p.k] || '#f4a261', 'stroke-dasharray': off ? '5 4' : '', 'stroke-opacity': 0.92}));
      }
    });
    gPipes.replaceChildren(pf);
    // points
    const f = document.createDocumentFragment();
    const put = (id, ll, build, label, dx = 0, dy = 0) => {
      if (!ll || !visible(ll)) return; const p = proj(ll); if (!p) return;
      const g = svg('g', {class: 'gi' + (ctx.selId === id ? ' sel' : ''), 'data-id': id, transform: `translate(${(p[0] + dx).toFixed(1)} ${(p[1] + dy).toFixed(1)})`, tabindex: '-1'});
      build(g); if (label) { const t = svg('text', {x: 9 * k, y: 3.5}); t.textContent = label; g.append(t); } f.append(g);
    };
    const glyph = (g, name, color, size = 13) => { const s = size * k; g.append(svg('circle', {r: s * 0.68, class: 'gi-bg', fill: 'rgba(5,8,10,.82)', stroke: color, 'stroke-width': 0.9}), svg('circle', {r: s * 0.95, class: 'gi-sel', fill: 'none', stroke: '#ffb000', 'stroke-width': 1.4}), svg('path', {d: ICON[name], fill: color, 'fill-rule': 'evenodd', transform: `translate(${-s * 0.42} ${-s * 0.42}) scale(${(s * 0.84 / 12).toFixed(3)})`})); };
    for (const [layer, icon] of [['airports', 'plane'], ['ports', 'anchor'], ['dams', 'dam'], ['datacenters', 'server'], ['exchanges', 'candle'], ['spaceports', 'rocket'], ['bases', 'tri'], ['nuclear', 'rad']]) {
      if (!on[layer]) continue;
      (refs[layer] || []).forEach((r, i) => put(`${layer}-${i}`, r.ll, g => glyph(g, icon, L[layer].color, 12), refLabels || ctx.selId === `${layer}-${i}` ? r.n : ''));
    }
    // live events, quietest first so the most severe sit on top
    const sevRank = {low: 0, med: 1, high: 2};
    for (const e of [...D.events].sort((a, b) => sevRank[a.sev] - sevRank[b.sev])) {
      if (!on[e.layer]) continue;
      const c = SEV[e.sev];
      if (e.layer === 'quakes') put(e.id, e.ll, g => { const r = Math.max(3, (e.q.mag - 3.5) * 3.2) * k; if (e.sev === 'high') g.append(svg('circle', {r, class: 'gi-pulse', fill: 'none', stroke: c, 'stroke-width': 1.5})); g.append(svg('circle', {r: r + 3, class: 'gi-sel', fill: 'none', stroke: '#ffb000', 'stroke-width': 1.4}), svg('circle', {r, class: 'gi-bg', fill: c, 'fill-opacity': 0.28, stroke: c, 'stroke-width': 1.2}), svg('circle', {r: 1.6, fill: c})); }, labels ? 'M' + e.q.mag.toFixed(1) : '');
      else if (e.layer === 'alerts') put(e.id, e.ll, g => { const hc = (HAZ[e.a.type] || ['', '#ffca28'])[1], s = 13 * k; g.append(svg('circle', {r: s * 0.95, class: 'gi-sel', fill: 'none', stroke: '#ffb000', 'stroke-width': 1.4})); if (e.sev === 'high') g.append(svg('circle', {r: s * 0.6, class: 'gi-pulse', fill: 'none', stroke: c, 'stroke-width': 1.5})); g.append(svg('path', {d: ICON.warn, class: 'gi-bg', fill: hc, stroke: e.sev === 'low' ? '#05080a' : c, 'stroke-width': 1.2, transform: `translate(${-s / 2} ${-s / 2}) scale(${(s / 12).toFixed(3)})`}), svg('path', {d: 'M5.4 3.6h1.2v3.6H5.4zM5.4 8.1h1.2v1.3H5.4z', fill: '#05080a', transform: `translate(${-s / 2} ${-s / 2}) scale(${(s / 12).toFixed(3)})`})); }, labels ? (HAZ[e.a.type] || ['Alert'])[0] : '');
      else if (e.layer === 'hotspots') put(e.id, e.ll, g => { const r = (10 + Math.min(10, e.score / 2)) * k; g.append(svg('circle', {r, class: 'gi-pulse', fill: 'none', stroke: c, 'stroke-width': 1.4}), svg('circle', {r: r + 3, class: 'gi-sel', fill: 'none', stroke: '#ffb000', 'stroke-width': 1.4}), svg('circle', {r, class: 'gi-bg', fill: 'none', stroke: c, 'stroke-width': 1.6, 'stroke-dasharray': '3 2'}), svg('circle', {r: r * 0.55, fill: 'none', stroke: c, 'stroke-width': 1, 'stroke-opacity': 0.8})); }, '');
      else {
        const [dx, dy] = OFFSET[e.layer] || [0, 0];
        put(e.id, e.ll, g => {
          if (e.layer === 'conflict') { const r = (4.5 + Math.min(6, Math.sqrt(e.n) * 2.2)) * k; if (e.sev === 'high') g.append(svg('circle', {r, class: 'gi-pulse', fill: 'none', stroke: c, 'stroke-width': 1.6})); g.append(svg('circle', {r: r + 3, class: 'gi-sel', fill: 'none', stroke: '#ffb000', 'stroke-width': 1.4}), svg('circle', {r, class: 'gi-bg', fill: c, 'fill-opacity': 0.88, stroke: '#05080a', 'stroke-width': 1.4}), svg('circle', {r: r * 0.36, fill: '#fff', 'fill-opacity': 0.85})); }
          else glyph(g, e.layer === 'protests' ? 'megaphone' : 'bolt', e.sev === 'low' ? L[e.layer].color : c, 13);
        }, labels ? countryName(e.iso) + (e.n > 1 ? ` · ${e.n}` : '') : '', dx * k, dy * k);
      }
    }
    gIntel.replaceChildren(f);
  }
  const BIG = new Map();
  function bigCountry(f) { const k = f.properties.iso2; if (!BIG.has(k)) { const [[x0, y0], [x1, y1]] = G.geoBounds(f); BIG.set(k, (x1 < x0 ? x1 + 360 - x0 : x1 - x0) > 35 || y1 - y0 > 28); } return BIG.get(k); }
  function circle(ll, km) { const r = km / 6371, [lon, lat] = ll.map(v => v * Math.PI / 180), out = []; for (let b = 0; b <= 360; b += 10) { const t = b * Math.PI / 180, la = Math.asin(Math.sin(lat) * Math.cos(r) + Math.cos(lat) * Math.sin(r) * Math.cos(t)), lo = lon + Math.atan2(Math.sin(t) * Math.sin(r) * Math.cos(lat), Math.cos(r) - Math.sin(lat) * Math.sin(la)); out.push([lo * 180 / Math.PI, la * 180 / Math.PI]); } return out; }
  function densify(pts) { const out = []; for (let i = 0; i < pts.length - 1; i++) { const it = G.geoInterpolate(pts[i], pts[i + 1]), n = Math.max(2, Math.ceil(G.geoDistance(pts[i], pts[i + 1]) / 0.03)); for (let j = 0; j < n; j++) out.push(it(j / n)); } out.push(pts.at(-1)); return out; }

  /* --- event intelligence card --------------------------------------------------------------------- */
  function openItem(id, {zoom = false, keep = false} = {}) {
    const x = D.byId.get(id); if (!x || !ctx) return;
    ctx.selId = id; const card = ctx.card;
    if (zoom && x.ll) { W.rot = W.flat ? [-x.ll[0], 0] : [-x.ll[0], -x.ll[1]]; W.scale = Math.max(W.scale, x.layer === 'zones' || x.layer === 'pipelines' ? 2.2 : 3); }
    if (!on[x.layer] && !BASE.has(x.layer)) { setOn(x.layer, true); ctx.layersBox?._paint?.(); }
    card.replaceChildren(); card.hidden = false;
    // On narrow screens the card and the layer panel cannot both fit: fold the panel away.
    if ((ctx.stage.clientWidth || 1000) < 640) { const lb = ctx.stage.querySelector('.fx-ilp'); if (lb && !lb.classList.contains('collapsed')) lb.querySelector('.fx-ilp-head button')?.click(); }
    const live = !x.ref || x.live, top = el('div', 'fx-ic-top');
    top.append(el('b', '', live ? 'EVENT INTELLIGENCE' : 'SITE INTELLIGENCE'), btn('⌖', '', () => openItem(id, {zoom: true}), 'Zoom to this'), btn('✕', '', closeCard, 'Close'));
    const body = el('div', 'fx-ic-body'); card.append(top, body);
    const lay = L[x.layer], color = x.sev ? SEV[x.sev] : lay.color;
    const title = el('div', 'fx-ic-title'); title.style.borderColor = color + '66'; title.append(iconSvg(x.layer === 'alerts' ? 'warn' : x.layer === 'conflict' || x.layer === 'zones' ? 'zone' : lay.icon, color, 18), el('strong', '', x.title)); body.append(title);
    const kv = el('dl', 'fx-ic-kv'), row = (k, v) => { if (v === null || v === undefined || v === '') return; kv.append(el('dt', '', k)); const dd = el('dd'); if (v instanceof Node) dd.append(v); else dd.textContent = v; kv.append(dd); };
    const sevPill = s => { const p = el('span', 'fx-ic-sev', SEV_LABEL[s]); p.style.background = SEV[s]; return p; };
    const iso = x.iso || (x.ll ? nearestCountry(x.ll) : null);
    row('Region', iso ? `${countryName(iso)}${countryRegion(iso) ? ' · ' + countryRegion(iso) : ''}` : x.q?.place || '');
    row('Category', lay.label + (x.layer === 'alerts' ? ' · ' + (HAZ[x.a.type] || ['Alert'])[0] : x.ref?.k && x.layer !== 'airports' ? ' · ' + x.ref.k : ''));
    if (x.sev) row('Severity', sevPill(x.sev));
    if (x.at) row('Time (UTC)', `${new Date(x.at).toISOString().slice(0, 16).replace('T', ' ')} (${ago(x.at)})`);
    if (x.ll) row('Location', `${Math.abs(x.ll[1]).toFixed(2)}°${x.ll[1] >= 0 ? 'N' : 'S'}, ${Math.abs(x.ll[0]).toFixed(2)}°${x.ll[0] >= 0 ? 'E' : 'W'}`);
    const actions = el('div', 'fx-ic-act'); let srcUrl = null;
    if (x.q) {
      row('Magnitude', `M${x.q.mag.toFixed(1)}`); row('Depth', finite(x.q.depth) ? `${x.q.depth} km` : null); row('Tsunami', x.q.tsunami ? 'Tsunami message issued' : 'No tsunami message'); row('PAGER alert', x.q.alert ? x.q.alert.toUpperCase() : 'None'); row('Felt reports', x.q.felt);
      body.append(kv, el('h3', 'fx-ic-h', 'Summary'), el('p', 'fx-ic-p', `A magnitude ${x.q.mag.toFixed(1)} earthquake ${x.q.place}${finite(x.q.depth) ? ` at ${x.q.depth} km depth` : ''}. ${x.q.mag >= 7 ? 'Major quake: damage and supply disruption are possible.' : x.q.mag >= 6 ? 'Strong quake: local damage is possible.' : 'Moderate quake.'}`));
      srcUrl = x.q.url;
    } else if (x.a) {
      row('Source', x.a.src); row('Detail', x.a.detail); row('Started', x.a.from ? new Date(x.a.from).toISOString().slice(0, 10) : null);
      body.append(kv, el('h3', 'fx-ic-h', 'Summary'), el('p', 'fx-ic-p', `${x.a.title}. ${x.a.src === 'GDACS' ? `GDACS alert level ${SEV_LABEL[x.sev] === 'HIGH' ? 'red' : x.sev === 'med' ? 'orange' : 'green'}.` : 'Open natural event tracked by NASA EONET.'}`));
      srcUrl = x.a.url;
    } else if (x.items) {
      const kind = x.layer === 'conflict' || x.layer === 'zones' ? 'conflict' : x.layer === 'protests' ? 'protest' : 'cyber';
      row('Reports', `${x.n} in the last 72 h`);
      body.append(kv, el('h3', 'fx-ic-h', 'Summary'), el('p', 'fx-ic-p', `${x.n} ${kind} headline${x.n === 1 ? '' : 's'} about ${countryName(x.iso)} in the last 72 hours. Latest: “${x.items[0].title}”.`));
      const h = el('h3', 'fx-ic-h', 'Intelligence'); h.append(el('small', '', `${x.items.length} source${x.items.length === 1 ? '' : 's'}`)); body.append(h);
      const ul = el('ul', 'fx-ic-src'); for (const it of x.items.slice(0, 8)) { const li = el('li'), d = el('div'); d.append(it.url ? T.link(it.title, it.url) : el('span', '', it.title), el('small', '', [it.source, it.at ? ago(it.at) : ''].filter(Boolean).join(' · '))); li.append(d); ul.append(li); } body.append(ul);
      srcUrl = x.items[0]?.url;
    } else if (x.layer === 'hotspots') {
      row('Score', `${x.score} (high at 12+)`);
      body.append(kv, el('h3', 'fx-ic-h', 'Why it is a hotspot'));
      const ul = el('ul', 'fx-ic-src fx-ic-why'); for (const [pts, t] of x.why.slice(0, 8)) ul.append(el('li', '', `${t} · +${pts}`)); body.append(ul);
    } else if (x.ref) {
      const r = x.ref;
      if (x.layer === 'pipelines') { row('Type', {oil: 'Crude oil', gas: 'Natural gas', fuel: 'Refined products'}[r.k] || r.k); row('Status', r.s); }
      else if (x.layer === 'zones') { row('Since', r.since); row('Countries', r.c.map(countryName).join(', ')); row('Area', `≈${r.r} km radius`); }
      else row('Type', r.k);
      if (x.layer === 'exchanges' && r.idx) { const q = quoteFor(r.idx); if (q && finite(q.changePercent)) row('Index today', `${T.shortOf(r.idx)} ${signed(q.changePercent, 2, '%')}`); }
      body.append(kv, el('h3', 'fx-ic-h', 'Summary'), el('p', 'fx-ic-p', r.d || ''));
      if (x.layer === 'zones') { const ev = D.events.find(e => e.layer === 'conflict' && r.c.includes(e.iso)); body.append(el('p', 'fx-ic-p', ev ? `Live: ${ev.n} conflict report${ev.n === 1 ? '' : 's'} about ${countryName(ev.iso)} in the last 72 h.` : 'No conflict headlines about these countries in the last 72 h.')); if (ev) srcUrl = ev.items[0]?.url; }
    }
    // Related: nearby sites, chokepoints and live events.
    if (x.ll) {
      const near = [];
      for (const [cid, c] of Object.entries(W.ships?.chokepoints || {})) { const b = c; const ll = [(b[0][1] + b[1][1]) / 2, (b[0][0] + b[1][0]) / 2]; const d = KM(ll, x.ll); if (d < 700) near.push([d, `${cid} chokepoint`, () => W.chokeCard?.(cid)]); }
      for (const y of D.byId.values()) { if (y.id === x.id || !y.ll || y.layer === 'pipelines' || (iso && y.iso === iso && !y.ref)) continue; const d = KM(y.ll, x.ll); if (d < (y.ref ? 350 : 500)) near.push([d, y.title, () => openItem(y.id, {zoom: true})]); }
      near.sort((a, b) => a[0] - b[0]);
      const tags = el('div', 'fx-ic-tags');
      if (iso) tags.append(btn(countryName(iso), '', () => W.focusOn?.(iso)));
      for (const [d, label, fn] of near.slice(0, 6)) tags.append(btn(`${label} · ${Math.round(d)} km`, '', fn));
      if (tags.childElementCount) { body.append(el('h3', 'fx-ic-h', 'Related')); body.append(tags); }
    }
    if (srcUrl) { const a = T.link('Open source ↗', srcUrl, 'pri'); actions.append(a); }
    if (iso) actions.append(btn(`${countryName(iso)} terminal ▸`, srcUrl ? '' : 'pri', () => T.openPage('ctry', iso)));
    if (actions.childElementCount) body.append(actions);
    body.append(el('p', 'fx-ic-note', live ? (x.items ? 'Grouped from headlines by fixed rules; open the sources to verify. Not a forecast.' : x.q ? 'Source: USGS Earthquake Hazards Program.' : x.a ? `Source: ${x.a.src}.` : 'Signals are combined by fixed rules. Not a forecast.') : `Reference data, reviewed ${monthOf(D.ref?.reviewed)}. Positions are approximate.`));
    if (!keep) ctx.redraw();
  }
  function closeCard() { if (!ctx) return; ctx.card.hidden = true; ctx.selId = null; ctx.redraw(); }

  /* --- country card line ---------------------------------------------------------------------------- */
  function countryLine(iso) {
    const ev = D.events.filter(e => e.iso === iso && ['conflict', 'protests', 'cyber'].includes(e.layer));
    const hs = D.events.find(e => e.layer === 'hotspots' && e.iso === iso);
    if (!ev.length && !hs) return null;
    return [hs ? `Intel hotspot (score ${hs.score})` : '', ...ev.map(e => `${e.n} ${e.layer === 'protests' ? 'protest' : e.layer} report${e.n === 1 ? '' : 's'}`)].filter(Boolean).join(' · ') + ' in 72 h';
  }

  W.intel = {panel: o => { const b = panel(o); if (ctx) ctx.layersBox = b; W._ilpBox = b; return b; }, mount: m => { mount({...m, layersBox: W._ilpBox}); }, draw, countryLine, open: id => openItem(id, {zoom: true}), load, layers: L};
  // Refresh: rebuild from fresh headlines whenever the World data reloads; hazards every 10 minutes.
  setInterval(() => { if (document.hidden || !document.getElementById('tp-globe')) return; build(); W.intelRedraw?.(); }, 120000);
  setInterval(() => { if (document.hidden || !document.getElementById('tp-globe')) return; loadHazards().then(() => { build(); D.at = Date.now(); W.intelRedraw?.(); }); }, 600000);
});
