# FYNX Satellite Map — MapTiler production configuration

## Hosting
The site is GitHub Pages (`CNAME` = `www.fynxfinanceworld.com`).
Publishing from a branch does **not** read Actions secrets.

The deploy workflow `.github/workflows/deploy-pages-satellite.yml`:
1. Reads `MAPTILER_API_KEY` from Actions secrets
2. Writes `assets/config/satellite.json` into the deploy artifact only
3. Publishes with `actions/deploy-pages`

The key is never committed. `.gitignore` excludes `assets/config/satellite.json`.

## One-time Pages setting (required)
Settings → Pages → Build and deployment → Source: **GitHub Actions**.
Until that is set, the secret is not injected into the live site.

## MapTiler key restrictions
In MapTiler → Account → Keys → FYNX Satellite Map, allow:
- `https://www.fynxfinanceworld.com/*`
- `https://fynxfinanceworld.com/*`
- any preview host you use

## Base maps (MAP ▾ menu in Satellite mode)
The same key serves every MapTiler standard map. The menu offers Satellite, Satellite + labels, Intelligence dark/light
(Dataviz), Streets, Streets dark, Base, Topographic, Terrain (Outdoor), Ocean, Landscape, Winter, Toner, Backdrop,
Aquarelle and OpenStreetMap. MapTiler is renaming styles (`satellite` → `satellite-v4`, `streets-v2` → `streets-v4`…),
so each entry tries the current id first and then the older one, checking that `style.json` loads before switching.
A style the key cannot load is greyed out ("not enabled for FYNX's MapTiler key") and the map stays as it was.
The choice is saved as `fx-term-world-map-style`, so it follows the signed-in account.

Every base map draws the same layers as the Globe, from the same records and the same layer switches: country lights,
countries with live conflict reports (hatched), long-running conflict areas, every event and reference layer with its
own icon and severity ring (pulsing for high severity), pipelines by kind, sea routes, chokepoints with live ship counts,
and every AIS ship at every zoom. Clicking an event or site opens the Globe's own event card.

## World search
The toolbar search (Flat, Globe and Satellite) finds countries, live events, reference sites (bases, nuclear sites,
ports, airports, dams, exchanges, data centers, spaceports, pipelines, conflict areas), chokepoints, ships (name, MMSI or
destination), layer names and coordinates (`lat, lon`), then places worldwide through MapTiler geocoding with the same
key (OpenStreetMap Nominatim when no key is configured). When nothing in FYNX's data matches, it says so before listing
places.

## Runtime load order
1. `window.FYNX_SATELLITE_STYLE`
2. `<meta name="fynx-satellite-style">`
3. `GET /assets/config/satellite.json`
4. Safe blank background with a configuration notice (no unlicensed fallback imagery)

## Checks
- `scripts/test-satellite-config.cjs` — config shape and map init contract
- `scripts/test-satellite-browser.cjs` — modes, layer parity, search and popup escaping (mock map engine)
- `scripts/test-terminal-markets-plus-e2e.cjs` "WORLD satellite" tests — the real terminal page on the real MapLibre
  engine (set `MAPLIBRE_DIR` to `maplibre-gl/dist`): style fallbacks, every overlay accepted, search, iPhone layout
- `.github/workflows/satellite-config-check.yml` — runs that check on PRs

Flat and Globe drawing stay in `world.js`; `world-intel.js` only exports its icon set and a layer switch for the map.
