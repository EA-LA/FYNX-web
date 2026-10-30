/* Edition, provenance and retention regression coverage. All responses below are test fixtures. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM, VirtualConsole} = require('jsdom');
const {createTerminalData} = require('../assets/js/terminal-market-data.js');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const NOW = Date.parse('2026-10-30T18:00:00Z'), HOUR = 3600000, DAY = 24 * HOUR;
const iso = offset => new Date(NOW + offset).toISOString();
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;});return {promise,resolve,reject};};
const response = data => ({ok:true,text:async()=>JSON.stringify(data)});
const headline = (edition='us',extra={}) => ({title:edition.toUpperCase()+' fixture market report',link:'https://www.reuters.com/markets/'+edition+'-fixture',source:'Reuters',sourceId:'reuters',pubDate:iso(-HOUR),edition,...extra});
const states = (ids,extra={}) => ids.map(id=>({id,name:id,status:'fresh',fetchedAt:iso(0),...extra}));
const headlines = (edition='us',category='all',extra={}) => ({edition,category,kind:'headlines',items:[headline(edition)],fetchedAt:iso(0),stale:false,sources:states(['reuters']),...extra});
const officialHosts = {fed:'www.federalreserve.gov',bea:'www.bea.gov',boe:'www.bankofengland.co.uk',ecb:'www.ecb.europa.eu',boc:'www.bankofcanada.ca',boj:'www.boj.or.jp',rba:'www.rba.gov.au'};
const release = (id='fed',edition='us',extra={}) => ({title:id+' fixture official release',link:'https://'+officialHosts[id]+'/fixture',sourceId:id,source:'Untrusted source name',pubDate:iso(-DAY),edition,...extra});
const official = (edition='us',ids=['fed','bea'],extra={}) => ({edition,category:'all',kind:'official-releases',items:ids.map(id=>release(id,edition)),fetchedAt:iso(0),stale:false,sources:states(ids),...extra});
function harness(t,{edition='us',url='https://www.fynxfinanceworld.com/news.html',storage={},fetcher}={}) {
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url,runScripts:'outside-only',virtualConsole:new VirtualConsole()});
  t.after(()=>dom.window.close());
  const w=dom.window,calls=[];let clock=NOW;
  for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);
  w.Date.now=()=>clock;
  w.FynxEdition={get:()=>edition};
  w.fetch=async(url,options)=>{const request={url:new URL(url,w.location.href),options};calls.push(request);return fetcher?fetcher(request,calls.length):response(headlines(edition));};
  w.eval(read('assets/js/market-intelligence-data.js'));
  return {w,D:w.FYNXMarketIntelligenceData,calls,setNow:value=>{clock=value;},get now(){return clock;}};
}
const plain = value => JSON.parse(JSON.stringify(value));

test('headline pending requests and browser caches are isolated by edition and category',async t=>{
  const waits=new Map();
  const h=harness(t,{fetcher:request=>{const key=request.url.searchParams.get('edition')+':'+request.url.searchParams.get('category');const wait=deferred();waits.set(key,wait);return wait.promise;}});
  const us=h.D.loadHeadlines('all',{edition:'us'}),usAgain=h.D.loadHeadlines('all',{edition:'us',force:true});
  const uk=h.D.loadHeadlines('all',{edition:'uk'}),ukMarkets=h.D.loadHeadlines('stocks',{edition:'uk'});
  assert.equal(h.calls.length,3);
  waits.get('uk:stocks').resolve(response(headlines('uk','stocks')));
  waits.get('uk:all').resolve(response(headlines('uk')));
  waits.get('us:all').resolve(response(headlines('us')));
  const values=await Promise.all([us,usAgain,uk,ukMarkets]);
  assert.equal(values[0],values[1]);
  assert.deepEqual(values.map(v=>[v.edition,v.category]),[['us','all'],['us','all'],['uk','all'],['uk','stocks']]);
  assert.equal(h.D.getCachedHeadlines('all',{edition:'uk'}).items[0].edition,'uk');
  assert.equal(h.D.getCachedHeadlines('all',{edition:'us'}).items[0].edition,'us');
  assert.equal(h.D.getCachedHeadlines('stocks',{edition:'us'}),null);
  for(const call of h.calls){assert.equal(call.options.credentials,'omit');assert.equal(call.url.pathname,'/webMarketFeed');}
});

test('wrong-edition envelopes, missing non-US edition, and wrong-category replies never fill a selected feed',async t=>{
  for(const payload of [headlines('us'),{...headlines('uk'),edition:undefined},headlines('uk','stocks')]){
    const h=harness(t,{edition:'uk',fetcher:()=>response(payload)});
    const result=await h.D.loadHeadlines('all',{edition:'uk'});
    assert.equal(result.status,'unavailable');assert.equal(result.items.length,0);assert.equal(result.edition,'uk');
    assert.equal(h.D.getCachedHeadlines('all',{edition:'uk'}),null);
  }
  const h=harness(t,{edition:'uk',fetcher:()=>response(headlines('uk','all',{items:[headline('us'),headline('uk')]}))});
  const result=await h.D.loadHeadlines('all');assert.equal(result.items.length,1);assert.equal(result.items[0].edition,'uk');
});

test('official releases retain institution provenance and never borrow another edition sources',async t=>{
  const cases=[['us',['fed','bea']],['uk',['boe']],['canada',['boc']],['europe',['ecb']],['asia',['boj']],['japan',['boj']],['australia',['rba']],['india',[]],['middle-east',[]],['africa',[]],['latin-america',[]]];
  for(const [edition,ids] of cases){
    const h=harness(t,{edition,fetcher:()=>response(official(edition,ids,{items:[...ids.map(id=>release(id,edition)),release(edition==='us'?'boe':'fed',edition)]}))});
    const result=await h.D.loadOfficialReleases();
    assert.deepEqual(plain(result.sources.map(s=>s.id)),ids,edition);
    assert(result.items.every(item=>ids.includes(item.sourceId)),edition);
    assert(result.items.every(item=>item.source!=='Untrusted source name'));
    if(!ids.length){assert.equal(result.status,'unavailable');assert.equal(result.items.length,0);}
  }
  const h=harness(t,{edition:'global',fetcher:()=>response(official('global',Object.keys(officialHosts)))});
  const global=await h.D.loadOfficialReleases();assert.equal(global.items.length,7);
  assert.equal(new Set(global.items.map(item=>item.sourceId)).size,7);
});

test('official source hosts and dated retrieval state are required; unsafe article links are rejected',async t=>{
  for(const change of [{link:'https://www.reuters.com/policy/not-fed'},{link:'javascript:alert(1)'},{pubDate:iso(10*HOUR)}]){
    const h=harness(t,{fetcher:()=>response(official('us',['fed'],{items:[release('fed','us',change)]}))});
    assert.equal((await h.D.loadOfficialReleases()).items.length,0);
  }
  for(const source of [{status:'unavailable',fetchedAt:null},{status:'fresh',fetchedAt:null}]){
    const h=harness(t,{fetcher:()=>response(official('uk',['boe'],{sources:states(['boe'],source)}))});
    assert.equal((await h.D.loadOfficialReleases({edition:'uk'})).status,'unavailable');
  }
  const h=harness(t,{fetcher:()=>response(headlines('us','all',{items:[headline('us',{title:'Rates &amp; growth &lt;script&gt;bad&lt;/script&gt;',link:'https://www.reuters.com/a#tracking'}),headline('us',{link:'https://user:secret@example.com/x'}),headline('us',{link:'http://www.reuters.com/x'})]}))});
  const result=await h.D.loadHeadlines();assert.equal(result.items.length,1);assert.equal(result.items[0].title,'Rates & growth');
  assert.equal(result.items[0].source,'Reuters');assert.equal(result.items[0].url,'https://www.reuters.com/a');
  assert.equal(result.items[0].publishedAt,iso(-HOUR));
});

test('headline publication retention is 48 hours, analysis seven days, and official releases 30 days',async t=>{
  const h=harness(t,{fetcher:request=>{
    if(request.url.searchParams.get('kind')==='releases')return response(official('us',['fed'],{items:[release('fed','us',{pubDate:iso(-30*DAY+1)}),release('fed','us',{link:'https://www.federalreserve.gov/expired',pubDate:iso(-30*DAY-1)})]}));
    const category=request.url.searchParams.get('category'),boundary=category==='analysis'?7*DAY:2*DAY;
    return response(headlines('us',category,{items:[headline('us',{pubDate:iso(-boundary+1)}),headline('us',{link:'https://www.reuters.com/expired',pubDate:iso(-boundary-1)})]}));
  }});
  for(const category of ['all','analysis'])assert.equal((await h.D.loadHeadlines(category)).items.length,1,category);
  const releases=await h.D.loadOfficialReleases();assert.equal(releases.items.length,1);assert.equal(releases.retentionHours,720);
  h.setNow(NOW+2);
  assert.equal(h.D.getCachedHeadlines('all'),null);assert.equal(h.D.getCachedHeadlines('analysis'),null);assert.equal(h.D.getCachedOfficialReleases(),null);
});

test('ten-minute cache freshness refreshes at expiry, with dated stale fallback and bounded retrieval age',async t=>{
  let offline=false,h;
  h=harness(t,{fetcher:()=>offline?Promise.reject(Error('Offline')):response(headlines('us','all',{fetchedAt:new Date(h.now).toISOString(),sources:states(['reuters'],{fetchedAt:new Date(h.now).toISOString()})}))});
  await h.D.loadHeadlines();h.setNow(NOW+599999);await h.D.loadHeadlines();assert.equal(h.calls.length,1);
  h.setNow(NOW+600000);await h.D.loadHeadlines();assert.equal(h.calls.length,2);
  offline=true;h.setNow(NOW+1200000);
  const saved=await h.D.loadHeadlines();assert.equal(saved.status,'cached');assert.equal(saved.stale,true);assert.equal(saved.fetchedAt,iso(600000));
  assert.equal(saved.items[0].publishedAt,iso(-HOUR));assert.equal(saved.sources[0].status,'cached');
  h.setNow(NOW+DAY+600001);const expired=await h.D.loadHeadlines();assert.equal(expired.status,'unavailable');assert.equal(expired.items.length,0);
});

test('a forced refresh failure marks a still-young browser cache as saved, never fresh',async t=>{
  let offline=false;
  const h=harness(t,{fetcher:()=>offline?Promise.reject(Error('Offline')):response(headlines())});
  await h.D.loadHeadlines();offline=true;h.setNow(NOW+60000);
  const saved=await h.D.loadHeadlines('all',{force:true});
  assert.equal(saved.status,'cached');assert.equal(saved.stale,true);assert.equal(saved.sources[0].status,'cached');assert.equal(saved.fetchedAt,iso(0));
});

const terminalFeed=(edition,items,extra={})=>({edition,items,status:'fresh',stale:false,fetchedAt:iso(0),sources:states([edition==='uk'?'boe':'fed']),...extra});
const terminalStory=(edition,extra={})=>({edition,title:edition+' terminal fixture',url:'https://www.reuters.com/'+edition+'-terminal',source:'Reuters',sourceId:'reuters',publishedAt:iso(-HOUR),...extra});
test('terminal pending and ten-minute memory caches stay separate across edition switches',async()=>{
  const waits=new Map(),calls=[];let edition='us',clock=NOW;
  const D={loadHeadlines(category,options){calls.push(['headlines',options.edition]);const wait=deferred();waits.set(options.edition,wait);return wait.promise;},loadOfficialReleases:async options=>terminalFeed(options.edition,[])};
  const data=createTerminalData({FynxEdition:{get:()=>edition},FYNXMarketIntelligenceData:D},{now:()=>clock});
  const us=data.loadBriefing(),usAgain=data.loadBriefing({force:true});assert.equal(us,usAgain);
  edition='uk';const uk=data.loadBriefing();assert.equal(calls.length,2);
  waits.get('uk').resolve(terminalFeed('uk',[terminalStory('uk')]));const ukResult=await uk;
  waits.get('us').resolve(terminalFeed('us',[terminalStory('us')]));const usResult=await us;
  assert.equal(ukResult.edition,'uk');assert.equal(usResult.edition,'us');assert.equal(ukResult.items[0].edition,'uk');
  clock=NOW+599999;assert.equal(await data.loadBriefing(),ukResult);assert.equal(calls.length,2);
  clock=NOW+600000;const refreshed=data.loadBriefing();assert.equal(calls.length,3);waits.get('uk').resolve(terminalFeed('uk',[terminalStory('uk')],{fetchedAt:iso(600000)}));await refreshed;
});

test('terminal refuses a wrong-edition feed and a wrong-edition record in the requested edition',async()=>{
  for(const payload of [terminalFeed('us',[terminalStory('us')]),terminalFeed('uk',[terminalStory('us')])]){
    const data=createTerminalData({FYNXMarketIntelligenceData:{loadHeadlines:async()=>payload,loadOfficialReleases:async()=>terminalFeed('uk',[])}},{now:()=>NOW});
    const value=await data.loadBriefing({edition:'uk'});assert.equal(value.status,'unavailable');assert.equal(value.items.length,0);
  }
});

test('terminal memory cache rechecks publication expiry both while fresh and during outage fallback',async()=>{
  for(const force of [false,true])for(const kind of ['headline','official']){
    let clock=NOW,offline=false;const boundary=kind==='headline'?2*DAY:30*DAY;
    const entry=terminalStory('us',{publishedAt:iso(-boundary+60000),url:kind==='official'?'https://www.federalreserve.gov/fixture':'https://www.reuters.com/us-terminal',source:kind==='official'?'Federal Reserve':'Reuters',sourceId:kind==='official'?'fed':'reuters'});
    const get=type=>async()=>{if(offline)throw Error('Offline');return terminalFeed('us',type===kind?[entry]:[]);};
    const data=createTerminalData({FYNXMarketIntelligenceData:{loadHeadlines:get('headline'),loadOfficialReleases:get('official')}},{now:()=>clock});
    assert.equal((await data.loadBriefing()).items.length,1);clock+=60001;offline=true;
    const expired=await data.loadBriefing({force});assert.equal(expired.items.length,0,kind+' force='+force);assert.equal(expired.status,'unavailable');
  }
});

test('edition preference honors explicit URLs, updates all controls, and responds once to a valid cross-tab change',async t=>{
  const dom=new JSDOM('<!doctype html><select data-edition-select><option value="us">US</option><option value="uk">UK</option><option value="canada">Canada</option></select><span data-edition-label></span>',{url:'https://www.fynxfinanceworld.com/news.html?edition=uk#headlines',runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window,events=[];w.localStorage.setItem('fynx_news_edition_v1','us');
  w.document.addEventListener('fynx:edition-change',event=>events.push(plain(event.detail)));w.eval(read('assets/js/newsroom-editions.js'));await tick();
  assert.equal(w.FynxEdition.get(),'uk');assert.equal(w.document.querySelector('select').value,'uk');assert.equal(w.document.querySelector('span').textContent,'UK edition');
  assert.equal(w.FynxEdition.set('not-an-edition'),false);assert.equal(events.length,0);
  w.dispatchEvent(new w.StorageEvent('storage',{key:'fynx_news_edition_v1',newValue:'canada'}));
  assert.equal(w.FynxEdition.get(),'canada');assert.equal(w.document.querySelector('select').value,'canada');
  assert.equal(new URL(w.location.href).searchParams.get('edition'),'canada');assert.equal(w.location.hash,'#headlines');
  assert.deepEqual(events,[{edition:'canada',previous:'uk'}]);
  w.dispatchEvent(new w.StorageEvent('storage',{key:'fynx_news_edition_v1',newValue:'canada'}));assert.equal(events.length,1);
  const select=w.document.querySelector('select');select.value='us';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(w.localStorage.getItem('fynx_news_edition_v1'),'us');assert.equal(w.document.documentElement.dataset.newsEdition,'us');assert.equal(events.length,2);
});

test('official source retrieval dates cannot be expired or far in the future under a newer envelope',async t=>{
  for(const fetchedAt of [iso(-7*DAY-1),iso(300001),'not a date']){
    const h=harness(t,{edition:'uk',fetcher:()=>response(official('uk',['boe'],{sources:states(['boe'],{fetchedAt})}))});
    const value=await h.D.loadOfficialReleases();
    assert.equal(value.status,'unavailable',fetchedAt);assert.equal(value.items.length,0);
  }
});

test('future publication and retrieval timestamps cannot be labeled as current coverage',async t=>{
  for(const kind of ['headlines','releases'])for(const field of ['publication','retrieval']){
    const isOfficial=kind==='releases',payload=isOfficial?official('uk',['boe']):headlines('uk');
    if(field==='publication')payload.items[0].pubDate=iso(300001);else payload.fetchedAt=iso(300001);
    const h=harness(t,{edition:'uk',fetcher:()=>response(payload)});
    const value=await (isOfficial?h.D.loadOfficialReleases():h.D.loadHeadlines());
    assert.equal(value.status,'unavailable',kind+' '+field);assert.equal(value.items.length,0);
  }
});

test('malformed and misfiled edition browser caches cannot cross into another feed',async t=>{
  const h=harness(t,{edition:'uk'});
  await h.D.loadHeadlines();
  const key=Object.keys(h.w.localStorage).find(key=>key.endsWith('_uk_all'));
  assert(key,'Edition-specific cache was persisted');
  h.w.localStorage.setItem(key,JSON.stringify(headlines('us')));
  assert.equal(h.D.getCachedHeadlines(),null);
  h.w.localStorage.setItem(key,'not json');assert.equal(h.D.getCachedHeadlines(),null);
  h.w.localStorage.removeItem(key);
  h.w.localStorage.setItem('fynx_market_intelligence_v1_all',JSON.stringify(headlines('us')));
  h.w.localStorage.setItem('fynx_news_latest_payload',JSON.stringify(headlines('us')));
  assert.equal(h.D.getCachedHeadlines(),null);
});

test('headline and official requests have separate pending and cache slots within one edition',async t=>{
  const waits={headlines:deferred(),releases:deferred()};
  const h=harness(t,{edition:'uk',fetcher:request=>waits[request.url.searchParams.get('kind')||'headlines'].promise});
  const news=h.D.loadHeadlines(),releases=h.D.loadOfficialReleases(),again=h.D.loadOfficialReleases({force:true});
  assert.equal(h.calls.length,2);
  waits.headlines.resolve(response(headlines('uk')));waits.releases.resolve(response(official('uk',['boe'])));
  const values=await Promise.all([news,releases,again]);assert.equal(values[1],values[2]);
  assert.equal(h.D.getCachedHeadlines().items[0].kind,'headline');assert.equal(h.D.getCachedOfficialReleases().items[0].kind,'official-release');
});

test('only images with usable source attribution and a Creative Commons license survive normalization',async t=>{
  const picture={url:'https://images.example.org/photo.jpg',sourceURL:'https://commons.wikimedia.org/wiki/File:Photo.jpg',licenseURL:'https://creativecommons.org/licenses/by/4.0/',credit:'Fixture photographer',license:'CC BY 4.0',alt:'Fixture image'};
  const items=[headline('us',{image:picture}),headline('us',{link:'https://www.reuters.com/missing-credit',image:{...picture,credit:''}}),headline('us',{link:'https://www.reuters.com/non-cc',image:{...picture,licenseURL:'https://example.org/license'}}),headline('us',{link:'https://www.reuters.com/unsafe-image',image:{...picture,url:'javascript:alert(1)'}})];
  const h=harness(t,{fetcher:()=>response(headlines('us','all',{items}))});const value=await h.D.loadHeadlines();
  assert.equal(value.items.length,4);assert.equal(value.items[0].image.credit,'Fixture photographer');assert.equal(value.items.filter(item=>item.image).length,1);
});

test('an explicitly shared edition still works when browser preference storage is denied',async t=>{
  const dom=new JSDOM('<!doctype html><span data-edition-label></span>',{url:'https://www.fynxfinanceworld.com/news.html?edition=uk',runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;
  Object.defineProperty(w,'localStorage',{configurable:true,get(){throw new Error('Storage unavailable');}});
  w.eval(read('assets/js/newsroom-editions.js'));await tick();
  assert.equal(w.FynxEdition.get(),'uk');assert.equal(w.document.querySelector('span').textContent,'UK edition');
  assert.equal(w.FynxEdition.set('canada'),true);assert.equal(w.FynxEdition.get(),'canada');
  assert.equal(new URL(w.location.href).searchParams.get('edition'),'canada');
});

test('the actual topic page outage state never invents a retrieval date and keeps refresh available',async t=>{
  const dom=new JSDOM(read('news/markets.html'),{url:'https://www.fynxfinanceworld.com/news/markets.html?edition=uk',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
  t.after(()=>dom.window.close());const w=dom.window;
  w.setInterval=()=>1;w.eval(read('assets/js/newsroom-editions.js'));
  w.FYNXMarketIntelligenceData={loadHeadlines:async()=>({edition:'uk',status:'unavailable',fetchedAt:null,items:[],message:'Source unavailable'})};
  w.eval(read('assets/js/newsroom-page.js'));await tick();
  const status=w.document.querySelector('[data-newsroom-status]');
  assert.match(status.textContent,/UK edition/);assert.doesNotMatch(status.textContent,/Retrieved|1969|1970/);
  assert.equal(w.document.querySelector('[data-newsroom-page]').dataset.feedState,'unavailable');
  assert.equal(w.document.querySelector('[data-newsroom-refresh]').disabled,false);
  assert.equal(w.document.querySelector('[data-newsroom-stories]').getAttribute('aria-busy'),'false');
});
