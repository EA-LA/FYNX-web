# My Accounts implementation plan

Baseline: `feature/my-accounts` starts at Edge Radar `99f1cc47f1828d301a63d3c3e7c837f07a4385d2`, stacked on Quant Analyst. The current checkout is clean and the existing site is build-generated static HTML, vanilla browser modules and CSS, with Firebase browser identity and a persistent Node API for Quant/Edge. `scripts/build-static.js`, `scripts/quant-dev-server.cjs`, `backend/quant/auth.cjs`, `backend/edge/{api,identity,snapshot}.cjs` establish these boundaries. Production is not deployed by this work.

## Accepted credential correction

Never request or store master/trading passwords. Read-only investor credentials, read-only API keys and OAuth tokens may be stored encrypted, write-only to the UI, with no staff reveal operation and user-controlled deletion. When an upstream service holds the investor password, retain only its external account ID. A label, user checkbox, or a local GET-only allow-list does not establish a read-only credential: the adapter must positively verify the credential cannot trade or withdraw. Unsupported permission models stay disabled. Ordinary support staff must have no key-decrypt IAM permission; encryption alone cannot prevent a compromised privileged runtime from accessing credentials.

## Implementation boundaries and files

- `lib/accounts/`: typed provider/normalized-data contracts; strict statement parsers; symbol mapping; deal-to-trade grouping; metrics; versioned challenge rules; fact-based plan checks; minimum-sample coaching. `config/prop-firms/`: sourced FTMO versions and explicitly unverified other-firm records.
- `backend/accounts/`: private SQLite WAL database with foreign keys and parameterized owner-scoped repositories; sessions/CSRF/limits; envelope encryption; audit; imports; durable synchronization jobs; provider adapters; account service/API; SSE updates and server-render data reads. No provider network fetch is allowed in a dashboard render.
- `assets/js/accounts/`, `assets/css/accounts.css`, `content/accounts.fragment`, `scripts/build-accounts.cjs`: choose/connect/dashboard/security screens, shared site navigation, progressive HTML rendering, accessible charts, phone layouts, credential forms and real import preview.
- Shared integration only in build/static packaging, private route mapping, Profile navigation, Quant step 06 and Edge guard. Existing public research, billing, authentication flows, advertising policy and Firebase rules remain in place.
- `scripts/accounts-runner.cjs`: durable polling/history/deletion/receipt work. `tests/accounts/`: pure calculation, parser, provider contract, security, API/integration and frontend regression tests, with test-only fixture files. `docs/accounts.md`, provider research and validation evidence accompany the feature.

## Database and sync

Private database tables cover connections, accounts, snapshots, positions, raw deals, round-trip trades, import previews, credentials, sessions, OAuth states, provider jobs, audit records, requests, user settings, strategy bindings, rule versions and alerts. User/account/connection identifiers are random, with explicit ownership in every read and write. Credentials and private data are excluded from Git and the public package. SQLite WAL targets one persistent service host; horizontal scale requires a transactional shared store and shared quotas.

Workers own provider calls, imports and synchronization. Jobs carry an account/connection generation so a late worker cannot repopulate a disconnected or deleted account. Active dashboards request 5–15 second synchronization, background work is bounded to five-minute checks and nightly history; configured provider quotas take precedence. SSE emits only current-user persisted state and closes on session expiry/revocation. A cached account dashboard can render even when a provider is unavailable, with its last-good timestamp and delayed state.

## Security design and threat assumptions

The user selected an existing backend they will identify. Its repository/service/database is pending clarification. Firebase sign-in is retained; the Node/SQLite implementation described here is the local test adapter, not an approved production hosting decision. Storage and jobs stay behind interfaces so the confirmed existing backend can be integrated. The intended service is internet-facing, multi-user, stores sensitive financial account data, and performs no trading. No real credential entry, external provider account provisioning, paid subscription, production deployment or live trade is authorized in this implementation turn.

Fresh verified Firebase identity bootstraps an opaque HttpOnly SameSite session. Production cookies are Secure; local HTTP is restricted to explicit loopback development. Connect, replace, exports and deletion require recent authentication. Mutations require an allowed same-origin request and a session-bound CSRF token; queries are scoped to verified identity. Server schemas bound strings/files/rows, reject unknown fields and return safe error codes instead of raw upstream exceptions. Credentials never enter URLs, browser storage, bundles, analytics or logs.

