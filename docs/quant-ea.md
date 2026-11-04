# Quant Analyst command, import and execution exports

## Command parsing

`lib/quant/commands.ts` exports `parseAsk(text, defaults)` and the asynchronous `CommandParser` interface. Keyword parsing uses the single `SYMBOLS` registry, tolerates `backrest` and `chllange`, detects candle/tick frequency and requested years/paths, and returns steps in this fixed order: backtest, optimize, portfolio, montecarlo, ftmo, deploy. The UI owns asynchronous orchestration and must activate a step before drawing its charts. Unknown steps default to backtest with a visible warning. It never substitutes EUR/USD when gold is requested. Multiple mentioned markets produce a warning; the first becomes the active market and the user can add the others in Portfolio.

`createCommandParser()` defaults to local keyword rules. Enabling a server LLM adapter requires both an explicitly configured server adapter and a key-present flag. No LLM calls or keys are embedded in the browser. A future authenticated adapter can implement `CommandParser.parse`; enabling a flag alone is deliberately insufficient to send requests.

## Imports

`importReturnsCSV(text, { name, initialEquity })` accepts:

```csv
date,return_pct
2025-01-02,0.4
2025-01-03,-0.2
```

These are format examples, not market observations. Return values are divided by 100. The alternative `entry_date,exit_date,pnl` format requires the user's actual initial equity. Cash P&L is summed by exit date, then divided by the previous realized balance. Empty days in the inclusive calendar range have zero realized P&L. Entry dates supply the trading-day flags. That is a realized-P&L reconstruction, not a mark-to-market series: intra-trade risk is unknown, and results cannot certify a challenge's intraday loss rule.

The parser supports quoted fields and CRLF, rejects malformed dates/rows, repeated daily dates, non-finite values, currency/percent text, impossible losses below -100%, backwards trades and accounts that become insolvent before the last observation. Limits are 10 MB and 100,000 rows. Returned points are `{ date, return, traded }` with fractional returns. JSON portability uses `{ version: 1, strategies: [...] }`; the parser whitelists fields and parameters rather than copying arbitrary properties. Both CSV types preserve source and limitation notes for the UI.

## Generating execution source

`generateEA({ platform, symbol, timeframe, params, dailyLossPct, maxLossPct, initialBalance })` returns `{ filename, mime, source, notes }`. Supported platforms are `mt5`, `mt4`, `ctrader`; filenames end in `.mq5`, `.mq4`, and `.cs`. The website only produces text files and never authenticates to a broker or submits orders. The generated software submits orders only if the user separately installs and enables it in their own platform.

The starting point is `genEa()` in the recovered approved `quant-analyst-reference.html`. The implementation preserves the close-breakout idea and adds:

- Exact symbol and tested candle-timeframe checks; M1, M5, H1, H4 and D1.
- Last-completed-candle signals, with the lookback excluding that signal candle. Orders execute at the next candle's first available tick.
- Close-to-close ATR for close-mode research or Wilder true-range ATR for OHLC research.
- Equity risk sizing rounded down to the broker's volume step. If computed volume is below the broker minimum, the trade is skipped; risk is never increased just to meet minimum size.
- Fixed SL/TP distances, a bar-count time exit, account-equity daily/maximum guards (4% and 9% by default), and error logging when broker operations fail.
- Persistent guard state and breach latches. A restart should not clear a recorded maximum-loss breach.
- A Prague trading-day boundary with the European daylight-saving transition. The test environment must supply its historical server-to-UTC offset because MetaTrader's simulated `TimeGMT()` behavior differs from live time.

The generator rejects a news strategy or tick-only strategy instead of producing an unrelated breakout EA. To export, select a candle ATR-breakout configuration and run its backtest first. A release-timed news EA needs its own live calendar/execution integration, which is not provided by this generator.

## MT5 setup

