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

  // Development placeholder. Production must supply a licensed style.
  // See docs/SATELLITE-MAP.md.
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
    mapInstance.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');

    mapInstance.on('load', () => {
      // Existing intelligence panels and layer toggles remain in the DOM.
      // Markers for live layers (ships, quakes, conflict, etc.) can be added here
      // using data already present in W.intelData / W.ships when available.
      if (W.intel && typeof W.intel.redraw === 'function') {
        try { W.intel.redraw(); } catch (_) {}
      }
    });

    return mapInstance;
  }

  function unmountSatellite() {
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    if (satContainer && satContainer.parentNode) {
      satContainer.parentNode.removeChild(satContainer);
      satContainer = null;
    }
  }

  function setMode(mode) {
    W.mapMode = mode;
    W.flat = mode === 'flat';
    const stage = document.querySelector('.fx-gstage');
    if (!stage) return;
    if (mode === 'satellite') {
      // Hide SVG/canvas layers; show MapLibre
      stage.querySelectorAll('.fx-gsvg, .fx-gships').forEach(el => el.style.visibility = 'hidden');
      mountSatellite(stage).catch(err => console.warn('Satellite map failed', err));
    } else {
      unmountSatellite();
      stage.querySelectorAll('.fx-gsvg, .fx-gships').forEach(el => el.style.visibility = '');
      // Existing render path handles flat/globe via W.flat
      if (typeof window.FynxTerminal?.redrawGlobe === 'function') {
        window.FynxTerminal.redrawGlobe();
      }
    }
  }

  // Inject three-way switcher without touching core SVG code.
  function injectSwitcher() {
    const tools = document.querySelector('.fx-gtools');
    if (!tools || tools.dataset.satSwitcher) return;
    tools.dataset.satSwitcher = '1';

    // Remove the original binary toggle if present (first button)
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
        // Trigger existing re-render for flat/globe
        if (id !== 'satellite') {
          const host = document.querySelector('.fx-globe');
          if (host && typeof T.panel === 'function') {
            // Soft re-render by calling the existing draw if available
            W.scale = 1;
          }
        }
      });
      group.appendChild(b);
    });
    tools.prepend(group);
  }

  // Observe for the globe panel to appear, then inject switcher.
  const obs = new MutationObserver(() => injectSwitcher());
  obs.observe(document.body, { childList: true, subtree: true });
  // Also try immediately
  setTimeout(injectSwitcher, 500);

  W.mountSatellite = mountSatellite;
  W.unmountSatellite = unmountSatellite;
  W.setMapMode = setMode;
});
