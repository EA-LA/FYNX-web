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

Style used:
`https://api.maptiler.com/maps/satellite/style.json?key=...`

## Runtime load order
1. `window.FYNX_SATELLITE_STYLE`
2. `<meta name="fynx-satellite-style">`
3. `GET /assets/config/satellite.json`
4. Safe blank background with a configuration notice (no unlicensed fallback imagery)

## Checks
- `scripts/test-satellite-config.cjs` — config shape and map init contract
- `.github/workflows/satellite-config-check.yml` — runs that check on PRs

Flat and Globe source files are not modified.