1. Generate the `.mq5` file from the settings you tested.
2. Open MT5 and log in to your own demo/free-trial account.
3. Choose **File → Open Data Folder → MQL5 → Experts**, then put the file there.
4. Open it in MetaEditor, compile, and fix any broker/platform-specific issues before continuing. The site does not report compiler success.
5. Run Strategy Tester using the tested symbol/timeframe and realistic spread, commission and tick settings. Compare signals and trades, including stop/target gaps and restarts.
6. Attach to the matching chart. Set the broker's exact symbol name (including suffix), true initial account balance and verified Prague-midnight equity. A zero first-day value causes the bot to wait until the next Prague day.
7. Test on a demo/free trial before enabling Algo Trading for a challenge.

MT4 uses `MQL4/Experts` and MetaEditor. For cTrader, create a C# cBot in **Algo**, replace its source with the generated `.cs` file, build it, backtest, and attach it to the tested symbol and timeframe. Use a desktop instance if relying on persisted guards: cTrader Cloud's local storage is held in memory for that run.

## What these guards establish

Guards monitor account equity, but can close only positions owned by this bot's magic number/label. Manual orders and other robots can still breach an account. A terminal that is disconnected cannot observe or act on every tick; broker stops, gaps and execution failures can exceed a theoretical stop. Guards are a conservative additional check, not an FTMO compliance guarantee. A recorded maximum breach remains latched and needs deliberate owner review before any new account/run is configured.

Close-only research fills are not equivalent to next-bar executable fills. The research's fixed transaction cost is not charged as a synthetic fee in the EA; the broker's actual spread, slippage, commission and swap apply. Candle history and ATR warmup can differ by broker. All exports require native compilation and platform testing. Those tools are not installed in this workspace, so generated source and invariant checks are verified here, not successful native compilation or order execution.

The optional HTTPS heartbeat is independent of these generators; no heartbeat token or broker password is placed in a generated file.

Official API references: [MQL5 position properties](https://www.mql5.com/en/docs/trading/positiongetdouble), [MQL5 terminal globals](https://www.mql5.com/en/docs/globals/globalvariableset), [MQL4 market information](https://book.mql4.com/appendix/marketinfo), [cTrader fixed-risk volume](https://help.ctrader.com/ctrader-algo/references/MarketData/Symbols/Symbol/VolumeForFixedRisk/), [cTrader local storage](https://help.ctrader.com/ctrader-algo/guides/local-storage/).

## Validation

Run `node --test tests/quant/exports.test.cjs`. Tests cover ordered commands and aliases, typo handling, parser feature gating, CSV/JSON integrity, trade-return conversion, source injection rejection, completed-bar signal ranges, rounding down risk, persisted guard markers, and refusal to export unsupported news/tick semantics. They do not stand in for a MetaEditor or cTrader compiler.

## Workspace persistence and identity

The browser saves guests under `fynx.quant.workspace.v1.guest` and signed-in records under `fynx.quant.workspace.v1.user.<uid>`. Firebase identity is resolved before a save/import. Signing in or out clears the previous identity's loaded sleeves and calculations, reads only the new identity's store, and does not copy guest work into an account. An explicit JSON import is the supported way to copy work between those workspaces. In-flight requests retain their original identity; responses arriving after an account switch cannot be applied to the new workspace.

**My strategies** retrieves verified account saves and loads them as portfolio sleeves. **Saved portfolios → Load portfolio** restores stored return sleeves and the weighting method, then recomputes the portfolio. These snapshots preserve daily returns; they do not claim intraday observations. Workspace JSON exports/imports include both strategies and portfolios. Imported IDs are regenerated to avoid silently replacing existing records. CSV saves include the selected market, daily timeframe, source and limitation notes, matching the API's strategy schema. Provider outages do not prevent a portfolio made entirely from imported returns.

`tests/quant/exports-workspace.test.cjs` exercises the actual browser controller in jsdom with test-only identity/provider adapters: guest and account isolation, a delayed save response after account switching, CSV portability, portfolio restoration, validation before mutation, and the keyboard-accessible Profile link. These tests do not establish production Firebase credentials or a deployed profile service.
