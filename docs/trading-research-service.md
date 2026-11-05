# Trading research on Finance World

GitHub Pages serves the Edge and Quant pages. The two pages send research API calls on the canonical domain to the existing FYNX Firebase project's `webTradingResearch` HTTP function; a development server continues to use relative URLs. The function only handles `/api/edge/*` and `/api/quant/*`.

Public research is refreshed by the scheduled **Refresh public market research** workflow. Its data-only `research-data` branch and the website release contain the same archive schema. The function also packages a dated baseline. Preserve the source date, price side, timeframe and coverage when serving a fallback. Completed D1 candles are historical bids, never current tradable quotes. Historical event tests require observations with the necessary time precision. A published calendar entry or a known release day is not an observed intraday release.

Firebase ID tokens protect saved research, watchlists and EA settings. The backend uses Admin SDK access to the `fynxResearchPrivateV1` collection. The public data branch contains no user records. `webTradingResearchAccountDeleted` deletes this collection's records for the deleted Firebase user. It does not administer Accounts, payment systems or other functions. The standalone research service retains only the latest read-only EA report for account guard; it does not import broker account history or enable email delivery.

## Maintenance

Run from the website checkout:

    npm run build
    node --test tests/research-runtime.test.cjs
    npm run test:edge
    npm run test:quant
    node scripts/package-research-service.cjs
    npm ci --prefix .deploy-work/research/functions
    cd .deploy-work/research
    firebase deploy --only functions:trading-research:webTradingResearch,functions:trading-research:webTradingResearchAccountDeleted --project fynx-c7a28 --non-interactive --force

The two explicit selectors isolate this deployment. The force switch accepts retry of the idempotent deletion hook. There is no change to Firestore rules or other Firebase codebases. A website push and a function deployment are separate releases. Check both before announcing a release.
