# Changelog

## 2026-11-11 (run 61) — [site-qa] Shareable scenarios on 4 more calculators; wider tap targets on iPhone
- New: Pip Value, Margin, Risk/Reward and Liquidation Guard calculators now have a "Copy scenario link" button. It copies a link with your current numbers; opening it fills them in and calculates. Only numbers and listed options are read from the link; nothing is saved to an account. https://www.fynxfinanceworld.com/tools/pip.html https://www.fynxfinanceworld.com/tools/margin.html https://www.fynxfinanceworld.com/tools/risk-reward.html https://www.fynxfinanceworld.com/tools/liquidation-guard.html
- iPhone: Pro page header links (Plans, Pro tools, Sign in), its Home breadcrumb and Terms footer link, the "BLS" link under "Chart or live data unavailable?" on News and Economic Calendar, the Notifications bell button and the Calendar "Open full page" link are now at least 44x44px. https://www.fynxfinanceworld.com/pro.html https://www.fynxfinanceworld.com/news.html https://www.fynxfinanceworld.com/notifications.html https://www.fynxfinanceworld.com/calendar.html
- Checked on iPhone SE, 14, 15 Pro Max and desktop (Chromium; WebKit unavailable) across 33 pages: no sideways overflow, no errors; shared links reproduce hand-checked results; `npm test`, tool/discovery/macro checks, CI regression tests and build pass.

## 2026-11-10 (run 60) — [site-qa] Shareable calculator scenarios; wider tap targets on iPhone
- New: Compound Growth, Debt Payoff and Break-even calculators have a "Copy scenario link" button. It copies a link with your current numbers; opening it fills them in and calculates. Only numbers and listed options are read from the link; nothing is saved to an account. https://www.fynxfinanceworld.com/tools/compound.html https://www.fynxfinanceworld.com/tools/debt-payoff.html https://www.fynxfinanceworld.com/tools/breakeven.html
- iPhone: the short "Home / Tools / News" breadcrumb links, news-page header "Account" link, and short footer links (Blog, Contact, Quizzes) are now at least 44px wide, not just 44px tall. https://www.fynxfinanceworld.com/tools/position-size.html https://www.fynxfinanceworld.com/news/markets.html https://www.fynxfinanceworld.com/
- Checked on iPhone SE, 14, 15 Pro Max and desktop (Chromium; WebKit unavailable): no sideways overflow, no errors; calculators match hand math; `npm test`, tool/discovery checks and build pass.

## 2026-11-10 (run 59) — [site-qa] Macro Desk tables fit iPhone
- iPhone: the Central Bank Watch and Smart Bias tables on the new Macro Desk were three screens wide, so you had to swipe sideways inside them to see next decisions and what drives each bias. On phones each bank and each currency pair is now a stacked card with labels (Policy rate, Next decision, Market pricing, This week / Price, Bias, What drives it). Desktop is unchanged. https://www.fynxfinanceworld.com/macro-desk.html
- iPhone: the "Official calendar" links in Central Bank Watch are now full-size tap targets.
- Checked on iPhone SE, 14, 15 Pro Max and desktop (Chromium; WebKit unavailable): no sideways overflow, no errors; `npm test`, `npm run test:macro` and build pass.

## 2026-11-09 (run 48) — [site-qa] Fixes sideways scroll on iPhone SE
- iPhone SE: the top menu (Home / Tools / News / Partners) on Partners, Risk Disclosure and Affiliate Disclosure stuck out 6px past the screen; it now wraps onto a second line. https://www.fynxfinanceworld.com/partners.html https://www.fynxfinanceworld.com/risk-disclosure.html https://www.fynxfinanceworld.com/affiliate-disclosure.html
- iPhone SE: the "Trade plan" card on Edge Radar market pages was 11px too wide; it now fits. https://www.fynxfinanceworld.com/edge-radar/nas100/
- Checked all 237 pages on iPhone SE and 15 Pro Max (Chromium; WebKit unavailable): no overflow left; `npm test` and build pass.

## 2026-11-08 (run 37) — [site-qa] Easier tapping on News jump links
- iPhone: the Headlines / Your News / Watch & listen / Official sources links at the top of the News page are now 44px tall. https://www.fynxfinanceworld.com/news/news.html
- Checked all pages on iPhone SE and 15 Pro Max (Chromium; WebKit unavailable): no overflow or errors; `npm test` passes.

