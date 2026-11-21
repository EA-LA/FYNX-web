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
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      s.onload = () => resolve(window.maplibregl);
      s.onerror = () => reject(new Error('Failed to load MapLibre GL JS'));
      document.head.appendChild(s);
    });
  }

  const SATELLITE_STYLE = {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© Esri · Maxar · Earthstar Geographics (demo tiles — review licensing before production)'
      }
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
  };

  let mapInstance = null;
  let satContainer = null;
  let popup = null;

  function layerOn(key) {
    if (W.layers && typeof W.layers[key] === 'boolean') return W.layers[key];
    return true;
  }

  function buildFeatures() {
    const feats = [];
    // Ships
    if (layerOn('tankers') || layerOn('cargo') || layerOn('other')) {
      for (const v of (W.ships?.vessels || []).slice(0, 3000)) {
        if (!Number.isFinite(v.lon) || !Number.isFinite(v.lat)) continue;
        const kind = v.kind || 'other';
        if (kind === 'tanker' && !layerOn('tankers')) continue;
        if (kind === 'cargo' && !layerOn('cargo')) continue;
        if (kind !== 'tanker' && kind !== 'cargo' && !layerOn('other')) continue;
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] }, properties: { layer: kind, name: v.name || kind, kind, source: 'AIS' } });
      }
    }
    // Earthquakes
    if (layerOn('quakes') && W.intelData?.haz?.quakes) {
      for (const q of W.intelData.haz.quakes) {
        if (!Number.isFinite(q.lon) || !Number.isFinite(q.lat)) continue;
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [q.lon, q.lat] }, properties: { layer: 'quakes', name: q.place || 'Earthquake', mag: q.mag, time: q.time, url: q.url || '' } });
      }
    }
    // Reference layers from intel-layers.json
    const ref = W.intelData?.ref?.layers || {};
    const refMap = { bases: 'bases', nuclear: 'nuclear', ports: 'ports', airports: 'airports', dams: 'dams', datacenters: 'datacenters', spaceports: 'spaceports', exchanges: 'exchanges' };
    for (const [key, arr] of Object.entries(ref)) {
      if (!layerOn(key) || !Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item.ll || item.ll.length < 2) continue;
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: item.ll }, properties: { layer: key, name: item.n || key, desc: item.d || '', country: item.c || '' } });
      }
    }
    // Live events (conflict, protests, cyber) — country centroids if available
    if (W.intelData?.events) {
      for (const ev of W.intelData.events) {
        if (!layerOn(ev.layer) || !ev.ll) continue;
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: ev.ll }, properties: { layer: ev.layer, name: ev.title || ev.layer, sev: ev.sev || '', n: ev.n || 0 } });
      }
    }
    return { type: 'FeatureCollection', features: feats };
  }

  function updateMarkers() {
    if (!mapInstance || !mapInstance.getSource('intel')) return;
    mapInstance.getSource('intel').setData(buildFeatures());
  }

  async function mountSatellite(host) {
    if (mapInstance) return mapInstance;
    const maplibregl = await loadMapLibre();
    satContainer = document.createElement('div');
    satContainer.className = 'fx-sat-map';
    satContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;';
    host.appendChild(satContainer);

    const style = window.FYNX_SATELLITE_STYLE || SATELLITE_STYLE;
    mapInstance = new maplibregl.Map({
      container: satContainer,
      style,
      center: [0, 20],
      zoom: 2,
      attributionControl: true
    });

    mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapInstance.addControl(new maplibregl.FullscreenControl(), 'top-right');

    mapInstance.on('load', () => {
      mapInstance.addSource('intel', { type: 'geojson', data: buildFeatures() });
      mapInstance.addLayer({
        id: 'intel-circles',
        type: 'circle',
        source: 'intel',
        paint: {
          'circle-radius': ['match', ['get', 'layer'], 'quakes', 7, 'bases', 5, 'nuclear', 6, 4],
          'circle-color': ['match', ['get', 'layer'],
            'tankers', '#ff9f43', 'cargo', '#5b8def', 'other', '#8e9b94',
            'quakes', '#ff8a65', 'bases', '#a5d66b', 'nuclear', '#ffe14d',
            'ports', '#80cbc4', 'airports', '#e6e6e6', 'conflict', '#ff3b30',
            'protests', '#c77dff', 'cyber', '#00e5ff', '#c9a7ff'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#06080a'
        }
      });
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '320px' });
      mapInstance.on('click', 'intel-circles', (e) => {
        const f = e.features?.[0]; if (!f) return;
        const p = f.properties || {};
        const html = `<div style="font:13px/1.4 Inter,system-ui,sans-serif;color:#e8e8e8;background:#111;padding:8px 10px;border-radius:6px;max-width:300px">
          <strong>${p.name || 'Event'}</strong><br>
          <span style="opacity:.7">${p.layer || ''}${p.country ? ' · ' + p.country : ''}</span><br>
          ${p.desc ? p.desc + '<br>' : ''}
          ${p.mag ? 'Magnitude ' + p.mag + '<br>' : ''}
          ${p.url ? '<a href="' + p.url + '" target="_blank" rel="noopener" style="color:#7ec8ff">Source</a>' : ''}
        </div>`;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(mapInstance);
      });
      mapInstance.on('mouseenter', 'intel-circles', () => { mapInstance.getCanvas().style.cursor = 'pointer'; });
      mapInstance.on('mouseleave', 'intel-circles', () => { mapInstance.getCanvas().style.cursor = ''; });
      // Refresh markers when layers change
      const orig = W.intel?.redraw;
      if (typeof orig === 'function') {
        W.intel.redraw = function () { orig.apply(this, arguments); updateMarkers(); };
      }
    });

    return mapInstance;
  }

  function unmountSatellite() {
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
    if (satContainer && satContainer.parentNode) { satContainer.parentNode.removeChild(satContainer); satContainer = null; }
  }

  function setMode(mode) {
    W.mapMode = mode;
    W.flat = mode === 'flat';
    const stage = document.querySelector('.fx-gstage');
    if (!stage) return;
    if (mode === 'satellite') {
      stage.querySelectorAll('.fx-gsvg, .fx-gships').forEach(el => el.style.visibility = 'hidden');
      mountSatellite(stage).catch(err => console.warn('Satellite map failed', err));
    } else {
      unmountSatellite();
      stage.querySelectorAll('.fx-gsvg, .fx-gships').forEach(el => el.style.visibility = '');
      // Existing draw function (if exposed) will refresh Flat/Globe
      if (typeof W.intelRedraw === 'function') W.intelRedraw();
    }
  }

  function injectSwitcher() {
    const tools = document.querySelector('.fx-gtools');
    if (!tools || tools.dataset.satSwitcher) return;
    tools.dataset.satSwitcher = '1';
    const firstBtn = tools.querySelector('.fx-gbtn');
    if (firstBtn && /Globe|Flat/.test(firstBtn.textContent)) firstBtn.remove();
    const modes = [['flat', 'FLAT'], ['globe', 'GLOBE'], ['satellite', 'SATELLITE']];
    const group = document.createElement('div');
    group.className = 'fx-sat-modes';
    group.style.cssText = 'display:inline-flex;gap:4px;margin-right:8px;';
    modes.forEach(([id, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fx-gbtn' + (W.mapMode === id ? ' fx-active' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        setMode(id);
        group.querySelectorAll('.fx-gbtn').forEach(x => x.classList.remove('fx-active'));
        b.classList.add('fx-active');
      });
      group.appendChild(b);
    });
    tools.prepend(group);
  }

  const obs = new MutationObserver(() => injectSwitcher());
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(injectSwitcher, 500);

  W.mountSatellite = mountSatellite;
  W.unmountSatellite = unmountSatellite;
  W.setMapMode = setMode;
  W.updateSatelliteMarkers = updateMarkers;
});
