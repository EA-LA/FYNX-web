# FYNX Satellite Map — Production Requirements

## Overview
Third map mode for FYNX World Desk: **FLAT | GLOBE | SATELLITE**.

- Engine: MapLibre GL JS 4.7.1 (CDN)
- Existing Flat Map and Globe Map code paths are **not modified**
- Three-way switcher is injected into the existing World Desk tools bar
- Intelligence markers are plotted as clustered GeoJSON circles and filtered by existing layer toggles
- Clicking a marker opens a popup with available fields only (name, layer, severity, magnitude, source, timestamp). No data is invented.
- Location search accepts coordinates or place names (Nominatim for interactive search)

## Tile Provider — Required Before Commercial Deployment

No satellite imagery provider or API key was present in the repository.

The current default uses Esri World Imagery raster tiles **as a development placeholder only**.
These tiles are **not** assumed free for commercial production use and must not be used for commercial deployment without a proper license.

A yellow notice is shown on the map when no licensed style is configured.

### What you need to do for production
1. Create an account with a properly licensed provider. Recommended: **MapTiler** (has paid commercial plans; free tier terms must be reviewed for commercial use).
2. Obtain a satellite style URL or MapLibre style JSON.
3. Set one of:
   - `window.FYNX_SATELLITE_STYLE = 'https://api.maptiler.com/maps/satellite/style.json?key=YOUR_KEY';` before the map loads, or
   - `<meta name="fynx-satellite-style" content="https://api.maptiler.com/maps/satellite/style.json?key=YOUR_KEY">` in the page head.
4. Prefer a backend proxy so the key is never exposed in frontend code.
5. Confirm the provider's terms allow commercial use on fynxfinanceworld.com.

### Other options
- Mapbox (requires access token and billing)
- Any other properly licensed satellite tile provider compatible with MapLibre

## Files
- `assets/js/terminal/satellite-map.js` — satellite mode, switcher, clustering, search, popups
- `docs/SATELLITE-MAP.md` — this file
- `terminal.html` — single script include added; original command prompt restored

## Verification status
- Flat and Globe rendering code was not edited
- GitHub Actions on PR #265 passed (prior commits)
- Full browser testing of all three modes was **not** executed in this environment
- Production build was **not** executed in this environment

## Remaining blockers
- Licensed satellite tile key must be supplied before commercial deployment
- Browser verification of Flat / Globe / Satellite switching, marker clicks, and mobile layout is still required
- Some reference layers depend on `W.intelData.ref` being loaded
