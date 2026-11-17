# FYNX Builder SDK (Phase 1)

Private terminal tools. A project runs in a sandboxed iframe and can be installed only on the signed-in user's own terminal.

This release does not include the Community Library, official FYNX submissions, creator rewards, admin review, or external API credentials. Do not tell users those are available.

## Widget contract

`main.js` must define:

```js
function render(root, FYNX) {}
```

- `root` is an empty element. Use `document.createElement` and `textContent`. Do not use `innerHTML`.
- `FYNX.quote(symbol)` returns `{symbol, price, changePercent}` or `null`.
- `FYNX.quotes()` returns the current snapshot array.
- `FYNX.format(number, digits)` and `FYNX.signed(number)` format numbers.
- `FYNX.onQuotes(callback)` runs after the terminal sends a newer snapshot.

Symbols already loaded by the terminal include `SPY`, `QQQ`, `AAPL`, `BTC-USD`, `EURUSD=X`, `GC=F`, `DX-Y.NYB`, and `^TNX`. A missing symbol is `null`. It is not a live feed of its own, and it must not be labeled as one when the snapshot has no row.

## What the sandbox refuses

The iframe uses `sandbox="allow-scripts"` only. It does not get `allow-same-origin`, so it cannot read the terminal page, cookies, or account.

Its document policy is `default-src 'none'` and `connect-src 'none'`. `fetch`, XHR, WebSocket, EventSource, and remote scripts are blocked.

Do not put API keys, passwords, or tokens in `main.js`. Saving and running are rejected when the source looks like it contains a credential. Phase 2 is the place for account-level credentials, and it is not built yet.

## Account storage

Projects are stored at `users/{uid}/builderProjects/{projectId}`. Installations are stored at `users/{uid}/builderInstalls/current`. Firestore rules allow only that user, and they force `visibility == "private"`.

Those rules have to be deployed before Save or Add to my terminal can succeed. Until then the editor and sandbox still run, and the page says that nothing was saved.

Panel placement uses the same per-device layout store as the rest of the terminal. The project source is the part stored on the account.

## Prompt for ChatGPT or Claude

The builder copies this prompt from `FynxBuilderCore.ASSISTANT_PROMPT`. It matches the contract above. Paste the returned JavaScript into `main.js` and press Run.
