/* FYNX Terminal plugin: Satellite Map mode for the WORLD desk.
 * Isolated addition — does not modify existing Flat or Globe rendering.
 * Uses MapLibre GL JS. Tile source is configurable; see docs/SATELLITE-MAP.md.
 */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T) => {
  'use strict';
  const W = T.S.world;
  if (!W) return;

  // Mode: 'globe' | 'flat' | 'satellite'. Existing W.flat remains for backward compatibility.
  if (typeof W.mapMode !== 'string') W.mapMode = W.flat ? 'flat' : 'globe';

  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      s.onload = () => resolve(window.maplibregl);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Placeholder satellite style. Replace SATELLITE_TILE_URL with a licensed provider.
  // See docs/SATELLITE-MAP.md for free-tier options (MapTiler, etc.).
  const SATELLITE_STYLE = {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          // Demo raster. For production set window.FYNX_SATELLITE_TILES or env-backed proxy.
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: '© Esri · Maxar · Earthstar Geographics (demo tiles — review licensing before production)'
      }
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
  };

  let mapInstance = null;

  async function mountSatellite(host) {
    const maplibregl = await loadMapLibre();
    const container = document.createElement('div');
    container.className = 'fx-sat-map';
    container.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    host.appendChild(container);

    const style = window.FYNX_SATELLITE_STYLE || SATELLITE_STYLE;
    mapInstance = new maplibregl.Map({
      container,
      style,
      center: [0, 20],
      zoom: 2,
      attributionControl: true
    });

    mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapInstance.addControl(new maplibregl.FullscreenControl(), 'top-right');

    // Hook existing intelligence redraw if available
    mapInstance.on('load', () => {
      if (W.intel && typeof W.intel.redraw === 'function') W.intel.redraw();
      // Minimal marker overlay for existing layers can be extended here.
    });

    return mapInstance;
  }

  function unmountSatellite() {
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
  }

  // Expose for the switcher in world.js
  W.mountSatellite = mountSatellite;
  W.unmountSatellite = unmountSatellite;
  W.setMapMode = (mode) => {
    W.mapMode = mode;
    W.flat = mode === 'flat';
    // Caller is expected to re-render the panel.
  };
});
