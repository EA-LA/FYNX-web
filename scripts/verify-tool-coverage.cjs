const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),base='https://www.fynxfinanceworld.com';
const catalog=require('../assets/js/pro-catalog.js'),{PRODUCTS,PLANS}=require('../backend/consumer-core.cjs');
const resources=require('../assets/resource-index.json'),urls=new Set(resources.map(r=>r.url));
assert.deepEqual(Object.keys(catalog),PRODUCTS,'Every existing Pro product needs a public page');
const dom=file=>new JSDOM(fs.readFileSync(path.join(root,file),'utf8'),{url:base+'/'+file});
const suite=dom('calculator.html'),pro=dom('pro.html'),report=[];
for(const file of fs.readdirSync(path.join(root,'tools')).filter(f=>f.endsWith('.html'))){
 const view=dom('tools/'+file),doc=view.window.document,url='/tools/'+file,canonical=new URL(doc.querySelector('link[rel=canonical]').href).pathname;
 assert(urls.has(canonical),'Tool has no public destination: '+file);
 if(canonical===url){
  assert(urls.has(url));assert(suite.window.document.querySelector(`#toolsGrid a[href="${url}"]`),'Missing initial calculator-directory link: '+file);
  assert(doc.querySelector('.tool-explainer'),'Tool explanation missing: '+file);
  report.push({url,status:'public'});
 }else report.push({url,status:'legacy',canonical});
 view.window.close();
}
for(const [key,[name,tier,,url]] of Object.entries(catalog)){
 const expected=Object.values(PLANS).find(p=>p.products.includes(key)).name;assert.equal(tier,expected);
 const view=dom(url.slice(1)),doc=view.window.document;
 assert(pro.window.document.querySelector(`#productCards a[href="${url}"]`),'Pro hub link missing: '+key);
 const link=new URL(doc.querySelector('[data-product-launch]').href);assert.equal(link.pathname,'/pro.html');assert.equal(link.searchParams.get('tool'),key);assert.equal(link.hash,'#workbench');
 assert(doc.querySelector('.tool-profile-article').textContent.split(/\s+/).length>220,'Product explanation incomplete: '+key);
 assert(doc.querySelector('.tool-access').textContent.includes(tier),'Access requirement missing: '+key);
 view.window.close();
}
assert(!urls.has('/journal.html'));assert(urls.has('/tools/trading-journal.html'));
assert(!urls.has('/tools/options-payoff.html'));assert(urls.has('/tools/debt-payoff.html'));
for(const file of ['home.html','owner.html','profile.html','security.html','account-settings.html','journal.html','trader-journal.html','api/workspace.html'])assert(!urls.has('/'+file),'Account page exposed: '+file);
suite.window.close();pro.window.close();
fs.mkdirSync(path.join(root,'output'),{recursive:true});fs.writeFileSync(path.join(root,'output/tool-coverage.json'),JSON.stringify(report,null,2));
console.log(`Tool coverage passed: ${report.filter(x=>x.status==='public').length} public tools, ${PRODUCTS.length} Pro products, ${report.filter(x=>x.status==='legacy').length} preserved legacy URLs.`);
