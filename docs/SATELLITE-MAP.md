# FYNX Satellite Map — MapTiler production configuration

## What is implemented
The Satellite Map loads its tile style at runtime. The key is never stored in git.

Load order:
1. `window.FYNX_SATELLITE_STYLE` (if set before the map mounts)
2. `<meta name="fynx-satellite-style">`
3. `GET /assets/config/satellite.json` (preferred for this site)
4. Development placeholder (Esri) with a yellow notice — not for commercial use

Expected MapTiler style:
```
https://api.maptiler.com/maps/satellite/style.json?key=YOUR_MAPTILER_KEY
```

## Exact hosting steps (GitHub Pages / static host)

The site is served from the repository (CNAME `www.fynxfinanceworld.com`). GitHub Pages cannot inject secrets at request time, so the key must be written into a non-committed config file at deploy time, or uploaded once.

### 1. Restrict the MapTiler key
In MapTiler → Account → Keys → FYNX Satellite Map:
- Allowed HTTP referrers:
  - `https://www.fynxfinanceworld.com/*`
  - `https://fynxfinanceworld.com/*`
  - any preview host you use
- Do not leave the key unrestricted.

### 2. Store the key as a hosting secret
GitHub → EA-LA/FYNX-web → Settings → Secrets and variables → Actions → New repository secret:
- Name: `MAPTILER_API_KEY`
- Value: the MapTiler key (not the full URL)

### 3. Deliver the config at runtime
The map fetches this file (not in git):
```
/assets/config/satellite.json
```

Contents (generated, never committed):
```json
{
  "style": "https://api.maptiler.com/maps/satellite/style.json?key=YOUR_MAPTILER_KEY"
}
```

How to generate it on deploy without committing it:
```bash
mkdir -p assets/config
printf '{"style":"https://api.maptiler.com/maps/satellite/style.json?key=%s"}\n' "$MAPTILER_API_KEY" > assets/config/satellite.json
```
Run that step in the deploy job after checkout and before the Pages upload. The file is then served to the browser; the key is domain-restricted in MapTiler so other sites cannot reuse it.

### 4. One-time manual option (if you are not using a deploy job yet)
Upload `assets/config/satellite.json` with the same JSON to the live host. Do not add it to the repository.

## Verification
- Flat and Globe source code are unchanged
- Browser testing of the three modes is not available in this environment
- After the config file is live, open Terminal → World Desk → SATELLITE. The yellow notice should be gone and MapTiler imagery should load.
