# FYNX Finance World — site audit and launch checklist

Audit date: September 15, 2026. Scope: all 79 HTML pages and their local JavaScript, stylesheets, links, embedded modules, and data paths in the FYNX-web repository.

## September 15 follow-up: Mailgun, reminders and cloud learning

- [x] Connected the existing Mailgun secret to server-side email reminders using the owner-approved `notifications@mail.fynxfunded.com` sender.
- [x] Mailgun accepted a test-mode request; no email was delivered during testing.
- [x] Deployed cloud reminder create/list/cancel and a scheduler running every minute, independent of an open browser tab.
- [x] Enforced verified account email, per-reminder consent, ownership, future dates and request limits.
- [x] Added account-backed outline review progress and recent quiz history. These track existing outline content, not a new full course curriculum.
- [x] Production integration tests passed for save/read, cross-user isolation, quiz history and reminder cancellation. Temporary QA accounts and records were removed.
- [x] Implemented authenticator enrollment/removal and login challenge screens.
- [ ] **Two-factor activation remains pending at the owner's request.** Firebase requires an Identity Platform upgrade; the project remains unupgraded with MFA disabled. Enrollment is disabled in the UI.
- [ ] Verify real inbox delivery. Provider acceptance in test mode does not prove inbox arrival. Add delivery/bounce webhooks if inbox-level reporting is needed.

Background delivery added here is email, not browser push. Full implementation and deployment notes: [backend/README.md](backend/README.md).

## What is complete

- [x] Applied one roadmap-inspired visual system to every HTML route, including workspace, tools, markets, learning, account and authentication screens.
- [x] Added an explicit layout family per page so homepage rules no longer distort other pages.
- [x] Added a build-time check that verifies all 79 pages load the design and theme assets.
- [x] Scanned all local HTML links and asset references: no missing local targets.
- [x] Scanned all 79 routes in a real browser at desktop and mobile widths. Redirect-only pages were identified separately.
- [x] Parsed standalone JavaScript and inline scripts; syntax checks passed.
- [x] Checked dark/light state transitions across the route scan, excluding the intentional App Store redirect; representative controls and the dashboard theme button were also clicked.
- [x] Fixed calculator dashboard overlap and theme controls lost when the shared navigation rebuilds.
- [x] Fixed TradingView sizing code that could expose embedded STYLE content as visible page text.
- [x] Fixed calendar widget rebuilding when themes change.
- [x] Isolated News Heatmap embeds and debounced theme rebuilding; four embeds loaded with no page errors during retest.
- [x] Removed synthetic P/L from both Journal entry points. Saving now requires actual user-entered realized P/L and session; invalid records are rejected.
- [x] Added Journal regression tests: negative results remain negative, zero P/L is accepted, and missing P/L never reaches storage.
- [x] Removed demo-trade substitution on signed-in Journal permission failure.
- [x] Connected Profile reads to the same Firestore account document and trade collection used by Settings and Journal. Profile edit routes to canonical Account Settings.
- [x] Removed fabricated Profile join dates and browser-local statistics presented as current account data.
- [x] Corrected pip value to use explicit pip size and supplied quote-to-account conversion rate rather than a price heuristic and universal dollar label.
- [x] Added manual-price/conversion fallback to position sizing when its external rate API fails.
- [x] Replaced the Forex tool's empty implementation placeholder with working calculator links.
- [x] Corrected Learning Center inventory counts to reflect actual content; invalid topic/section parameters fall back safely.
- [x] Added clear static/demo labels to rate tables, illustrative heatmaps and fixed-rate conversions.
- [x] News now handles all-provider failure without claiming a successful refresh. Added bounded request timeouts and escaped external news text at HTML rendering boundaries.
- [x] Home fallback publisher links are labeled and failed refreshes do not receive a false success timestamp.
- [x] Retired the unused synthetic active-user/update counter script.

## Follow-up: Brokers and smoother module loading

- [x] Added a dedicated Brokers category view with a direct `partners.html#brokers` link.
- [x] Added local instant search, category selection, result counts, clear/reset, and an accessible empty state.
- [x] Added a collapsible broker-comparison guide without inventing ratings or partner terms.
- [x] Tested Brokers filter (3 listings), Pepperstone search (1 listing), no-match state, and reset (8 listings).
- [x] Checked the updated directory at 390px: no document overflow.
- [x] Deferred inactive News, Calendar and Learn frames until their tabs are opened; already-loaded frames retain state.
- [x] Verified News initially configures 1 frame instead of all 14; Calendar 1 instead of 3; Learn 1 instead of 2. This is a resource-loading improvement, not a measured page-speed score.
- [x] Added Arrow keys/Home/End keyboard navigation for module tabs and verified tab activation.
- [x] Corrected the News Macro tab's Economic Indicators link, which previously opened the simulated trading heatmap.
- [x] Made the page canvas color consistent below the initial viewport, avoiding different black/white bands on long pages.

