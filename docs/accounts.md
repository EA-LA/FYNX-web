# My Accounts — implementation and operation

My Accounts adds a private trading-account workspace to Finance World. The website reads observations and calculates analytics; it never places, modifies, closes or transfers a trade. Existing public page layouts are preserved. Quant Analyst and Edge Radar navigation entries are additions to the existing navigation.

## Current delivery boundary

The user chose **an existing backend they will identify**. That repository/service/database has not yet been supplied. The SQLite implementation is a local integration adapter; it is not an approved production persistence choice. Production deployment, paid service provisioning, real broker credentials, real account connection and email delivery have not been performed. Static hosting alone cannot run the account API, jobs, private server rendering or live updates.

The four Accounts HTML design-reference files were not available in the supplied downloads. `Main.dc.html` present on this computer was the Edge Radar reference. The Accounts layout implements the detailed written brief and existing FYNX terminal palette. Do not claim pixel parity with an unseen reference or redesign the existing homepage.

## Features and boundaries

- Private routes: `/profile/accounts`, `/profile/accounts/connect`, individual provider forms, `/profile/accounts/:accountId`, `/profile/security`, privacy and administrator rule editing.
- Firebase identity is verified on the server before creating an opaque, revocable HttpOnly Accounts session. CSRF and exact-origin checks protect mutations. Sensitive actions require recent authentication.
- CSV and native MT4/MT5 HTML statements are parsed in bounded background workers. Users choose the broker time zone and review up to twenty normalized records before committing. The source upload is removed after parsing; temporary previews and exports expire.
- Normalized account observations, positions, cash flows, executions and round trips have explicit coverage. Partial closes, scale-ins, hedges and reversals are covered by known-answer tests. Unknown equity, original risk, conversion rates, reset baselines and entry evidence remain unavailable.
- The dashboard reads a materialized, owner-scoped database view. SSE invalidations refresh it without blocking page requests on brokers. Active cloud connections poll on a bounded schedule; imports retain their statement dates.
- FTMO current and legacy rule versions preserve official source links and applicability. Other requested firms are explicitly unverified. Custom rules remain user-declared. Deposits do not count as target profit; sparse observations do not certify challenge compliance.
- Plan checks use observed facts. Saved strategy matching requires an explicit binding or owner-controlled manual assignment. Coaching and live/backtest comparisons require at least twenty relevant trades.
- Security includes write-only credential replacement, immediate local disconnection, remote cleanup status, JSON/CSV exports, hard deletion tracking, sessions, audit history and configurable alerts. Email readiness and delivery acceptance are reported separately.
- The standalone `FynxAccountMonitor.mq5` only reports data. It contains no order or position management. The existing Quant trading-EA export remains a separate, explicitly chosen product flow.

## Local run

Use Node 24 or a supported Node 22 release with `node:sqlite` (22.13 or later). The SQLite runtime currently emits an experimental-feature warning; it is not a production backend endorsement.

```sh
npm ci
npm run build
npm run test:accounts
npm run typecheck:accounts
npm run lint:edge:setup
npm run lint:accounts
```

For a normal local service, populate an ignored `.env` from `.env.example` with the existing Firebase project/server credentials and private storage paths, then run:

```sh
node --env-file=.env scripts/quant-dev-server.cjs
```

Open `http://127.0.0.1:4174/profile/accounts`. The public Firebase configuration in `auth/firebase.js` and server project verification must refer to the same approved project. Use workload identity or application-default credentials in the selected backend; do not put a service-account secret in a browser bundle or a public directory.

The private database parent directory must have mode `0700`; database/WAL/SHM files are restricted to `0600`. Production needs an approved database adapter, migrations, durable worker leases, storage encryption, monitoring and backup/restore deletion policy. Repository methods and SQL are the integration seam to adapt, not a promise that swapping one environment variable migrates databases.

For an isolated browser acceptance test without real credentials:

```sh
npm run build:accounts
npm run dev:accounts:qa
```

Open `http://127.0.0.1:4175/profile/accounts/connect`. This harness is loopback-only, refuses `NODE_ENV=production`, injects a test identity through constructor options, disables all cloud connectors/mail, uses a disposable private database and labels every page **LOCAL TEST**. It starts empty. Import `tests/accounts/fixtures/mt4-statement.html` as MT4 HTML, USD, `Europe/Prague`. It should show three closed trades, $70 closed profit and $10,070 reported balance/equity. Today P&L and original R remain unavailable. The harness and fixtures are excluded from the public site package.

