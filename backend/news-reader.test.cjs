'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('./news-reader.cjs'),api=require('./market-feed')._test;
const now=Date.parse('2026-11-02T18:00:00Z');
const item=(extra={})=>({title:'Central bank cuts policy rate as inflation slows',source:'CNBC',link:'https://www.cnbc.com/2026/11/02/rate-decision.html',pubDate:new Date(now-3600000).toISOString(),edition:'us',category:'economics',description:'The central bank lowered its policy rate by 25 basis points on Monday as inflation slowed. Inflation reached 3.2 percent in September, compared with 3.5 percent the previous month. Officials said the next decision will depend on new inflation data.',...extra});
const response=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}});
const rss=rows=>'<rss><channel>'+rows.map(x=>`<item><title>${x.title}</title><link>${x.link}</link><pubDate>${x.pubDate}</pubDate><source>${x.source}</source><description><![CDATA[${x.description||''}]]></description></item>`).join('')+'</channel></rss>';
test('article IDs are canonical and the browser cannot turn the reader into an arbitrary URL fetcher',()=>{
 assert.equal(R.articleId('https://example.com/story?utm_source=a#read'),R.articleId('https://example.com/story'));
 assert.match(R.articleId(item().link),/^[a-f0-9]{64}$/);
 for(const url of ['http://example.com','https://127.0.0.1/a','https://user:pass@www.cnbc.com/a','https://www.cnbc.com.attacker.example/a','https://www.cnbc.com:8443/a','https://news.google.com/rss/articles/test'])assert.equal(R.approvedPageURL({link:url}),null,url);
 assert.equal(R.approvedPageURL(item()),item().link);
});
test('a real publisher excerpt creates evidence and numbers while preserving publication and preparation times',()=>{
 const brief=R.createBrief(item(),{now});
 assert.equal(brief.coverageLevel,'publisher-excerpt');assert.equal(brief.sourceAccess,'publisher-feed');
 assert.equal(brief.publishedAt,item().pubDate);assert.equal(brief.preparedAt,new Date(now).toISOString());
 assert.match(brief.summary,/25 basis points/);assert(brief.keyPoints.some(point=>point.text.includes('3.2 percent')));
 assert(brief.numbers.some(n=>n.value==='3.2 percent'));assert(brief.context.length);assert(brief.terms.some(t=>t.term==='Basis point'));
 const emitted=[brief.summary,...brief.keyPoints.map(x=>x.text),...brief.numbers.map(x=>x.value)].join(' ').split(/\s+/).length;
 assert(emitted<=90,'The brief and repeated numeric values must share one source-word budget');
 assert(brief.numbers.every(n=>!n.context.includes('September')),'Numbers do not duplicate further source excerpts');
});
test('missing source text never invents a summary, evidence, numbers or full-article access',()=>{
 const brief=R.createBrief(item({description:''}),{now});
 assert.equal(brief.coverageLevel,'headline-only');assert.equal(brief.summary,item().title);assert.deepEqual(brief.keyPoints,[]);assert.deepEqual(brief.numbers,[]);
 assert.match(brief.coverageNote,/complete article has not been reviewed/);assert.equal(brief.image,null);
});
test('large source text is limited to short evidence snippets and distinct original reading context',()=>{
 const description=Array.from({length:100},(_,i)=>`Central bank inflation decision ${i} includes a policy rate comparison and detailed economic assessment with several additional figures reported in the statement.`).join(' ');
 const brief=R.createBrief(item({description}),{now,coverageLevel:'source-text'});
 assert.equal(brief.coverageLevel,'source-text');assert(brief.summary.length<description.length/10);assert(brief.keyPoints.length<=2);
 assert(!JSON.stringify(brief).includes(description));assert(brief.context.every(x=>x.title&&x.text));
});
test('only a matching public article produces reviewed source text; paid and unrelated text remain inaccessible',()=>{
 const source=item(),body=source.description.repeat(3);
 const page=data=>'<script type="application/ld+json">'+JSON.stringify(data)+'</script>';
 const data={'@type':'NewsArticle',headline:source.title,articleBody:body,isAccessibleForFree:true};
 assert.equal(R.extractPage(page(data),source).coverageLevel,'source-text');
 assert.equal(R.extractPage(page({...data,isAccessibleForFree:false}),source),null);
 assert.equal(R.extractPage(page({...data,headline:'A football team wins another championship',articleBody:'Football players celebrated a dramatic championship win. '.repeat(10)}),source),null);
 assert.equal(R.extractPage('<div class="paywall">'+page(data)+'</div>',source),null);
});
test('robots rules fail restricted paths closed and honour the longest explicit allow',()=>{
 assert.equal(R.robotsAllows('User-agent: *\nDisallow: /',item().link),false);
 assert.equal(R.robotsAllows('User-agent: *\nDisallow: /2026/\nAllow: /2026/11/02/',item().link),true);
 assert.equal(R.robotsAllows('User-agent: FYNX-NewsReader\nDisallow: /\nUser-agent: *\nAllow: /',item().link),false);
 assert.equal(R.robotsAllows('User-agent: *\nDisallow: /private*\n', 'https://www.cnbc.com/private/secret'),false);
});
test('blocked public-source access is cached and cannot silently become a complete article brief',async()=>{
 const previous=global.fetch;R.articleCache.clear();let calls=0;
 try{global.fetch=async()=>{calls++;return{ok:true,text:async()=> 'User-agent: *\nDisallow: /'};};
 const a=await R.enhance(item({link:'https://www.fxstreet.com/blocked-reader-test'}));
 const b=await R.enhance(item({link:'https://www.fxstreet.com/blocked-reader-test',edition:'uk'}));
 assert.equal(a.sourceAccess,'publisher-access-restricted');assert.equal(a.coverageLevel,'publisher-excerpt');assert.equal(b.edition,'uk');assert.equal(calls,1);
 }finally{global.fetch=previous;R.articleCache.clear();}
});
test('article page reads are bounded even when a transport ignores its AbortSignal',async()=>{
 const previous=global.fetch;let aborted=false;
 try{global.fetch=async(_url,options)=>{options.signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});};await assert.rejects(R.boundedFetch(item().link,{timeoutMs:25}),/timed out/);assert.equal(aborted,true);}
 finally{global.fetch=previous;}
});
test('editorial ranking excludes stock-pick filler, favours fresh source-backed reporting and deduplicates syndicated titles',()=>{
 const pool=[item({title:'Central bank cuts interest rate - CNBC',pubDate:new Date(now-1000).toISOString()}),item({title:'Central bank cuts interest rate',link:'https://example.com/duplicate'}),item({title:'Best stocks to buy this week',link:'https://example.com/picks'}),item({title:'Old merger report',link:'https://example.com/old',pubDate:new Date(now-23*3600000).toISOString()})];
 const ranked=R.rankHeadlines(pool,now);assert.equal(ranked.length,2);assert.equal(ranked[0].rank,1);assert.match(ranked[0].title,/Central bank/);assert.equal(typeof ranked[0].priorityScore,'number');
});
test('related reporting links are internal, related by subject and diverse by publisher',()=>{
 const pool=[item(),item({link:'https://example.com/a',source:'Reuters'}),item({link:'https://example.com/b',source:'Reuters'}),item({title:'Semiconductor factory opens',link:'https://example.com/c',source:'AP News'})];
 const related=R.relatedRows(item(),pool);assert.equal(related.length,1);assert.equal(related[0].source,'Reuters');assert.match(related[0].readerUrl,/^\/news\/article.html\?id=[a-f0-9]{64}/);
});
test('feed rows have precomputed source briefs, retain private excerpts through warm cache and never copy raw text into public descriptions',async()=>{
 const previous=global.fetch;api.cache.clear();api.articleRecords.clear();R.articleCache.clear();let calls=0;
 try{const row=item({pubDate:new Date().toISOString()});global.fetch=async url=>{calls++;return{ok:true,text:async()=>url.includes('news.google.com')?rss([]):rss([row])};};
 const feed=await api.load('economics','us'),first=feed.items[0];assert.match(first.articleId,/^[a-f0-9]{64}$/);assert.equal(first.reader.coverageLevel,'publisher-excerpt');assert.equal(first.description,'');assert.equal(calls,3);
 const warm=await api.load('economics','us');assert.equal(warm.items[0].reader.coverageLevel,'publisher-excerpt');assert.equal(calls,3);
 assert.match(first.readerUrl,/category=economics/);assert.equal(feed.freshForMs,300000);assert.equal(feed.retentionHours,24);
 }finally{global.fetch=previous;api.cache.clear();api.articleRecords.clear();R.articleCache.clear();}
});
test('unknown article IDs do not fetch caller-supplied URLs; selector mismatch cannot reuse another edition record',async()=>{
 const previous=global.fetch;api.cache.clear();api.articleRecords.clear();const urls=[];
 try{global.fetch=async url=>{urls.push(url);return{ok:true,text:async()=>rss([])};};
 const invalid=response();await api.handler({method:'GET',query:{kind:'article',id:'bad',source:'https://127.0.0.1/'}},invalid);assert.equal(invalid.code,400);assert.equal(urls.length,0);
 const missing=response();await api.handler({method:'GET',query:{kind:'article',id:'0'.repeat(64),source:'https://127.0.0.1/'}},missing);assert.equal(missing.code,404);assert(urls.every(url=>!url.includes('127.0.0.1')));
 }finally{global.fetch=previous;api.cache.clear();api.articleRecords.clear();}
});
test('official archive readers use their own selector and keep old release dates visible',async()=>{
 const previous=global.fetch;api.cache.clear();api.articleRecords.clear();R.articleCache.clear();
 try{const row=item({title:'Policy rate announcement',source:'Bank of England',link:'https://www.bankofengland.co.uk/news/reader-test',pubDate:new Date(Date.now()-8*86400000).toISOString()});global.fetch=async url=>({ok:true,text:async()=>url.endsWith('/robots.txt')?'User-agent: *\nDisallow: /':rss([row])});
 const feed=await api.loadOfficialReleases('uk');assert.equal(feed.items.length,1);assert.match(feed.items[0].readerUrl,/category=official/);
 const data=await api.loadArticle(feed.items[0].articleId,'uk','official');assert.equal(data.article.category,'official');assert.equal(data.article.isCurrent,false);assert.equal(data.article.publishedAt,row.pubDate);
 }finally{global.fetch=previous;api.cache.clear();api.articleRecords.clear();R.articleCache.clear();}
});
test('symbol news uses the same verified internal-reader route, original query and 24-hour freshness contract',async()=>{
 const previous=global.fetch,S=require('./symbol-news')._test;S.cache.clear();api.articleRecords.clear();
 try{global.fetch=async()=>({ok:true,text:async()=>rss([item({title:'Tesla earnings rise',source:'Reuters',link:'https://news.google.com/rss/articles/tesla-test',pubDate:new Date().toISOString()})])});
 const res=response();await api.handler({method:'GET',query:{kind:'symbol',q:' TSLA '}},res);assert.equal(res.code,200);assert.equal(res.body.query,'TSLA');assert.equal(res.body.kind,'symbol');assert.equal(res.body.retentionHours,24);
 const row=res.body.items[0];assert.match(row.readerUrl,/symbol=TSLA/);assert.equal(row.reader.coverageLevel,'headline-only');const article=await api.loadArticle(row.articleId,'us','stocks','TSLA');assert.equal(article.article.id,row.articleId);
 }finally{global.fetch=previous;S.cache.clear();api.articleRecords.clear();}
});
test('headline plus publisher echoes do not pass as publisher excerpts',()=>{
 const title='Central bank cuts its policy rate as inflation slows across the economy';
 const brief=R.createBrief(item({title,source:'Fixture Publisher',description:title+' Fixture Publisher'}),{now});
 assert.equal(brief.coverageLevel,'headline-only');assert.deepEqual(brief.keyPoints,[]);
});
test('expired verified records cannot survive a feed refresh that no longer contains the story',async()=>{
 const previous=global.fetch;api.cache.clear();api.articleRecords.clear();
 try{const row=item({link:'https://publisher.example/expired-reader',pubDate:new Date(Date.now()-9*86400000).toISOString()});const id=R.articleId(row.link);api.articleRecords.set('us:economics::'+id,{item:row,seenAt:Date.now()-8*86400000});global.fetch=async()=>({ok:true,text:async()=>rss([])});
 await assert.rejects(api.loadArticle(id,'us','economics'),error=>error.status===404);assert.equal(api.articleRecords.has('us:economics::'+id),false);
 }finally{global.fetch=previous;api.cache.clear();api.articleRecords.clear();}
});
test('index and model numerals are not reported financial facts and election context does not invent unrelated glossary terms',()=>{
 const row=item({title:'Stock market after midterm elections: What S&P 500 history shows',description:'Midterms historically precede a strong year for the S&P 500. Here is what to know if you are watching the market.'});
 const brief=R.createBrief(row,{now});assert.deepEqual(brief.numbers,[]);assert(!brief.terms.some(t=>t.term==='Tariff'||t.term==='Effective date'));assert(brief.context.some(c=>c.title.includes('historical')));
 assert(!brief.keyPoints.some(p=>/^what to know|^here is what/i.test(p.text)));
});
test('five-minute expiry refreshes source text, while the publication time remains the actual publisher time',async()=>{
 const previous=global.fetch,originalNow=Date.now;let clock=Date.now(),calls=0;const initialClock=clock;api.cache.clear();api.articleRecords.clear();R.articleCache.clear();
 try{Date.now=()=>clock;global.fetch=async url=>{calls++;return{ok:true,text:async()=>url.includes('news.google.com')?rss([]):rss([item({description:clock===initialClock?item().description:'The central bank has revised its inflation projection to 3.1 percent after receiving additional monthly data.'})])};};
 const first=await api.load('economics','us'),count=calls;clock+=299000;await api.load('economics','us');assert.equal(calls,count);
 clock+=1001;const updated=await api.load('economics','us');assert(calls>count);assert.notEqual(first.items[0].reader.summary,updated.items[0].reader.summary);assert.equal(updated.items[0].pubDate,item().pubDate);
 }finally{Date.now=originalNow;global.fetch=previous;api.cache.clear();api.articleRecords.clear();R.articleCache.clear();}
});
test('CNBC public Key Points are readable while clipped or subscription body text is never extracted',()=>{
 const source=item(),html='<div class="RenderKeyPoints-keyPoints"><div class="wrapper"><ul><li>The central bank cut its policy rate as inflation declined to a 2%-3% target range.</li><li>Officials reported that six members supported the inflation decision while three preferred no change.</li></ul></div></div><div class="ArticleBody-articleBody"><div class="ArticleBody-meteredPaywallPreview" style="max-height:660px;overflow:hidden"><p>HIDDEN BODY SECRET '+source.description+'</p></div></div>';
 const content=R.extractPage(html,source);assert.equal(content.coverageLevel,'publisher-excerpt');assert.equal(content.sourceAccess,'public-key-points');assert(!content.text.includes('HIDDEN BODY'));
 const brief=R.createBrief(source,{now,sourceText:content.text,coverageLevel:content.coverageLevel,sourceAccess:content.sourceAccess});assert.match(brief.coverageNote,/complete article.*has not been reviewed/);assert(brief.numbers.some(n=>n.value==='2%-3%'));assert(!brief.numbers.some(n=>n.value==='3%'));
});
test('an unrestricted visible CNBC article-body region supplies real source text',()=>{
 const source=item(),html='<h1>'+source.title+'</h1><div class="ArticleBody-articleBody"><div class="group"><p>'+source.description+'</p></div></div><footer><p>Unrelated navigation text</p></footer>';
 const content=R.extractPage(html,source);assert.equal(content.coverageLevel,'source-text');assert.equal(content.text,source.description);assert(!content.text.includes('navigation'));
});
test('editorial filters remove fashion stock-pick promotions that only mention AI in passing',()=>{
 const ranked=R.rankHeadlines([item({title:'Jim Cramer says these six fashion stocks are buys beyond the AI trade'}),item({title:'OpenAI expands new national security team',link:'https://example.com/openai'})],now);assert.equal(ranked.length,1);assert.match(ranked[0].title,/OpenAI/);
 assert.equal(R.editorialTier({source:'Bloomberg.com'}),3);
});
