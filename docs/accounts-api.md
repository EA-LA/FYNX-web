# My Accounts API contract

All `/api/accounts/*` responses are private (`Cache-Control: no-store`). Credentials never appear in response records, job metadata, exports, audit events or URLs. API errors use `{error:{code,message},requestId}` with a safe user-facing message. Unknown and foreign-owned IDs both return `404 NOT_FOUND`. UTC timestamps are ISO strings; all monetary data retains its account currency and nullable USD conversion/coverage fields from `lib/accounts/types.ts`.

## Session and CSRF

`POST /api/accounts/session`, `Authorization: Bearer <Firebase ID token>`, JSON `{}` and an allowed `Origin` creates a new opaque HttpOnly session. The Firebase token must have a recent `auth_time` (five minutes); refreshing a token is not reauthentication. Production uses a Secure SameSite=Lax cookie. Explicit loopback development uses a separate non-Secure cookie name. The server stores only the session token hash.

```json
{"user":{"uid":"verified-firebase-uid","emailVerified":true},"session":{"id":"uuid","expiresAt":"2026-11-04T09:00:00.000Z","recentAuthUntil":"2026-11-03T21:05:00.000Z"},"csrfToken":"opaque-session-bound-value","serverTime":"2026-11-03T21:00:00.000Z"}
```

`GET /api/accounts/session` restores the same safe session envelope and CSRF value. Keep `csrfToken` only in module memory. Send `X-CSRF-Token` plus `Content-Type: application/json` and same-origin credentials for every mutation. `POST /api/accounts/session/reauth` additionally sends a fresh Firebase bearer token for the same user; it rotates the account session and updates the recent-auth window. Connect, credential replacement, export creation/download and deletion require recent authentication. `DELETE /api/accounts/session` ends the current Accounts session. Accounts sessions are scoped to this service; revoking one does not claim to revoke every Firebase device session elsewhere on the site.

## Read APIs and server rendering

- `GET /providers` → `{providers:[{id,name,kind,enabled,configured,status,reason,helpUrl,...}]}`. Disabled providers remain explicit; no credentials are requested for an unavailable provider.
- `GET /accounts` → `{accounts:[AccountCard],selectedAccountId}`.
- `GET /dashboard?accountId=<uuid>&range=all|30d|7d` → `{accounts,selectedAccountId,dashboard,empty,serverTime}`. `dashboard` is the pure `buildDashboard` result, or null for no accounts. It is loaded solely from persisted records. A provider outage preserves the last good data/status.
- `GET /jobs/:id` → `{jobId,status,stage,progress,createdAt,updatedAt,result,error}`. Status is queued, running, complete, failed or cancelled; safe result contains IDs/counts, never raw credentials or uploaded source.
- `GET /imports/:id` → `{importId,status,preview,jobId}`. Preview contains the first 20 normalized trade/deal rows, counts, mapping requirements, source summary and warnings.
- `GET /security` → `{connections,sessions,audit,deletionReceipts}`. Session records contain ID, created/last-active/expiry time, IP and bounded user agent; never session cookies. Audit records have safe action/outcome metadata and no provider payloads.
- `GET /audit?before=<cursor>&limit=50` → `{events,nextCursor}`.
- `GET /events` is cookie-authenticated SSE. Events contain persisted-state invalidations (`{revision,accountId,type,ts}`), not credentials. The client reloads the database-backed dashboard. Session expiry/revocation closes the stream; no bearer token is accepted in its URL.

The adapter exposes `loadPage(req,{page:'dashboard'|'security'|'connect',accountId?,range?})` for root's SSR template, returning `{user,csrfToken,bootstrap}`. It performs no provider calls. The root server supplies the page renderer, with neutral sign-in UI when authentication is absent; private records must never enter generated static HTML. `securityHeaders(req,res)` supplies the response headers used by authenticated SSR routes.

## Connections and synchronization

`POST /connections` (recent auth) accepts `{provider,account,credentials,consent:true}`. `account` includes nickname, kind, firmId/plan/phase/challengeSize when applicable, and timezone. Credential keys are validated against the provider's strict schema. The response is HTTP202 `{connectionId,accountId,job}`. Only the worker calls providers. Progress stages are connect, verify-read-only, import-history and live. Permission verification failure refuses the connection and schedules verified remote cleanup.

`PUT /connections/:id/credentials` (recent auth) accepts `{credentials,consent:true}` and returns a queued job. Credentials remain write-only; safe connection records expose only `{savedAt,configured:true}`. `POST /connections/:id/disconnect` accepts `{confirm:true}` and immediately stops local sync and deletes stored credentials. Response reports `{disconnected:true,cleanupStatus,job}`; remote cleanup is never reported complete until confirmed.

