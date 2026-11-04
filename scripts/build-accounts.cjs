'use strict';
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
const providers=['mt5','mt4','ctrader','dxtrade','tradelocker','matchtrader','oanda','ibkr','binance','bybit','ea','file'];
const routes=['/profile/accounts','/profile/accounts/connect',...providers.map(p=>'/profile/accounts/connect/'+p),'/profile/security','/profile/accounts/privacy','/profile/accounts/admin'];
function buildPages(){
 const fragment=fs.readFileSync(path.join(root,'content/accounts.fragment'),'utf8');
 const navigation=[['Home','/home.html'],['Journal','/journal.html'],['Calculator','/calculator.html'],['News','/news.html'],['Calendar','/calendar.html'],['Learn','/learn.html'],['Explore','/explore.html'],['Research','/tools/research-desk.html'],['Quant Analyst','/quant-analyst.html'],['Edge Radar','/edge-radar/'],['Profile','/profile/accounts']];
 for(const route of routes){
  const title=route.endsWith('/connect')?'Connect your trading account':route==='/profile/security'?'Account security':route.endsWith('/privacy')?'Your trading account data':route.endsWith('/admin')?'Prop rules administration':route.includes('/connect/')?'Connect '+providers.find(p=>route.endsWith('/'+p)):'My accounts';
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${title} | FYNX</title><link rel="icon" href="/favicon-32x32.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/css/accounts.css"><script type="module" src="/assets/js/accounts/app.js"></script></head><body class="accounts-page" data-accounts-route="${route}"><a href="#accounts-main" class="ac-skip">Skip to your accounts</a><header class="accounts-header"><a class="accounts-brand" href="/" aria-label="FYNX Finance World home"><strong>FYNX</strong><span>FINANCE WORLD</span></a><nav class="accounts-header-links" aria-label="Main navigation"><a href="/explore.html">Explore tools</a><a href="/pro.html">Pro tools & plans</a><a class="ac-login-link" href="/profile/security">Private account</a></nav></header><nav class="accounts-nav" aria-label="Workspace navigation">${navigation.map(([label,href])=>`<a href="${href}"${label==='Profile'?' aria-current="page"':''}>${label}</a>`).join('')}</nav>${fragment}<noscript><p>JavaScript and sign-in are required to manage private account connections.</p></noscript></body></html>`;
  const file=path.join(root,route,'index.html');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,html);
 }
}
function buildBundles(){if(fs.existsSync(path.join(root,'lib/accounts/index.ts')))esbuild.buildSync({entryPoints:[path.join(root,'lib/accounts/index.ts')],bundle:true,target:'node22',platform:'node',format:'cjs',legalComments:'none',outfile:path.join(root,'backend/accounts/engine.cjs')});}
function build(){buildPages();buildBundles();console.log('Built private My Accounts routes.');}
module.exports={build,buildPages,buildBundles,routes};if(require.main===module)build();
