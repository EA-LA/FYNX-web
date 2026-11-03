# Fresh news and the FYNX reader

Current headlines across Home, the public landing page, both News routes, section desks and Symbol News use a 24-hour publication window. Feed caches refresh after five minutes; visible pages check automatically and catch up on return. Edition/topic changes load the requested selection immediately. Official documents remain in a separately labelled 30-day archive.

Stories open `/news/article.html` with an opaque source-derived ID and their edition/category/symbol context. The existing `webMarketFeed` function supplies the reader; callers cannot supply an article fetch URL. Feed responses include prepared briefs, and a bounded queue prepares visible stories ahead of opening them. The reader preserves reading position when an updated brief becomes available.

Briefs contain bounded source excerpts, reported figures with context, relevant terms, original explanatory context, and the original source at the end. They explicitly distinguish public source text, publisher excerpts/key points and headline-only access. Public CNBC key points may be read outside restricted article regions; clipped/subscriber text, redirects, robots-denied pages and unapproved hosts are not read. Google aggregation metadata is not represented as full reporting. No generative model, paid service or fabricated article fact is introduced.

Source images require credit and reusable-license provenance. Otherwise, the reader uses a labelled licensed context photograph; this is not represented as a photo of the event. Ranking uses recency, editorial source and related coverage, not an unsupported claim of popularity. Promotional stock-pick headlines and duplicate titles are filtered.

## Validation

- Static generation succeeded; the tracked `ads.txt` and unrelated API pricing metadata were restored after known generator side effects.
- 118 focused frontend tests and 62 backend tests passed.
- Local real-source smoke: 33 checks passed across 12 editions, eight US desks, Symbol News, official history and four readers. Twenty-one of 22 feed selections were populated; the analysis selection honestly returned no current items.
- Discovery/search/Fibonacci and public business-flow checks passed.
- The general test chain passed through advertising checks, then stopped at the existing AdSense assertion that rejects the repository's tracked `ads.txt`. The file is preserved; no advertising behavior changed.
- Browser checks verified news-card to internal-reader navigation, return navigation, 390px layout without overflow, light/dark appearance and source disclosures.
- Only the existing `webMarketFeed` Firebase function was updated. Static publication is through the normal repository Pages release.

## Operational limits

Five-minute checks require a visible/open page; browsers may suspend background tabs. Provider publication times remain visible and outages do not turn cached items into new reporting. Not every publisher supplies full text or reusable event photography. Historical article links can outlive the latest-news window in a bounded verified instance cache, but this change does not add a durable article archive. Source-derived article figures are not live market quotes.

Run `node scripts/verify-news-reader-live.cjs --output /tmp/fynx-news-live.json` after publication. Use `--base http://127.0.0.1:8765` for the local preview.
