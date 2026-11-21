/* FYNX Terminal plugin: Satellite Map mode for the WORLD desk.
 * Isolated addition — does not modify existing Flat or Globe rendering logic.
 * Uses MapLibre GL JS. Tile source is configurable; see docs/SATELLITE-MAP.md.
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

  function getStyle() {
    if (window.FYNX_SATELLITE_STYLE) return window.FYNX_SATELLITE_STYLE;
    const meta = document.querySelector('meta[name="fynx-satellite-style"]');
    if (meta && meta.content) return meta.content;
    return {
      version: 8,
      sources: {
        satellite: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri · Maxar · Earthstar Geographics (development placeholder — not licensed for commercial production)'
        }
      },
      layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
    };
  }

  let mapInstance = null;
  let satContainer = null;
  let popup = null;
  let searchBox = null;

  // Layers that are on by default in world-intel.js when no saved preference exists.
  const DEFAULT_ON = new Set(['conflict', 'zones', 'protests', 'hotspots', 'cyber', 'quakes', 'alerts', 'tankers', 'cargo', 'chokes', 'lights']);

  function layerOn(key) {
    // Existing World Desk checkboxes do not set data-layer; use shared state first.
    if (W.layers && typeof W.layers[key] === 'boolean') return W.layers[key];
    const box = document.querySelector(`input[data-layer="${key}"]`);
    if (box) return box.checked;
    return DEFAULT_ON.has(key);
  }

  function buildFeatures() {
    const feats = [];
    const add = (lon, lat, props) => {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props });
    };
    for (const v of (W.ships?.vessels || []).slice(0, 4000)) {
      const kind = v.kind || 'other';
      const key = kind === 'tanker' ? 'tankers' : kind === 'cargo' ? 'cargo' : 'other';
      if (!layerOn(key)) continue;
      add(v.lon, v.lat, { layer: kind, name: v.name || kind, source: 'AIS', updated: W.ships?.generatedAt || '' });
    }
    if (layerOn('quakes')) {
      for (const q of W.intelData?.haz?.quakes || []) {
        add(q.lon, q.lat, { layer: 'quakes', name: q.place || 'Earthquake', mag: q.mag, time: q.time, url: q.url || '', source: 'USGS' });
      }
    }
    if (layerOn('alerts')) {
      for (const a of W.intelData?.haz?.alerts || []) {
        if (a.ll) add(a.ll[0], a.ll[1], { layer: 'alerts', name: a.title || a.type || 'Alert', source: a.source || 'GDACS/EONET', time: a.time || '' });
      }
    }
    const ref = W.intelData?.ref?.layers || {};
    for (const [key, arr] of Object.entries(ref)) {
      if (!layerOn(key) || !Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item.ll || item.ll.length < 2) continue;
        add(item.ll[0], item.ll[1], { layer: key, name: item.n || key, desc: item.d || '', country: item.c || '', source: 'Reference (reviewed 2026-11)' });
      }
    }
    for (const ev of W.intelData?.events || []) {
      if (!layerOn(ev.layer) || !ev.ll) continue;
      add(ev.ll[0], ev.ll[1], { layer: ev.layer, name: ev.title || ev.layer, sev: ev.sev || '', n: ev.n || 0, time: ev.at || '', source: 'FYNX headlines' });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  function updateMarkers() {
    if (!mapInstance || !mapInstance.getSource('intel')) return;
    try { mapInstance.getSource('intel').setData(buildFeatures()); } catch (_) {}
  }

  function showPopup(lngLat, p) {
    if (!popup || !mapInstance) return;
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
    if (p.url) lines.push(`<a href="${p.url}" target="_blank" rel="noopener" style="color:#7ec8ff">Open source</a>`);
    const html = `<div style="font:13px/1.45 Inter,system-ui,sans-serif;color:#e8e8e8;background:#0d1110;padding:10px 12px;border-radius:8px;max-width:300px;border:1px solid rgba(255,255,255,.08)">${lines.join('<br>')}</div>`;
    popup.setLngLat(lngLat).setHTML(html).addTo(mapInstance);
  }

  async function mountSatellite(host) {
    if (mapInstance) return mapInstance;
    const maplibregl = await loadMapLibre();
    satContainer = document.createElement('div');
    satContainer.className = 'fx-sat-map';
    satContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;background:#0a0c0b;';
    host.appendChild(satContainer);

    if (!window.FYNX_SATELLITE_STYLE && !document.querySelector('meta[name="fynx-satellite-style"]')) {
      const note = document.createElement('div');
      note.className = 'fx-sat-notice';
      note.style.cssText = 'position:absolute;top:8px;left:8px;z-index:5;background:rgba(0,0,0,.72);color:#ffd23f;font:12px/1.3 Inter,system-ui,sans-serif;padding:6px 10px;border-radius:6px;max-width:280px;pointer-events:none';
      note.textContent = 'Development imagery — set FYNX_SATELLITE_STYLE for production';
      satContainer.appendChild(note);
    }

    const style = getStyle();
    mapInstance = new maplibregl.Map({
      container: satContainer,
      style,
      center: [0, 20],
      zoom: 2,
      attributionControl: true,
      maxZoom: 18,
      minZoom: 1
    });

    mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapInstance.addControl(new maplibregl.FullscreenControl(), 'top-right');

    searchBox = document.createElement('input');
    searchBox.type = 'search';
    searchBox.placeholder = 'Search country, city, or coordinates';
    searchBox.style.cssText = 'position:absolute;top:8px;right:56px;z-index:4;width:220px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:#111;color:#eee;font:13px Inter,system-ui,sans-serif';
    searchBox.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const q = searchBox.value.trim();
      if (!q) return;
      const m = q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
      if (m) { mapInstance.flyTo({ center: [+m[2], +m[1]], zoom: 8 }); return; }
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, { headers: { 'Accept': 'application/json' } });
        const d = await r.json();
        if (d[0]) mapInstance.flyTo({ center: [+d[0].lon, +d[0].lat], zoom: 6 });
      } catch (_) {}
    });
    satContainer.appendChild(searchBox);

    mapInstance.on('load', () => {
      mapInstance.addSource('intel', {
        type: 'geojson',
        data: buildFeatures(),
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 50
      });
      mapInstance.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'intel',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1a3a32',
          'circle-radius': ['step', ['get', 'point_count'], 16, 20, 22, 100, 30],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#3ecf8e'
        }
      });
      mapInstance.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'intel',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
        paint: { 'text-color': '#fff' }
      });
      mapInstance.addLayer({
        id: 'intel-circles',
        type: 'circle',
        source: 'intel',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['match', ['get', 'layer'], 'quakes', 7, 'bases', 5, 'nuclear', 6, 4],
          'circle-color': ['match', ['get', 'layer'],
            'tankers', '#ff9f43', 'cargo', '#5b8def', 'other', '#8e9b94',
            'quakes', '#ff8a65', 'bases', '#a5d66b', 'nuclear', '#ffe14d',
            'ports', '#80cbc4', 'airports', '#e6e6e6', 'conflict', '#ff3b30',
            'protests', '#c77dff', 'cyber', '#00e5ff', 'alerts', '#ffca28', '#c9a7ff'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#06080a'
        }
      });
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '340px' });
      mapInstance.on('click', 'intel-circles', (e) => {
        const f = e.features?.[0]; if (!f) return;
        showPopup(e.lngLat, f.properties || {});
      });
      mapInstance.on('click', 'clusters', (e) => {
        const f = e.features?.[0]; if (!f) return;
        const cid = f.properties.cluster_id;
        mapInstance.getSource('intel').getClusterExpansionZoom(cid, (err, zoom) => {
          if (err) return;
          mapInstance.easeTo({ center: f.geometry.coordinates, zoom });
        });
      });
      mapInstance.on('mouseenter', 'intel-circles', () => { mapInstance.getCanvas().style.cursor = 'pointer'; });
      mapInstance.on('mouseleave', 'intel-circles', () => { mapInstance.getCanvas().style.cursor = ''; });
      const panel = document.querySelector('.fx-glayers, .fx-intel');
      if (panel) panel.addEventListener('change', updateMarkers);
    });

    mapInstance.on('error', (e) => console.warn('Satellite map error', e?.error || e));
    return mapInstance;
  }

  function unmountSatellite() {
    if (mapInstance) { try { mapInstance.remove(); } catch (_) {} mapInstance = null; }
    if (satContainer && satContainer.parentNode) { satContainer.parentNode.removeChild(satContainer); satContainer = null; }
    searchBox = null;
  }

  function setMode(mode) {
    W.mapMode = mode;
    W.flat = mode === 'flat';
    try { localStorage.setItem('fynx-map-mode', mode); } catch (_) {}
    const stage = document.querySelector('.fx-gstage');
    if (!stage) return;
    if (mode === 'satellite') {
      stage.querySelectorAll('.fx-gsvg, .fx-gships').forEach(el => { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; });
      mountSatellite(stage).catch(err => console.warn('Satellite map failed', err));
    } else {
      unmountSatellite();
      stage.querySelectorAll('.fx-gsvg, .fx-gships').forEach(el => { el.style.visibility = ''; el.style.pointerEvents = ''; });
      if (typeof W.intelRedraw === 'function') W.intelRedraw();
    }
  }

  function injectSwitcher() {
    const tools = document.querySelector('.fx-gtools');
    if (!tools || tools.dataset.satSwitcher) return;
    tools.dataset.satSwitcher = '1';
    const modes = [['flat', 'FLAT'], ['globe', 'GLOBE'], ['satellite', 'SATELLITE']];
    const group = document.createElement('div');
    group.className = 'fx-sat-modes';
    group.style.cssText = 'display:inline-flex;gap:4px;margin-right:6px;';
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