## 2026-11-08 (run 36) — [site-qa] Quant Analyst fits small iPhones
- iPhone SE: the data fields on Quant Analyst stuck out past the right edge (page was 367px wide on a 320px screen). They now stack and fit. https://www.fynxfinanceworld.com/quant-analyst.html
- Checked 15 key pages on iPhone SE, 14 and 15 Pro Max (Chromium; WebKit unavailable): no other overflow or errors; `npm test` passes.

## 2026-11-08 (run 35) — [site-qa] Easier tapping on topic pages' Follow buttons and Your News filters
- iPhone: the "Follow …" and "Refresh coverage" buttons on World, Energy, Finance and Industries news pages, and the filter boxes on Your News, are now at least 44px tall. https://www.fynxfinanceworld.com/news/world.html https://www.fynxfinanceworld.com/news/your-news.html
- Checked on iPhone SE and 14 plus desktop (Chromium; WebKit unavailable): no sideways overflow, no errors; `npm test` passes.

## 2026-11-07 (run 33) — [site-qa] Easier tapping on Learn hub links
- iPhone: the Quiz and Glossary links on every Learn hub card are now at least 44px wide. https://www.fynxfinanceworld.com/learn.html
- Checked on iPhone SE and 15 Pro Max: no sideways overflow, no errors; `npm test` passes.

## 2026-11-07 (run 32) — [site-qa] Easier tapping on research-tool source notes
- iPhone: the Yahoo Finance / Coinbase source links at the bottom of Company Financials, Company Screener, Heatmap, Portfolio Tracker, Price Alerts, Research Desk, Research Heatmap, Strategy Backtester and Financial Research Assistant, plus the "economic calendar" link on Economic Indicators Heatmap, are now full-size tap targets. https://www.fynxfinanceworld.com/tools/company-screener.html https://www.fynxfinanceworld.com/tools/economic-indicators-heatmap.html
- Checked on iPhone SE, 15 Pro Max: no sideways overflow, no errors; all 46 tools re-scanned.

## 2026-11-07 (run 31) — [site-qa] New: break-even win rate on the Risk/Reward calculator
- Added: after you calculate, the Risk/Reward calculator now shows the win rate you need just to break even (1 ÷ (1 + R:R), before costs) — e.g. 3:1 needs 25%, 1:1 needs 50%. It is also included when you Copy/Share the result. https://www.fynxfinanceworld.com/tools/risk-reward.html
- Checked on iPhone SE, 15 Pro Max and desktop: no sideways overflow, no errors, math hand-verified.

## 2026-11-07 (run 30) — [site-qa] Easier tapping on News source links and Market Holidays
- iPhone: the official source links on News (Federal Reserve, Bureau of Economic Analysis, etc.) and the exchange links on Market Holidays (NYSE, Nasdaq, LSE, HKEX, JPX) are now full-size tap targets. https://www.fynxfinanceworld.com/news.html https://www.fynxfinanceworld.com/tools/market-holidays.html
- Checked on iPhone SE, 14 and 15 Pro Max plus desktop: no sideways overflow, no errors.

## 2026-11-07 (run 29) — [site-qa] Wider tap targets on News and Home
- iPhone: the News "Refresh" button, the Tokyo map pin and the homepage "Markets" tab are now at least 44px wide. https://www.fynxfinanceworld.com/news.html https://www.fynxfinanceworld.com/
- Checked on iPhone SE and 15 Pro Max: no sideways overflow, no errors.

## 2026-11-07 (run 28) — [site-qa] Easier tapping on "recently opened" tools
- iPhone: the list of recently opened tools on your workspace home (shown after you use a few calculators) is now full-size tap targets. https://www.fynxfinanceworld.com/home.html
- Checked on iPhone SE and 15 Pro Max: no sideways overflow, no errors.

## 2026-11-06 (run 27) — [site-qa] Easier tapping on Directory, Partners, Connection Help and Quant Analyst
- iPhone: every link in the lightweight Directory lists, the Tools/News header links on Partners, Risk Disclosure and Affiliate Disclosure, the source links on Connection Help, and the market/strategy buttons on Quant Analyst are now full-size tap targets. https://www.fynxfinanceworld.com/directory.html https://www.fynxfinanceworld.com/partners.html https://www.fynxfinanceworld.com/accessibility.html https://www.fynxfinanceworld.com/quant-analyst.html
- Checked on iPhone SE and 15 Pro Max plus desktop: no sideways overflow, no errors.