`POST /accounts/:id/activity` accepts `{}` and marks the dashboard active for a bounded interval, scheduling provider-limited 5–15-second polling. Otherwise sync is scheduled no faster than every five minutes, with a nightly history pass. Provider limits and circuit breakers take precedence. `PATCH /accounts/:id/settings` accepts only explicitly supported metadata/risk/rule/binding fields; no user ID, connection ownership or credential reference is accepted.

Server search uses `GET /providers/:id/servers?q=<text>` with fixed provider endpoints and bounded query/cache behavior. OAuth start/callback routes remain unavailable unless the provider registry positively supports the required read-only scope, PKCE and state validation. An endpoint allow-list alone does not prove credentials are read-only.

## File import

`POST /imports/preview` accepts `{format,filename,content,mapping?,currency?,timezone?,account}`. `format` is csv, mt4-html or mt5-html. `content` is text, capped at 5 MB; uploads are never served as HTML or parsed with script/network execution. Response is HTTP202 `{importId,job}`. The parser worker stores only bounded private preview/normalized records. The UI polls the job and reads the preview.

`POST /imports/:id/commit` accepts `{confirm:true}` and returns HTTP202 `{accountId,job}`. The owner-scoped staged import is committed once; source identity/deal IDs prevent duplicate imports. Imported account metrics retain statement/history/cash-flow coverage. Unknown balance, equity, FX or R values remain null.

## Export, deletion and requests

- `POST /exports` (recent auth), `{format:'json'|'csv',accountId?}` → HTTP202 `{exportId,job}`. `GET /exports/:id` (same owner and recent auth) downloads an attachment. JSON excludes credentials/session/OAuth secrets; CSV neutralizes spreadsheet formulas. Exports expire after a short retention window.
- `DELETE /accounts/:id/data` (recent auth), `{confirm:'DELETE'}` removes that account's data and credentials and fences worker writes. `DELETE /data`, `{confirm:'DELETE ALL ACCOUNT DATA'}` applies to all My Accounts records owned by this user. Neither endpoint deletes the Firebase user or unrelated billing records. Both return HTTP202 `{deletionId,job}` until hard deletion/derived-copy cleanup completes.
- Deletion receipts identify completion and email delivery separately. Email sending requires explicit provider configuration and the verified account owner as recipient; lack of configuration must not block deletion or claim delivery.
- `DELETE /sessions/:id` revokes one owner-scoped Accounts session.
- `POST /platform-requests`, `{platform:'bounded name'}` → `{saved:true}`. One vote per user/platform; no message is sent to a third party.

Every queued work item is fenced by connection/account generation and user ownership. A disconnected/deleted account cannot be repopulated by a late worker. The local SQLite implementation targets one persistent host; multi-host operation requires a shared transactional database/queue and provider quota coordination.

## Account cards, rule/settings operations and adapter boundary

`AccountCard` is `{id,connectionId,provider,nickname,kind,firmId,plan,phase,currency,maskedLogin,status,statusSince,lastSyncAt,balance,equity,credential:{configured,savedAt}|null,scope,settings}`. Missing money is null. Provider status is connecting, verifying, syncing, live, delayed, disconnected, needs-relogin or refused; imported records use imported status and their true observation timestamp. `settings` is the safe validated account metadata. `scope` describes partial provider coverage when applicable.

`GET /rules` returns `{firms:[{id,name,platforms,verified}],rules:RuleVersion[]}`. Rules retain source URLs, version and effective-date evidence. `GET /rules/:id` reads a sourced or owner-scoped custom version. `PUT /rules/:id` is reserved for a verified `accountsAdmin` Firebase custom claim and accepts a strict full rule record, never an arbitrary file path. User custom rules instead use `PATCH /accounts/:id/settings` with `customRule`; they remain user-declared and must not acquire an administrator verification label. Account settings also accept `ruleId`, `initialBalance`, `initialBalanceAt`, `phaseStartedAt`, `safetyDailyPct`, and a bounded `bindings` array from the canonical model. `PUT /accounts/:id/trades/:tradeId/strategy` accepts `{strategyId}` and requires both the trade and saved strategy to belong to the current user.

Preview options are explicit: `options:{dateFormat?,costConvention?,historyComplete?,initialBalance?,initialBalanceAt?,statementAsOf?,accountMode?}`. Top-level mapping is canonical-field → source-column header. Server-owned byte/row limits cannot be increased by client options. Imported balances provided by the user remain labeled user-declared.

The user has chosen an **existing backend to be identified**. SQLite and worker threads are the local test adapter, not an agreed production hosting/database plan. The integration boundary is `createAccountsService({repository,jobs,vault,registry,sessions,engine,edgeBridge,...})`; API/SSR callers depend on the service contract, not SQLite. The repository adapter owns scoped persistence/transactions; the job adapter owns durable leasing and generation fencing; the vault owns credential envelope operations. A production adapter must preserve the same ownership, revocation, deletion and concurrency guarantees on the identified backend. No new infrastructure is deployed by this work.

## Implemented local limits, alerts and Edge integration

