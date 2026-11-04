'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {publicSiteFiles} = require('./public-site-files.cjs');
const groups = require('../content/company-products.cjs');
const root = path.resolve(__dirname,'..');
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cards() {
 return groups.map(group=>`<section class="fp-group" data-product-group id="products-${group.id}" aria-labelledby="products-${group.id}-title"><h2 id="products-${group.id}-title">${esc(group.title)}</h2><ul>${group.items.map(item=>`<li data-product-item><a href="${esc(item.href)}"><span class="fp-item-title">${esc(item.name)}<span aria-hidden="true" class="fp-arrow">${item.href.startsWith('https:')?'↗':'→'}</span></span>${item.status?`<span class="fp-status">${esc(item.status)}</span>`:''}<span class="fp-description">${esc(item.description)}</span></a></li>`).join('')}</ul></section>`).join('');
}
function buildPage(base=root) {
 fs.writeFileSync(path.join(base,'assets/js/company-products-data.js'),'/* Generated from content/company-products.cjs. */\nwindow.FynxCompanyProducts = '+JSON.stringify(groups).replace(/</g,'\\u003c')+';\n');
 fs.writeFileSync(path.join(base,'products.html'),`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FYNX Company & Products | The FYNX Ecosystem</title><meta name="description" content="Explore FYNX products, websites, trading tools, research, news, learning and developer services in one directory, with clear availability information."><meta name="robots" content="index,follow"><link rel="canonical" href="https://www.fynxfinanceworld.com/products.html"><link rel="icon" href="/favicon-32x32.png"></head>
<body class="fp-directory"><header class="fp-directory-header"><a href="/" aria-label="FYNX Finance World home">FYNX <small>FINANCE WORLD</small></a><a href="/home.html">Open your workspace ↗</a></header><main id="main"><section class="fp-directory-intro"><p class="fp-eyebrow">THE COMPANY & ITS PRODUCTS</p><h1>One FYNX.<br><span>Explore the possibilities.</span></h1><p>From your first calculation to your daily research. Discover our products, websites and services, all in one place.</p><a href="/about.html">Get to know FYNX →</a></section><div class="fp-directory-filter" data-product-filter hidden><label for="fp-directory-search">Find a product or tool</label><input id="fp-directory-search" type="search" data-company-products-search placeholder="Try Wallet, news, risk or API…"><p data-company-products-count role="status" aria-live="polite"></p></div><p class="fp-empty" data-product-empty hidden>No matches. Try a different product, topic or tool.</p><div class="fp-directory-groups">${cards()}</div><section class="fp-directory-end"><h2>Looking for a specific tool or lesson?</h2><p>The resource library brings together every public calculator, guide and learning resource.</p><a href="/explore.html">Explore the full resource library →</a></section></main><footer class="fp-directory-footer"><span>FYNX · Built around your process.</span><a href="/contact.html">Contact</a><a href="/risk-disclosure.html">Risk disclosure</a><a href="/">Finance World home</a></footer></body></html>\n`);
}
function eligible(file,html) {
 return !/^(?:auth\/|api\/(?!index\.html$|docs\.html$)|directory\.html$|404\.html$|waitlist\.html$)/.test(file) && !/(?:admin|embed|print|callback|redirect)/i.test(file) && !/http-equiv=["']refresh/i.test(html) && /<body\b/i.test(html) && /<\/head>/i.test(html);
}
function inject(base=root) {
 let count=0;
 for(const file of publicSiteFiles(base)) {
  const full=path.join(base,file);let html=fs.readFileSync(full,'utf8');
  html=html.replace(/<!-- company-products:assets:start -->[\s\S]*?<!-- company-products:assets:end -->\s*/g,'').replace(/\s*<!-- company-products:launch:start -->[\s\S]*?<!-- company-products:launch:end -->\s*/g,'');
  if(!eligible(file,html))continue;
  const assets='<!-- company-products:assets:start --><link rel="stylesheet" href="/assets/css/company-products.css"><script src="/assets/js/company-products-data.js" defer></script><script src="/assets/js/company-products.js" defer></script><!-- company-products:assets:end -->\n';
  const launch='\n<!-- company-products:launch:start --><div id="fynx-products-launch" class="fp-launch"><a class="fp-trigger" data-company-products-open href="/products.html" aria-label="FYNX: Company & Products"><span class="fp-trigger-full">FYNX Products</span><span class="fp-trigger-short">Products</span><span aria-hidden="true">⌄</span></a></div><!-- company-products:launch:end -->\n';
  html=html.replace('</head>',assets+'</head>').replace(/<body\b[^>]*>/,match=>match+launch);
  fs.writeFileSync(full,html);count++;
 }
 console.log(`Company & Products menu added to ${count} pages; ${groups.reduce((n,g)=>n+g.items.length,0)} directory entries.`);
 return count;
}
module.exports={buildPage,inject,eligible,groups};
if(require.main===module){buildPage();inject();}