## 2026-11-06 (run 25) — [site-qa] Easier tapping on footer links
- iPhone: the footer links on discovery/lesson pages (All resources, Connection help, Contact, Risk disclosure) and About's "Read the Journal" link are now full-size tap targets. https://www.fynxfinanceworld.com/about.html https://www.fynxfinanceworld.com/learn/lessons/stocks/institutional-footprints-in-equities.html
- Checked on iPhone SE and 15 Pro Max plus desktop: no sideways overflow, no errors.

## 2026-11-06 (run 24) — [site-qa] Easier tapping on every lesson page
- iPhone: on all Learn lessons, the "on this page" jump links, Worked example/Practice links, source links, lesson-path list, glossary/tool links and Previous/Next lesson links are now full-size tap targets. https://www.fynxfinanceworld.com/learn/lessons/indices/opening-range-strategy.html https://www.fynxfinanceworld.com/learn/lessons/options/defined-risk-strategies.html
- Checked on iPhone SE and 15 Pro Max plus desktop: no sideways overflow, no errors.

## 2026-11-06 (run 23) — [site-qa] Matching hero buttons on the homepage
- iPhone: "Open Your Workspace" and "Explore Resources" are now the same width instead of two different-sized buttons. https://www.fynxfinanceworld.com/
- Checked on iPhone SE and 15 Pro Max: no sideways overflow.

## 2026-11-06 (run 22) — [site-qa] Easier tapping on Products, Directory and Shared Profile
- iPhone: the header and intro links on the Products page, the header and menu links on the lightweight Directory, and the FYNX logo link on Shared Profile are now full-size tap targets. https://www.fynxfinanceworld.com/products.html https://www.fynxfinanceworld.com/directory.html
- Checked on iPhone SE and 15 Pro Max: no sideways overflow, no errors.

## 2026-11-06 (run 21) — [site-qa] More answers in the homepage FAQ
- Added: the homepage FAQ now answers "Is FYNX free?", "Where does the news come from?" and "Is FYNX financial advice?" with links to Pro, News and the Risk Disclosure; links are full-size tap targets on iPhone. https://www.fynxfinanceworld.com/#faqs
- Checked on iPhone SE, 15 Pro Max and desktop: no sideways overflow, no errors.

## 2026-11-06 (run 20) — [site-qa] Bigger fields and links on Account, Partners and Quant pages
- iPhone: text boxes and dropdowns on Account settings, Preferences, Security and the Quant Analyst are now full-size (44px tall, 16px text so the page no longer zooms when tapped). The Partners category menu, Owner page back link and Affiliate/Risk disclosure links are full-size tap targets. https://www.fynxfinanceworld.com/account-settings.html https://www.fynxfinanceworld.com/partners.html https://www.fynxfinanceworld.com/quant-analyst.html
- Checked 21 top-level pages on iPhone SE and 15 Pro Max plus desktop: no sideways overflow, no errors.

## 2026-11-06 (run 19) — [site-qa] Easier tapping on Markets and Learn pages
- iPhone: the "Open … calculator" links on Risk Management and Trading Psychology, the source links on COT, Liquidity, Volatility and Correlation, and the "Chart or live data unavailable?" help links on Markets pages are now full-size tap targets. https://www.fynxfinanceworld.com/learn/risk-management.html https://www.fynxfinanceworld.com/markets/cot.html https://www.fynxfinanceworld.com/markets/crypto.html
- Checked all Markets and Learn pages on iPhone SE and 15 Pro Max: no sideways overflow, no errors.

## 2026-11-06 (run 18) — [site-qa] Easier tapping across the tool pages
- iPhone: on the tool pages (Heat Map, Interest Rates, Market Holidays, Company Screener, Portfolio Tracker, Journal Export and more) the header Explore/Theme/Import buttons, Refresh buttons, "Continue to…" links, source links and filter chips are now full-size tap targets. https://www.fynxfinanceworld.com/tools/heatmap.html https://www.fynxfinanceworld.com/tools/interest-rates.html https://www.fynxfinanceworld.com/tools/market-holidays.html
- Checked every tool page on iPhone SE and 15 Pro Max: no sideways overflow, no errors.