The factory is `createAccountsAPI({service,sessions?,verifyIdentity?,validateSession?,env?,now?,logger?})`; service construction is `new AccountsService({repository,jobs?,vault?,registry?,engine?,quantStore?,edgeStore?,env?,now?,connectionLimitResolver?,resolveRecipient?,fetchImpl?,startJobs?,inlineJobs?})`. Test identity/provider/mail functions are injected by a loopback harness; no environment variable bypasses Firebase authentication. Production backend selection remains unresolved.

The session user includes `accountsAdmin:boolean`. A non-secret `fynx_accounts_present` cookie accompanies the HttpOnly cookie solely to coordinate the site's logout flow; it grants no access. The active session list excludes revoked/expired/idle sessions. Server-side admin actions refresh the Firebase claim check.

A job response is `{id,jobId,kind,status,state,stage,progress,accountId,attempts,nextAttemptAt,result,error,createdAt,updatedAt}`. Public status uses `complete`; internal durable state uses `done`. Preview jobs return only IDs/counts. `GET /imports/:id` returns `{importId,accountId,status,preview,expiresAt,job}`; `preview.preview` contains up to 20 trades and `preview.previewDeals` covers deal-only inputs, with issues/coverage/metadata and `canCommit`.

- `GET /preferences` → `{preferences,emailConfigured}`; `PUT /preferences` accepts optional `inAppEnabled`, `emailEnabled`, `lossThresholds` (subset of `[0.5,0.75,0.9]`), `targetEnabled`, `eventEnabled`, `eventMinutes` (1–180), and `guardAccountId` (owned account UUID or null).
- `GET /alerts` → `{alerts,preferences,emailConfigured}`. `GET /security` includes the same fields, connections, active sessions, audit and deletion receipts. Alerts use verified current observations and known calculations only; unknown loss room or missing calendar data does not generate an invented warning. Email requires verified identity, opt-in and `ACCOUNTS_EMAIL_SEND_ENABLED=true`; the default is disabled. Existing Mailgun credentials are reused if explicitly configured, with no new provider purchased.
- `GET /ea/tokens` returns only owner-scoped token ID/label/date/bound status, never raw tokens or hashes. `GET /ea/monitor` downloads the authenticated standalone read-only MT5 monitor source. First send a v1 report to bind an Edge token, link that token in My Accounts, then enable optional v2 deal history. Unlinked v2 reports are not acknowledged as successfully ingested.
- `service.guard(uid,accountId=null,events=[])` returns null when the user retains the default Edge EA source. An explicitly selected Accounts source returns a guard object with fresh balance/equity, calculated loss rooms, actual positions and event warnings, or an explicit offline/revoked/unavailable result. A selected unavailable account never silently falls back to another account. The guard reuses account-engine output and checks `metrics.asOf`; it supplies no invented broker quotes/contract metadata, so `instruments` remains empty for cloud account adapters.

`ACCOUNTS_FREE_CONNECTION_LIMIT` defaults to one active cloud provider connection; the optional async `connectionLimitResolver(uid)` is server-authoritative and clamped to `ACCOUNTS_MAX_ACCOUNTS` (default/maximum 20). File imports and EA connections do not consume the cloud allowance but count toward stored account capacity. Queued connections and unresolved paid MetaApi cleanup consume quota. Firm approval is an independent gate and cannot be enabled by a client-selected plan.

Two worker threads are the local default, with 256 MB heap limit per worker and a default five-minute job timeout (`ACCOUNTS_JOB_TIMEOUT_MS`, bounded to 30 seconds–15 minutes). Durable leases renew while a job is active; expired attempts are reclaimable and attempts are bounded. General work is capped at 20 queued/running jobs per user and 200 total; deletion/cleanup have reserved capacity up to 50 per user and 400 total. Provider requests reserve a shared database quota, default 40/minute; MT4/MT5 share the MetaApi bucket. Active account polling targets 15 seconds, background polling five minutes, with periodic full history reconciliation, subject to actual provider caps and outages.

Raw staged source expires after one hour and is cleared after parsing; normalized preview data is cleared after commit. Exports expire after 15 minutes and are capped at 25 MB. Analysis uses at most the newest 100,000 snapshots and 100,000 deals, with explicit coverage notes when snapshot analysis is bounded. The materialized dashboard shows the latest 100 trades; large curves sample recorded interval extremes for display while preserving full saved records. Local JSON export rejects more than 200,000 snapshots instead of silently truncating them; larger streaming exports are a required production-adapter capability if such accounts are supported.

Deletion completion means local financial records and derived copies were removed. Unresolved provider cleanup, manual exchange-key revocation, and receipt-email status remain separate. Minimal receipts, authentication sessions and cleanup tombstones are retained; no claim of backup or storage-device forensic erasure is made. Production backup retention, restore-time deletion replay, operator escalation for unresolved remote provisioning and a continuously running scheduler are release gates. See `security/docs/accounts-threat-model.md` for the security boundary and remaining assumptions.
