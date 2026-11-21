# FYNX Satellite Map — Production Requirements

## Overview
Third map mode for FYNX World Desk: **FLAT | GLOBE | SATELLITE**.

- Engine: MapLibre GL JS 4.7.1 (CDN)
- Existing Flat Map and Globe Map code paths are **not modified**
- Switcher is injected into the existing World Desk tools bar
- Intelligence layers, data feeds, and event panels continue to use the existing `world-intel.js` system

## Tile Provider (Required for Production)

No satellite imagery provider or API key was present in the repository.

The current default uses Esri World Imagery raster tiles **as a development placeholder only**.
These tiles are not assumed free for commercial production use.

### Recommended free-tier option
**MapTiler** (free tier available):

```js
window.FYNX_SATELLITE_STYLE = 'https://api.maptiler.com/maps/satellite/style.json?key=YOUR_MAPTILER_KEY';
```

Or set a full MapLibre style object.

### Other options
- Mapbox (requires access token and billing)
- Self-hosted or proxied tiles so the key never appears in browser code

### Configuration
Set before the map mounts:

```js
window.FYNX_SATELLITE_STYLE = { /* MapLibre style */ };
// or a style URL string
```

## Files
- `assets/js/terminal/satellite-map.js` — satellite mode, switcher injection, MapLibre mount/unmount
- `docs/SATELLITE-MAP.md` — this file

## Verification
- Flat and Globe modes remain fully functional
- Satellite mode loads MapLibre and displays imagery
- Layer toggles and event panels continue to work (data is shared)
- No existing files were deleted

## Limitations
- Marker plotting for every intelligence layer on the MapLibre canvas is wired for extension; live data is available via existing `W.intelData` / `W.ships`
- Production tile key must be supplied before commercial deployment
