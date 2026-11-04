'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function buildPage() {
  const header = fs.readFileSync(path.join(root, 'tools/research-desk.html'), 'utf8').match(/<header class="discovery-header">[\s\S]*?<\/header>/)[0];
  const content = fs.readFileSync(path.join(root, 'content/quant-analyst.fragment'), 'utf8');
  fs.writeFileSync(path.join(root, 'quant-analyst.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quant Analyst: Backtests, Portfolio & Monte Carlo | FYNX</title>
<meta name="description" content="Research ATR breakout and news strategies using attributed historical data, walk-forward optimization, portfolio analysis and reproducible risk simulations.">
<link rel="canonical" href="https://www.fynxfinanceworld.com/quant-analyst.html">
<link rel="icon" href="/favicon-32x32.png"><script src="/assets/js/site-theme-init.js?v=20261011"></script>
<link rel="stylesheet" href="/assets/funded-system.css"><link rel="stylesheet" href="/assets/site-design.css"><link rel="stylesheet" href="/assets/discovery.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="/assets/js/journal-theme.js" defer></script><script type="module" src="/assets/js/session-bootstrap.js"></script>
<script src="/assets/js/quant/engine.js" defer></script><script src="/assets/js/quant/app.js" defer></script>
</head><body data-fynx-layout="standalone" class="discovery-page quant-page" data-fynx-terminal>
<a class="discovery-skip" href="#quant-main">Skip to Quant Analyst</a>${header}
${content}<noscript><p>JavaScript is required for calculations. Read the risk disclosure and data sources before using these tools.</p></noscript></body></html>`);
}
function buildBundles() {
  const esbuild = require('esbuild');
  const common = { bundle: true, target: 'es2022', legalComments: 'none' };
  fs.mkdirSync(path.join(root, 'assets/js/quant'), { recursive: true });
  fs.mkdirSync(path.join(root, 'backend/quant'), { recursive: true });
  esbuild.buildSync({...common, entryPoints:[path.join(root,'lib/quant/index.ts')], platform:'browser',format:'iife',globalName:'FynxQuant',outfile:path.join(root,'assets/js/quant/engine.js')});
  esbuild.buildSync({...common, entryPoints:[path.join(root,'lib/quant/worker.ts')],platform:'browser',format:'iife',outfile:path.join(root,'assets/js/quant/worker.js')});
  esbuild.buildSync({...common,entryPoints:[path.join(root,'lib/quant/index.ts')],platform:'node',format:'cjs',outfile:path.join(root,'backend/quant/engine.cjs')});
  fs.copyFileSync(require.resolve('plotly.js-dist-min'),path.join(root,'assets/js/quant/plotly.min.js'));
}
function build() { buildPage(); buildBundles();
  const profile=path.join(root,'profile.html');let html=fs.readFileSync(profile,'utf8');if(!html.includes('/assets/js/quant/profile.js'))html=html.replace('</body>','<script src="/assets/js/quant/profile.js" defer></script></body>');fs.writeFileSync(profile,html);
 console.log('Built Quant Analyst page, browser worker and server engine.'); }
module.exports = {build,buildPage,buildBundles};
if (require.main === module) build();
