/* FYNX Terminal plugin: Satellite (and other MapTiler) map modes for the WORLD desk.
 * Draws the same intelligence the Globe shows, from the same records and the same layer switches:
 * country lights, live and long-running conflict zones, every event layer with its own icon and severity ring,
 * reference sites (bases, nuclear, ports, airports, dams, exchanges, data centers, spaceports), pipelines, sea
 * routes, chokepoints with live ship counts, and every AIS ship at every zoom.
 * A style menu switches between MapTiler base maps (satellite, satellite with labels, dark, streets, terrain…)
 * with the same key; layers are redrawn on top of whichever style is chosen.
 * World search (all three modes) finds countries, events, sites, chokepoints, ships and places worldwide.
 * Flat and Globe drawing stay in world.js; this file only adds the MapLibre engine. See docs/SATELLITE-MAP.md.
 */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T) => {
  'use strict';
  const W = T.S.world;
  if (!W) return;
  const store = T.store || {get: k => { try { return localStorage.getItem('fx-term-' + k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem('fx-term-' + k, v); } catch (_) {} }};

  if (typeof W.mapMode !== 'string') W.mapMode = W.flat ? 'flat' : 'globe';

  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    return new Promise((resolve, reject) => {
      if (!document.getElementById('maplibre-css')) {
        const link = document.createElement('link');
        link.id = 'maplibre-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
        document.head.appendChild(link);
      }
      if (document.querySelector('script[src*="maplibre-gl"]')) {
        const wait = setInterval(() => { if (window.maplibregl) { clearInterval(wait); resolve(window.maplibregl); } }, 50);
        setTimeout(() => { clearInterval(wait); if (!window.maplibregl) reject(new Error('MapLibre timeout')); }, 15000);
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      s.onload = () => resolve(window.maplibregl);
      s.onerror = () => reject(new Error('Failed to load MapLibre GL JS'));
      document.head.appendChild(s);
    });
  }

  /* --- base map styles --------------------------------------------------------------------------- */
  // [key, menu label, MapTiler style ids to try (current name first, then the older one), what it is good for]
  const STYLES = [
    ['satellite', 'Satellite', ['satellite-v4', 'satellite'], 'Imagery only'],
    ['hybrid', 'Satellite + labels', ['hybrid-v4', 'hybrid'], 'Imagery with places, roads and borders'],
    ['dark', 'Intelligence dark', ['dataviz-v4-dark', 'dataviz-dark'], 'Quiet dark map: every layer stands out'],
    ['light', 'Intelligence light', ['dataviz-v4-light', 'dataviz-light'], 'Quiet light map'],
    ['streets', 'Streets', ['streets-v4', 'streets-v2'], 'Cities, roads and places'],
    ['streets-dark', 'Streets dark', ['streets-v4-dark', 'streets-v2-dark'], 'Streets at night'],
    ['base', 'Base', ['base-v4', 'basic-v2'], 'Simple reference map'],
    ['topo', 'Topographic', ['topo-v4', 'topo-v2'], 'Relief and elevation'],
    ['outdoor', 'Terrain', ['outdoor-v4', 'outdoor-v2'], 'Mountains, parks and terrain'],
    ['ocean', 'Ocean', ['ocean-v4', 'ocean'], 'Sea-floor relief: shipping and chokepoints'],
    ['landscape', 'Landscape', ['landscape-v4', 'landscape'], 'Land cover'],
    ['winter', 'Winter', ['winter-v4', 'winter-v2'], 'Snow and winter terrain'],
    ['toner', 'Toner', ['toner-v4', 'toner-v2'], 'High-contrast black and white'],
    ['backdrop', 'Backdrop', ['backdrop-v4', 'backdrop'], 'Muted grey relief'],
    ['aquarelle', 'Aquarelle', ['aquarelle-v4', 'aquarelle'], 'Painted look'],
    ['osm', 'OpenStreetMap', ['openstreetmap'], 'Classic OpenStreetMap look']
  ];
  const STYLE = Object.fromEntries(STYLES.map(s => [s[0], {key: s[0], label: s[1], ids: s[2], hint: s[3]}]));
  let config = null;               // {style?, key?, custom?}
  const styleUrlCache = new Map(); // key → resolved style URL, or null when the key cannot load it

  async function readConfig() {
    if (config) return config;
    if (window.FYNX_SATELLITE_STYLE) return (config = {custom: window.FYNX_SATELLITE_STYLE});
    const meta = document.querySelector('meta[name="fynx-satellite-style"]');
    if (meta && meta.content) return (config = {style: meta.content, key: keyFrom(meta.content)});
    try {
      const r = await fetch('/assets/config/satellite.json', { cache: 'no-store' });
      if (r.ok) {
        const cfg = await r.json();
        if (cfg && cfg.style) return (config = {style: cfg.style, key: cfg.key || keyFrom(cfg.style)});
        if (cfg && cfg.key) return (config = {key: cfg.key, style: 'https://api.maptiler.com/maps/satellite/style.json?key=' + encodeURIComponent(cfg.key)});
      }
    } catch (_) {}
    return (config = {});
  }
  function keyFrom(url) { try { return new URL(url, location.href).searchParams.get('key'); } catch (_) { return null; } }
  // Do not load unlicensed fallback imagery on the commercial website.
  const BLANK = {version: 8, sources: {}, layers: [{id: 'unconfigured-background', type: 'background', paint: {'background-color': '#0a0c0b'}}]};

  async function styleFor(key) {
    const cfg = await readConfig();
    if (cfg.custom) return {style: cfg.custom, licensed: true, key: 'satellite'};
    if (!cfg.key) return cfg.style ? {style: cfg.style, licensed: true, key: 'satellite'} : {style: BLANK, licensed: false, key: 'satellite'};
    const want = STYLE[key] ? key : 'satellite';
    if (want === 'satellite' && cfg.style && !styleUrlCache.has('satellite')) styleUrlCache.set('satellite', cfg.style);
    if (!styleUrlCache.has(want)) {
      let found = null;
      for (const id of STYLE[want].ids) {
        const url = `https://api.maptiler.com/maps/${id}/style.json?key=${encodeURIComponent(cfg.key)}`;
        try { const r = await fetch(url, {cache: 'force-cache'}); if (r.ok) { found = url; break; } } catch (_) {}
      }
      styleUrlCache.set(want, found);
    }
    const url = styleUrlCache.get(want);
    if (url) return {style: url, licensed: true, key: want};
    return want === 'satellite' ? {style: cfg.style || BLANK, licensed: !!cfg.style, key: 'satellite'} : null;
  }

  /* --- shared state -------------------------------------------------------------------------------- */
  let mapInstance = null;
  let satContainer = null;
  let popup = null;
  let raisedOverlays = [];
  let refreshHandle = null;
  let pulseHandle = null;
  let panelCleanup = null;
  let resizeObserver = null;
  let currentStyle = STYLE[store.get('world-map-style')] ? store.get('world-map-style') : 'satellite';
  let fontStack = ['Open Sans Regular', 'Arial Unicode MS Regular'];

  function elevateMapControls(stage) {
    if (raisedOverlays.length) return;
    for (const el of stage.querySelectorAll(':scope > .fx-gtools, :scope > .fx-glayers, :scope > .fx-glegend, :scope > .fx-gcard, :scope > .fx-scard, :scope > .fx-ilp, :scope > .fx-icard, :scope > .fx-wsearch')) {
      raisedOverlays.push({ el, position: el.style.position, zIndex: el.style.zIndex });
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.style.zIndex = el.classList.contains('fx-icard') ? '8' : '6';
    }
  }
  function restoreMapControls() {
    for (const item of raisedOverlays) { item.el.style.position = item.position; item.el.style.zIndex = item.zIndex; }
    raisedOverlays = [];
  }

  const DEFAULT_ON = new Set(['conflict', 'zones', 'protests', 'hotspots', 'cyber', 'quakes', 'alerts', 'tankers', 'cargo', 'chokes', 'lights', 'lanes']);
  const colors = {
    conflict:'#ff3b30', zones:'#ff5a4f', protests:'#c77dff', hotspots:'#ff6b5f',
    cyber:'#00e5ff', bases:'#a5d66b', nuclear:'#ffe14d', quakes:'#ff8a65',
    alerts:'#ffca28', tankers:'#ff9f43', cargo:'#5b8def', other:'#8e9b94',
    chokes:'#c9a7ff', datacenters:'#4dd0e1', spaceports:'#b388ff',
    ports:'#80cbc4', airports:'#e6e6e6', dams:'#4fc3f7', exchanges:'#ffb000',
    pipelines:'#f4a261'
  };
  const SEV_COLOR = {high: '#ff3b30', med: '#ff9f1c', low: '#ffd23f'};
  const SEV_LABEL = {high: 'High', med: 'Elevated', low: 'Low'};
  const PIPE_COLOR = {oil: '#a0522d', gas: '#4fa3e0', fuel: '#ff9f1c'};
  const layerInfo = k => W.intel?.layers?.[k] || null;
  const colorOf = k => layerInfo(k)?.color || colors[k] || '#c9a7ff';
  const labelOf = k => layerInfo(k)?.label || k;

  function layerOn(key) {
    // The intelligence sidebar persists its own security/cyber/etc. settings.
    if (W.intel && typeof W.intel.isOn === 'function') return W.intel.isOn(key);
    if (W.layers && typeof W.layers[key] === 'boolean') return W.layers[key];
    return DEFAULT_ON.has(key);
  }

  function point(lon, lat, properties) {
    const x = Number(lon), y = Number(lat);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) return null;
    return {type:'Feature',geometry:{type:'Point',coordinates:[x,y]},properties};
  }
  function collection(features) {
    return {type:'FeatureCollection',features:features.filter(Boolean)};
  }
  // A circle of r km around [lon, lat], as a polygon (long-running conflict areas).
  function circlePolygon(ll, km, props) {
    const [lon, lat] = ll.map(Number); if (!Number.isFinite(lon) || !Number.isFinite(lat) || !(km > 0)) return null;
    const ring = [], d = km / 6371, la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    for (let i = 0; i <= 48; i++) {
      const b = i / 48 * 2 * Math.PI, lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
      const lon2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
      ring.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
    }
    return {type: 'Feature', geometry: {type: 'Polygon', coordinates: [ring]}, properties: props};
  }

  /* --- layer data (same records, ids and switches as Flat/Globe) ------------------------------------ */
  function buildFeatures() {
    const features = [], D = W.intelData;
    for (const [id, item] of (D?.byId || new Map())) {
      if (!item?.ll || !layerOn(item.layer) || item.layer === 'pipelines') continue;
      const sev = item.sev || '';
      const props = {
        id, layer:item.layer, icon:'fx-' + item.layer, name:item.title || item.ref?.n || item.layer,
        country:item.iso || item.ref?.c || '', sev, sevColor: SEV_COLOR[sev] || colorOf(item.layer),
        desc:item.ref?.d || '', kind: item.ref?.k || '', source:item.ref ? 'FYNX reference data' :
          item.layer === 'quakes' ? 'USGS' : item.layer === 'alerts' ? (item.a?.src || 'Hazards feed') : 'FYNX classified headlines',
        time:item.at || item.q?.time || '', reports:item.n || 0,
        // Bigger marker for more reports, a stronger quake or a hotter hotspot (same rule of thumb as the globe).
        size: item.layer === 'quakes' ? Math.min(1.5, 0.75 + Math.max(0, (item.q?.mag || 4.5) - 4.5) * 0.25) : sev === 'high' ? 1.25 : sev === 'med' ? 1.05 : item.ref ? 0.85 : 0.95,
        pulse: sev === 'high' && !item.ref ? 1 : 0
      };
      features.push(point(item.ll[0],item.ll[1],props));
    }
    // Early loading fallback: show hazards while the intelligence index builds.
    if (!(D?.byId?.size)) {
      for (const q of D?.haz?.quakes || []) if (layerOn('quakes'))
        features.push(point(q.lon,q.lat,{layer:'quakes',icon:'fx-quakes',name:q.place || 'Earthquake',mag:q.mag,time:q.time,source:'USGS',size:1,sevColor:colors.quakes,pulse:0}));
      for (const a of D?.haz?.alerts || []) if (layerOn('alerts'))
        features.push(point(a.lon,a.lat,{layer:'alerts',icon:'fx-alerts',name:a.title || 'Natural alert',time:a.from,source:a.src || 'Hazard feed',size:1,sevColor:colors.alerts,pulse:0}));
    }
    return collection(features);
  }

  function chokeFeatures() {
    const features = [];
    if (!layerOn('chokes')) return collection(features);
    for (const [name, bounds] of Object.entries(W.ships?.chokepoints || {})) {
      if (!Array.isArray(bounds) || !Array.isArray(bounds[0]) || !Array.isArray(bounds[1])) continue;
      const c = W.ships?.counts?.[name] || {};
      features.push(point((+bounds[0][1] + +bounds[1][1]) / 2,(+bounds[0][0] + +bounds[1][0]) / 2,
        {id:'choke-'+name,layer:'chokes',kind:'choke',name,label: c.ships ? `${name} · ${c.ships}` : name,
          ships:c.ships || 0,tankers:c.tankers || 0,cargo:c.cargo || 0,waiting:c.waiting || 0,source:'AIS / geographic reference'}));
    }
    return collection(features);
  }

  function shipFeatures() {
    const features=[];
    for (const v of (W.ships?.vessels || []).slice(0,6000)) {
      const key=v.kind === 'tanker' ? 'tankers' : v.kind === 'cargo' ? 'cargo' : 'other';
      if (!layerOn(key)) continue;
      const waiting = Number.isFinite(+v.sog) && +v.sog < 0.5;
      features.push(point(v.lon,v.lat,{kind:'ship',layer:key,name:v.name || ('MMSI ' + (v.mmsi || '')),mmsi:v.mmsi || '',
        sog: Number.isFinite(+v.sog) ? +v.sog : null, hdg: v.heading ?? v.cog ?? null, dest: v.dest || '', eta: v.eta || '',
        waiting: waiting ? 1 : 0, source:'AIS', updated:W.ships?.generatedAt || ''}));
    }
    return collection(features);
  }

  function lightFeatures() {
    if (!layerOn('lights')) return collection([]);
    return collection((W.feats || []).map(f => {
      const iso=f.properties?.iso2;
      if (!iso) return null;
      const ll=W.centroidOf?.(iso);
      const status=W.statusOf?.(iso);
      if (!ll) return null;
      const level=status?.level || 'grey';
      return point(ll[0],ll[1],{id:'country-'+iso,kind:'country',layer:'lights',name:f.properties?.name || iso,iso,
        level,source:'FYNX country-status model'});
    }));
  }
  // Countries, with live conflict zones marked so they can be hatched like on the globe.
  function countryFeatures() {
    const live = layerOn('zones') ? (W.intelData?.liveZones || new Set()) : new Set();
    return collection((W.feats || []).map(f => ({type: 'Feature', geometry: f.geometry, properties: {...(f.properties || {}), live: live.has(f.properties?.iso2) ? 1 : 0}})));
  }
  function zoneFeatures() {
    if (!layerOn('zones')) return collection([]);
    return collection((W.intelData?.ref?.layers?.zones || []).map((z, i) => circlePolygon(z.ll, z.r || 250, {id: 'zones-' + i, name: z.n, layer: 'zones'})));
  }

  function lineFeatures() {
    const features=[];
    if (layerOn('lanes')) for (const route of W.mainSeaRoutes || []) {
      if (Array.isArray(route) && route.length>1)
        features.push({type:'Feature',geometry:{type:'LineString',coordinates:route},properties:{layer:'lanes'}});
    }
    return collection(features);
  }
  function pipelineFeatures() {
    const features=[];
    if (layerOn('pipelines')) (W.intelData?.ref?.layers?.pipelines || []).forEach((pipe, i) => {
      const off = /offline|halt|construct|planned|idle|shut/i.test(pipe.s || '') ? 1 : 0;
      for (const route of pipe.paths || []) {
        if (Array.isArray(route) && route.length > 1)
          features.push({type:'Feature',geometry:{type:'LineString',coordinates:route},
            properties:{id:'pipelines-' + i,layer:'pipelines',name:pipe.n || 'Pipeline',kind:pipe.k || '',status:pipe.s || '',off,color:PIPE_COLOR[pipe.k] || colors.pipelines}});
      }
    });
    return collection(features);
  }

  function updateMarkers() {
    if (!mapInstance) return;
    try {
      const data={intel:buildFeatures(),shipping:shipFeatures(),lights:lightFeatures(),lanes:lineFeatures(),pipelines:pipelineFeatures(),chokes:chokeFeatures(),countries:countryFeatures(),zones:zoneFeatures()};
      for (const [key,value] of Object.entries(data)) {
        const source=mapInstance.getSource(key);
        if (source) source.setData(value);
      }
    } catch (error) { console.warn('FYNX satellite layer refresh failed',error); }
  }

  /* --- icons: the globe's own icon shapes, drawn for MapLibre --------------------------------------- */
  function addIcons(map) {
    if (typeof map.addImage !== 'function' || typeof document.createElement('canvas').getContext !== 'function') return;
    const ICON = W.intel?.icons || {};
    const keys = new Set([...Object.keys(colors), ...Object.keys(W.intel?.layers || {})]);
    const S = 56, ctx = document.createElement('canvas').getContext('2d');
    if (!ctx || typeof Path2D !== 'function') return;
    for (const k of keys) {
      const name = 'fx-' + k; if (map.hasImage?.(name)) continue;
      const c = colorOf(k), iconName = layerInfo(k)?.icon || 'dot';
      ctx.canvas.width = S; ctx.canvas.height = S; ctx.clearRect(0, 0, S, S);
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6,10,9,.9)'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = c; ctx.stroke();
      const d = ICON[iconName] || ICON.dot;
      if (d) { ctx.save(); ctx.translate(S / 2 - 15, S / 2 - 15); ctx.scale(2.5, 2.5); ctx.fillStyle = c; try { ctx.fill(new Path2D(d), 'evenodd'); } catch (_) {} ctx.restore(); }
      map.addImage(name, ctx.getImageData(0, 0, S, S), {pixelRatio: 2});
    }
    if (!map.hasImage?.('fx-hatch')) {   // diagonal red hatching for countries with live conflict reports
      const P = 16; ctx.canvas.width = P; ctx.canvas.height = P; ctx.clearRect(0, 0, P, P);
      ctx.strokeStyle = 'rgba(255,90,79,.75)'; ctx.lineWidth = 2; ctx.beginPath();
      for (const o of [-P, 0, P]) { ctx.moveTo(o, P); ctx.lineTo(o + P, 0); }
      ctx.stroke(); map.addImage('fx-hatch', ctx.getImageData(0, 0, P, P), {pixelRatio: 2});
    }
  }

  /* --- popups (ships, chokepoints, countries); events and sites open the globe's own event card ----- */
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function showPopup(lngLat, p) {
    if (!popup || !mapInstance) return;
    p = Object.fromEntries(Object.entries(p).map(([key, value]) => [key, escapeHTML(value)]));
    const kindLabel = p.kind === 'ship' ? ({tankers: 'Tanker', cargo: 'Cargo ship', other: 'Ship'}[p.layer] || 'Ship') : p.kind === 'choke' ? 'Chokepoint' : p.kind === 'country' ? 'Country' : (p.layer || '');
    const lines = [
      `<strong>${p.name || 'Location'}</strong>`,
      `<span style="opacity:.7">${kindLabel}${p.country ? ' · ' + p.country : ''}</span>`
    ];
    if (p.kind === 'country') lines.push('Country light: ' + ({red: 'Red · big things happening', yellow: 'Yellow · worth watching', green: 'Green · quiet', grey: 'No live signal'}[p.level] || p.level));
    if (p.kind === 'choke') lines.push(`Ships inside now: ${p.ships || 0}${p.ships ? ` (${p.tankers || 0} tankers, ${p.cargo || 0} cargo, ${p.waiting || 0} waiting)` : ''}`);
    if (p.kind === 'ship') {
      if (p.sog !== '' && p.sog != null) lines.push('Speed: ' + p.sog + ' kn' + (p.waiting === '1' ? ' · stopped or at anchor' : ''));
      if (p.hdg !== '' && p.hdg != null) lines.push('Heading: ' + p.hdg + '°');
      lines.push(p.dest ? 'Destination: ' + p.dest + (p.eta ? ' · ETA ' + p.eta + ' UTC' : '') : 'Destination not broadcast');
      if (p.mmsi) lines.push('MMSI ' + p.mmsi);
    }
    if (p.sev) lines.push('Severity: ' + (SEV_LABEL[p.sev] || p.sev));
    if (p.mag) lines.push('Magnitude: ' + p.mag);
    if (p.reports) lines.push(p.reports + ' report' + (p.reports === '1' ? '' : 's'));
    if (p.status) lines.push('Status: ' + p.status);
    if (p.desc) lines.push(p.desc);
    if (p.time) lines.push('Time: ' + p.time);
    if (p.updated) lines.push('Feed: ' + p.updated);
    if (p.source) lines.push('Source: ' + p.source);
    if (p.url && /^https?:\/\//i.test(p.url)) lines.push(`<a href="${p.url}" target="_blank" rel="noopener noreferrer" style="color:#7ec8ff">Open source</a>`);
    const html = `<div style="font:13px/1.45 Inter,system-ui,sans-serif;color:#e8e8e8;background:#0d1110;padding:10px 12px;border-radius:8px;max-width:300px;border:1px solid rgba(255,255,255,.08)">${lines.join('<br>')}</div>`;
    popup.setLngLat(lngLat).setHTML(html).addTo(mapInstance);
  }
  // Events and reference sites: the same event card as the globe (sources, why it matters, related markets).
  function openItem(id, lngLat, props) {
    if (id && W.intelData?.byId?.has(id) && typeof W.intel?.open === 'function') {
      try { popup?.remove?.(); W.intel.open(id); return; } catch (_) {}
    }
    showPopup(lngLat, props || {});
  }

  /* --- overlays (added on every style load, so they survive style switches) ------------------------- */
  function addOverlays(map) {
    if (!map || map !== mapInstance || map.getSource?.('intel')) return;
    try {
      const sym = (map.getStyle?.()?.layers || []).find(l => l.type === 'symbol' && Array.isArray(l.layout?.['text-font']));
      if (sym) fontStack = sym.layout['text-font'];
    } catch (_) {}
    addIcons(map);
    // Text needs the style's font server; an unconfigured blank style has none, so draw icons only.
    let glyphs = true; try { glyphs = !map.getStyle || !!map.getStyle()?.glyphs || !map.getStyle()?.layers; } catch (_) {}
    const text = layout => glyphs ? layout : Object.fromEntries(Object.entries(layout).filter(([k]) => !k.startsWith('text-')));
    const addSource=(id,data) => map.addSource(id,{type:'geojson',data});
    addSource('countries',countryFeatures());
    addSource('zones',zoneFeatures());
    addSource('lanes',lineFeatures());
    addSource('pipelines',pipelineFeatures());
    addSource('lights',lightFeatures());
    addSource('shipping',shipFeatures());
    addSource('chokes',chokeFeatures());
    addSource('intel',buildFeatures());
    const labels = collection((W.feats || []).map(f => { const ll = W.centroidOf?.(f.properties?.iso2); return ll ? point(ll[0], ll[1], {name: f.properties.name || f.properties.iso2}) : null; }));
    addSource('country-labels',labels);
    // MapLibre only allows ['zoom'] at the top of an interpolate, so the per-marker size multiplies each stop.
    const SIZE = ['coalesce',['get','size'],1];
    const hasIcons = typeof map.hasImage !== 'function' || map.hasImage('fx-conflict');

    // Country outlines and live conflict hatching come from the same geometry as the Globe/Flat map.
    map.addLayer({id:'sat-conflict-hatch',type:'fill',source:'countries',filter:['==',['get','live'],1],paint:{'fill-pattern':'fx-hatch','fill-opacity':0.85}});
    map.addLayer({id:'sat-country-borders',type:'line',source:'countries',
      paint:{'line-color':'rgba(214,226,230,.48)','line-width':['interpolate',['linear'],['zoom'],1,0.35,6,1.1],'line-opacity':0.75}});
    map.addLayer({id:'sat-zones-fill',type:'fill',source:'zones',paint:{'fill-color':'rgba(255,72,60,.12)'}});
    map.addLayer({id:'sat-zones-line',type:'line',source:'zones',paint:{'line-color':'#ff5a4f','line-width':1.3,'line-dasharray':[3,2]}});
    if (glyphs) map.addLayer({id:'sat-country-labels',type:'symbol',source:'country-labels',minzoom:1.3,
      layout:{'text-field':['get','name'],'text-size':['interpolate',['linear'],['zoom'],2,10,6,13],'text-font':fontStack,'text-allow-overlap':false,'text-padding':4},
      paint:{'text-color':'#f0f0e7','text-halo-color':'rgba(3,8,12,.95)','text-halo-width':1.4}});
    map.addLayer({id:'sat-shipping-lanes',type:'line',source:'lanes',paint:{'line-color':'#83bce1','line-width':1.4,'line-opacity':0.55,'line-dasharray':[3,3]}});
    map.addLayer({id:'sat-pipelines',type:'line',source:'pipelines',
      paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],1,1.6,6,3],'line-opacity':0.9}});
    // Country lights at every zoom, like the globe; red and yellow get a ring.
    map.addLayer({id:'sat-country-ring',type:'circle',source:'lights',filter:['in',['get','level'],['literal',['red','yellow']]],
      paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,6,6,11],'circle-color':'rgba(0,0,0,0)','circle-stroke-width':1.6,
        'circle-stroke-color':['match',['get','level'],'red','#ff6b5f','#ffb000'],'circle-stroke-opacity':0.55}});
    map.addLayer({id:'sat-country-status',type:'circle',source:'lights',
      paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,['match',['get','level'],'red',3.6,'yellow',3.2,2.4],6,6],
        'circle-color':['match',['get','level'],'red','#ff6b5f','yellow','#ffb000','green','#3ecf8e','#768a83'],
        'circle-stroke-color':'#04100c','circle-stroke-width':1}});
    // Every AIS ship at every zoom (the globe shows them all too); stopped ships are hollow.
    map.addLayer({id:'sat-ships',type:'circle',source:'shipping',
      paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,1.3,4,2.4,8,4.5],
        'circle-color':['case',['==',['get','waiting'],1],'rgba(0,0,0,0)',['match',['get','layer'],'tankers','#ff9f43','cargo','#5b8def','#8e9b94']],
        'circle-stroke-color':['match',['get','layer'],'tankers','#ff9f43','cargo','#5b8def','#8e9b94'],'circle-stroke-width':['case',['==',['get','waiting'],1],1,0],'circle-opacity':0.9}});
    // Chokepoints: diamond and live ship count.
    map.addLayer({id:'sat-chokes',type:'symbol',source:'chokes',
      layout:text({'icon-image':'fx-chokes','icon-size':0.8,'icon-allow-overlap':true,'text-field':['get','label'],'text-font':fontStack,'text-size':11,'text-offset':[0.9,0.9],'text-anchor':'top-left','text-allow-overlap':false}),
      paint:{'text-color':'#e9ddff','text-halo-color':'rgba(3,8,12,.95)','text-halo-width':1.4}});
    // Events and sites: severity ring (pulsing for high severity), then the layer's own icon.
    map.addLayer({id:'intel-halo',type:'circle',source:'intel',filter:['==',['get','pulse'],1],
      paint:{'circle-radius':14,'circle-color':'rgba(0,0,0,0)','circle-stroke-width':2,'circle-stroke-color':['get','sevColor'],'circle-stroke-opacity':0.6}});
    map.addLayer({id:'intel-circles',type:'circle',source:'intel',
      paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,['*',hasIcons?7:4,SIZE],8,['*',hasIcons?10:7,SIZE]],
        'circle-color':hasIcons?'rgba(6,10,9,.85)':['match',['get','layer'],
            'conflict','#ff3b30','zones','#ff5a4f','protests','#c77dff',
            'hotspots','#ff6b5f','cyber','#00e5ff','quakes','#ff8a65',
            'alerts','#ffca28','bases','#a5d66b','nuclear','#ffe14d',
            'datacenters','#4dd0e1','spaceports','#b388ff','dams','#4fc3f7',
            'ports','#80cbc4','airports','#e6e6e6','chokes','#c9a7ff',
            'exchanges','#ffb000','#c9a7ff'],
        'circle-stroke-width':1.2,'circle-stroke-color':['get','sevColor']}});
    if (hasIcons) map.addLayer({id:'intel-icons',type:'symbol',source:'intel',
      layout:{'icon-image':['get','icon'],'icon-size':['interpolate',['linear'],['zoom'],1,['*',0.62,SIZE],8,['*',0.9,SIZE]],'icon-allow-overlap':true,'icon-ignore-placement':true,
        'symbol-sort-key':['match',['get','sev'],'high',3,'med',2,1]}});
    if (glyphs) map.addLayer({id:'intel-labels',type:'symbol',source:'intel',minzoom:3,filter:['in',['get','sev'],['literal',['high','med']]],
      layout:{'text-field':['get','name'],'text-font':fontStack,'text-size':10.5,'text-offset':[0,1.4],'text-anchor':'top','text-max-width':14,'text-optional':true},
      paint:{'text-color':'#f3f6f4','text-halo-color':'rgba(3,8,12,.95)','text-halo-width':1.4}});

    const clickPoint=(e) => {
      const f=e.features?.[0]; if (!f) return;
      const p = f.properties || {};
      if (p.id && !p.kind) openItem(p.id, e.lngLat, p); else showPopup(e.lngLat, p);
    };
    for (const id of ['intel-circles','intel-icons','sat-ships','sat-country-status','sat-chokes','sat-pipelines','sat-zones-fill']) {
      map.on('click',id,clickPoint);
      map.on('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});
      map.on('mouseleave',id,()=>{map.getCanvas().style.cursor='';});
    }
  }

  function startPulse() {
    if (pulseHandle || matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    let t = 0;
    pulseHandle = setInterval(() => {
      if (!mapInstance || document.hidden || W.mapMode !== 'satellite' || !mapInstance.getLayer?.('intel-halo')) return;
      t = (t + 0.045) % 1;
      try { mapInstance.setPaintProperty('intel-halo', 'circle-radius', 9 + t * 18); mapInstance.setPaintProperty('intel-halo', 'circle-stroke-opacity', 0.75 * (1 - t)); } catch (_) {}
    }, 70);
  }

  async function mountSatellite(host) {
    if (mapInstance) return mapInstance;
    const maplibregl = await loadMapLibre();
    if (W.mapMode !== 'satellite') return null;
    const resolved = (await styleFor(currentStyle)) || (await styleFor('satellite'));
    if (W.mapMode !== 'satellite') return null;
    currentStyle = resolved.key;
    satContainer = document.createElement('div');
    satContainer.className = 'fx-sat-map';
    satContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;background:#0a0c0b;';
    host.appendChild(satContainer);

    if (!resolved.licensed) {
      const note = document.createElement('div');
      note.className = 'fx-sat-notice';
      note.style.cssText = 'position:absolute;top:8px;left:8px;z-index:5;background:rgba(0,0,0,.72);color:#ffd23f;font:12px/1.3 Inter,system-ui,sans-serif;padding:6px 10px;border-radius:6px;max-width:280px;pointer-events:none';
      note.textContent = 'Satellite imagery unavailable — configure MapTiler in /assets/config/satellite.json';
      satContainer.appendChild(note);
    }

    mapInstance = new maplibregl.Map({
      container: satContainer,
      style: resolved.style,
      center: [0, 15],
      zoom: 1.5,
      attributionControl: true,
      maxZoom: 18,
      minZoom: 1
    });
    const map = mapInstance;
    satContainer.fxMap = map;   // lets tests and dev tools reach the live map from its element

    // FYNX's existing +, − and Reset buttons control both map engines.
    // Do not add MapLibre's white native buttons over the terminal toolbar.
    const stageTools = host.querySelector('.fx-gtools');
    if (stageTools && !stageTools.dataset.satControls) {
      stageTools.dataset.satControls = '1';
      stageTools.addEventListener('click', event => {
        if (W.mapMode !== 'satellite' || !mapInstance) return;
        const button = event.target.closest('button');
        if (!button || button.closest('.fx-sat-modes') || button.closest('.fx-sat-style') || button.closest('.fx-wsearch')) return;
        const text = button.textContent.trim();
        if (text !== '+' && text !== '−' && text !== '-' && text !== 'Reset') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (text === '+') mapInstance.zoomIn();
        else if (text === '−' || text === '-') mapInstance.zoomOut();
        else mapInstance.flyTo({center:[0,15],zoom:1.5,bearing:0,pitch:0});
      }, true);
    }

    popup = new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:'340px'});
    map.on('style.load', () => addOverlays(map));
    map.on('load', () => {
      if (!mapInstance || W.mapMode !== 'satellite') return;
      addOverlays(map);
      const panel=host.querySelector('.fx-ilp,.fx-glayers');
      if (panel) {
        const refresh=()=>setTimeout(updateMarkers,0);
        panel.addEventListener('change',refresh);
        panel.addEventListener('click',refresh);
        panelCleanup=()=>{panel.removeEventListener('change',refresh);panel.removeEventListener('click',refresh);};
      }
      // Existing world feeds refresh while this tile is open; map sources follow.
      refreshHandle=setInterval(()=>{if(!document.hidden && W.mapMode==='satellite')updateMarkers();},12000);
      if (window.ResizeObserver) {
        resizeObserver=new ResizeObserver(()=>{if(mapInstance && typeof mapInstance.resize==='function')mapInstance.resize();});
        resizeObserver.observe(host);
      }
      startPulse();
      updateMarkers();
      if (pendingFly) { const f = pendingFly; pendingFly = null; flyTo(f); }
    });

    map.on('error', (e) => console.warn('Satellite map error', e?.error || e));
    paintStyleMenu();
    return map;
  }

  async function setBaseStyle(key) {
    if (!STYLE[key]) return false;
    const resolved = await styleFor(key);
    if (!resolved) { markUnavailable(key); return false; }
    currentStyle = resolved.key; store.set('world-map-style', currentStyle);
    if (mapInstance && typeof mapInstance.setStyle === 'function') mapInstance.setStyle(resolved.style, {diff: false}); // overlays come back on 'style.load'
    paintStyleMenu();
    return true;
  }

  function unmountSatellite() {
    if (refreshHandle) {clearInterval(refreshHandle);refreshHandle=null;}
    if (pulseHandle) {clearInterval(pulseHandle);pulseHandle=null;}
    if (panelCleanup) {panelCleanup();panelCleanup=null;}
    if (resizeObserver) {resizeObserver.disconnect();resizeObserver=null;}
    if (mapInstance) { try { mapInstance.remove(); } catch (_) {} mapInstance = null; }
    if (satContainer && satContainer.parentNode) { satContainer.parentNode.removeChild(satContainer); satContainer = null; }
    paintStyleMenu();
  }

  function setMode(mode) {
    if (!['flat', 'globe', 'satellite'].includes(mode)) return;
    W.mapMode = mode;
    try { localStorage.setItem('fynx-map-mode', mode); } catch (_) {}
    const stage = document.querySelector('.fx-gstage');
    if (!stage) return;
    stage.classList.toggle('fx-satellite-active',mode==='satellite');
    document.querySelectorAll('.fx-sat-modes .fx-gbtn').forEach(x => { const on = x.dataset.mode === mode; x.classList.toggle('fx-active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (mode === 'satellite') {
      // Keep existing controls above the satellite canvas; preserve their layout.
      elevateMapControls(stage);
      stage.querySelectorAll('.fx-gsvg, .fx-gships').forEach(el => { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; });
      mountSatellite(stage).catch(err => console.warn('Satellite map failed', err));
    } else {
      unmountSatellite();
      restoreMapControls();
      stage.querySelectorAll('.fx-gsvg, .fx-gships').forEach(el => { el.style.visibility = ''; el.style.pointerEvents = ''; });
      // world.js owns projection and its renderGlobe() is private. Use its existing
      // toggle to redraw only when changing projection, without replacing its logic.
      const wantFlat = mode === 'flat';
      if (W.flat !== wantFlat) {
        const originalToggle = document.querySelector('.fx-gtools > .fx-gbtn');
        if (originalToggle) originalToggle.click();
        else W.flat = wantFlat;
      }
    }
    paintStyleMenu();
  }

  /* --- style menu ---------------------------------------------------------------------------------- */
  let styleMenu = null;
  const unavailable = new Set();
  function markUnavailable(key) { unavailable.add(key); paintStyleMenu(); }
  function paintStyleMenu() {
    if (!styleMenu) return;
    const show = W.mapMode === 'satellite' && !config?.custom && !!config?.key;
    styleMenu.hidden = !show;
    const b = styleMenu.querySelector('.fx-sat-stylebtn'); if (b) { b.replaceChildren(Object.assign(document.createElement('span'), {className: 'fx-sat-stylepre', textContent: 'MAP · '}), `${STYLE[currentStyle]?.label || 'Satellite'} ▾`); b.title = 'Base map: ' + (STYLE[currentStyle]?.label || 'Satellite'); }
    for (const o of styleMenu.querySelectorAll('[data-style]')) {
      const k = o.dataset.style; o.classList.toggle('on', k === currentStyle); o.setAttribute('aria-checked', k === currentStyle ? 'true' : 'false');
      o.disabled = unavailable.has(k); o.title = unavailable.has(k) ? 'This map style is not enabled for FYNX’s MapTiler key' : STYLE[k].hint;
    }
  }
  function buildStyleMenu(tools) {
    if (tools.querySelector('.fx-sat-style')) return;
    styleMenu = document.createElement('div'); styleMenu.className = 'fx-sat-style'; styleMenu.hidden = true;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fx-gbtn fx-sat-stylebtn'; b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
    const list = document.createElement('div'); list.className = 'fx-sat-stylelist'; list.setAttribute('role', 'menu'); list.hidden = true;
    for (const s of STYLES) {
      const o = document.createElement('button'); o.type = 'button'; o.dataset.style = s[0]; o.setAttribute('role', 'menuitemradio');
      const t = document.createElement('b'); t.textContent = s[1]; const h = document.createElement('small'); h.textContent = s[3];
      o.append(t, h);
      o.addEventListener('click', async () => { list.hidden = true; b.setAttribute('aria-expanded', 'false'); await setBaseStyle(s[0]); });
      list.append(o);
    }
    b.addEventListener('click', e => { e.stopPropagation(); list.hidden = !list.hidden; b.setAttribute('aria-expanded', list.hidden ? 'false' : 'true'); });
    document.addEventListener('click', e => { if (!styleMenu.contains(e.target)) { list.hidden = true; b.setAttribute('aria-expanded', 'false'); } });
    styleMenu.append(b, list);
    tools.querySelector('.fx-sat-modes')?.after(styleMenu);
    readConfig().then(paintStyleMenu);
  }

  /* --- world search (all three map modes) --------------------------------------------------------- */
  // Finds what FYNX has: countries, live events, reference sites, chokepoints, ships and layers; then places worldwide.
  let pendingFly = null;
  function flyTo({ll, zoom = 5, item = null}) {
    if (!ll) return;
    if (W.mapMode !== 'satellite') { pendingFly = {ll, zoom, item}; setMode('satellite'); return; }
    if (!mapInstance) { pendingFly = {ll, zoom, item}; return; }
    mapInstance.flyTo({center: ll, zoom});
    if (item) setTimeout(() => {
      if (item.id && W.intelData?.byId?.has(item.id)) openItem(item.id, {lng: ll[0], lat: ll[1]}, item.props);
      else if (item.props) showPopup({lng: ll[0], lat: ll[1]}, item.props);
    }, 900);
  }
  const lc = s => String(s || '').toLowerCase();
  function searchFynx(q) {
    const s = lc(q).trim(); if (!s) return [];
    const out = [], D = W.intelData, push = (group, r) => out.push({group, ...r});
    // Coordinates "lat, lon".
    const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) push('Coordinates', {title: `${(+m[1]).toFixed(3)}, ${(+m[2]).toFixed(3)}`, sub: 'Latitude, longitude', ll: [+m[2], +m[1]], zoom: 8});
    // Layers by name: shows how many there are and switches the layer on if needed.
    for (const [k, l] of Object.entries(W.intel?.layers || {})) if (lc(l.label).includes(s) || k === s) push('Layers', {title: l.label, sub: l.info ? l.info.slice(0, 90) + (l.info.length > 90 ? '…' : '') : '', layer: k, color: l.color});
    // Countries.
    for (const f of W.feats || []) {
      const n = f.properties?.name || '', iso = f.properties?.iso2 || '';
      if (!iso || !(lc(n).includes(s) || lc(iso) === s)) continue;
      const st = W.statusOf?.(iso), ll = W.centroidOf?.(iso);
      push('Countries', {title: n, sub: `Country light: ${({red: 'red', yellow: 'yellow', green: 'green'}[st?.level] || 'no live signal')}`, ll, zoom: 4, props: {kind: 'country', name: n, iso, level: st?.level || 'grey', layer: 'lights', source: 'FYNX country-status model'}});
    }
    // Events and reference sites (same records as the globe's layers).
    for (const [id, it] of D?.byId || new Map()) {
      const text = lc([it.title, it.ref?.n, it.ref?.d, it.iso, it.ref?.c, it.ref?.k, labelOf(it.layer)].join(' '));
      if (!text.includes(s)) continue;
      push(it.ref ? 'Sites' : 'Events', {title: it.title || it.ref?.n || id, sub: `${labelOf(it.layer)}${it.sev ? ' · ' + SEV_LABEL[it.sev] : ''}${it.iso ? ' · ' + it.iso : ''}${layerOn(it.layer) ? '' : ' · layer off'}`, ll: it.ll, zoom: it.ref ? 7 : 5, id, layer: it.layer, color: colorOf(it.layer)});
    }
    // Chokepoints.
    for (const [n, b] of Object.entries(W.ships?.chokepoints || {})) {
      if (!lc(n).includes(s)) continue;
      const c = W.ships?.counts?.[n] || {};
      push('Chokepoints', {title: n, sub: c.ships ? `${c.ships} ships inside now` : 'No ship reported inside in the last sample', ll: [(+b[0][1] + +b[1][1]) / 2, (+b[0][0] + +b[1][0]) / 2], zoom: 7, props: {kind: 'choke', name: n, ships: c.ships || 0, tankers: c.tankers || 0, cargo: c.cargo || 0, waiting: c.waiting || 0, source: 'AIS / geographic reference'}, color: colors.chokes});
    }
    // Ships by name, MMSI or destination.
    let ships = 0;
    for (const v of W.ships?.vessels || []) {
      if (ships >= 12) break;
      if (!(lc(v.name).includes(s) || String(v.mmsi || '') === s.replace(/\s/g, '') || (s.length > 3 && lc(v.dest).includes(s)))) continue;
      ships++;
      const layer = v.kind === 'tanker' ? 'tankers' : v.kind === 'cargo' ? 'cargo' : 'other';
      push('Ships', {title: v.name || 'MMSI ' + v.mmsi, sub: `${({tankers: 'Tanker', cargo: 'Cargo ship', other: 'Ship'})[layer]}${v.dest ? ' → ' + v.dest : ''}${Number.isFinite(+v.sog) ? ' · ' + (+v.sog).toFixed(1) + ' kn' : ''}`, ll: [v.lon, v.lat], zoom: 9, color: colors[layer],
        props: {kind: 'ship', layer, name: v.name || 'MMSI ' + v.mmsi, mmsi: v.mmsi || '', sog: Number.isFinite(+v.sog) ? +v.sog : null, hdg: v.heading ?? v.cog ?? null, dest: v.dest || '', eta: v.eta || '', source: 'AIS', updated: W.ships?.generatedAt || ''}});
    }
    const order = ['Coordinates', 'Countries', 'Events', 'Sites', 'Chokepoints', 'Ships', 'Layers'];
    return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }
  async function searchPlaces(q) {
    const cfg = await readConfig();
    // The public OSM geocoder does not permit client-side autocomplete.
    // Without an explicitly configured geocoder the existing FYNX results stand alone.
    if (!cfg.key) return undefined;
    try {
      const d = await (await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${encodeURIComponent(cfg.key)}&limit=6`)).json();
      return (d.features || []).map(f => ({group: 'Places worldwide', title: f.text || f.place_name, sub: f.place_name || '', ll: f.center, zoom: (f.place_type || []).includes('country') ? 4 : (f.place_type || []).some(t => /region|state/.test(t)) ? 6 : 10}));
    } catch (_) { return null; }
  }
  function buildSearch(tools) {
    if (tools.querySelector('.fx-wsearch')) return;
    const box = document.createElement('div'); box.className = 'fx-wsearch'; box.setAttribute('role', 'search');
    const input = document.createElement('input'); input.type = 'search'; input.className = 'fx-wsearch-in';
    input.placeholder = 'Search ships, ports, bases, countries, events…';
    input.setAttribute('aria-label', 'Search countries, events, sites, chokepoints, ships and places'); input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', 'fx-wsearch-list');
    const list = document.createElement('div'); list.className = 'fx-wsearch-list'; list.id = 'fx-wsearch-list'; list.setAttribute('role', 'listbox'); list.hidden = true;
    box.append(input, list);
    tools.prepend(box);
    let results = [], active = -1, seq = 0, timer = 0;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
    function choose(r) {
      close();
      if (!r) return;
      if (r.layer && !r.ll) {      // a layer: switch it on and list what it holds
        if (!layerOn(r.layer)) { if (typeof W.intel?.setLayer === 'function') W.intel.setLayer(r.layer, true); else { const cb = document.getElementById('ilp-' + r.layer); if (cb) cb.click(); } }
        input.value = labelOf(r.layer); render(searchFynx(labelOf(r.layer)).filter(x => x.layer === r.layer && x.ll), true); return;
      }
      if (r.id && W.mapMode !== 'satellite' && typeof W.intel?.open === 'function' && W.intelData?.byId?.has(r.id)) { W.intel.open(r.id); return; }
      flyTo({ll: r.ll, zoom: r.zoom, item: r.id || r.props ? {id: r.id, props: r.props} : null});
    }
    function render(rows, keepOpen) {
      results = rows; list.replaceChildren(); active = -1;
      if (!input.value.trim()) return close();
      let group = '';
      rows.slice(0, 40).forEach((r, i) => {
        if (r.group !== group) { group = r.group; const h = document.createElement('div'); h.className = 'fx-wsearch-h'; h.textContent = group; list.append(h); }
        const o = document.createElement('button'); o.type = 'button'; o.className = 'fx-wsearch-r'; o.setAttribute('role', 'option'); o.id = 'fx-ws-' + i;
        const dot = document.createElement('i'); dot.style.background = r.color || '#7f8c86';
        const t = document.createElement('b'); t.textContent = r.title; const sub = document.createElement('small'); sub.textContent = r.sub || '';
        o.append(dot, t, sub); o.addEventListener('click', () => choose(r)); list.append(o);
      });
      if (!rows.some(r => r.group !== 'Places worldwide')) {
        const p = document.createElement('p'); p.className = 'fx-wsearch-none';
        p.textContent = `Nothing in FYNX’s world data matches “${input.value.trim()}”. ${rows.length ? 'Places worldwide:' : 'Looking up places worldwide…'}`;
        list.prepend(p);
      }
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (keepOpen) input.focus();
    }
    async function run() {
      const q = input.value.trim(), my = ++seq;
      if (!q) return close();
      const local = searchFynx(q);
      render(local);
      if (q.length < 3 || /^-?\d/.test(q)) return;
      const places = await searchPlaces(q);
      if (my !== seq || input.value.trim() !== q) return;
      if (places === undefined) {
        const message = list.querySelector('.fx-wsearch-none');
        if (message) message.textContent = `Nothing in FYNX’s world data matches “${q}”. Worldwide place search is not configured.`;
        return;
      }
      if (places === null && !local.length) { render([]); const p = list.querySelector('.fx-wsearch-none'); if (p) p.textContent = `Nothing in FYNX’s world data matches “${q}”, and the worldwide place search is unavailable right now.`; return; }
      if (places && !places.length && !local.length) { render([]); const p = list.querySelector('.fx-wsearch-none'); if (p) p.textContent = `No country, event, site, ship or place matches “${q}”.`; return; }
      render([...local, ...(places || [])]);
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
    input.addEventListener('focus', () => { if (input.value.trim() && results.length) { list.hidden = false; input.setAttribute('aria-expanded', 'true'); } });
    input.addEventListener('keydown', e => {
      const opts = [...list.querySelectorAll('.fx-wsearch-r')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!opts.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.classList.toggle('on', i === active)); input.setAttribute('aria-activedescendant', opts[active].id); opts[active].scrollIntoView({block: 'nearest'});
      } else if (e.key === 'Enter') {
        e.preventDefault(); clearTimeout(timer);
        if (active >= 0) opts[active].click();
        else { const first = searchFynx(input.value).find(r => r.ll) || null; if (first) choose(first); else if (opts[0]) opts[0].click(); else run(); }
      }
      else if (e.key === 'Escape') { close(); input.blur(); }
      e.stopPropagation();
    });
    document.addEventListener('click', e => { if (!box.contains(e.target)) close(); });
  }

  /* --- toolbar --------------------------------------------------------------------------------------- */
  function injectSwitcher() {
    const tools = document.querySelector('.fx-gtools');
    if (!tools || tools.dataset.satSwitcher) return;
    tools.dataset.satSwitcher = '1';
    const modes = [['flat', 'FLAT'], ['globe', 'GLOBE'], ['satellite', 'SATELLITE']];
    const group = document.createElement('div');
    group.className = 'fx-sat-modes';
    group.style.cssText = 'display:inline-flex;gap:2px;margin-right:4px;';
    modes.forEach(([id, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mode = id;
      b.className = 'fx-gbtn' + (W.mapMode === id ? ' fx-active' : '');
      b.textContent = label;
      b.setAttribute('aria-pressed', W.mapMode === id ? 'true' : 'false');
      b.addEventListener('click', () => setMode(id));
      group.appendChild(b);
    });
    tools.prepend(group);
    buildStyleMenu(tools);
    buildSearch(tools);
    // The layer panel starts under the toolbar, however many rows the toolbar wraps to (phones).
    if (window.ResizeObserver) {
      const stage = tools.closest('.fx-gstage');
      if (stage) new ResizeObserver(() => stage.style.setProperty('--fx-gtools-h', Math.round(tools.getBoundingClientRect().height) + 'px')).observe(tools);
    }
    if (!tools.querySelector('.fx-sat-fullscreen')) {
      const full=document.createElement('button');
      full.type='button';
      full.className='fx-gbtn fx-sat-fullscreen';
      full.textContent='⛶';
      full.title='Toggle fullscreen World Desk map';
      full.setAttribute('aria-label','Toggle fullscreen World Desk map');
      full.addEventListener('click',()=>{
        const stage=tools.closest('.fx-gstage');
        if (!stage) return;
        if (document.fullscreenElement) document.exitFullscreen?.();
        else stage.requestFullscreen?.().catch?.(()=>{});
      });
      tools.appendChild(full);
    }
    const orig = tools.querySelector('.fx-gbtn:not(.fx-sat-modes .fx-gbtn):not(.fx-sat-stylebtn)');
    if (orig && /Globe|Flat/.test(orig.textContent)) orig.style.display = 'none';
  }

  const style = document.createElement('style'); style.id = 'fx-sat-style-css';
  style.textContent = `
.fx-sat-style{position:relative;display:inline-flex;margin-right:4px}
.fx-sat-style[hidden]{display:none}
.fx-sat-stylebtn{white-space:nowrap}
.fx-sat-stylelist{position:absolute;top:calc(100% + 4px);right:0;z-index:12;width:250px;max-height:340px;overflow:auto;padding:4px;background:rgba(7,10,11,.97);border:1px solid #2a3530;box-shadow:0 16px 36px rgba(0,0,0,.55)}
.fx-sat-stylelist[hidden]{display:none}
.fx-sat-stylelist button{display:block;width:100%;padding:6px 8px;background:none;border:0;border-left:2px solid transparent;text-align:left;color:var(--tx,#e7ece9);cursor:pointer}
.fx-sat-stylelist button:hover{background:#111816}
.fx-sat-stylelist button.on{border-left-color:var(--am,#ffb000);background:#14120a}
.fx-sat-stylelist button:disabled{opacity:.4;cursor:not-allowed}
.fx-sat-stylelist b{display:block;font:600 12px Inter,Arial,sans-serif}
.fx-sat-stylelist small{display:block;color:var(--mu,#8a978f);font:11px Inter,Arial,sans-serif}
.fx-wsearch{position:relative;display:inline-flex;margin-right:6px}
.fx-wsearch-in{width:260px;height:26px;padding:0 9px;background:rgba(10,14,13,.92);border:1px solid #2a3530;color:var(--tx,#e7ece9);font:12px Inter,Arial,sans-serif}
html body.fx-terminal .fx-wsearch-in{background:rgba(10,14,13,.92)!important;color:var(--tx)!important;border:1px solid #2a3530!important;border-radius:0!important}
html body.fx-terminal .fx-wsearch-in:focus{border-color:var(--am)!important;outline:none}
.fx-wsearch-list{position:absolute;top:calc(100% + 4px);right:0;z-index:12;width:360px;max-height:420px;overflow:auto;padding:4px 0;background:rgba(7,10,11,.98);border:1px solid var(--am,#ffb000);box-shadow:0 18px 40px rgba(0,0,0,.6);text-align:left}
.fx-wsearch-list[hidden]{display:none}
.fx-wsearch-h{padding:7px 10px 3px;color:var(--mu,#7f8c86);font:700 9.5px 'IBM Plex Mono',monospace;letter-spacing:.1em;text-transform:uppercase}
.fx-wsearch-r{display:grid;grid-template-columns:8px 1fr;column-gap:8px;width:100%;padding:5px 10px;background:none;border:0;text-align:left;color:var(--tx,#e7ece9);cursor:pointer}
.fx-wsearch-r:hover,.fx-wsearch-r.on{background:#111816}
.fx-wsearch-r i{grid-row:span 2;width:8px;height:8px;margin-top:4px;border-radius:50%}
.fx-wsearch-r b{font:600 12px Inter,Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-wsearch-r small{color:var(--mu,#8a978f);font:10.5px Inter,Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-wsearch-none{margin:4px 10px 6px;color:#c5cfca;font:11.5px/1.45 Inter,Arial,sans-serif}
@media (max-width:900px){.fx-wsearch-in{width:170px}.fx-wsearch-list{width:min(340px,calc(100vw - 24px))}}
@media (max-width:760px){
html body.fx-terminal .fx-gstage .fx-gtools{left:6px;right:6px;top:6px;flex-wrap:wrap;justify-content:flex-start;gap:3px}
html body.fx-terminal .fx-gstage .fx-gtools .fx-wsearch{order:-1;flex:1 1 100%;margin:0 0 2px}
html body.fx-terminal .fx-gstage .fx-wsearch-in{width:100%;height:38px;font-size:16px}
.fx-wsearch-list{left:0;right:auto;width:100%;max-height:55vh}
html body.fx-terminal .fx-gstage .fx-gtools .fx-gbtn{min-height:34px!important;height:34px!important;padding:0 8px!important;font-size:12px!important}
html body.fx-terminal .fx-gstage .fx-sat-stylepre{display:none}
.fx-sat-stylelist{right:auto;left:0}
html body.fx-terminal .fx-gstage .fx-ilp{top:calc(var(--fx-gtools-h,84px) + 12px)!important;max-height:calc(100% - var(--fx-gtools-h,84px) - 56px)!important}
html body.fx-terminal .fx-gstage .fx-ilp.collapsed{max-height:none!important}}`;
  document.head.appendChild(style);

  const obs = new MutationObserver(() => injectSwitcher());
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(injectSwitcher, 400);

  W.mountSatellite = mountSatellite;
  W.unmountSatellite = unmountSatellite;
  W.setMapMode = setMode;
  W.updateSatelliteMarkers = updateMarkers;
  W.setMapStyle = setBaseStyle;
  W.mapStyles = STYLES.map(s => ({key: s[0], label: s[1]}));
  W.searchWorld = searchFynx;
  W.satFlyTo = (ll, zoom) => { if (mapInstance && ll) mapInstance.flyTo({center: ll, zoom: zoom || 5}); };
});