## 2026-11-05 (run 17) — [site-qa] Easier tapping on Pro, Dashboard, Contact and the homepage
- iPhone: the Pro tool links, "Explore the tools", the Dashboard section links (All coverage, Heat map, Full calendar, quick calculator links, photo credits), the contact email links and the homepage photo-credit and "Explore original sources" links are now full-size tap targets. https://www.fynxfinanceworld.com/pro.html https://www.fynxfinanceworld.com/dashboard.html https://www.fynxfinanceworld.com/contact.html https://www.fynxfinanceworld.com/
- Checked Pro, Dashboard, Contact, Homepage, Learn and Journal on iPhone SE and 15 Pro Max: no overflow, no errors, zero links under 44px.

## 2026-11-05 (run 16) — [site-qa] Easier tapping across the News pages
- iPhone: on the News section pages (Markets, Economics, Finance, Your News, article reader) the ticker arrows, Account and theme buttons, breadcrumbs, Save resource, Share/Copy buttons and Your News topic buttons are now full-size tap targets, and the header edition picker no longer zooms the page when tapped. The COT search box is also bigger. https://www.fynxfinanceworld.com/news/economics.html https://www.fynxfinanceworld.com/news/your-news.html https://www.fynxfinanceworld.com/markets/cot.html
- Checked all Markets and News pages on iPhone SE and 15 Pro Max: no sideways overflow, no errors.

## 2026-11-05 (run 15) — [site-qa] Easier tapping on About and Pro
- iPhone: the logo, Menu and theme buttons, and footer links on the About page, plus the Pro page header links, are now full-size tap targets. https://www.fynxfinanceworld.com/about.html https://www.fynxfinanceworld.com/pro.html
- Checked Patterns, Pro, About, Contact, Dashboard, Calendar, Risk Management and Trading Psychology on iPhone SE and 15 Pro Max: no overflow, no problems.

## 2026-11-05 (run 14) — [site-qa] Easier tapping on the Trader Journal header
- iPhone: the API, Pro tools & plans, Sign in links and "Account settings" on the Trader Journal page are now full-size tap targets. https://www.fynxfinanceworld.com/trader-journal.html
- Checked all 30 Learn pages (how-to, glossary, quizzes, topic) plus Symbol News on iPhone SE and 15 Pro Max: no overflow, no problems.

## 2026-11-05 (run 13) — [site-qa] Easier tapping on the Learn hub
- iPhone: the Start learning, Quiz, Glossary and Open quizzes links on the Learn page are now full-size tap targets. https://www.fynxfinanceworld.com/learn.html
- Checked Margin, Risk/Reward, Break-even, Compound, Quizzes and Risk Management pages on iPhone SE and 15 Pro Max: no overflow, no problems.

## 2026-11-05 (run 12) — [site-qa] Easier tapping on the homepage and glossary
- iPhone: the homepage buttons (Open Your Workspace, Explore Resources), the Your News / All reporting / All calculators links, the theme button, and the Trading Glossary header and A–Z letters are now full-size tap targets. https://www.fynxfinanceworld.com/ https://www.fynxfinanceworld.com/trading-glossary.html

## 2026-11-05 (run 11) — [site-qa] Easier tapping on News and the homepage
- iPhone: News search, publisher/topic pickers, jump links and source links, plus the homepage tabs, search and footer links are now full-size tap targets. https://www.fynxfinanceworld.com/news.html https://www.fynxfinanceworld.com/

## 2026-11-05 (run 10) — [site-qa] Easier tapping in the header on iPhone
- iPhone: the search box, notification bell, Sign in button and edition picker in the header, the card titles on Explore and Quick Add in the Journal are now full-size tap targets. https://www.fynxfinanceworld.com/journal.html https://www.fynxfinanceworld.com/explore.html

## 2026-11-05 (run 9) — [site-qa] Easier tapping on Explore and the market ticker
- iPhone: the Explore search and filter buttons, the save buttons on resource cards and the market ticker arrows are now full-size tap targets. https://www.fynxfinanceworld.com/explore.html https://www.fynxfinanceworld.com/journal.html

