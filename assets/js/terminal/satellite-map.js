/* FYNX Terminal plugin: Satellite Map mode for the WORLD desk.
 * Isolated addition — does not modify existing Flat or Globe rendering logic.
 * Uses MapLibre GL JS. Tile source is loaded at runtime; see docs/SATELLITE-MAP.md.
 */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T) => {
  'use strict';
  const W = T.S.world;
  if (!W) return;

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

  async function resolveStyle() {
    if (window.FYNX_SATELLITE_STYLE) return { style: window.FYNX_SATELLITE_STYLE, licensed: true };
    const meta = document.querySelector('meta[name="fynx-satellite-style"]');
    if (meta && meta.content) return { style: meta.content, licensed: true };
    try {
      const r = await fetch('/assets/config/satellite.json', { cache: 'no-store' });
      if (r.ok) {
        const cfg = await r.json();
        if (cfg && cfg.style) return { style: cfg.style, licensed: true };
        if (cfg && cfg.key) {
          return {
            style: 'https://api.maptiler.com/maps/satellite/style.json?key=' + encodeURIComponent(cfg.key),
            licensed: true
          };
        }
      }
    } catch (_) {}
    // Do not load unlicensed fallback imagery on the commercial website.
    // An empty background is safe until a licensed MapTiler style is configured.
    return {
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'unconfigured-background', type: 'background', paint: { 'background-color': '#0a0c0b' } }]
      },
      licensed: false
    };
  }

  let mapInstance = null;
  let satContainer = null;
  let popup = null;
  let searchBox = null;
  let raisedOverlays = [];

  function elevateMapControls(stage) {
    if (raisedOverlays.length) return;
    for (const el of stage.querySelectorAll(':scope > .fx-gtools, :scope > .fx-glayers, :scope > .fx-glegend, :scope > .fx-gcard, :scope > .fx-scard')) {
      raisedOverlays.push({ el, position: el.style.position, zIndex: el.style.zIndex });
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.style.zIndex = '6';
    }
  }

  function restoreMapControls() {
    for (const item of raisedOverlays) {
      item.el.style.position = item.position;
      item.el.style.zIndex = item.zIndex;
    }
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
  let refreshHandle = null;
  let panelCleanup = null;
  let resizeObserver = null;

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

  function buildFeatures() {
    const features = [], D = W.intelData;
    // Same records, IDs and toggle states as Flat/Globe, including non-default layers.
    for (const [id, item] of (D?.byId || new Map())) {
      if (!item?.ll || !layerOn(item.layer) || item.layer === 'pipelines') continue;
      const props = {
        id, layer:item.layer, name:item.title || item.ref?.n || item.layer,
        country:item.iso || item.ref?.c || '', sev:item.sev || '',
        desc:item.ref?.d || '', source:item.ref ? 'FYNX reference data' :
          item.layer === 'quakes' ? 'USGS' : item.layer === 'alerts' ? (item.a?.src || 'Hazards feed') : 'FYNX classified headlines',
        time:item.at || '', reports:item.n || 0
      };
      features.push(point(item.ll[0],item.ll[1],props));
    }
    // Early loading fallback: show hazards while the intelligence index builds.
    if (!(D?.byId?.size)) {
      for (const q of D?.haz?.quakes || []) if (layerOn('quakes'))
        features.push(point(q.lon,q.lat,{layer:'quakes',name:q.place || 'Earthquake',mag:q.mag,time:q.time,source:'USGS'}));
      for (const a of D?.haz?.alerts || []) if (layerOn('alerts'))
        features.push(point(a.lon,a.lat,{layer:'alerts',name:a.title || 'Natural alert',time:a.from,source:a.src || 'Hazard feed'}));
    }
    for (const [name, bounds] of Object.entries(W.ships?.chokepoints || {})) {
      if (!layerOn('chokes') || !Array.isArray(bounds) || !Array.isArray(bounds[0]) || !Array.isArray(bounds[1])) continue;
      features.push(point((+bounds[0][1] + +bounds[1][1]) / 2,(+bounds[0][0] + +bounds[1][0]) / 2,
        {id:'choke-'+name,layer:'chokes',name:name+' chokepoint',source:'AIS / geographic reference'}));
    }
    return collection(features);
  }

  function shipFeatures() {
    const features=[];
    for (const v of (W.ships?.vessels || []).slice(0,5000)) {
      const key=v.kind === 'tanker' ? 'tankers' : v.kind === 'cargo' ? 'cargo' : 'other';
      if (!layerOn(key)) continue;
      features.push(point(v.lon,v.lat,{layer:key,name:v.name || key,source:'AIS',updated:W.ships?.generatedAt || '',mmsi:v.mmsi || ''}));
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
      return point(ll[0],ll[1],{id:'country-'+iso,layer:'lights',name:f.properties?.name || iso,iso,
        level,source:'FYNX country-status model'});
    }));
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
    if (layerOn('pipelines')) for (const pipe of W.intelData?.ref?.layers?.pipelines || []) {
      for (const route of pipe.paths || []) {
        if (Array.isArray(route) && route.length > 1)
          features.push({type:'Feature',geometry:{type:'LineString',coordinates:route},
            properties:{layer:'pipelines',name:pipe.n || 'Pipeline',kind:pipe.k || ''}});
      }
    }
    return collection(features);
  }

  function updateMarkers() {
    if (!mapInstance) return;
    try {
      const data={intel:buildFeatures(),shipping:shipFeatures(),lights:lightFeatures(),lanes:lineFeatures(),pipelines:pipelineFeatures()};
      for (const [key,value] of Object.entries(data)) {
        const source=mapInstance.getSource(key);
        if (source) source.setData(value);
      }
    } catch (error) { console.warn('FYNX satellite layer refresh failed',error); }
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function showPopup(lngLat, p) {
    if (!popup || !mapInstance) return;
    p = Object.fromEntries(Object.entries(p).map(([key, value]) => [key, escapeHTML(value)]));
    const lines = [
      `<strong>${p.name || 'Location'}</strong>`,
      `<span style="opacity:.7">${p.layer || ''}${p.country ? ' · ' + p.country : ''}</span>`
    ];
    if (p.sev) lines.push('Severity: ' + p.sev);
    if (p.mag) lines.push('Magnitude: ' + p.mag);
    if (p.n) lines.push(p.n + ' report' + (p.n === 1 ? '' : 's'));
    if (p.desc) lines.push(p.desc);
    if (p.time) lines.push('Time: ' + p.time);
    if (p.updated) lines.push('Feed: ' + p.updated);
    if (p.source) lines.push('Source: ' + p.source);
    if (p.url && /^https?:\/\//i.test(p.url)) lines.push(`<a href="${p.url}" target="_blank" rel="noopener noreferrer" style="color:#7ec8ff">Open source</a>`);
    const html = `<div style="font:13px/1.45 Inter,system-ui,sans-serif;color:#e8e8e8;background:#0d1110;padding:10px 12px;border-radius:8px;max-width:300px;border:1px solid rgba(255,255,255,.08)">${lines.join('<br>')}</div>`;
    popup.setLngLat(lngLat).setHTML(html).addTo(mapInstance);
  }

  async function mountSatellite(host) {
    if (mapInstance) return mapInstance;
    const maplibregl = await loadMapLibre();
    if (W.mapMode !== 'satellite') return null;
    const resolved = await resolveStyle();
    if (W.mapMode !== 'satellite') return null;
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

    // FYNX's existing +, − and Reset buttons control both map engines.
    // Do not add MapLibre's white native buttons over the terminal toolbar.
    const stageTools = host.querySelector('.fx-gtools');
    if (stageTools && !stageTools.dataset.satControls) {
      stageTools.dataset.satControls = '1';
      stageTools.addEventListener('click', event => {
        if (W.mapMode !== 'satellite' || !mapInstance) return;
        const button = event.target.closest('button');
        if (!button || button.closest('.fx-sat-modes')) return;
        const text = button.textContent.trim();
        if (text !== '+' && text !== '−' && text !== '-' && text !== 'Reset') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (text === '+') mapInstance.zoomIn();
        else if (text === '−' || text === '-') mapInstance.zoomOut();
        else mapInstance.flyTo({center:[0,15],zoom:1.5,bearing:0,pitch:0});
      }, true);
    }

    searchBox = document.createElement('input');
    searchBox.type = 'search';
    searchBox.placeholder = 'Search country, city, or coordinates';
    searchBox.className = 'fx-sat-search';
    searchBox.setAttribute('aria-label','Find country, city, or latitude and longitude');
    searchBox.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const q = searchBox.value.trim();
      if (!q) return;
      const m = q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
      if (m) {
        const lat = +m[1], lon = +m[2];
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && mapInstance) {
          mapInstance.flyTo({ center: [lon, lat], zoom: 8 });
        }
        return;
      }
      // Search FYNX's existing country dataset locally before the external geocoder.
      const country=(W.feats || []).find(f=>{
        const name=String(f.properties?.name || '').toLowerCase();
        const iso=String(f.properties?.iso2 || '').toLowerCase();
        return name===q.toLowerCase() || iso===q.toLowerCase();
      });
      if (country) {
        const center=W.centroidOf?.(country.properties.iso2);
        if (center && mapInstance) {mapInstance.flyTo({center,zoom:4});return;}
      }
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, { headers: { 'Accept': 'application/json' } });
        const d = await r.json();
        if (d[0] && mapInstance && W.mapMode === 'satellite') mapInstance.flyTo({ center: [+d[0].lon, +d[0].lat], zoom: 6 });
      } catch (_) {}
    });
    satContainer.appendChild(searchBox);

    mapInstance.on('load', () => {
      if (!mapInstance || W.mapMode !== 'satellite') return;
      const addSource=(id,data,cluster=false) => mapInstance.addSource(id,{
        type:'geojson',data, ...(cluster?{cluster:true,clusterMaxZoom:9,clusterRadius:38}:{})
      });
      addSource('intel',buildFeatures(),true);
      addSource('shipping',shipFeatures(),true);
      addSource('lights',lightFeatures());
      addSource('lanes',lineFeatures());
      addSource('pipelines',pipelineFeatures());

      // Country boundaries and country names come from the exact same country
      // geometry used by the existing Globe/Flat map, without a new API key.
      if (Array.isArray(W.feats) && W.feats.length) {
        addSource('countries',collection(W.feats));
        mapInstance.addLayer({
          id:'sat-country-borders',type:'line',source:'countries',
          paint:{'line-color':'rgba(214,226,230,.48)','line-width':['interpolate',['linear'],['zoom'],1,0.35,6,1.1],'line-opacity':0.75}
        });
        const labels=collection(W.feats.map(f => {
          const ll=W.centroidOf?.(f.properties?.iso2);
          return ll ? point(ll[0],ll[1],{name:f.properties.name || f.properties.iso2}) : null;
        }));
        addSource('country-labels',labels);
        mapInstance.addLayer({
          id:'sat-country-labels',type:'symbol',source:'country-labels',
          minzoom:2,
          layout:{'text-field':['get','name'],'text-size':['interpolate',['linear'],['zoom'],2,10,6,13],
            'text-font':['Open Sans Regular','Arial Unicode MS Regular'],'text-allow-overlap':false,'text-padding':4},
          paint:{'text-color':'#f0f0e7','text-halo-color':'rgba(3,8,12,.95)','text-halo-width':1.4}
        });
      }

      mapInstance.addLayer({
        id:'sat-shipping-lanes',type:'line',source:'lanes',
        paint:{'line-color':'#83bce1','line-width':1.4,'line-opacity':0.5,'line-dasharray':[3,3]}
      });
      mapInstance.addLayer({
        id:'sat-pipelines',type:'line',source:'pipelines',
        paint:{'line-color':'#f4a261','line-width':2,'line-opacity':0.8,'line-dasharray':[2,1]}
      });
      mapInstance.addLayer({
        id:'sat-country-status',type:'circle',source:'lights',minzoom:3.4,
        paint:{'circle-radius':3,'circle-color':['match',['get','level'],
          'red','#ff6b5f','yellow','#ffb000','green','#3ecf8e','#768a83'],
          'circle-stroke-color':'#04100c','circle-stroke-width':1}
      });

      // World security and natural event markers stay visible even at world zoom.
      mapInstance.addLayer({
        id:'clusters',type:'circle',source:'intel',filter:['has','point_count'],
        paint:{'circle-color':'rgba(13,37,30,.90)',
          'circle-radius':['step',['get','point_count'],13,10,17,50,22,200,28],
          'circle-stroke-width':1.3,'circle-stroke-color':'#3ecf8e'}
      });
      mapInstance.addLayer({
        id:'cluster-count',type:'symbol',source:'intel',filter:['has','point_count'],
        layout:{'text-field':'{point_count_abbreviated}','text-size':10.5},
        paint:{'text-color':'#f3f8f4'}
      });
      mapInstance.addLayer({
        id:'intel-circles',type:'circle',source:'intel',filter:['!', ['has','point_count']],
        paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,3.5,8,6],
          'circle-color':['match',['get','layer'],
            'conflict','#ff3b30','zones','#ff5a4f','protests','#c77dff',
            'hotspots','#ff6b5f','cyber','#00e5ff','quakes','#ff8a65',
            'alerts','#ffca28','bases','#a5d66b','nuclear','#ffe14d',
            'datacenters','#4dd0e1','spaceports','#b388ff','dams','#4fc3f7',
            'ports','#80cbc4','airports','#e6e6e6','chokes','#c9a7ff',
            'exchanges','#ffb000','#c9a7ff'],
          'circle-stroke-width':1,'circle-stroke-color':'#06100c'}
      });

      // AIS can exceed 4,000 vessels. Keep those separate to avoid hiding
      // critical conflict/hazard events behind giant vessel clusters.
      mapInstance.addLayer({
        id:'sat-shipping-clusters',type:'circle',source:'shipping',
        minzoom:3.5,filter:['has','point_count'],
        paint:{'circle-color':'#172b35','circle-radius':['step',['get','point_count'],11,20,16,100,21],
          'circle-stroke-width':1,'circle-stroke-color':'#82b7e1'}
      });
      mapInstance.addLayer({
        id:'sat-shipping-count',type:'symbol',source:'shipping',
        minzoom:3.5,filter:['has','point_count'],
        layout:{'text-field':'{point_count_abbreviated}','text-size':10},
        paint:{'text-color':'#fff'}
      });
      mapInstance.addLayer({
        id:'sat-ships',type:'circle',source:'shipping',minzoom:3.5,
        filter:['!', ['has','point_count']],
        paint:{'circle-radius':3,'circle-color':['match',['get','layer'],
          'tankers','#ff9f43','cargo','#5b8def','#8e9b94'],
          'circle-stroke-color':'#081015','circle-stroke-width':0.6}
      });

      popup = new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:'340px'});
      const clickPoint=(e) => {
        const f=e.features?.[0]; if (!f) return;
        showPopup(e.lngLat,f.properties || {});
      };
      for (const id of ['intel-circles','sat-ships','sat-country-status']) {
        mapInstance.on('click',id,clickPoint);
        mapInstance.on('mouseenter',id,()=>{mapInstance.getCanvas().style.cursor='pointer';});
        mapInstance.on('mouseleave',id,()=>{mapInstance.getCanvas().style.cursor='';});
      }
      for (const [id,source] of [['clusters','intel'],['sat-shipping-clusters','shipping']]) {
        mapInstance.on('click',id,(e)=>{
          const f=e.features?.[0]; if (!f) return;
          const src=mapInstance.getSource(source);
          if (!src?.getClusterExpansionZoom) return;
          src.getClusterExpansionZoom(f.properties.cluster_id,(err,zoom)=>{
            if (!err && mapInstance) mapInstance.easeTo({center:f.geometry.coordinates,zoom});
          });
        });
      }
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
      updateMarkers();
    });

    mapInstance.on('error', (e) => console.warn('Satellite map error', e?.error || e));
    return mapInstance;
  }

  function unmountSatellite() {
    if (refreshHandle) {clearInterval(refreshHandle);refreshHandle=null;}
    if (panelCleanup) {panelCleanup();panelCleanup=null;}
    if (resizeObserver) {resizeObserver.disconnect();resizeObserver=null;}
    if (mapInstance) { try { mapInstance.remove(); } catch (_) {} mapInstance = null; }
    if (satContainer && satContainer.parentNode) { satContainer.parentNode.removeChild(satContainer); satContainer = null; }
    searchBox = null;
  }

  function setMode(mode) {
    if (!['flat', 'globe', 'satellite'].includes(mode)) return;
    W.mapMode = mode;
    try { localStorage.setItem('fynx-map-mode', mode); } catch (_) {}
    const stage = document.querySelector('.fx-gstage');
    if (!stage) return;
    stage.classList.toggle('fx-satellite-active',mode==='satellite');
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
  }

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
      b.className = 'fx-gbtn' + (W.mapMode === id ? ' fx-active' : '');
      b.textContent = label;
      b.setAttribute('aria-pressed', W.mapMode === id ? 'true' : 'false');
      b.addEventListener('click', () => {
        setMode(id);
        group.querySelectorAll('.fx-gbtn').forEach(x => { x.classList.remove('fx-active'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('fx-active');
        b.setAttribute('aria-pressed', 'true');
      });
      group.appendChild(b);
    });
    tools.prepend(group);
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
    const orig = tools.querySelector('.fx-gbtn:not(.fx-sat-modes .fx-gbtn)');
    if (orig && /Globe|Flat/.test(orig.textContent)) orig.style.display = 'none';
  }

  const obs = new MutationObserver(() => injectSwitcher());
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(injectSwitcher, 400);

  W.mountSatellite = mountSatellite;
  W.unmountSatellite = unmountSatellite;
  W.setMapMode = setMode;
  W.updateSatelliteMarkers = updateMarkers;
});
