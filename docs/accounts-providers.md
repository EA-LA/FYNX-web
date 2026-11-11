# My Accounts provider contracts and access gates

Research checked against primary documentation on 3 November 2026. These are implementation and access findings, not a claim of provider approval, a legal opinion, or a live-provider acceptance test. No broker credential was entered, paid account provisioned, exchange trade attempted, email sent or commercial application submitted during implementation.

## Availability

Every external connector defaults off. Statement imports and the explicitly enabled user-owned EA reporting path do not require FYNX to hold a broker password. A feature flag cannot enable a provider whose credential permission model is unsupported.

| Provider | Implemented contract | Release gate and source |
| --- | --- | --- |
| MT4 / MT5 through MetaApi | Cloud-g2 investor login, known-server search, fresh investor-mode verification, account/positions/deal reads, remote deletion. FYNX keeps the provider account ID after provisioning, not the investor password. | Service subscription/key, permitted region and broker/firm third-party-access approval. Require `investorMode === true` **and** `tradeAllowed === false`; g1 cannot supply the required investor proof. [Account information model](https://metaapi.cloud/docs/client/models/metatraderAccountInformation/) |
| Binance Spot | Signed API-key restrictions, native asset balances, selected-symbol fills and selected-currency deposits/withdrawals. No Futures/Margin consolidation. | Explicit feature flag, supported jurisdiction and exchange/API terms review. All documented trading, transfer and withdrawal flags must be false. Missing/new permission fields fail closed. [Key permission endpoint](https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account) |
| Bybit Unified USDT | Signed key permission check, USDT wallet observations, linear USDT positions and USDT transaction ledger. | Explicit feature flag, supported jurisdiction, Unified account and terms review. Require numeric `readOnly:1`, matching API key, known permission schema, no withdrawal/FIX rights. [Key information](https://bybit-exchange.github.io/docs/v5/user/apikey-info) |
| cTrader | Unavailable pending confirmed authorization security contract. | The documented `accounts` scope is genuinely view-only, unlike `trading`. However the documented flow does not establish PKCE support and shows a GET token exchange containing `client_secret` in the URL. FYNX does not invent PKCE support or use that secret-bearing URL flow. App approval and a verified compliant alternative are needed. [Authentication](https://help.ctrader.com/open-api/account-authentication/), [app approval](https://help.ctrader.com/open-api/api-application/) |
| Interactive Brokers | Unavailable pending approved third-party integration and positive read-only proof. | Current Web API onboarding states third-party vendors may seek approval for OAuth 1.0a, with Compliance review and an agreement. Individual Client Portal access is not authorization to run a general third-party OAuth2/PKCE connector. [Web API access](https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/) |
| OANDA | Personal-token connector deliberately unavailable. | Personal tokens grant access to all subaccounts and the API supports trading. No verified read-only PAT scope/introspection was found. Calling only GET endpoints does not make a broad token read-only. FYNX does not solicit these tokens. [Authentication](https://developer.oanda.com/rest-live-v20/authentication/), [v20 API](https://developer.oanda.com/rest-live-v20/introduction/) |
| DXtrade | Unavailable pending broker-specific access and investor permission proof. | Brokers/prop firms control enabled APIs and allowed IPs. Devexperts does not manage retail accounts directly. A broker login capable of trading cannot be accepted. [Trader FAQ](https://dx.trade/traders-faq/) |
| TradeLocker | Unavailable pending a verifiable read-only credential flow. | Public API authentication uses the user's email/password/server to obtain a JWT covering trading operations. Multi-user integrations should join its Developer Program. No documented investor-only verifier was established. [Public API guide](https://public-api.tradelocker.com/docs/getting-started) |
| Match-Trader | Unavailable pending authoritative token-permission verification. | Broker-enabled API tokens can be read-only. This is not a lack of API support. `GET /v1/account` reports **account** `accessRight`, explicitly not token permissions; it cannot prove a submitted token lacks trading rights. No verifier or validated signing-key contract was established in the reviewed docs. [Trader API](https://app.theneo.io/match-trade/trader-api/introduction), [account schema](https://app.theneo.io/match-trade/trader-api/account/get-account) |

Bybit product permission names such as `Order` and `SpotTrade` can appear in an official response with `readOnly:1`; the global flag determines read versus write. The implementation understands that distinction while refusing a nonempty withdrawal permission or an unknown permission schema. A user checkbox or key label never substitutes for the signed provider response.

For a future cTrader connector, verify the actual token using `ProtoOAGetAccountListByAccessTokenRes.permissionScope === SCOPE_VIEW`; the requested authorization scope alone is not sufficient. Refuse absent scope, `SCOPE_TRADE`, unexpected accounts, or failed authorization. [Protocol response](https://help.ctrader.com/open-api/messages/)

## Runtime interface

`backend/accounts/providers/index.cjs` exports `createRegistry({env, fetchImpl, now, sleep, beforeRequest})`. Tests inject transport/time functions; production uses the real fixed HTTPS origins. `list()` returns public descriptors only; `get(id)` returns one adapter; unknown IDs fail safely. The async `beforeRequest({provider, method, path})` hook reserves a shared durable quota for **each** outbound attempt, including pagination/retries, without receiving credentials, headers, query strings or bodies. Returning `false` or `{allowed:false,retryAfterSeconds}` denies the request before network I/O. Worker threads should inject the SQLite-backed limiter; group MT4/MT5 quotas when the service key shares an upstream allowance.

```js
connect(input, {signal, idempotencyKey, onProvisioned})
// -> {externalId, readOnlyEvidence, metadata, credential?}
verifyReadOnly(connection, {signal})
// -> {verified, canTrade, canWithdraw, basis, checkedAt, sourceURL}
fetchAccount(connection, {signal})
fetchPositions(connection, {signal})
fetchHistory(connection, since, {signal})
// -> {deals, complete, from, to, notes}
disconnect(connection, {signal})
// -> {revoked, manualRevocationRequired, instructions?}
```

The worker supplies `{externalId, credential?, generation}` only in memory. Its persistent job contains an encrypted credential reference, never the plaintext key. Only `verified === true && canTrade === false && canWithdraw === false` allows import. Permission evidence is renewed during sync; unknown is not false. `credential` is internal return data for immediate envelope encryption and must never be serialized in a web response.

MetaApi's `onProvisioned({externalId, provider})` callback runs immediately after an ID is known, before permission verification. Persist that ID and delete the temporary encrypted investor input at this point. A safe `PROVIDER_PENDING` error may contain `externalId`; resume verification with that ID rather than recreating an account. Prior to an ID, retain only the encrypted pending input, use the same worker-generated idempotency key and honor the retry interval. The adapter hashes that key to the documented 32-character `transaction-id`. Never retry provisioning with a fresh transaction ID merely because a request timed out. [Provisioning contract](https://metaapi.cloud/docs/provisioning/api/account/createAccount/)

For disconnect during an in-flight provisioning request, `cleanupByIdempotencyKey` finds the operation through the documented account search, then requires exact operation name, metadata, type, platform and region before deletion. A search returning no account is **not** proof that an asynchronous request was cancelled: keep cleanup pending and escalate unresolved requests for provider review. Cleanup works after the connection feature is switched off. Remote deletion is only confirmed after a successful deletion response or a verified 404. [Account search](https://metaapi.cloud/docs/provisioning/api/account/readAccounts/), [delete account](https://metaapi.cloud/docs/provisioning/api/account/deleteAccount/)

Exchange credentials are deleted locally on disconnect. The adapters do not claim that deletion revokes the key at the exchange. They return `manualRevocationRequired:true` and instructions for API Management, since no supported self-revocation flow for these read-only keys is used. Do not retry using a retained plaintext credential after local deletion.

## Endpoint and outage controls

Each provider has an explicit method/path/query allow-list, fixed HTTPS origin, no redirect following, bounded response bodies, abort timeout, retry backoff, request budget and circuit breaker. MetaApi allows only connection provisioning/deletion plus data reads; its trade, account-password update, manager and live-broker-account creation operations are absent. Exchange order and transfer operations are absent. A successful GET does not replace permission verification.

Raw upstream messages, request URLs, headers, bodies and error causes are excluded from `ProviderError`. Only fixed messages, safe codes, numeric retry/status metadata and constructed permission evidence are retained. Binance HMAC signatures necessarily appear in signed provider query strings under its protocol; API key and secret do not. Network/proxy/APM logging must omit the entire query and authorization headers. Do not enable HTTP debug logging around provider calls.

Failed syncs must preserve last-good snapshots and positions. A truncated positions page sequence throws instead of replacing stored positions with an incomplete list. History budgets return `complete:false` and a reason. Polling/limits are operator ceilings, not a statement that a provider grants that allowance; upstream 429 and the stricter provider limits take precedence. Multiple worker processes require a shared quota coordinator beyond the per-adapter process budget.

## Monetary and history limits

All canonical monetary values remain in the reported account currency. USD conversion is nullable. MetaApi snapshots use an actual reported exchange rate only with the configured USD base; no historical deal FX conversion is inferred from a present-day rate. Position risk remains null when the broker metadata needed to price the stop is unavailable. A reported final stop is not an initial risk observation.

Binance Spot has multiple asset balances. The selected currency's cash is shown explicitly as scoped cash; `equity`, `floatingPL` and USD totals remain null. `assets` contains real free/locked balances. Holdings are not fabricated as open leveraged trades. History is restricted to the selected symbols and cash currency, so account-wide coverage remains false even when all requested pages finish. Fees charged in another asset remain unconverted. Empty symbol selection imports supported cashflows only.

Bybit reports actual Unified USDT wallet values and linear positions. USDT remains USDT, not USD. The transaction log supplies real cash movements and signed fees, but lacks reliable universal hedge position IDs and initial-stop observations. Those values remain null, and ambiguous round trips must not be manufactured. History is bounded by the provider's two-year retention, seven-day query windows and configured page cap; unsupported products, currencies and migrations keep account-wide coverage incomplete. Use a verified statement import for additional closed-trade context. [Transaction-log specification](https://bybit-exchange.github.io/docs/v5/account/transaction-log)

## Setup and costs

Do not put credentials into source files, screenshots, shell command arguments, browser storage or support messages. Configure the service token using the deployment secret manager and user API credentials through the write-only encrypted connection form.

| Variable | Default / role |
| --- | --- |
| `ACCOUNTS_MT4_ENABLED`, `ACCOUNTS_MT5_ENABLED` | `false`; independent flags |
| `ACCOUNTS_METAAPI_TOKEN` | Empty; backend-only service token |
| `ACCOUNTS_METAAPI_REGION` | `new-york`; a fixed allow-listed region, validated against the provisioned account |
| `ACCOUNTS_BINANCE_ENABLED`, `ACCOUNTS_BYBIT_ENABLED` | `false`; regional and terms approval precedes enabling |
| `ACCOUNTS_PROVIDER_TIMEOUT_MS` | `10000`, bounded 500–30000 |
| `ACCOUNTS_PROVIDER_REQUESTS_PER_MINUTE` | `60` per adapter transport; upstream quotas may be stricter |
| `ACCOUNTS_PROVIDER_HISTORY_MAX_PAGES` | `20`, bounded 1–200; incomplete coverage remains visible |

MetaApi requires a [MetaApi account](https://app.metaapi.cloud/) and backend API token. At research time its public page displayed a **$30/month Regular subscription excluding VAT/GST**, one included MT account, and additional API usage billing. The usage-pricing section was temporarily unavailable, and the interactive calculator's unloaded `$0` values are not a quotation. Consequently a reliable incremental monthly price per connected g2 account could not be verified. Budget using **`$30/N + verified per-account hosting/API usage + tax/add-ons`** for N connected accounts, then obtain the current operator quote before enabling paid provisioning. One-account base subscription is at least $30/month before usage and taxes; never present a guessed marginal price as confirmed. Extended subscription displayed $100/month. [Official pricing](https://metaapi.cloud/), [cost estimator](https://metaapi.cloud/estimate-costs)

Binance and Bybit users create read-only keys in their own existing eligible accounts; no FYNX signup, payment or account creation was performed. Follow the official [Binance key instructions](https://www.binance.com/en/support/faq/detail/360002502072) and [Bybit key instructions](https://www.bybit.com/en/help-center/article/How-to-create-your-API-key), disable financial actions, and bind the key to the server's egress IP where supported. The permission endpoint remains the final acceptance check. Provider subscriptions, market-data entitlements and jurisdictional eligibility are separate operator responsibilities.

## Prop-firm terms are a separate gate

FTMO's current Personal Use rules restrict third-party access to Challenge/Verification and FTMO Accounts. Its allowance for certain EAs does not establish permission to share investor credentials with a cloud analytics provider. Obtain written approval specific to this architecture before enabling such credential connections; do not label the connector FTMO-approved. [FTMO personal-use restrictions](https://ftmo.com/en/forbidden-trading-practices/), [EA guidance](https://ftmo.com/faq/which-instruments-can-i-trade-and-what-strategies-am-i-allowed-to-use/)

FundedNext CFD terms section 8.10 restrict third-party access and credential sharing. Its Futures terms separately address account management and credential sharing. These are product-specific terms, so no blanket permission is inferred for analytics. [CFD terms](https://fundednext.com/api_docs/cfd-challenge-terms), [Futures terms](https://fundednext.com/api-docs/futures-challenge-terms)

Topstep documents third-party tools through its paid ProjectX API for eligible simulated accounts, and excludes Live Funded accounts from that API. This does not establish a read-only scope or approve a FYNX integration; Topstep is not an implemented provider here. [TopstepX API access](https://help.topstep.com/en/articles/11187768-topstepx-api-access)

For every remaining firm, record the exact legal entity, product, region, current source, review date, allowed connection method and any written approval before enabling cloud credential sharing. Verified challenge mathematics and permission to access an account are separate facts. Unverified rules remain null. User-controlled file analysis avoids sharing broker credentials, but it does not automatically establish unrestricted rights to redistribute account data.

## Verification evidence

Run `node --test tests/accounts/providers.test.cjs`. The suite uses documentation-derived response fixtures and injected transports: default-off gates; strict investor proof; Binance capability changes/missing flags; Bybit global readonly semantics; unknown permissions; endpoint/redirect denial; secret-canary error redaction; budgets and circuit breaking; rejected-account cleanup; pending-operation orphan cleanup; native-currency/scoped snapshots; and honest incomplete history.

These tests do not establish live provider availability, funded-account eligibility, commercial approval, production rate limits or native MT terminal operation. No trading-capable request is used as a permission probe.