## 2026-11-05 (run 8) — [site-qa] More tap-friendly links on tool pages
- iPhone: the Home / Tools / Find a resource links at the top of calculators, the "Assumptions" disclosures, the "Developer sign in" link and Position Size's "Use manual price" and Save buttons are now full-size tap targets. https://www.fynxfinanceworld.com/tools/position-size.html https://www.fynxfinanceworld.com/tools/correlation.html https://www.fynxfinanceworld.com/tools/pip.html

## 2026-11-05 (run 7) — [site-qa] More tap-friendly tool pages on iPhone
- iPhone: Back and Home links, the Fibonacci theme button, the Drawdown Simulator header links and the ATR Stop input boxes are now full-size tap targets. https://www.fynxfinanceworld.com/tools/atr-stop.html https://www.fynxfinanceworld.com/tools/fibonacci.html https://www.fynxfinanceworld.com/tools/drawdown-simulator.html
- Checked Pivot, Options, Profit/Loss and ATR Stop against hand-worked examples: all correct. https://www.fynxfinanceworld.com/tools/pivot.html

## 2026-11-05 — [site-qa] Bigger tap targets for Save resource and ATR Stop buttons
- iPhone: the "Save resource" button on tool pages and the Buy/Sell and ATR multiplier buttons on the ATR Stop calculator are now full-size and easier to tap. https://www.fynxfinanceworld.com/tools/atr-stop.html
- Checked the Debt Payoff and Liquidation Guard calculators against hand-worked examples: all correct. https://www.fynxfinanceworld.com/tools/debt-payoff.html

## 2026-11-04 (night) — [site-qa] Position Size lot rounding fix
- Position Size calculator: some exact answers were rounded one step too low (e.g. USD/JPY at 150, $100 risk, 25-pip stop showed 0.59 lots instead of 0.60). Fixed. https://www.fynxfinanceworld.com/tools/position-size.html

## 2026-11-04 (evening) — [site-qa] Easier tapping on iPhone
- iPhone: the news topic row in the header (Newsroom, Markets, Economics…) and the "More" menu now have full-size tap areas, and "Politics & Policy" no longer runs into "Industries". https://www.fynxfinanceworld.com/calculator.html
- iPhone: Back, Home, Calculate and Clear buttons on calculators are larger and easier to hit. https://www.fynxfinanceworld.com/tools/pip.html

## 2026-11-04 — [site-qa] Correlation clocks fit small iPhones; clearer Position Size heading
- iPhone SE: the time/range cards on Correlation stuck out past the screen edge; they now fit. https://www.fynxfinanceworld.com/tools/correlation.html
- Position Size calculator: the card heading "Calculator UI" is now "Position size calculator" with plain instructions. https://www.fynxfinanceworld.com/tools/position-size.html

## 2026-11-04 05:30 UTC — [site-qa] iPhone menus fit the screen
- iPhone: the "More" news menu (Energy, World, Watch & listen, Official sources) opened off the left edge and was cut off. It now opens fully on screen. https://www.fynxfinanceworld.com/home.html
- iPhone: the "US edition" picker in the header showed as a white box. It's now dark with its own arrow, matching the header.
- iPhone: the slide-out menu on the homepage is fully hidden when closed, so the page can't be dragged sideways, and it now fits above Safari's bottom toolbar.
- Phones now get the newest page styles straight away instead of an old saved copy.

## 2026-11-04 04:40 UTC — [site-qa] iPhone fixes and readability fixes
- iPhone: tapping a search box or calculator field no longer zooms the whole page in (every page).
- iPhone: Symbol News quick symbol buttons are full size and scroll sideways instead of being squashed. https://www.fynxfinanceworld.com/tools/symbol-news.html
- Homepage FAQ: questions and answers no longer touch the card edges; the +/× icon is no longer cut off. https://www.fynxfinanceworld.com/#faqs
- Homepage: the "Your News" button text and the footer copyright line can now be read.
- Symbol News: the "Search" button label is visible again.
- The "US edition" picker in the header is now dark on every page, like the homepage (it was a light box on Calculator, Journal and tool pages). https://www.fynxfinanceworld.com/calculator.html
- Risk Management, Trading Psychology, Quizzes, Market Analysis and Glossary short pages: links are readable now and each links to its full guide. https://www.fynxfinanceworld.com/learn/risk-management.html
