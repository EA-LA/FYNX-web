# October 5 release review

- Removed the added bottom ecosystem navigation and its inline CSS from all 97 affected HTML files. The ordinary Company footer/navigation and home-page hero remain. A static rebuild does not recreate the removed blocks.
- Prepared disabled AdSense build integration for four public editorial pages. No ad provider is contacted, no fake publisher ID is published, and no revenue is claimed. Owner selected preparation because no approved advertising account exists. See advertising-setup.md.
- Owner explicitly chose to keep the paid Identity Platform upgrade pending. Live Firebase configuration still reports FIREBASE_AUTH and MFA DISABLED. Existing TOTP code is not represented as active protection.
- Owner selected ordinary directory links; partner agreements/affiliate approval are not claimed.
- News: corrected forex word-boundary filtering (Europe is not euro), mark feeds with newest publisher timestamp older than 72 hours stale, expose publishedAt independently of fetchedAt, and add dedicated CoinDesk RSS fallback. Only titles and original article links are displayed.
- Holiday coverage regression: all 213 reviewed exchange/date/status entries pass. Nasdaq official calendar still lists 2026 on October 5; no future dates were guessed or silently certified. Existing official-source notice monitor remains in place; future notices and unsupported exchanges still require source review.
- Auth, journal, reset, verification-action, MFA challenge mocks, account UI, session isolation, API pages and advertising guard tests passed. Desktop/mobile browser checks on home, learning, news, holidays and API pages found no duplicate blocks, ad scripts or horizontal overflow.

This release does not claim exhaustive production sign-in/provider, physical second-device, MFA enrollment or ad-delivery verification. Those require their respective external activation or user steps.

## Release verification

Published commit 8a89252 to main; hosting workflow completed successfully. Live home and holiday pages returned HTTP 200 without the removed ecosystem-footer markup. The production webMarketFeed update completed successfully.

Production feed recheck: commodities 9 items, newest October 5; crypto 19 items from CoinDesk, newest October 5; forex 0 qualifying items; world 4 items with newest October 2 and stale=true. Forex and world publisher availability therefore remain limited, not certified healthy. The site must keep its empty/stale states rather than present fabricated or refresh-dated news.

The full proof suite passed after updating the test-only TypeScript module loader for Funded's new local policy-module imports. Set FYNX_FUNDED_REPO to the actual sibling checkout when running this suite from an isolated worktree. The existing legacy-versus-versioned policy comparison continues reporting intentional differences rather than asserting equivalence.
