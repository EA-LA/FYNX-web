# Edge browser audit method

Browser interaction remains in the approved computer-use session. The helper below only assembles a local audit payload; it does not launch Chromium, attach to a debug port or run browser automation outside that session.

For this implementation, the official `axe-core` package was installed as version `4.14.0` under `/tmp/fynx-edge-audit-tools`, with package scripts disabled and without modifying repository dependencies. Recreate the temporary tool and payload with:

```sh
npm install --prefix /tmp/fynx-edge-audit-tools --ignore-scripts --no-audit --no-fund --package-lock=false axe-core@4.14.0
node scripts/edge-audit-payload.cjs /tmp/fynx-edge-audit-tools/node_modules/axe-core/axe.min.js /tmp/fynx-edge-audit-payload.js
```

After navigating to the intended page, setting the viewport and waiting for its actual snapshot, read this payload through the approved computer-use runtime and execute it using that runtime's supported `Runtime.evaluate` call with `awaitPromise:true` and `returnByValue:true`. Save the returned value as evidence. Repeat for main/detail pages and relevant dialogs or error states, because axe checks rendered content. Do not convert a fixture-based page or empty loading view into evidence for a populated live result.

The JSON reports:

- Axe version, browser user agent, current URL, capture time and viewport.
- Whole-document WCAG 2.0/2.1/2.2 A/AA and best-practice violations, incomplete checks and pass counts. Incomplete checks require review; they are not passes.
- Document width versus viewport width, for the requested no-horizontal-overflow checks.
- Actual browser navigation and paint entries, the latest available buffered LCP, session-window CLS and observed long tasks. The collector reads these before running axe so the audit's own work is not included in the reported samples.

These observations are **not Lighthouse scores**, emulated-phone benchmarks, field Core Web Vitals or full accessibility certification. In particular, observed long-task blocking time is not Lighthouse TBT. Buffered performance entries can be incomplete when a page has been open for a long time or has already received input; retain the observation context.

Lighthouse supports an offline `--audit-mode`, but it processes complete artifacts produced by its gatherers: artifacts JSON, a navigation trace and DevTools protocol log. DOM snapshots and a few Performance API metrics do not establish those artifacts. Its official user-flow documentation states that snapshot mode has no performance score or metrics and timespan mode has no overall performance score. Therefore, the requested Lighthouse performance ≥90 and accessibility ≥95 gates remain unmeasured until a real Lighthouse navigation audit is run through an allowed environment. Do not synthesize an artifact file to force a score.

Primary references: [Lighthouse architecture](https://github.com/GoogleChrome/lighthouse/blob/main/docs/architecture.md), [Lighthouse user-flow modes](https://github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md), [axe-core browser API](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md).
