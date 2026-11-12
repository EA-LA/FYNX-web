# FYNX — owner setup checklist (keys and switches only the owner can add)

Everything below is already built into the site. Each item switches on when its secret or setting is added.
Add secrets in GitHub: **EA-LA/FYNX-web → Settings → Secrets and variables → Actions → New repository secret**.

| # | What it turns on | Secret / setting | Where to get it | Cost |
|---|---|---|---|---|
| 1 | **FYNX Intelligence written analysis**: overview, why it matters, bullish/bearish cases, risks on every Intelligence page (`/intelligence/`). Without it, pages show reported headlines plus FYNX's computed market data. | `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | Paid per use; at most 30 new stories every 2 hours (Haiku model by default; change with the `INTELLIGENCE_MODEL` variable) |
| 2 | **Order book & position book** in the Terminal (`BOOK`) and on Edge Radar pages | `OANDA_API_TOKEN` (optional `OANDA_ENV` = `live` for a live account; practice is the default) | oanda.com → open a free practice (demo) account → Manage API Access → Generate token | Free |
| 3 | **Live ships and tankers** on the Terminal WORLD globe | `AISSTREAM_API_KEY` | aisstream.io → sign in with GitHub → API keys | Free |
| 4 | **Vercel preview limit** ("Resource is limited – try again in 24 hours") | Data branches now carry a `vercel.json` that turns off Vercel deployments for them. If it still happens: Vercel → project fynxfinanceworld → Settings → Git → ignore branches `terminal-data`, `macro-data`, `world-data`, `research-data`, `status-data`, `tmp/*` | vercel.com | — |
| 5 | **FYNX Intelligence publishing** commits pages to `main` every 2 hours as a bot. If branch protection blocks it, the "Publish FYNX Intelligence" workflow fails; allow GitHub Actions to push to `main` or add a bypass for it. | Repository rules | GitHub → Settings → Rules / Branches | — |
| 6 | **My accounts** (broker/prop-firm connections, account monitoring, Performance Coach data at `/profile/accounts`). The page shows "not available on this host yet" because `www` is static GitHub Pages and the accounts API (`/api/accounts/*`, `backend/accounts`) is not deployed anywhere. | Deploy the accounts service (see `docs/accounts.md` and `docs/accounts-api.md`) with its database and encryption secrets, then route `/api/accounts/*` to it (e.g. Cloudflare route or a Vercel project on the same domain). | Your hosting | Depends on host |

Housekeeping: leftover test branches that can be deleted in GitHub → Branches:
`tmp/probe`, `tmp/world-live`, `tmp/check-live`, `tmp/intel-out`, `claude/terminal-world`, `claude/terminal-desks`, `claude/terminal-screens`.
Keep `terminal-data`, `macro-data`, `world-data`, `research-data`, `status-data` (live data).

Not available from any lawful free source (not built): bank research notes and bank trade ideas; implied policy-rate paths for central banks other than the Fed (needs paid OIS data).
