# Shared FYNX Intelligence and iOS integration — November 15, 2026

This change connects the existing native app and website through exact story identities, source-bound evidence, dated market observations, stable calendar aliases and additive account records. It does not claim a complete licensed financial-news terminal or archive-wide media service.

## Services and contracts

- `webMarketFeed?kind=resolve&id=…` or `&url=…` resolves a known article across existing stored scopes. It never fetches an arbitrary caller-supplied publisher URL. A fixed, current published FYNX index is a bounded fallback for an exact source match; headline-only records remain headline-only.
- `intelligence.version=1` sections contain complete source-backed sentences. A claim must belong to the brief's existing evidence and original source. Potential effects and reported movements have distinct labels. Unsupported context and future-event guesses are omitted.
- `marketContext` contains separately dated observations, provider links and explicit change units. These snapshots do not establish a reaction to the article. Crypto observations expire after one hour; other observations after four days.
- `fynxIntelligencePublicStory` exposes only public `kind: story` objects through an explicit field allowlist. Installation-specific briefs remain behind the existing protected callable. Content expiration is enforced by the server and readers.
- `/news/article.html?id=…` is the shared exact article route. Source-URL routes resolve to that identity. `/intelligence/story.html?id=…` handles public push-story IDs. Native handling also accepts existing validated edition/category/symbol article links.
- The bookmark's original URL hash remains its record ID. `webArticleId` and `intelligenceStoryID` are additional identities; opening an enriched story never silently creates a duplicate bookmark because tracking parameters or source order changed.
- `mediaLibrary` is an additive account-sync domain. Original publisher URL hashes identify items. Saved/queued/opened state and real audio position metadata are separate fields. Opening an external publisher does not fabricate playback progress.
- `notificationPreferences/default.data.intelligence` contains mode, seven editorial category choices and morning/midday/evening brief choices. OS permission, tokens, device pause, quiet hours, time zone and Time Sensitive authorization stay device-local. New browser controls save only edited leaves with a captured revision.
- Calendar records retain their existing web ID and add a native-compatible `stableEventID`. Both aliases resolve to the same published event. Same-day schedule corrections retain identity; cross-day identity cannot be inferred without a provider ID.

## Native integration

The authoritative Xcode checkout is `/Users/h/Documents/FYNX`, repository `EA-LA/FYNX-app`, branch `elham-fix-1`. It already contained substantial unrelated staged and unstaged work. The implementation is applied there without resetting it. A separate task-only patch and SHA-256 file manifest are retained in the local task evidence directory.

The app now has a durable instrument-specific quote cache, explicit quote failures, original timestamps and a compact horizontal strip. Actual indices remain indices; GOLD futures are not relabeled as spot XAU/USD. The observed public provider requests worked during the audit, so the historical screenshot outage was not reproduced. The repaired failure mode was loss of useful errors and last-known quotes during transient failures.

The internal reader uses exact shared story data and displays publisher-excerpt or headline-only limitations. TV adds bounded catalog search, filters, history, saved items, queue and native episode details. Official podcast RSS enclosures use AVPlayer after an explicit Play action, with background audio, seek/speed, Now Playing and actual progress. YouTube uses its supported embedded player and application identity header. Live badges require fresh confirmation; a publisher's broadcast directory is not proof that a stream is live.

The five map layers reuse institutions, exchanges, existing calendar data and the published country feed. Country reporting appears at approximate country references, never as precise event coordinates. Records without location provenance remain unpinned. Calendar details preserve source figures and show unavailable actual/forecast values honestly.

## Validation and limits

Repository tests cover exact identity, incompatible/expired content, source attribution, unsupported claims, stale quotes, unit-preserving calendar comparisons, bookmark preservation, account isolation and editorial preference conflicts. A dedicated GitHub Actions workflow runs the shared reader and calendar contracts. Static build and packaging checks keep server code out of `dist`.

Public media search covers the configured current publisher feeds, not an entire YouTube or podcast archive. Popularity sorting appears only where the source provides view counts. Native podcast progress is measured; YouTube progress/continue-watching is not synthesized. Licensed transcripts, complete publisher text, full market-reaction datasets, precise geopolitical/corporate event feeds and a verified live-program schedule remain provider/licensing dependencies.

The new association file is packaged under `.well-known` and explicitly included in GitHub Pages. Origin publication, Apple CDN availability and installed-device universal-link behavior must be checked separately. The apex domain currently redirects to `www`; an apex redirect is not equivalent to a direct association-file response.

No App Store submission or release is part of this change. Simulator fixtures and API checks must not be described as physical-device media, push-delivery, purchase or restoration verification.
