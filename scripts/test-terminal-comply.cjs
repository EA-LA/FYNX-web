/* COMPLY: the compliance screen flags promissory, predictive and hypothetical language, requires the right
 * disclosures, and its cleaner draft scores better. */
const fs = require('fs'), path = require('path');
global.window = {FynxTerminalPlugins: []}; global.document = {head: {append() {}}};
const stubEl = () => ({style: {setProperty() {}}, append() {}});
const T = {el: stubEl, btn: stubEl, svg: stubEl, $: () => null, panel: stubEl, setText() {}, store: {get: () => null, set() {}}, empty() {}, finite: v => typeof v === 'number' && Number.isFinite(v), report() {},
  PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [], PAGE_NAMES: [], TABBED: new Set(), DESK_ORDER: ['all'], DESK_DEFS: {all: {}}, premium() {}};
const pages = {}; const PG = {add: (n, l, r) => { pages[n] = r; }, setHead() {}, rerender() {}};
for (const f of ['quantlab.js', 'quantlab-research.js', 'comply.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal', f), 'utf8'));
for (const f of window.FynxTerminalPlugins) f(T, PG);
let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const C = T.Comply;
ok(pages.comply && pages.finra && T.PAGE_NAMES.includes('COMPLY'), 'COMPLY page and aliases registered');
const bad = 'NVDA is the best AI stock and it will double by summer 🚀. Our members made 340% last year, and our backtest shows it would have turned $10,000 into $95,000. Guaranteed returns with almost no risk. Act now: load up before it’s too late! I heard from a friend at the company it is not yet public.';
const r = C.scan(bad), ids = new Set(r.flags.map(f => f.id));
ok(['guarantee', 'projection', 'hypothetical', 'performance', 'testimonial', 'superlative', 'pressure', 'hype', 'advice', 'mnpi'].every(i => ids.has(i)), 'all ten rule families fire on a bad post: ' + [...ids].join(', '));
ok(r.high >= 4 && r.score < 30, `bad post: ${r.high} high flags, score ${r.score}`);
ok(r.missing.map(c => c.k).sort().join() === ['conflicts', 'hypo', 'notadvice', 'past', 'risk', 'source'].sort().join(), 'all needed disclosures reported missing: ' + r.missing.map(c => c.k).join(', '));
const good = 'Our model portfolio returned 8.2% in 2025 (net of fees, source: FYNX research, as of Dec 31, 2025). Hypothetical results do not represent actual trading. Past performance does not guarantee future results. Investing involves risk, including possible loss of principal. This is not investment advice. The author does not hold a position in the securities mentioned.';
const g = C.scan(good);
ok(g.high === 0 && g.medium === 0 && g.missing.length === 0 && g.score >= 85, `compliant text: score ${g.score}, ${g.low} low flags (labelled hypothetical and past-performance context downgrade them)`);
const fixed = C.rewrite(bad, r), r2 = C.scan(fixed);
ok(!/guaranteed|will double|act now|🚀|no-brainer/i.test(fixed) && r2.score > r.score && r2.missing.length < r.missing.length, `cleaner draft: score ${r.score} → ${r2.score}`);
ok(C.scan('The market rose 1% today.').missing.some(c => c.k === 'past') && C.scan('Plain text with no claims at all.').flags.length === 0, 'performance needs a past-performance line; plain text has no flags');
console.log(fail ? `${fail} compliance check(s) failed` : 'Compliance screen: rule families, disclosures, scoring and rewrite checks passed');
process.exit(fail ? 1 : 0);
