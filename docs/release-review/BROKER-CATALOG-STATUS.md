# Broker catalog — implementation and outstanding evidence

Status: **PARTIAL — item 3 is not complete.** No actual broker account instrument export has been retrieved. No instrument is represented as verified for production.

## Selected integration

The owner delegated broker selection. Selected **OANDA v20 fxTrade Practice** for the first read-only instrument-data integration, targeting a US USD Forex test account. Account availability/type and commercial suitability are not yet confirmed by an actual account. This is a development selection, not a claim that OANDA is a contracted FYNX Funded provider.

OANDA documents a dedicated authenticated practice endpoint and account-specific instruments. Its instrument schema exposes size/precision, margin, commission and financing fields. FOREX.com also offers API access through a contact process; OANDA's documented practice environment is the reason for this implementation choice, not a universal claim of best pricing or suitability.

Sources checked September 28, 2026:

- [OANDA development environments](https://developer.oanda.com/rest-live-v20/development-guide/)
- [OANDA account instruments endpoint](https://developer.oanda.com/rest-live-v20/account-ep/)
- [OANDA instrument field definitions](https://developer.oanda.com/rest-live-v20/primitives-df/)
- [OANDA US account comparison](https://www.oanda.com/us-en/trading/account-comparison/)
- [OANDA US trading hours](https://www.oanda.com/us-en/trading/hours-of-operation/)
- [OANDA US financing](https://www.oanda.com/us-en/trading/financing-fees/)
- [OANDA US legal/API agreements](https://www.oanda.com/us-en/legal/)
- [FOREX.com US API offering](https://www.forex.com/en-us/premium-trader-tools/api-trading/)

## Implemented

`backend/oanda-instruments.cjs` and its capture CLI issue only a GET request to the fixed OANDA practice host. Redirects are rejected. The capture preserves exact response bytes and their SHA-256, retrieval timestamp and a hashed account reference. Raw broker unit quantities are retained; they are not silently converted to lots. Output uses private file permissions and refuses overwriting. Neither token nor raw account ID is written into the snapshot. No orders, live-account calls or account creation are implemented.

`backend/broker-catalog.cjs` and its validation CLI check the offline catalog's identity, effective interval, source references/hashes, duplicate symbols, positive contract/lot/price fields, precision, cost and session evidence. A content hash versions the complete input. Detailed margin tiers, commissions, swap schedules, holidays/DST and restrictions are preserved as source-linked descriptions for review. Validation is structural intake checking, not a broker-authority certification, pricing engine, live allowlist or session scheduler.

`BROKER-CATALOG-TEMPLATE.json` is deliberately empty. Populate it from preserved account-specific exports and applicable broker schedules; do not treat illustrative EUR/USD values or synthetic test fixtures as approved broker specifications. A new effective version must be saved whenever relevant source data changes; do not overwrite previously accepted evidence. Retrieved time alone does not establish an effective date or future validity.

## Retrieve and validate

Create or provide an authorized OANDA US practice account with v20 API access. Configure these server-side variables securely (do not paste the token into chat, public code or `VITE_` variables):

- `FYNX_OANDA_PRACTICE_TOKEN`
- `FYNX_OANDA_PRACTICE_ACCOUNT_ID`

Then run:

```sh
node backend/scripts/capture-oanda-instruments.cjs /secure/path/new-oanda-snapshot.json
node backend/scripts/validate-broker-catalog.cjs /secure/path/completed-catalog.json
```

Neither variable was configured during this work. The importer therefore has isolated test coverage, not evidence of a successful authenticated broker call.

## Remaining to close item 3

1. Retrieve the actual account-specific instrument export using authorized practice access; verify the intended live/Funded provider separately.
2. Complete broker-supported contract/lot conversion, leverage/margin applicability, commissions/spreads, swaps, other charges, exact sessions, holiday/DST exceptions, execution restrictions and effective dates from the applicable account documents. Missing optional API fields never mean zero cost.
3. Review the completed catalog against the source evidence, record approval of its exact hash/version and connect it to the approved production broker adapter. An account's available symbols do not automatically become FYNX's public supported-pair list.
4. Confirm the provider's permission and commercial terms for the actual FYNX Funded/API business use. Retail practice API availability does not establish a white-label or proprietary-evaluation agreement.

The approved FYNX 22:00 UTC rule reset remains unchanged; broker trading sessions and financing cutoffs are separate concepts.
