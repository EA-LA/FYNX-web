/* Shared catalog for public pages and the authenticated workspace. */
(function(root){
  const catalog={
  "analytics": [
    "Journal intelligence",
    "Essential",
    "Find expectancy, profit factor and realized drawdown in your saved trades.",
    "/tools/journal-analytics.html"
  ],
  "risk": [
    "Position risk planner",
    "Essential",
    "Model position units, risk budget and reward from your own contract inputs.",
    "/tools/position-risk-planner.html"
  ],
  "scenarios": [
    "Scenario comparison",
    "Essential",
    "Compare four risk budgets side by side before choosing your exposure.",
    "/tools/scenario-comparison.html"
  ],
  "review": [
    "Trading process review",
    "Essential",
    "Use a five-point checklist and save the reasoning behind your decisions.",
    "/tools/trading-process-review.html"
  ],
  "export": [
    "Journal export",
    "Essential",
    "Download your dated Journal entries as a spreadsheet-ready CSV.",
    "/tools/journal-export.html"
  ],
  "watchlist": [
    "Research watchlists",
    "Essential",
    "Save symbols and research notes, then open symbol-specific news.",
    "/tools/research-watchlists.html"
  ],
  "portfolio": [
    "Portfolio stress test",
    "Plus",
    "See gross exposure, leverage and account impact under a parallel price shock.",
    "/tools/portfolio-stress-test.html"
  ],
  "simulation": [
    "Drawdown simulator",
    "Professional",
    "Explore 500 hypothetical equity paths from your win-rate and risk assumptions.",
    "/tools/drawdown-simulator.html"
  ]
};
  if(typeof module!=="undefined"&&module.exports)module.exports=catalog;
  else root.FynxProCatalog=catalog;
})(typeof window!=="undefined"?window:globalThis);
