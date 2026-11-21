# FYNX Satellite Map — Production Requirements

## Overview
Third map mode for FYNX World Desk: **FLAT | GLOBE | SATELLITE**.

- Engine: MapLibre GL JS 4.7.1 (CDN)
- Existing Flat Map and Globe Map code paths are **not modified**
- Switcher is injected into the existing World Desk tools bar
- Intelligence markers (ships, earthquakes, conflict/protest/cyber events, bases, nuclear, ports, airports, etc.) are plotted as GeoJSON circles on the satellite map and filtered by existing layer toggles
- Clicking a marker opens a popup with available details (name, layer, description, magnitude, source link when present). No data is invented.

## Tile Provider (Required for Production)

No satellite imagery provider or API key was present in the repository.

The current default uses Esri World Imagery raster tiles **as a development placeholder only**.
These tiles are not assumed free for commercial production use and must not be used for commercial deployment without proper licensing.

### Recommended free-tier option
**MapTiler** (free tier available):

```js
window.FYNX_SATELLITE_STYLE = 'https://api.maptiler.com/maps/satellite/style.json?key=YOUR_MAPTILER_KEY';
```

Or set a full MapLibre style object. Prefer a backend proxy so the key is never exposed in frontend code.

### Other options
- Mapbox (requires access token and billing)
- Any other properly licensed satellite tile provider

### Configuration
Set before the map mounts:

```js
window.FYNX_SATELLITE_STYLE = { /* MapLibre style */ };
// or a style URL string
```

## Files
- `assets/js/terminal/satellite-map.js` — satellite mode, switcher, marker plotting, popups
- `docs/SATELLITE-MAP.md` — this file
- `terminal.html` — single script include added

## Verification status
- Flat and Globe rendering code was not edited
- Satellite mode loads MapLibre, displays imagery, and plots markers from existing data sources
- Marker clicks show popups with available fields
- Full browser and production-build verification was not executed in this environment (see PR description)

## Limitations
- Production tile key must be supplied and licensed before commercial deployment
- Some reference layers depend on `W.intelData.ref` being loaded; if the reference JSON fails to load, those markers will be absent
- Marker clustering is not implemented in this version
