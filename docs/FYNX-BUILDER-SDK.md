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

The iframe uses `sandbox="allow-scripts"` only. It does not get `allow-same-origin`, so its origin is opaque (`"null"`) and it cannot read the terminal page, cookies, storage, or account.

The document policy is `default-src 'none'` and `connect-src 'none'`. The sandbox also replaces `fetch`, XHR, WebSocket, workers, and WebRTC on that window and on nested frames the widget creates. `document.write` is blocked so a widget cannot replace the locked document. A second load, or a second ready signal, removes the frame.

User code does not receive the frame's real `window`, `document`, or `location`. It runs in a scope whose free variables resolve to a finance DOM facade. `location.href`, `eval`, the `Function` constructor, and DOM walks back to the frame's document are blocked. Chromium still has no CSP directive that cancels navigation, so this is enforced in the frame before the widget runs. `fetch`, XHR, images, beacons, workers, dynamic `import()`, and WebRTC do not leave the frame. A second load still removes the frame.

Do not put API keys, passwords, or tokens in `main.js`. The editor rejects source that looks like a credential. That scan is easy to bypass with concatenation. It is not the security boundary. The sandbox and the Firestore rules are. Phase 2 is the place for account-level credentials, and it is not built yet.

## Account storage

Projects are stored at `users/{uid}/builderProjects/{projectId}`. Installations are stored at `users/{uid}/builderInstalls/current`. Rules allow an ordinary user to read and write only their own documents, force `visibility == "private"`, and reject a widget slot that is not `mine-` plus that project id. Up to 12 installed widgets and 5 stored versions.

Those rules are not live until they are deployed. Until then Save and Add to my terminal fail closed, and the page says nothing was stored. The editor and the sandbox still run.

Panel placement uses the same per-device layout store as the rest of the terminal. An installed slot that belongs to a project this account does not have is left empty. It does not load another account's source. The project source is the part stored on the account.

## Before this can be used on the live site

This repository has no `firebase.json`. Do not run `firebase deploy` from FYNX-web. Production rules are released from the existing functions project (see [backend/README.md](../backend/README.md)).

1. Download the live rules (`firebase firestore:rules:get --project fynx-c7a28` or the Firebase console) and save that file. It is the rollback copy.
2. Diff the live rules against `backend/rules/firestore.rules`. The repo change is an insertion inside `match /users/{userId}` only. It does not delete or rewrite any existing match.
3. If production has diverged, do not replace the whole ruleset. Copy only the `builderVersion`, `builderVersions`, `builderWidget`, and `builderWidgets` functions, plus the `builderProjects` and `builderInstalls` matches, into the live `match /users/{userId}` block.
4. Only when the file you are about to publish matches that reviewed result, from the Firebase directory whose rules file is exactly that file:

```
firebase deploy --only firestore:rules --project fynx-c7a28
```

Never deploy without `--only firestore:rules`. Never deploy functions from this repository. An unrestricted `firebase deploy` can publish functions from the wrong project.

Rollback is the same command with the saved live file put back in place. It is rules-only, so it does not restore or delete documents.

5. Sign in with a non-admin account. Save a project, reload, Run, and add it to the desk. Sign in as a second account and confirm that project and panel are absent. Remove the install.

The existing admin wildcard still allows an administrator to read these documents, the same as the rest of the database. This release does not change that.

## Not in this release

Community Library, official submission, creator profiles, rewards, admin review, in-terminal AI, Monaco, and external API keys stay later phases. The builder says so in the settings panel. Do not tell users those are available.

## Prompt for ChatGPT or Claude

The builder copies this prompt from `FynxBuilderCore.ASSISTANT_PROMPT`. It matches the contract above. Paste the returned JavaScript into `main.js` and press Run.