Remaining broker work requires business/source verification: actual partner agreements, regional eligibility, fees and current regulatory entities. The directory links to existing official destinations; it does not claim verified pricing, rankings or universal availability.

## Verification limits

Browser layout checks used local-only interception of the existing session-bootstrap and protect-route modules to inspect private templates. Production access rules were not changed. This verifies rendering, not authorization. Calculator/UI examples used an isolated browser; no production trades, accounts, password emails or waitlist entries were created. Cloud write/read round trips, OAuth provider configuration, Storage permissions and background delivery remain unverified.

A passing calculation example is not a full financial-model certification. Broker-specific contract sizes, fees, slippage, leverage and liquidation rules still require domain review. Pip conventions were checked against [OANDA's pip explanation](https://www.oanda.com/us-en/learn/introduction-to-leverage-trading/what-is-a-pip/) and [IBKR's pip definition](https://www.interactivebrokers.com/campus/glossary-terms/pip/).

## Main product checklist

| Area | What works or is implemented | What remains before claiming fully live |
|---|---|---|
| Home | Shared layout, navigation, TradingView embeds, RSS/cache/reference handling | Reliable production RSS/X feed; distinguish delays and source outages |
| Journal | Guest samples labeled; authenticated Firestore path; explicit actual P/L; regression checks | Signed-in create/reload/read test; permissions/index verification; review older records created with synthetic P/L |
| Calculators | Search/directory; local math; tested pip, R:R and manual position sizing | Exhaustive pair/contract/fee edge cases; authenticated market-rate provider for automatic rates |
| News | Module tabs; external RSS integration; safe failed-feed state | Stable production proxy/provider, rate-limit handling and source freshness monitoring |
| Calendar | Module tabs; economic widget theme sync; clocks; local reminders | Authoritative exchange holidays; server email reminders added; browser push remains optional |
| Learn | Topic navigation, real content counts, glossary/study cards; scored 10-question quiz | Full lesson content beyond outlines; cloud outline reviews and quiz history now implemented |
| Profile | Canonical profile/trade reads; empty/error states; Settings edit flow | Signed-in profile edit/reload and cross-device test; photo upload and Storage rules |
| Account/security | Firebase integration and preferences/security interfaces | OAuth/email reset/verification round trips; two-factor implementation; account lifecycle policy |

## Open checklist — priority order

### Must verify before a public account launch

- [ ] Test email sign-in, Google, Apple, password reset and verification on the production domain with a test account. The site is currently configured for an owner/private-beta waitlist flow; ordinary users do not have general account access.
- [ ] Verify Firestore and Storage rules server-side: own-profile/trade read-write, denial of another user's data, waitlist creation, and required indexes. Frontend owner checks alone are not evidence of backend access enforcement.
- [ ] Run signed-in Journal save → reload → Profile statistics → second-device verification. New saves use actual P/L; historical synthetic records were not modified and need user review.
- [ ] Confirm the correct Firebase Storage bucket. Configuration files contain both legacy `appspot.com` and `firebasestorage.app` names; no upload was made to determine the active bucket.
- [ ] Connect an authenticated market-rate service or deliberately retain manual inputs. The existing exchangerate.host request returned `missing_access_key` during this audit. Do not put a private API key in public HTML.
- [ ] Replace stale hard-coded central-bank rates/meeting dates and illustrative indicator scores with maintained sources before advertising them as current market intelligence.

### Product capabilities still missing or limited

- [ ] Activate and test two-factor authentication after the owner authorizes Identity Platform. Implementation exists; activation is explicitly pending.
- [x] Added and tested cloud outline review progress and quiz history. Full lesson content remains separate work.
- [x] Added server-side email reminders for closed-page delivery. Browser push remains separate work.
- [ ] Verify actual outbound email delivery separately from in-app notification records and preference switches.
- [ ] Audit generated holiday coverage against each exchange, including one-off closures, early closes and dates beyond 2027.
- [ ] Replace static correlation/COT/liquidity descriptions with real data ingestion if these are intended to be live analytical products.
- [ ] Decide whether PRO badges represent a real plan. A badge alone is not billing, subscription or entitlement enforcement.
- [ ] Confirm partner agreements and destination/affiliate URLs. This audit preserved existing partner listings rather than certifying them.
- [ ] Add operational monitoring for failed feeds, auth errors, uploads and saves; maintain provider timestamps rather than browser-refresh timestamps.

## Functional test evidence

| Check | Result |
|---|---|
| Calculator layout | Hero bottom 521.5px; search begins 543.5px — no overlap |
| Calculator search | Searching Pip leaves the Pip tool |
| Pip example, standard lot, 0.0001 increment, rate 1 | 10.00 account units |
| JPY pip example, 0.01 increment, supplied conversion 1/150 | 6.67 account units |
| Invalid zero lots | Validation error |
| Position size, EUR/USD, $10,000 balance, 1% risk, 20-pip stop | 0.50 lots in manual mode |
| Risk/reward, entry 100, stop 90, target 120 | 2.00 |
| Calendar and Learn tab switching | Correct panel activates |
| Scored quiz | 10 questions complete; score and answer review displayed |
| Future calendar alert | Persists after reload in isolated browser; test entry removed |
| News provider failure (mocked 503) | “Could not load live feeds right now.” |
| Signed-out Profile | Sign-in status; no invented account statistics |
| Embedded stylesheet visibility | No visible STYLE elements after sizing |
| News Heatmap theme retest | Four isolated embeds; no page errors |
| Journal persistence regression (mock storage) | Actual loss/zero P/L preserved; missing P/L rejected |

## Every-page inventory

“Account-backed” means the integration exists in code, not that a production write was verified. “Local calculation” means values are computed from supplied inputs, not live data. “External” means the provider controls loading, freshness and market entitlements.

| File | Type / data status | Notes |
|---|---|---|
| [account-settings.html](account-settings.html) | Account-backed, integration pending verification | Firestore profile, Firebase Auth profile and Storage photo operations; live saves require authenticated QA. |
| [affiliate-disclosure.html](affiliate-disclosure.html) | Static policy content | Styled disclosure; content is not a legal compliance certification. |
| [app-return.html](app-return.html) | App/auth handoff | Deep-link return flow; requires testing with the installed iOS app. |
| [auth/forgot.html](auth/forgot.html) | Authentication integration | Firebase password reset; no real reset email was sent during this audit. |
| [auth/login.html](auth/login.html) | Authentication integration | Firebase email/Google/Apple/app pathways; normal visitors currently encounter private-beta/waitlist gates. |
| [auth/signup.html](auth/signup.html) | Authentication integration | Firebase signup/private-beta flow; account creation not exercised against production. |
| [calculator.html](calculator.html) | Working local directory | 24 tool cards, search and basic calculator; PRO badges do not establish paid access. |
| [calendar.html](calendar.html) | Module hub | Economic calendar, market holidays and market hours tabs work; their data sources differ. |
| [contact.html](contact.html) | Static contact links | Mailto links; no contact-submission backend. |
| [dashboard.html](dashboard.html) | Redirect | Routes to Home; does not maintain a separate dashboard. |
| [founder.html](founder.html) | Static company content | Founder/company page. |
| [home/hub.html](home/hub.html) | Navigation/reference | Links to static/reference macro pages; those pages are not live feeds. |
| [home.html](home.html) | External + cached/reference | TradingView widgets; Google RSS through AllOrigins; X through RSSHub; fallback publisher links are labeled. |
| [index.html](index.html) | Public landing | Navigation and shared themes; outbound products retain their own sites. |
| [journal.html](journal.html) | Account-backed + explicit guest samples | Firestore users/{uid}/trades. Realized P/L is now user-entered. Authenticated write/read requires account verification. |
| [learn/risk-management.html](learn/risk-management.html) | Educational link page | Static introduction linking to its full learning or resource destination. |
| [learn/topic.html](learn/topic.html) | Local educational content | Actual counts displayed. Lesson outlines, study answers and glossary; links to scored quiz. |
| [learn/trading-psychology.html](learn/trading-psychology.html) | Educational link page | Static introduction linking to its full learning or resource destination. |
| [learn.html](learn.html) | Local education hub | Learning and quiz tabs work. Cloud outline review progress and quiz history added and API-tested. |
| [market-analysis.html](market-analysis.html) | External widgets + education | TradingView charts/news/technicals; third-party coverage and entitlements apply. |
| [markets/correlation.html](markets/correlation.html) | Mixed external/reference | Qualitative pair examples plus external comparison widget; static text is not a measured correlation matrix. |
| [markets/cot.html](markets/cot.html) | Reference/external | COT interface; not a verified automated CFTC positions ingestion pipeline. |
| [markets/crypto.html](markets/crypto.html) | Mixed external/reference | External crypto widgets and local supporting content; no trading execution. |
| [markets/currencies.html](markets/currencies.html) | Mixed external + fixed example | TradingView quotes plus a clearly labeled fixed-rate example converter. |
| [markets/historical-data.html](markets/historical-data.html) | Reference/external | Historical-chart interface; no verified proprietary downloadable history dataset. |
| [markets/index.html](markets/index.html) | Navigation/reference | Markets hub and links to supporting market pages. |
| [markets/indicators.html](markets/indicators.html) | Reference/external | Indicator education and embedded market data. |
| [markets/liquidity.html](markets/liquidity.html) | Reference/external | Liquidity concepts and external widgets; not venue order-book integration. |
| [markets/patterns.html](markets/patterns.html) | Reference/external | Pattern guidance and charts; no verified live pattern-detection engine. |
| [markets/volatility.html](markets/volatility.html) | Reference/external | Volatility guidance and widgets; not an independently validated signal service. |
| [news/challenges.html](news/challenges.html) | Informational/reference | Challenge comparison interface; listings and performance claims need independent maintenance. |
| [news/heatmap.html](news/heatmap.html) | External widget | TradingView market heatmap; third-party loading/data entitlements are not guaranteed. |
| [news/news.html](news/news.html) | External RSS, provider-dependent | RSS2JSON feeds. All-provider failure displays an error instead of a false success timestamp. |
| [news/sentiment.html](news/sentiment.html) | External/derived view | Sentiment interface with external dependencies; not a verified proprietary real-time sentiment feed. |
| [news.html](news.html) | Module hub | Embeds news, markets and analysis. Availability and provenance depend on the selected module. |
| [notifications.html](notifications.html) | Account-backed, integration pending verification | In-app notification engine and preferences. This does not prove email or background push delivery. |
| [open-app.html](open-app.html) | External redirect | Opens the App Store/app; the external destination is outside this website design. |
| [owner.html](owner.html) | Restricted access screen | Owner/private-beta access flow. No access rules were loosened. |
| [partners.html](partners.html) | Static directory | Outbound links and disclosures. Partner labels do not prove commercial agreements or active affiliate tracking. |
| [preferences.html](preferences.html) | Account-backed, integration pending verification | Theme and account preferences; live persistence needs signed-in QA. |
| [profile.html](profile.html) | Account-backed, integration pending verification | Reads canonical profile and Journal trades. Guest statistics stay blank. Edit uses Account Settings. |
| [resources/market-analysis.html](resources/market-analysis.html) | Educational link page | Static introduction linking to its full learning or resource destination. |
| [resources/quizzes.html](resources/quizzes.html) | Educational link page | Static introduction linking to its full learning or resource destination. |
| [resources/trading-glossary.html](resources/trading-glossary.html) | Educational link page | Static introduction linking to its full learning or resource destination. |
| [risk-disclosure.html](risk-disclosure.html) | Static policy content | Styled disclosure and trading risk information. |
| [risk-management.html](risk-management.html) | Local educational content | Educational page; examples are not a connected account risk engine. |
| [security.html](security.html) | Partially implemented | Password/verification controls exist; authenticator UI implemented, Identity Platform activation pending by owner choice. |
| [tools/atr-stop.html](tools/atr-stop.html) | Local calculation | User-entered ATR, entry and multiplier; does not fetch ATR from charts. |
| [tools/breakeven.html](tools/breakeven.html) | Local calculation | Spread/commission estimate; confirm pair/contract assumptions before using beyond supported inputs. |
| [tools/calendar-alerts.html](tools/calendar-alerts.html) | Device-local reminders — tested | Local reminders require an open page. New verified-email reminders run on the server every minute; save/cancel tested. |
| [tools/compound.html](tools/compound.html) | Local projection | Assumed return and deposits; projected balance is not investment performance. |
| [tools/correlation.html](tools/correlation.html) | Local calculation | Pearson correlation from supplied series; not an automatic live correlation feed. |
| [tools/crypto.html](tools/crypto.html) | Local calculation | User-supplied crypto trade inputs; not exchange-connected execution or balances. |
| [tools/currency.html](tools/currency.html) | Fixed examples + manual rates | Built-in currency rates are static; the interface now states this explicitly. |
| [tools/economic-calendar.html](tools/economic-calendar.html) | External widget | TradingView events; theme re-render fixed, feed remains dependent on the provider. |
| [tools/economic-indicators-heatmap.html](tools/economic-indicators-heatmap.html) | Illustrative/static | Hard-coded economic indicator scores; now labeled, not current measured data. |
| [tools/fibonacci.html](tools/fibonacci.html) | Local calculation | Retracement levels from supplied highs/lows. |
| [tools/forex.html](tools/forex.html) | Working tool directory | Former empty implementation placeholder now links to working position-size and pip tools. |
| [tools/heatmap.html](tools/heatmap.html) | Simulated demo | Sample values/random variation; prominent DEMO label added. |
| [tools/interest-rates.html](tools/interest-rates.html) | Stale reference snapshot | Hard-coded rates and spring/summer 2026 meeting dates; now explicitly disclosed, not current policy data. |
| [tools/liquidation-guard.html](tools/liquidation-guard.html) | Local estimate | User-input leverage/liquidation estimate; venue-specific margin rules are not connected. |
| [tools/margin.html](tools/margin.html) | Local estimate | User-input required-margin calculation; contract and broker rules need validation. |
| [tools/market-holidays.html](tools/market-holidays.html) | Rule-generated/partial reference | 2025–2027 local date rules, not an authoritative complete exchange calendar. |
| [tools/market-hours.html](tools/market-hours.html) | Local clock/session calculation | IANA timezone/DST session calculations; not broker execution availability or holiday-aware exchange status. |
| [tools/options-payoff.html](tools/options-payoff.html) | Local model | User-input expiry payoff; not an options chain or live pricing feed. |
| [tools/options.html](tools/options.html) | Local model | Option P/L assumptions from user inputs; no broker connection. |
| [tools/pip.html](tools/pip.html) | Local calculation — tested | Explicit pip size and quote-to-account rate; 10.00 for same-currency standard-lot example; 6.67 for supplied JPY conversion example. |
| [tools/pivot.html](tools/pivot.html) | Local calculation | Classic/Fibonacci pivots from supplied values. |
| [tools/position-size.html](tools/position-size.html) | Local calculation + broken external API | Manual EUR/USD test passes at 0.50 lots. External exchangerate.host returns missing_access_key; cross pairs accept a manual quote-to-USD rate. |
| [tools/profit-loss.html](tools/profit-loss.html) | Local calculation | User-input stock/trade P/L, not an imported account statement. |
| [tools/recent-topics-discussed.html](tools/recent-topics-discussed.html) | Static editorial reference | No live discussion backend or continuously updated feed. |
| [tools/risk-reward.html](tools/risk-reward.html) | Local calculation — tested | Entry 100, stop 90, target 120 returns 2.00 R:R. |
| [tools/stock.html](tools/stock.html) | Local calculation | User-input stock position/risk sizing. |
| [tools/symbol-news.html](tools/symbol-news.html) | External RSS | Google News RSS through RSS2JSON; provider availability/rate limits apply. |
| [trader-journal.html](trader-journal.html) | Account-backed + explicit guest samples | Alternate Journal entry point; receives the same P/L and access-error fixes. |
| [trading-glossary.html](trading-glossary.html) | Local educational content | Static glossary, not live market data. |
| [trading-psychology.html](trading-psychology.html) | Local educational content | Educational guidance; no personalized clinical or performance assessment. |
| [trading-quizzes.html](trading-quizzes.html) | Local scored quiz — tested | 10-question completion, score and answer review verified. Random selection is quiz randomization, not fake market data. |
| [waitlist.html](waitlist.html) | Account/service-backed, unverified write | Firestore waitlist enrollment; deduplication and rules require an authorized end-to-end test. |

## Maintenance commands

- `npm run build` checks static assets and shared design coverage for all 79 routes.
- `npm test` protects Journal realized P/L behavior on both entry points.
- `scripts/design-inventory.json` records every page and its layout family.

Changes to backend rules, external service subscriptions, commercial agreements and authentication settings require their own verification; none were silently assumed complete.
