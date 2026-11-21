# FYNX Satellite Map — Tile Source & Licensing

## Status
No satellite imagery provider or API key was present in the repository at the time of implementation.

## Implementation
- Engine: **MapLibre GL JS** (v4.7.1, loaded from unpkg)
- Mode: third option in the World Desk switcher (`FLAT | GLOBE | SATELLITE`)
- Existing Flat Map and Globe Map code paths are left untouched
- Intelligence layers continue to come from the existing `world-intel.js` / `intel-layers.json` system

## Tile Source
The default style uses Esri World Imagery raster tiles as a **development placeholder only**.

**Important:** These tiles are not assumed to be free for commercial production use. Before deploying to production:

1. Choose a properly licensed satellite provider with a suitable free tier or paid plan, for example:
   - **MapTiler** — free tier available; satellite style: `https://api.maptiler.com/maps/satellite/style.json?key=YOUR_KEY`
   - Other commercial providers (Maxar, Planet, etc.) as needed
2. Set the style via `window.FYNX_SATELLITE_STYLE` before the map mounts, or proxy tiles through your own backend so the key is never exposed in the browser.
3. Update attribution accordingly.

## Configuration
```js
window.FYNX_SATELLITE_STYLE = { /* MapLibre style object or style URL */ };
```

## Files added
- `assets/js/terminal/satellite-map.js` — isolated satellite mode
- `docs/SATELLITE-MAP.md` — this file

## Next steps for production
- Supply a licensed tile style / key
- Optionally extend marker rendering in `satellite-map.js` to plot the existing intelligence layers on the MapLibre map (data is already available via `W.intelData`)
- Run full browser tests of all three modes
