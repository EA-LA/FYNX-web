// Generate real HTML entry points and enhance existing pages without changing their calculators.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const base = 'https://www.fynxfinanceworld.com';
const outlines = require('../content/lesson-outlines.json');
const lessons = require('../content/lesson-details.cjs');
const sources = require('../content/learning-sources.json');
const guides = require('../content/tool-guides.cjs');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = title => title.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const labels = {stocks:'Stocks',funds:'Funds & ETFs',futures:'Futures',forex:'Forex',crypto:'Crypto',indices:'Indices',bonds:'Bonds',economy:'Economy',options:'Options'};
const urlFor = (topic,item) => `/learn/lessons/${topic}/${slug(item.title)}.html`;
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root,file)), {recursive:true}); fs.writeFileSync(path.join(root,file),text.replace(/^[ \t]+$/gm,'')); };
const json = value => JSON.stringify(value).replace(/</g,'\\u003c');
const headAssets = '<link rel="stylesheet" href="/assets/discovery.css?v=20261012"><script src="/assets/js/discovery.js?v=20261012" defer></script>';
function page({title,description,body,layout='standalone',extra=''}) {
 return `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><script src="/assets/js/site-theme-init.js?v=20261011"></script><link rel="icon" href="/favicon-32x32.png"><link rel="stylesheet" href="/assets/funded-system.css"><link rel="stylesheet" href="/assets/site-design.css?v=20261011">${headAssets}${extra}<script src="/assets/js/journal-theme.js?v=20260922-routing" defer></script></head><body data-fynx-layout="${layout}" class="discovery-page"><a class="discovery-skip" href="#main">Skip to content</a><header class="discovery-header"><a class="discovery-brand" href="/" aria-label="FYNX Finance World home">↗ FYNX<span>FINANCE WORLD</span></a><nav aria-label="Main navigation"><a href="/explore.html">Explore</a><a href="/learn.html">Learn</a><a href="/home.html" class="discovery-button">Open workspace <span aria-hidden="true">↗</span></a></nav></header><main id="main">${body}</main><footer class="discovery-footer"><a href="/explore.html">All resources</a><a href="/accessibility.html">Connection help &amp; light browsing</a><a href="/contact.html">Contact</a><a href="/risk-disclosure.html">Risk disclosure</a><span>FYNX Finance World · Tools for your own research.</span></footer></body></html>\n`;
}
const publicProducts=require('./build-product-pages.cjs')({page,write,escape});
let lessonPaths=[];
for (const [topic, items] of Object.entries(outlines)) {
 if (lessons[topic]?.length !== items.length) throw Error(`Missing lesson content: ${topic}`);
 items.forEach((item,i) => {
  const detail=lessons[topic][i], route=urlFor(topic,item), [sourceName,sourceUrl]=sources[topic];
  const body=`<nav class="discovery-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/learn.html">Learn</a><span>/</span><a href="/learn/${topic}-howto.html">${escape(labels[topic])}</a></nav><div class="lesson-layout"><article class="lesson-article"><header class="lesson-intro"><div class="discovery-kicker">${escape(labels[topic])} / ${escape(item.level)}</div><h1>${escape(item.title)}</h1><p class="discovery-lead">${escape(item.desc)}</p><div class="lesson-meta">FYNX learning guide <span>•</span> Educational example <span>•</span> <button type="button" data-save-resource>Save resource</button></div></header><nav class="lesson-toc" aria-label="On this page">${detail.sections.map(([h],n)=>`<a href="#section-${n+1}">${escape(h)}</a>`).join('')}<a href="#example">Worked example</a><a href="#practice">Practice</a></nav>${detail.sections.map(([h,p],n)=>`<section id="section-${n+1}"><h2>${escape(h)}</h2><p>${escape(p)}</p></section>`).join('')}<section class="lesson-example" id="example"><div class="discovery-kicker">WORKED EXAMPLE</div><h2>Put the idea into numbers</h2><p>${escape(detail.example)}</p><small>Illustrative assumptions; no live quote or promised outcome.</small></section><section id="practice"><h2>Try it in your research</h2><p>${escape(detail.exercise)}</p><a class="discovery-textlink" href="/learn/${topic}-quizzes.html">Test your ${escape(labels[topic].toLowerCase())} knowledge →</a></section><section class="lesson-source"><h2>Continue reading</h2><a href="${sourceUrl}">${escape(sourceName)} ↗</a><p>Background reading from the publisher. This guide is educational and does not recommend a position or allocation.</p></section><nav class="lesson-sequence" aria-label="More lessons">${i?`<a href="${urlFor(topic,items[i-1])}"><small>Previous lesson</small>${escape(items[i-1].title)}</a>`:''}${i<items.length-1?`<a href="${urlFor(topic,items[i+1])}"><small>Next lesson</small>${escape(items[i+1].title)} →</a>`:`<a href="/learn/${topic}-quizzes.html"><small>Next step</small>Practice with a quiz →</a>`}</nav></article><aside class="lesson-aside"><div class="discovery-kicker">YOUR ${escape(labels[topic].toUpperCase())} PATH</div><ol>${items.map((other,n)=>`<li><a ${n===i?'aria-current="page"':''} href="${urlFor(topic,other)}">${escape(other.title)}</a></li>`).join('')}</ol><a href="/learn/${topic}-glossary.html">Open the glossary →</a><a href="/explore.html?category=Tools">Put a tool to work →</a></aside></div>`;
  const articleSchema={'@context':'https://schema.org','@type':'LearningResource',name:item.title,description:item.desc,url:base+route,learningResourceType:'Study guide',educationalLevel:item.level,inLanguage:'en',provider:{'@type':'Organization',name:'FYNX Finance World',url:base}};
  write(route.slice(1),page({title:`${item.title} | FYNX`,description:item.desc,body,extra:`<script type="application/ld+json">${json(articleSchema)}</script>`}));lessonPaths.push(route);
 });
}
// Legacy views remain usable, but only their substantive destination is in discovery and the sitemap.
const aliases = {'tools/heatmap.html':'tools/research-heatmap.html','learn/risk-management.html':'risk-management.html','learn/trading-psychology.html':'trading-psychology.html','resources/market-analysis.html':'market-analysis.html','resources/quizzes.html':'trading-quizzes.html','resources/trading-glossary.html':'trading-glossary.html','tools/profit-loss.html':'tools/stock.html','tools/options-payoff.html':'tools/debt-payoff.html','waitlist.html':'home.html'};
// Company pages retain their editorial navigation and curated onward links.
const companyFiles = new Set(['about.html', 'founder.html']);
const privateFiles = new Set(['home.html','learn/topic.html','waitlist.html']);
function allHTML(dir='') {
 return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{
  const f=path.posix.join(dir,e.name);
  if(e.isDirectory())return ['.git','node_modules','output','dist','backend','docs','ops','scripts'].includes(e.name)?[]:allHTML(f);
  return e.name.endsWith('.html')?[f]:[];
 });
}
function category(file) {
 if(file.startsWith('tools/')||file==='calculator.html')return 'Tools';
 if(file.startsWith('learn/')||['learn.html','risk-management.html','trading-psychology.html','trading-glossary.html','trading-quizzes.html'].includes(file))return 'Learning';
 if(file.startsWith('markets/')||file==='market-analysis.html')return 'Markets';
 if(file.startsWith('news/')||['news.html','calendar.html','home/hub.html'].includes(file))return 'News & events';
 if(file.startsWith('api/'))return 'Developers';
 return 'Resources';
}
function replaceBlock(html,id,content,anchor='</main>') {
 html=html.replace(new RegExp(`<!-- ${id}:start -->[\\s\\S]*?<!-- ${id}:end -->\\s*`,'g'),'');
 if(!content)return html;
 const block=`<!-- ${id}:start -->${content}<!-- ${id}:end -->\n`;
 if(anchor==='</main>'&&/data-fynx-layout="workspace"/.test(html)) {
  const dom=new JSDOM(html,{includeNodeLocations:true});
  const area=dom.window.document.querySelector('.content-area');
  const end=area&&dom.nodeLocation(area)?.endTag?.startOffset;dom.window.close();
  if(Number.isInteger(end))return html.slice(0,end)+block+html.slice(end);
 }
 if(anchor==='</main>'&&!html.includes(anchor)) {
  const dom=new JSDOM(html,{includeNodeLocations:true});
  const area=dom.window.document.querySelector('body > .wrap');
  const end=area&&dom.nodeLocation(area)?.endTag?.startOffset;dom.window.close();
  if(Number.isInteger(end))return html.slice(0,end)+block+html.slice(end);
  throw Error(`No content insertion point for ${id}`);
 }
 return html.replace(anchor,block+anchor);
}
function setHead(html,selector,value,tag) {
 const boundary=html.indexOf('</head>');let head=html.slice(0,boundary);head=head.replace(selector,'').replace(/\n[ \t]*\n+/g,'\n').trimEnd();return head+'\n'+tag(value)+'\n'+html.slice(boundary);
}
const assetBlock=`<!-- discovery-assets:start -->${headAssets}<!-- discovery-assets:end -->`;
let entries=[];
for(const file of allHTML()) {
 if(['explore.html','accessibility.html','directory.html'].includes(file))continue;
 let html=fs.readFileSync(path.join(root,file),'utf8');
 const clean=html.replace(/<!-- (tool-guide|discovery-(?:crumb|related|hub|schema|assets|network)):start -->[\s\S]*?<!-- \1:end -->/g,'');
 const dom=new JSDOM(clean), doc=dom.window.document;
 if(privateFiles.has(file))html=setHead(html,/<meta\b[^>]*name=["']robots["'][^>]*>/gi,'noindex,follow',v=>`<meta name="robots" content="${v}">`);
 const noindex=privateFiles.has(file)||doc.querySelector('meta[name="robots"]')?.content.includes('noindex');
 if(noindex||aliases[file]) {
  if(aliases[file])html=setHead(html,/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,base+'/'+aliases[file],v=>`<link rel="canonical" href="${v}">`);
  write(file,html);dom.window.close();continue;
 }
 // Legacy public protection imported Firebase just to call an empty function.
 html=html.replace(/<script\b[^>]*src=["'][^"']*assets\/js\/protect-route\.js[^"']*["'][^>]*>\s*<\/script>/g,'');
 if(/tradingview|s3\.tradingview|widget\.myfxbook/i.test(html))html=replaceBlock(html,'discovery-network',`<details class="network-help"><summary>Chart or live data unavailable?</summary><p>Some networks restrict embedded providers. You can still use <a href="/explore.html?category=Tools">local calculators</a>, read <a href="/learn.html">learning guides</a>, or open the <a href="/directory.html">lightweight directory</a>. For release times, check the <a href="https://www.bls.gov/schedule/">BLS</a> and <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm">Federal Reserve</a> calendars. <a href="/accessibility.html">Connection help →</a></p></details>`);
 const route=file==='index.html'?'/':file==='api/index.html'?'/api/':'/'+file;
 const title=doc.title, description=doc.querySelector('meta[name="description"]')?.content;
 if(!title||!description)throw Error(`Missing page metadata: ${file}`);
 const name=title.replace(/\s*(?:\||—|-)\s*FYNX(?: Finance World)?.*$/i,'').trim();
 const group=category(file);
 entries.push({url:route,title:name,description,category:group,...(publicProducts[route]?{access:publicProducts[route].access}:{}),topic:file.startsWith('learn/lessons/')?file.split('/')[2]:file.startsWith('learn/')?file.slice(6).split('-')[0]:'',keywords:[...doc.querySelectorAll('h1,h2,h3')].map(n=>n.textContent.trim()).slice(0,18).join(' ')});
 html=setHead(html,/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,base+route,v=>`<link rel="canonical" href="${v}">`);
 for (const [property,value] of [['og:title',title],['og:description',description],['og:url',base+route],['og:type',file.startsWith('learn/lessons/')||file==='founder.html'?'article':'website'],['og:image',base+'/assets/social/fynx-resources.png'],['og:image:alt','FYNX trading calculators, finance lessons and market research']]) html=setHead(html,new RegExp(`<meta\\b[^>]*property=["']${property}["'][^>]*>`,'gi'),value,v=>`<meta property="${property}" content="${escape(v)}">`);
 html=setHead(html,/<meta\b[^>]*name=["']twitter:card["'][^>]*>/gi,'summary_large_image',v=>`<meta name="twitter:card" content="${v}">`);
 html=html.replace(/<!-- discovery-assets:start -->[\s\S]*?<!-- discovery-assets:end -->\s*/g,'');
 if(!companyFiles.has(file)&&!html.includes('/assets/discovery.css'))html=html.replace('</head>',assetBlock+'\n</head>');
 const tool=guides[path.basename(file,'.html')];
 if(file.startsWith('tools/')&&tool){
  const [heading,formula,example,how,limits]=tool;
  html=replaceBlock(html,'tool-guide',`<section class="tool-explainer" aria-labelledby="tool-guide-title"><div class="discovery-kicker">HOW TO USE THIS TOOL</div><h2 id="tool-guide-title">${escape(heading)}</h2><div class="tool-explainer-grid"><div><h3>Start with your inputs</h3><p>${escape(how)}</p><h3>The calculation or concept</h3><p>${escape(formula)}</p></div><div class="tool-example"><h3>Worked example</h3><p>${escape(example)}</p><small>Hypothetical example, not a current quote.</small></div></div><details><summary>Assumptions and limitations</summary><p>${escape(limits)}</p></details></section>`);
 }
 if(!['index.html'].includes(file)&&!companyFiles.has(file)&&!file.startsWith('learn/lessons/')){
  let breadcrumb=`<div class="resource-wayfinding"><nav aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/explore.html?category=${encodeURIComponent(group)}">${escape(group)}</a></nav><div><a href="/explore.html">Find a resource</a><button type="button" data-save-resource>Save resource</button></div></div>`;
  html=html.replace(/<!-- discovery-crumb:start -->[\s\S]*?<!-- discovery-crumb:end -->\s*/g,'');
  // Workspace crumbs belong inside its scroll area, after the application header.
  const anchor=doc.body.dataset.fynxLayout==='workspace'?/(<(?:div|section)\b[^>]*class="[^"]*content-area[^"]*"[^>]*>)/:html.includes('<main')?/(<main\b[^>]*>)/:/(<div\b[^>]*class="wrap"[^>]*>)/;
  html=html.replace(anchor,`$1\n<!-- discovery-crumb:start -->${breadcrumb}<!-- discovery-crumb:end -->`);
 }
 const crumbs=companyFiles.has(file)?[{'@type':'ListItem',position:1,name:'Home',item:base+'/'},{'@type':'ListItem',position:2,name,item:base+route}]:[{'@type':'ListItem',position:1,name:'Home',item:base+'/'},{'@type':'ListItem',position:2,name:group,item:base+'/explore.html?category='+encodeURIComponent(group)},{'@type':'ListItem',position:3,name,item:base+route}];
 html=replaceBlock(html,'discovery-schema',`<script type="application/ld+json">${json({'@context':'https://schema.org','@type':file==='index.html'?'WebSite':'BreadcrumbList',...(file==='index.html'?{name:'FYNX Finance World',alternateName:'FYNX',url:base+'/'}:{itemListElement:crumbs})})}</script>`,'</head>');
 write(file,html);dom.window.close();
}
const categories=['Tools','Learning','Markets','News & events','Developers','Resources'];
entries=entries.filter(e=>e.url!=='/').sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category)||a.title.localeCompare(b.title));
function card(e) {return `<article class="discovery-card" data-resource-url="${e.url}" data-category="${escape(e.category)}" data-search="${escape([e.title,e.description,e.keywords,e.topic].join(' ').toLowerCase())}"><div class="discovery-card-top"><span>${escape(e.category)}${e.access?' / '+escape(e.access):''}${e.topic?' / '+escape(labels[e.topic]||e.topic):''}</span><button type="button" data-save-resource="${e.url}" aria-label="Save ${escape(e.title)}" aria-pressed="false">＋</button></div><h2><a href="${e.url}">${escape(e.title)}<span aria-hidden="true">↗</span></a></h2><p>${escape(e.description)}</p></article>`;}
const filters=['All',...categories,'Saved'];
const form=`<form class="discovery-search" action="/explore.html" role="search"><label for="resource-query">Find a tool, lesson or market topic</label><div><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="resource-query" name="q" type="search" placeholder="Try margin, position size, bonds…" autocomplete="off"><button type="submit">Search</button></div></form>`;
write('explore.html',page({title:'Trading Tools, Calculators & Finance Learning Library | FYNX',description:'Find FYNX trading calculators, finance lessons, quizzes, market research and economic calendars. Search by topic and save useful resources.',body:`<section class="discovery-hero"><div class="discovery-kicker">THE FYNX RESOURCE LIBRARY</div><h1>A question.<br><em>A place to start.</em></h1><p class="discovery-lead">Find the right calculation, understand the concept, and bring it into your process.</p>${form}<div class="discovery-popular"><span>Popular</span><a href="/tools/margin.html">Margin calculator ↗</a><a href="/tools/position-size.html">Position size ↗</a><a href="/tools/economic-calendar.html">Economic calendar ↗</a></div></section><section aria-label="Resource library" data-discovery-library><div class="discovery-filterbar"><div class="discovery-filters" aria-label="Filter by resource type">${filters.map((f,i)=>`<button type="button" data-filter="${escape(f)}" aria-pressed="${i===0}">${escape(f)}</button>`).join('')}</div><p id="discovery-count" role="status" aria-live="polite">${entries.length} resources</p></div><noscript><p>Every resource is linked below. Use your browser’s Find command, or open the <a href="/directory.html">lightweight directory</a>.</p></noscript><div class="discovery-empty" id="discovery-empty" hidden><h2>No resources match yet.</h2><p>Try a broader term, choose another category, or reset the filters.</p><button type="button" data-discovery-reset>Show all resources</button></div><div class="discovery-grid">${entries.map(card).join('\n')}</div></section>`}));
write('directory.html',`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lightweight FYNX Resource Directory</title><meta name="description" content="Browse every public FYNX tool and lesson with no external scripts, sign-in or embedded widgets."><meta name="robots" content="noindex,follow"><link rel="canonical" href="${base}/explore.html"><style>body{font:17px/1.7 system-ui,sans-serif;max-width:850px;margin:auto;padding:24px;color:#1b2921;background:#fff}a{color:#24593d}h1{font-size:36px;line-height:1.2}li{margin:9px 0}p{max-width:70ch}nav{display:flex;gap:20px;flex-wrap:wrap}section{border-top:1px solid #d8e1dc;margin-top:30px}small{color:#536158}</style></head><body><header><a href="/">FYNX Finance World</a><h1>The lightweight directory</h1><p>Direct links to our public tools and learning pages. This directory uses no JavaScript, fonts, sign-in service or external widgets. Use your browser’s Find command to search this page.</p><nav><a href="/explore.html">Searchable library</a><a href="/accessibility.html">Connection help</a><a href="/contact.html">Contact</a></nav></header><main>${categories.map(c=>`<section><h2>${escape(c)}</h2><ul>${entries.filter(e=>e.category===c).map(e=>`<li><a href="${e.url}">${escape(e.title)}</a></li>`).join('')}</ul></section>`).join('')}</main><footer><p>Calculators may need JavaScript. Live data and account features need their providers to be available.</p></footer></body></html>`);
write('accessibility.html',page({title:'Connection Help & Lightweight Browsing | FYNX Finance World',description:'Get help opening FYNX on school, work or managed networks. Browse a lightweight directory and understand which features need external services.',body:`<article class="connection-guide"><div class="discovery-kicker">ACCESS & CONNECTION HELP</div><h1>A simpler way to browse.</h1><p class="discovery-lead">Read public lessons and use local calculations without an account. If an embedded service is unavailable, you can still explore the rest of FYNX.</p><a class="discovery-button" href="/directory.html">Open the lightweight directory →</a><section><h2>If the whole website is blocked</h2><p>Check that the address is <a href="${base}/">www.fynxfinanceworld.com</a> and uses HTTPS. If your school or organization shows a blocked-category message, share this address and the message with its IT administrator. Access policies are controlled by the organization.</p><p>FYNX offers educational finance material and calculation tools. It does not execute brokerage trades. An administrator can review the site and decide whether it fits the network’s policy.</p></section><section><h2>If charts or sign-in do not load</h2><p>Some features use external services. Firebase handles accounts and cloud data; TradingView supplies selected embedded charts and calendars. A managed network may allow this site while restricting those providers. Public lessons, the directory and local calculators do not require you to sign in.</p><p>Use the text links beside embedded content to open a standalone resource or the data publisher. Saved resource shortcuts are kept in this browser; if browser storage is disabled, browsing still works but saves may not persist.</p></section><section><h2>If you see a connection or certificate error</h2><p>Check the address, your device’s date and time, and whether the network has a sign-in page. Do not ignore a certificate warning. Share the exact error, browser and affected address with your administrator or <a href="/contact.html">FYNX support</a>.</p></section><section><h2>Keyboard and low-bandwidth access</h2><p>Use Tab to move through links and controls, Enter to activate them and Escape to close open menus. The resource library has labeled search and category controls. The lightweight directory works without JavaScript; lesson text and links are delivered in the initial page.</p></section><section><h2>Official economic calendars</h2><p><a href="https://www.bls.gov/schedule/">US Bureau of Labor Statistics release schedule ↗</a></p><p><a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm">Federal Reserve FOMC calendar ↗</a></p></section></article>`}));
// Related links are generated from the same canonical inventory as search and sitemap.
for(const e of entries){
 const file=e.url==='/api/'?'api/index.html':e.url.slice(1);if(companyFiles.has(file))continue;let html=fs.readFileSync(path.join(root,file),'utf8');
 const guide=guides[path.basename(file,'.html')];
 let related=(publicProducts[e.url]?publicProducts[e.url].related.map(s=>entries.find(x=>x.url==='/'+(aliases[`tools/${s}.html`]||`tools/${s}.html`))).filter(Boolean):file.startsWith('tools/')&&guide?guide[5].map(s=>entries.find(x=>x.url==='/'+(aliases[`tools/${s}.html`]||`tools/${s}.html`))).filter(Boolean):entries.filter(x=>x.url!==e.url&&x.category===e.category&&(!e.topic||x.topic===e.topic)).slice(0,3));
 related=related.filter((item,index,list)=>item.url!==e.url&&list.findIndex(other=>other.url===item.url)===index);
 const block=`<section class="resource-related" aria-label="Related resources"><div><span class="discovery-kicker">CONTINUE YOUR RESEARCH</span><h2>Useful next steps.</h2></div><div class="resource-related-links">${related.map(x=>`<a href="${x.url}"><strong>${escape(x.title)}</strong><span>${escape(x.description)}</span></a>`).join('')}<a href="/explore.html"><strong>Explore the full library →</strong><span>Find tools, guides and market research by topic.</span></a></div></section>`;
 html=replaceBlock(html,'discovery-related',block);write(file,html);
}
// Public HTML cards for hubs whose original interfaces were populated only by JavaScript.
for(const [file,group,selection] of [['calculator.html','Tools',e=>e.category==='Tools'&&e.url!=='/calculator.html'],['calendar.html','News & events',e=>/\/tools\/(economic-calendar|market-hours|market-holidays|calendar-alerts)\.html/.test(e.url)],['news.html','News & events',e=>['Markets','News & events'].includes(e.category)&&e.url!=='/news.html']]){
 let html=fs.readFileSync(path.join(root,file),'utf8');
 html=replaceBlock(html,'discovery-hub',`<section class="hub-directory"><h2>${group==='Tools'?'Open a calculator':file==='calendar.html'?'Calendar resources':'Research resources'}</h2><p>Open any resource directly. Each page has its own link, explanation and related tools.</p><div class="hub-directory-links">${entries.filter(selection).map(e=>`<a href="${e.url}"><strong>${escape(e.title)}</strong><span>${escape(e.description)}</span></a>`).join('')}</div></section>`);write(file,html);
}
const publicExtras=['/explore.html','/accessibility.html'];
for (const url of publicExtras){let file=url.slice(1),html=fs.readFileSync(path.join(root,file),'utf8');const dom=new JSDOM(html),doc=dom.window.document;html=html.replace('</head>',`<link rel="canonical" href="${base+url}"><meta property="og:url" content="${base+url}"><meta property="og:title" content="${escape(doc.title)}"><meta property="og:description" content="${escape(doc.querySelector('meta[name=description]').content)}"><meta property="og:type" content="website"><meta property="og:image" content="${base}/assets/social/fynx-resources.png"><meta name="twitter:card" content="summary_large_image">\n</head>`);dom.window.close();write(file,html);}
// Every calculator directory view uses this inventory, including without JavaScript.
{
 const file='calculator.html';let html=fs.readFileSync(path.join(root,file),'utf8');
 const tools=entries.filter(e=>e.category==='Tools'&&e.url!=='/calculator.html').map(e=>({name:e.title,file:e.url,desc:e.description,access:e.access||'Free tool'}));
 html=html.replace(/const tools = \[[\s\S]*?\n\s*\];/,`const tools = ${JSON.stringify(tools,null,6)};`);
 const dom=new JSDOM(html,{includeNodeLocations:true});const grid=dom.window.document.getElementById('toolsGrid'),loc=dom.nodeLocation(grid);dom.window.close();
 if(!loc?.endTag)throw Error('Missing calculator directory');
 const cards=tools.map(t=>`<article class="tool-card"><div class="tool-head"><h3 class="tool-title">${escape(t.name)}</h3><span class="tool-chip">${escape(t.access)}</span></div><p class="tool-desc">${escape(t.desc)}</p><a class="tool-link" href="${t.file}">Open tool →</a></article>`).join('');
 html=html.slice(0,loc.startTag.endOffset)+cards+html.slice(loc.endTag.startOffset);
 html=html.replace(/(<[^>]+id="countText"[^>]*>)[^<]*(<\/[^>]+>)/,`$1${tools.length} tools$2`);
 // The populated grid is the public directory; avoid a second copy beneath it.
 html=replaceBlock(html,'discovery-hub','');write(file,html);
}
{
 const catalog=require('../assets/js/pro-catalog.js');let html=fs.readFileSync(path.join(root,'pro.html'),'utf8');
 const dom=new JSDOM(html,{includeNodeLocations:true}),grid=dom.window.document.getElementById('productCards'),loc=dom.nodeLocation(grid);dom.window.close();
 const cards=Object.entries(catalog).map(([key,[name,tier,description,url]])=>`<article class="product"><span>${escape(tier.toUpperCase())}</span><h3><a href="${url}">${escape(name)} ↗</a></h3><p>${escape(description)}</p><button type="button" data-key="${key}" aria-pressed="false">Open in workspace</button></article>`).join('');
 html=html.slice(0,loc.startTag.endOffset)+cards+html.slice(loc.endTag.startOffset);write('pro.html',html);
}
const allURLs=['/',...entries.map(e=>e.url),...publicExtras];
write('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allURLs.map(url=>`  <url><loc>${base+escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('assets/resource-index.json',JSON.stringify(entries.map(({keywords,...e})=>e),null,2)+'\n');
write('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
fs.mkdirSync(path.join(root,'output'),{recursive:true});write('output/search-audit.json',JSON.stringify({htmlPages:allHTML().length,publicURLs:allURLs.length,lessonURLs:lessonPaths.length,resources:entries.length,aliases,privateFiles:[...privateFiles],publicTools:entries.filter(e=>e.category==='Tools'&&e.url!=='/calculator.html').length,productPages:publicProducts},null,2)+'\n');
console.log(`Discovery built: ${allURLs.length} canonical public URLs, ${lessonPaths.length} substantive lessons and ${entries.length} searchable resources.`);