## Credentials and provider setup

See [the provider source and permission audit](accounts-providers.md) for exact endpoints, proof predicates and terms findings. Every cloud connector defaults off.

| Connection | Required operator/user setup | Current implementation status |
| --- | --- | --- |
| CSV / MT statements | A genuine exported statement; broker time zone and currency | Functional server parsing, preview and import; no cloud provider cost |
| Fynx EA | Existing owner-scoped reporting token, compiled standalone monitor, explicit broker IANA time zone | Functional reporting protocol and account linkage; native MQL compilation and live terminal acceptance remain release checks |
| MT4 / MT5 | [MetaApi account](https://app.metaapi.cloud/), server-only MetaApi token, approved region, investor password | Adapter implemented; both `investorMode === true` and `tradeAllowed === false` required; live service acceptance not performed |
| Binance Spot | [Binance API management](https://www.binance.com/en/my/settings/api-management), read-only key/secret, supported region, requested history symbols | Permission-checked adapter; native asset/quote balances are not presented as whole-portfolio USD equity |
| Bybit Unified | [Bybit API management](https://www.bybit.com/app/user/api-management), read-only key/secret, supported region | Permission-checked USDT scope; USDT is never relabeled USD |
| OANDA | Official [v20 authentication documentation](https://developer.oanda.com/rest-live-v20/authentication/) | Gated: personal tokens do not establish the required read-only permission boundary |
| cTrader | [Open API application](https://openapi.ctrader.com/), approved accounts-only authorization | Gated pending an approved PKCE and secret-safe token exchange; no invented OAuth implementation |
| Interactive Brokers | [Official third-party API onboarding](https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/) | Gated pending vendor/compliance approval and a verified read-only authorization flow |
| DXtrade / TradeLocker / Match-Trader | Broker/platform developer authorization and positively verified read-only credentials | Gated; a trading-capable token is never accepted merely because this code calls read endpoints |

A rule configuration marked `verified` means the mathematical rule source was checked. It does **not** mean a firm approves third-party account access. The cloud-connection gate separately requires `ACCOUNTS_APPROVED_PROP_FIRMS` and a recorded permission source/date in `ACCOUNTS_PROP_TERMS_PROOFS_JSON`. FTMO's [personal-use restrictions](https://ftmo.com/en/forbidden-trading-practices/) and FundedNext's [CFD terms](https://fundednext.com/api_docs/cfd-challenge-terms) require particular attention. No approval is claimed.

## Cloud MT cost

Checked on 2026-11-03: [MetaApi's public pricing](https://metaapi.cloud/) lists a regular subscription at **$30/month excluding VAT/GST**, includes one MT account, and adds pay-as-you-go API charges. The usage-price section was unavailable. A defensible all-in monthly price per connected account cannot be quoted from that page.

Budget formula: **$30 / active billable accounts + measured account/API usage + hosting/storage + applicable tax**. Subscription allocation alone is $30 for one account, $3 per account across ten, or $0.30 across one hundred; these are not total provider quotes. Obtain the actual usage schedule and test utilization before choosing a customer price or enabling paid access. An inactive/deleting remote account can still cost money until provider removal is confirmed.

`ACCOUNTS_FREE_CONNECTION_LIMIT` defaults to one and `ACCOUNTS_MAX_ACCOUNTS` to twenty. A server-owned entitlement resolver can set a higher approved plan limit. Client-declared plans never authorize additional paid connections. Existing billing must be mapped after the chosen backend is identified; no subscription or charge was created by this task.

## Encryption and privacy operations

Credential envelopes use AES-256-GCM with a fresh data key per record, bound to owner, provider and connection through authenticated data. Production wrapping uses GCP Cloud KMS through workload identity/ADC. The local environment-key wrapper is explicitly refused in production. The website and staff views never reveal stored credentials. When MetaApi holds the investor password, FYNX drops that password and retains the provider account reference.

Disconnect first fences new writes and deletes the local credential. Remote cleanup is a separately tracked operation and may require retry or manual exchange-key revocation. Do not report provider deletion complete before its acknowledgement. Hard deletion removes account records and derived copies, while a minimal receipt records completion. Export files and notification payloads are covered by deletion. Provider-side retention and deployment backups must have explicit deletion/retention policies before launch.

A nonsecret presence cookie tells the existing global sign-out flow whether an Accounts session needs revocation; it never grants access. Sign-out waits for confirmed revocation before broadcasting success. Account identity changes serialize cookie mutations and discard late responses. Private markup is cleared on `pagehide`; back/forward-cache restoration reloads authentication.

## Alerts and email

Observed daily/max-loss usage can trigger 50/75/90% thresholds; target and high-impact event alerts require sufficient current data. Preferences are user-scoped. Mail uses the existing Mailgun configuration behind `ACCOUNTS_EMAIL_SEND_ENABLED=false` by default, plus explicit user opt-in for alerts. Transactional deletion receipts require the configured mail transport. Provider acceptance is not mailbox delivery. Tests inject the mail transport; no real email was sent during this work.

## Adding a provider or rule version

Implement the canonical `AccountProvider` contract in `lib/accounts/types.ts` through an isolated backend adapter. Restrict requests to fixed HTTPS origins and allowed methods/paths; refuse redirects. Add permission-introspection tests for missing, unknown, trading, withdrawal and transfer permissions. Fail closed before history import when read-only proof is absent. Include timeouts, bounded pagination, shared quotas, circuit breaking and removal semantics.

Add a rule JSON with source URLs, plan/phase applicability, verification date and an evidence-backed effective date. Use `effectiveFrom:null` when a source only establishes the rules observed today. Do not fabricate an effective date. Administrator writes require the verified `accountsAdmin` Firebase claim and a strict schema. Custom owner rules remain unverified. Add known-answer tests across reset/DST boundaries and all affected loss/consistency definitions.

## Release checks still requiring the actual environment

Identify the existing backend and database, implement its persistence/queue/KMS/billing bindings, configure same-origin API and private page routing, and validate real Firebase authentication there. Verify provider and firm permissions, account/API costs, selected regions and redistribution terms. Then perform real read-only provider acceptance with user-controlled credentials, native monitor compilation, live terminal reporting, opted-in mail acceptance, backup deletion/restore tests, and physical iPhone/Safari testing.

The browser evidence is desktop and 360/390/430 CSS-pixel Chromium testing. It does not establish a physical-device result or a Lighthouse score. Do not claim the requested Lighthouse performance/accessibility thresholds until an actual Lighthouse report exists.

## Validation of the integrated source

The Accounts branch includes main `263d4b12c91804e9c31c3540c70a8d6c5b40328d` through the Quant/Edge integration. `home.html` and fifteen shared design, news, reader, Your News and market assets preserve that revision, with release URL versions updated to `20261103-r2`. Existing header CSS is retained in full; the feature badge is appended. The shared workspace navigation adds Quant Analyst and Edge Radar. Profile keeps opening the existing `/profile.html`, which contains an additive My accounts link. See [the file comparisons](evidence/accounts-design-preservation.json).

The final integrated test runs passed 101 Accounts tests, 78 Edge tests, 113 Quant tests and 111 shared terminal/news/reader/release tests. Existing site authentication, MFA, journal, session, advertising and business-profile checks also passed, along with full build, lint, strict TypeScript, static packaging and discovery of 188 public pages. Test fixtures and private source directories are excluded from discovery, release rewriting and the static package.

The [browser report](evidence/accounts-browser-validation.json) records statement upload → preview → commit → dashboard → export → disconnect → deletion, seven zero-violation axe audits, and responsive bounds. Screenshots use explicitly disclosed local fixtures; they are not real connected broker accounts. The [cached loader benchmark](evidence/accounts-ssr.json) is an in-memory local measurement, excluding network and production authentication. The existing-home screenshot validates navigation and layout on a static preview; its market APIs are intentionally unavailable because the preview has no backend.

## Public website release scope

The owner authorized publishing these additions on 2026-11-03. The custom domain is served by GitHub Pages from `main`, behind Cloudflare; the separate Vercel build is not proof of custom-domain publication. Generated pages and browser assets must be committed before merging. Release version `20261103-r2` refreshes shared navigation assets in browsers.

This static release publishes the pages and navigation. It does not run `/api/quant`, `/api/edge` or `/api/accounts`. Quant preserves device-local saved research and imported return workflows, while missing market history stays unavailable. Accounts detects a missing/non-JSON service response and shows a clear availability notice with a link to the existing Profile; it never displays credential forms before a successful service response. Edge Profile controls also require a successful service read. Live research feeds, private imports/sync and broker connections remain dependent on integration with the owner's still-unidentified existing backend.