AES-256-GCM encrypts each credential with a random per-record data key; a KMS/secret-manager key wraps that data key. Associated data binds owner, connection, provider and version. A local environment wrapping key is allowed only in explicit development; production fails closed without configured key management. Provider endpoint allow-lists reject arbitrary URLs, redirects and trading methods; credential permission checks are mandatory before account import. Write-only credentials are removed immediately on disconnect. Provider cleanup has a durable retry record and does not claim external revocation before confirmation. User data deletion hard-deletes scoped data and derived Edge copies, cancels workers, and queues an optional receipt without claiming email delivery.

| Threat | Abuse path | Planned control and verification |
| --- | --- | --- |
| Cross-user disclosure | Guess account/import/export/SSE IDs | Random IDs plus owner checks in every repository operation; two-user tests |
| Credential theft | Logs, errors, XSS or leaked database | Envelope encryption/AAD, allow-listed logging, no reveal APIs, escaped text/strict CSP, secret-canary tests |
| Trading-capable access | Submit master password or broad API token | Positive upstream permission proof; reject and clean up; capability contract tests |
| CSRF/session abuse | Cross-site connect/delete/export | Origin checks, session CSRF, recent-auth gates, revoked-session tests |
| Parser/SSRF abuse | Malicious HTML/CSV/oversized upload or provider URL | No script execution/external HTML loads, size/row limits, formula-safe CSV exports, fixed provider hosts and endpoint allow-lists |
| Deletion race | Slow worker writes after disconnect/delete | Generation fencing, transactional tombstones/cancellation, retry cleanup tests |
| False compliance/results | Incomplete history or unknown stops/timezones | Coverage flags and withheld metrics; source/versioned rules; known-answer and DST/partial-close tests |
| Cost/availability abuse | Repeated expensive connect or sync | Server entitlements/connection quotas, durable claims, bounded workers, backoff/circuit breaker, request limits |

This is the implementation security design. The final repository-grounded threat report will distinguish implemented controls from deployment assumptions, including KMS IAM, retention/backup deletion, provider terms and commercial entitlements.

## Provider and rule gates

File import and the existing opt-in EA are the local verification paths. MT4/MT5 use a swappable MetaApi-style adapter only when configured and explicitly enabled with positive investor/read-only verification. Binance/Bybit require authoritative key-permission checks. cTrader/IBKR OAuth need official read-only scopes and supported security parameters; an unsupported PKCE flow or commercial access requirement remains a visible release gate. OANDA personal tokens are not presumed read-only. DXtrade/TradeLocker/Match-Trader stay unavailable unless retail access and read-only verification are proven. Every provider is off by default except file import and the user-controlled existing EA path. No provider connection cost is incurred by tests.

FTMO rule versions retain source URL, observed date/effective-date evidence and current/legacy distinctions. Other prop firms start `verified:false` with empty rule values; user-entered overrides are clearly labeled. No firm permission or partnership is inferred from public marketing. Terms and per-account service prices are researched from primary sources and reported separately from technical adapter readiness.

## Eight reviewable phases

1. Routes/navigation, all visible UI states and database-backed private shells.
2. Provider contract, real file import with 20-row preview, normalization/grouping and imported-data dashboard.
3. Envelope encryption, audit, sessions, disconnect/delete/export and Security.
4. MT4/MT5 adapter with read-only verification, bounded history and positions.
5. Flagged exchange/OAuth adapters and honest unavailable providers.
6. Versioned prop rules, progress/alerts, EA/Edge/Quant account integration.
7. Fact-based plan checks, explicit strategy bindings, minimum-sample comparisons and coaching.
8. Full relevant tests, security review, browser desktop/360–430 px flows, performance/accessibility evidence and setup docs.

Commits are made after each phase. Test fixtures never appear in production; test authentication is constructor-injected in test harnesses, not a deployable bypass flag. CUA browser testing will exercise a full statement import, dashboard, disconnect/delete/export and error states using labeled test accounts. Real provider acceptance, real email delivery, native terminal operation, physical iPhone/Safari and production performance remain separate evidence categories.
