// Original public documentation of the existing Journal and eight Pro products.
// Examples match backend/consumer-core.cjs; no account data is published here.
module.exports = {
  analytics: {
    title: 'Trading Journal Analytics: Expectancy, Profit Factor & Drawdown',
    intro: 'Understand what your recorded trades say about your process. Journal intelligence summarizes realized results from your own saved trading history.',
    sections: [
      ['Read the sample before the statistics', 'The analysis uses up to 1,000 dated Journal trades from your account. It reports the trade count, net realized profit or loss, win rate, average result per trade, profit factor and maximum realized drawdown. Record the actual closed-trade result in one account currency. A missing fee or an omitted losing trade changes the interpretation of every summary.'],
      ['Interpret each number separately', 'Expectancy here is average recorded P/L per trade, not a forecast. Profit factor divides gross winning P/L by the absolute total of losing P/L; it is undefined when there are no recorded losses. Drawdown measures a fall from a peak in cumulative realized P/L. It does not include unrealized losses, deposits or a starting account balance. Compare the statistics with your notes and the period covered before drawing conclusions.']
    ],
    inputs: [['Source', 'Your dated, saved Journal trades'], ['Currency', 'Realized P/L recorded in one account currency'], ['Coverage', 'Up to 1,000 trades returned by the workspace']],
    example: 'Three illustrative results of +$100, −$50 and +$150 total +$200. Average realized P/L is $66.67 per trade, win rate is 66.67%, profit factor is 5, and the largest realized decline from the running peak is $50.',
    outputs: [['Net realized P/L', '+$200'], ['Expectancy per trade', '+$66.67'], ['Profit factor', '5.00'], ['Realized drawdown', '$50']],
    limitations: 'A small or selectively recorded sample can be misleading. Historical outcomes do not establish future profitability. This tool does not reconstruct intratrade risk or connect to your broker automatically.',
    related: ['trading-journal', 'journal-export', 'trading-process-review']
  },
  risk: {
    title: 'Position Risk Planner: Contract Size, Stop Risk & Reward',
    intro: 'Turn an explicit loss budget into position units using your entry, stop, target, contract multiplier and currency conversion assumptions.',
    sections: [
      ['Translate the contract into account currency', 'Start with account balance and the percentage allocated to this hypothetical trade. Enter entry, stop and target prices for the same instrument. The contract multiplier converts one price unit into value; the quote-to-account conversion rate converts that value into your account currency. Verify both against the contract you intend to study. A share, a futures contract and a forex lot are different units.'],
      ['Check size and execution together', 'The model divides the risk budget by the absolute entry-to-stop distance, multiplier and conversion rate. It rounds calculated units down to six decimal places and reports modeled loss at the stop, profit at the target and reward-to-risk ratio. The stop and target must lie on opposite sides of entry. A broker may require a larger size increment, so compare the output with permitted order sizes.']
    ],
    inputs: [['Risk budget', 'Account balance and risk percentage'], ['Trade prices', 'Entry, stop and target'], ['Contract basis', 'Multiplier and quote-to-account conversion rate']],
    example: 'For a hypothetical $10,000 balance, 1% risk, entry 100, stop 98 and target 104, with multiplier and conversion rate both 1, the budget is $100. The model gives 50 units, $100 of stop-distance loss and $200 of target-distance profit.',
    outputs: [['Risk budget', '$100'], ['Calculated units', '50'], ['Modeled reward / risk', '2 : 1']],
    limitations: 'Fees, gaps, slippage, margin requirements and broker size increments are excluded. A stop price is not a guaranteed execution price. The calculation does not decide whether the underlying trade is suitable.',
    related: ['position-size', 'margin', 'scenario-comparison']
  },
  scenarios: {
    title: 'Trading Risk Scenario Comparison: Four Position Budgets',
    intro: 'Compare four position sizes while keeping the same entry, stop, target and contract assumptions. See how changing the risk budget changes both modeled loss and reward.',
    sections: [
      ['Keep the trade assumption fixed', 'Enter the same balance, price levels, multiplier and conversion rate used by the position risk planner. This tool evaluates four risk budgets: one-half, one, one-and-a-half and two times the entered risk percentage. The model caps each scenario at 100% of balance; that computational boundary is not a recommended allocation.'],
      ['Compare exposure rather than just the upside', 'Each row shows risk budget, calculated units, loss at the stop, profit at the target and reward-to-risk ratio. With fixed price levels, increasing size scales both loss and profit, while the price-based ratio remains the same. Use the rows to understand the trade-off before recording your own decision. This is a deterministic comparison of entered assumptions, not a probability-weighted outcome model.']
    ],
    inputs: [['Base risk', 'The risk percentage multiplied across four scenarios'], ['Price assumptions', 'One entry, stop and target shared by every row'], ['Value conversion', 'Contract multiplier and account-currency conversion']],
    example: 'With $10,000 of balance, 1% base risk and a two-unit stop distance at a multiplier and conversion rate of 1, the four risk budgets are $50, $100, $150 and $200. They correspond to 25, 50, 75 and 100 units before broker rounding.',
    outputs: [['0.5 × base risk', '$50 / 25 units'], ['1 × base risk', '$100 / 50 units'], ['1.5 × base risk', '$150 / 75 units'], ['2 × base risk', '$200 / 100 units']],
    limitations: 'The comparison excludes fees, slippage, broker lot increments and margin rules. It does not make a larger risk allocation preferable or guarantee that a stop will contain a loss.',
    related: ['position-risk-planner', 'risk-reward', 'portfolio-stress-test']
  },
  review: {
    title: 'Trading Process Review: Plan, Risk, Execution & Lessons',
    intro: 'Keep a written trade thesis and review five observable parts of your process. Save the reasoning alongside a checklist you can revisit later.',
    sections: [
      ['Record the decision in your own words', 'Write the trade thesis, the evidence considered and the lesson you want to retain. The workspace accepts up to 2,000 characters of notes. Separate facts available before the trade from interpretations made after the outcome. A profitable result does not prove that the decision process was sound, and a losing result does not by itself prove the opposite.'],
      ['Review five concrete checks', 'The checklist covers a defined entry plan, a checked risk budget, scheduled events, execution that followed the plan, and a recorded outcome and lesson. Each checked item contributes 20 points to a completion score. The result lists completed and missing checks so that the next review has a clear starting point. Save a named workspace when you want to retain the notes and checklist state.']
    ],
    inputs: [['Written review', 'Trade thesis, execution notes and lesson'], ['Five checks', 'Plan, risk, event awareness, execution and outcome review'], ['Workspace name', 'A label for finding this saved review later']],
    example: 'If the entry plan, risk budget and event check are complete, but execution and the final review are not, the completion score is 60%. The two remaining checks stay visible; the score says nothing about profitability.',
    outputs: [['Completed checks', '3 of 5'], ['Completion score', '60%'], ['Next review', 'Execution and outcome notes']],
    limitations: 'This is a self-assessment, not a trading performance rating or an independent audit. The tool does not verify that a checked action occurred. The quality of the notes matters more than the score.',
    related: ['trading-journal', 'journal-analytics', 'research-watchlists']
  },
  export: {
    title: 'Trading Journal CSV Export for Spreadsheet Analysis',
    intro: 'Download dated Journal records as a CSV file for your own spreadsheet review. Keep a portable copy of the values you recorded in FYNX.',
    sections: [
      ['Know what the export contains', 'The export includes date, symbol, session, realized P/L and notes from up to 1,000 dated trades returned by your account workspace. It is a Journal-data export, not a broker statement. Entry prices, stops and targets are not columns in this export. The download displays its row count so you can compare it with the period and records you expected.'],
      ['Check the spreadsheet interpretation', 'Open the CSV with a spreadsheet import flow and confirm how dates and decimal values are interpreted in your locale. Quoted text preserves commas and quotation marks inside notes. Text beginning with certain spreadsheet formula characters is escaped for safer opening. Keep the original export before applying filters, sorting or editing values in a working copy. The export operation does not alter your saved Journal.']
    ],
    inputs: [['Source', 'Your dated, saved Journal entries'], ['Columns', 'Date, Symbol, Session, Realized P/L, Notes'], ['File', 'CSV downloaded through your browser']],
    example: 'A recorded EURUSD trade dated 2026-01-15, assigned to London, with +$75 realized P/L and the note “Waited for the release” becomes one row. A comma inside the note remains part of the same cell when the CSV is imported correctly.',
    outputs: [['Format', 'CSV'], ['Record count', 'Shown beside the download'], ['Account data', 'Only the signed-in account’s returned records']],
    limitations: 'An export is only as complete and accurate as the recorded trades and returned sample. It is not a tax report or proof of broker execution. Store downloaded files appropriately if they contain private notes.',
    related: ['trading-journal', 'journal-analytics', 'trading-process-review']
  },
  watchlist: {
    title: 'Trading Research Watchlists: Symbols, Notes & News Links',
    intro: 'Save a focused list of symbols with research notes. Return to the same questions and open symbol-specific news from each result.',
    sections: [
      ['Build a list with a research purpose', 'Enter one to thirty symbols separated by commas and write the question that connects them. The tool normalizes symbols to uppercase and removes repeated entries. Notes can describe an upcoming event, an observation to verify or the reason a symbol belongs on the list. A ticker alone may be ambiguous across exchanges, so record the venue or instrument context where necessary.'],
      ['Separate organization from market data', 'The result contains the saved symbol list, notes and links into FYNX Symbol News. It does not stream prices, verify that a ticker exists on every venue or place trades. Save a named workspace to retain the list across signed-in sessions. Revisit the notes after a scheduled release and distinguish what changed from what was already known.']
    ],
    inputs: [['Symbols', '1–30 comma-separated entries'], ['Research notes', 'Up to 2,000 characters'], ['Saved workspace', 'A name that describes the research purpose']],
    example: 'Entering “aapl, AAPL, MSFT” produces two normalized symbols: AAPL and MSFT. A note about comparing their next earnings releases stays with the list, and each symbol has a link to its news search.',
    outputs: [['Normalized list', 'AAPL, MSFT'], ['Duplicates', 'Removed'], ['Next action', 'Open news for the selected symbol']],
    limitations: 'A watchlist is an organizational aid. Prices, alert delivery and trading signals are not supplied. News coverage depends on the connected provider and the symbol query.',
    related: ['symbol-news', 'economic-calendar', 'trading-process-review']
  },
  portfolio: {
    title: 'Portfolio Stress Test: Exposure, Leverage & Price Shocks',
    intro: 'Estimate the effect of one parallel price shock on a set of signed position values. Compare gross exposure, net exposure and the resulting account equity.',
    sections: [
      ['Put every position on the same basis', 'Enter account equity and one to thirty positions in a common account currency. Use a positive signed notional for a long exposure and a negative value for a short exposure. Each line contains a symbol and its signed value. Convert foreign-currency positions before entering them; the tool does not retrieve prices or exchange rates.'],
      ['Distinguish gross from net exposure', 'Gross exposure adds absolute position values, while net exposure retains their signs. Gross leverage divides gross exposure by account equity. The same percentage price shock is applied to every row, and the row effects are summed to estimate scenario P/L and equity. An offsetting net figure can therefore hide substantial gross exposure and instrument-specific risks.']
    ],
    inputs: [['Account equity', 'The starting equity for the scenario'], ['Positions', 'SYMBOL, signed value in account currency'], ['Parallel shock', 'A common percentage move from −100% to +100%']],
    example: 'With $10,000 equity, positions of +$6,000, +$4,000 and −$2,000 have $12,000 gross and $8,000 net exposure. A parallel −5% shock produces −$300, −$200 and +$100: −$400 overall, leaving $9,600 modeled equity.',
    outputs: [['Gross exposure', '$12,000'], ['Net exposure', '$8,000'], ['Gross leverage', '1.2 ×'], ['Scenario equity', '$9,600']],
    limitations: 'This linear parallel-shock model is not value at risk. It ignores correlations, different asset shocks, nonlinear option payoffs, fees, margin calls and liquidation. It does not estimate how likely the scenario is.',
    related: ['scenario-comparison', 'correlation', 'margin']
  },
  simulation: {
    title: 'Trading Drawdown Simulator: 500 Hypothetical Equity Paths',
    intro: 'Explore how repeated wins and losses could affect equity under fixed assumptions. Compare simulated ending balances and drawdown across 500 paths.',
    sections: [
      ['Make the assumptions explicit', 'Enter starting equity, risk per trade, assumed win rate, reward-to-risk ratio and one to five hundred trades per path. Each simulated loss reduces current equity by the entered risk fraction; a win increases current equity by that fraction multiplied by the reward-to-risk assumption. Position risk therefore compounds as equity changes.'],
      ['Read the distribution, not just one curve', 'The output summarizes ending-equity percentiles, the median, the 90th-percentile maximum drawdown and the percentage of paths ending below the starting balance. One illustrated curve is only one of the 500 paths. A fixed random seed makes comparisons repeatable. Changing assumptions explores the model’s sensitivity; it does not reveal the true probability of a future trading outcome.']
    ],
    inputs: [['Equity and risk', 'Starting balance and fixed-fractional risk per trade'], ['Outcome assumptions', 'Win rate and reward-to-risk ratio'], ['Length', '1–500 trades in each of 500 paths']],
    example: 'At 1% risk per trade, ten consecutive modeled losses reduce $10,000 to $10,000 × 0.99¹⁰, approximately $9,043.82. That is a 9.56% decline. The example shows compounding; it does not estimate the chance of such a streak.',
    outputs: [['Paths', '500'], ['Ending equity', '10th, 50th and 90th percentiles'], ['Drawdown', '90th percentile of each path’s maximum decline'], ['Loss frequency', 'Paths ending below initial equity']],
    limitations: 'Trades are modeled as independent with fixed win rate and payoff. Fees, slippage, changing market conditions and liquidity constraints are excluded. A percentile from assumed inputs is not a confidence guarantee or forecast.',
    related: ['compound', 'portfolio-stress-test', 'journal-analytics']
  },
  journal: {
    title: 'Free Trading Journal: Record Trades & Review Realized Results',
    intro: 'Keep your plan, actual realized result and review notes together. A free FYNX account lets you save trades and return to your history across signed-in sessions.',
    sections: [
      ['Record a trade with enough context', 'The Journal entry includes symbol, date, entry, stop, target, realized P/L, session and notes. Enter the actual closed-trade result in your account currency. The distance between entry and stop describes planned price risk; it cannot replace a realized result that includes what actually happened during execution. Use notes to record the original thesis and any deviation from the plan.'],
      ['Review the history you have recorded', 'The Journal dashboard includes trade count, win rate, realized P/L, session summaries, streaks, a calendar and trade-by-trade review. Date-range controls let you examine the recorded period. The cumulative curve reflects entered results rather than a live broker account. A free account is required to save and synchronize entries; optional Pro products add separate advanced analysis and CSV export.']
    ],
    inputs: [['Trade context', 'Symbol, date and trading session'], ['Plan', 'Entry, stop and target prices'], ['Outcome', 'Actual realized P/L and review notes']],
    example: 'Suppose a planned long entry is 100 with a stop at 98 and target at 104. The planned price ratio is 2:1. If the actual closed trade returned $75 after your chosen accounting treatment, record $75 as realized P/L rather than substituting the hypothetical target profit.',
    outputs: [['Trade record', 'Plan, actual result and notes'], ['Review', 'History, calendar and session summaries'], ['Account access', 'Free account for saving and sync']],
    limitations: 'The Journal relies on what you enter. It does not execute trades or automatically reconcile broker statements. Sample results shown in demo mode are examples, not your performance.',
    related: ['journal-analytics', 'journal-export', 'trading-process-review']
  }
};
