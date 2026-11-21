# FYNX Satellite Map — Production Requirements

## Overview
Third map mode for FYNX World Desk: **FLAT | GLOBE | SATELLITE**.

- Engine: MapLibre GL JS 4.7.1 (CDN)
- Existing Flat Map and Globe Map code paths are **not modified**
- Three-way switcher is injected into the existing World Desk tools bar
- Intelligence markers are plotted as clustered GeoJSON circles
- Clicking a marker opens a popup with available fields only
- Location search accepts coordinates or place names

## MapTiler configuration (exact)

### What to create
1. Sign up at https://www.maptiler.com/
2. Open **Account → Keys** and create an API key.
3. Restrict the key:
   - Allowed HTTP referrers: `https://www.fynxfinanceworld.com/*`, `https://fynxfinanceworld.com/*`, and any preview host you use.
   - Do not leave the key unrestricted.
4. Choose a commercial plan that covers your expected map loads. The free tier is not assumed suitable for commercial production — confirm MapTiler's current terms.

### What the app expects
A MapLibre style URL or style object. The satellite style is:

```
https://api.maptiler.com/maps/satellite/style.json?key=YOUR_MAPTILER_KEY
```

### Secure configuration (preferred)
Do **not** put the key in committed source or in a public meta tag if you can avoid it.

Preferred order:
1. **Backend proxy** (best). Store the key in a server-only environment variable (`MAPTILER_API_KEY`). Serve tiles or the style through your own origin so the browser never sees the key.
2. **Domain-restricted key** (acceptable if proxy is not ready). Inject the style URL at runtime from a non-committed config:
   ```html
   <meta name="fynx-satellite-style" content="https://api.maptiler.com/maps/satellite/style.json?key=YOUR_KEY">
   ```
   or
   ```js
   window.FYNX_SATELLITE_STYLE = 'https://api.maptiler.com/maps/satellite/style.json?key=YOUR_KEY';
   ```
   Restrict the key to your domains in the MapTiler dashboard. The key is still visible to the browser, but MapTiler will reject requests from other sites.

Never commit the key. Never paste it into a public repository, issue, or PR comment.

### Until a key is set
The map falls back to Esri World Imagery as a **development placeholder** and shows a yellow notice. That source is not approved for commercial deployment.

## Files
- `assets/js/terminal/satellite-map.js`
- `docs/SATELLITE-MAP.md`
- `terminal.html` (script include only)

## Verification status
- GitHub Actions on the latest commit: **passed** (tree safety, world-intel headline, terminal heatmap, headline, tour, scanner, portfolio)
- Flat and Globe source code: **not modified**
- Production browser testing: **unavailable in this environment**
- Production build: **not executed in this environment**

## Remaining blockers
- Licensed MapTiler key (or equivalent) must be supplied before commercial deployment
- Browser verification of all three modes, marker clicks, and mobile layout is still required
