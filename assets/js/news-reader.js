/* Source-backed reading, with explicit evidence limits and stable reading state. */
(function () {
  'use strict';
  const root = document.querySelector('[data-news-reader]');
  if (!root || root.dataset.readerReady) return;
  root.dataset.readerReady = 'true';
  const $ = selector => root.querySelector(selector);
  const HOUR = 3600000, cadence = 5 * 60000;
  const params = new URLSearchParams(location.search);
  let originalEdition = params.get('edition') || window.FynxEdition?.get() || 'us';
  const options = {id:params.get('id') || '', edition:originalEdition, category:params.get('category') || 'all'};
  if (params.get('symbol')) options.symbol = params.get('symbol');
  const sourceURL = safeURL(params.get('url'));
  const resolveShared = !!sourceURL || !params.has('edition');
  let current = null, pendingUpdate = null, request = 0, loading = false, timer = null, lastCheck = 0, lastAttempt = 0, refreshUnavailable = false;
  let sharing = false, markedOpened = false, shared=null, imageExpiryTimer=null;
  const preferenceKey = 'fynx:reader-preferences:v1';
  let preferences = {size:'standard',focus:false};
  const labels = {all:'News',stocks:'Markets',forex:'Currencies',crypto:'Digital assets',macro:'Economics',commodities:'Commodities',finance:'Finance',economics:'Economics',technology:'Technology',politics:'Politics & Policy',industries:'Industries',energy:'Energy',world:'World',analysis:'Analysis',official:'Official sources'};
  const sections = {stocks:'markets',finance:'finance',economics:'economics',macro:'economics',technology:'technology',politics:'politics',industries:'industries',energy:'energy',world:'world'};
  const coverageLabels = {'source-text':'Source text reviewed','publisher-excerpt':'Publisher excerpt reviewed','headline-only':'Headline only'};
  const text = (value, length=1200) => typeof value === 'string' ? value.replace(/\s+/g,' ').trim().slice(0,length) : '';
  function node(tag, value, className) { const el=document.createElement(tag); if(value !== undefined)el.textContent=value;if(className)el.className=className;return el; }
  function safeURL(value) {
    try {
      const url=new URL(value);
      if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!url.hostname.includes('.')||url.hostname.includes(':')||/^[\d.]+$/.test(url.hostname)||/\.(?:local|localhost|internal)$/.test(url.hostname)||url.href.length>4096)return null;
      return url.href;
    } catch {return null;}
  }
  function time(value) {const at=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(at)?new Date(at).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'';}
  function labelEdition(code) {return window.FynxEdition?.editions?.find(item=>item.id===code)?.label || code;}
  function deskURL(code) {const route=sections[options.category];return (route?'/news/'+route+'.html':'/news.html')+'?edition='+encodeURIComponent(code || originalEdition);}
  function syncBackLinks() {const code=window.FynxEdition?.get() || originalEdition;root.querySelectorAll('[data-reader-back]').forEach(link=>{link.href=deskURL(code);});}
  function validate(article) {
    if(!article || article.id!==options.id || !/^[a-f0-9]{64}$/.test(article.id) || !text(article.title) || !text(article.source) || !safeURL(article.sourceUrl) || !time(article.publishedAt) || Date.parse(article.publishedAt)>Date.now()+300000)throw new Error('This story could not be verified.');
    if(article.edition && article.edition!==originalEdition)throw new Error('The source returned a different news edition.');
    if(!Object.hasOwn(coverageLabels,article.coverageLevel))throw new Error('The available source material could not be verified.');
    return article;
  }
  function fingerprint(article) {return JSON.stringify([article.id,article.title,article.sourceUrl,article.publishedAt,article.coverageLevel,article.coverageNote,article.summary,article.keyPoints,article.numbers,article.context,article.questions,article.terms,article.image,article.related,article.intelligence,article.marketContext]);}
  function currentStory(article) {const age=Date.now()-Date.parse(article.publishedAt);return article.isCurrent!==false&&age>=-300000&&age<=24*HOUR;}
  function contentExpiry(article) {
    if(!article)return NaN;
    const published=Date.parse(article.publishedAt),limit=published+(article.category==='official'?30:7)*24*HOUR;
    return published>0?(article.contentExpiresAt?Math.min(limit,Date.parse(article.contentExpiresAt)):limit):NaN;
  }
  function retained(article) {const expiry=contentExpiry(article);return Number.isFinite(expiry)&&expiry>Date.now();}
  function clearExpired() {
    clearExpiredImages();
    if(!current||retained(current))return;
    current=null;pendingUpdate=null;
    for(const name of ['summary','points','context','questions','numbers','terms','sources','related','image'])$('[data-reader-'+name+']')?.replaceChildren();
    fail('This story’s source material has expired. Check for updates or open current reporting.');
  }
  function status(message) { $('[data-reader-status]').textContent=message; }
  function actionStatus(message) { $('[data-reader-action-status]').textContent=message; }
  function readingPreferences(save=false) {
    root.dataset.readerSize=preferences.size;
    document.body.classList.toggle('reader-focus-view',preferences.focus);
    $('[data-reader-text-size]').value=preferences.size;
    const button=$('[data-reader-focus]');button.setAttribute('aria-pressed',String(preferences.focus));button.textContent=preferences.focus?'Exit focus view':'Focus view';
    if(save&&shared?.sync.uid){shared.save('preferences','default',{reader:preferences}).catch(error=>actionStatus(error.message));return;}
    if(save)try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch{ $('[data-reader-preferences-note]').textContent='Preferences apply for this visit. Browser storage is unavailable.'; }
  }
  function storyURL() {
    const url=new URL('/news/article.html',location.origin);
    url.searchParams.set('id',options.id);
    if(!resolveShared){url.searchParams.set('edition',originalEdition);url.searchParams.set('category',options.category);if(options.symbol)url.searchParams.set('symbol',options.symbol);}
    return url.href;
  }
  function fallbackLink() {
    $('[data-reader-share-fallback]').hidden=false;
    const input=$('[data-reader-share-url]');input.value=storyURL();input.focus();input.select();
    actionStatus('Automatic copying is unavailable. The story link is selected below; copy it using your browser or keyboard.');
  }
  async function copyLink() {
    try {
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(storyURL());
      $('[data-reader-share-fallback]').hidden=true;actionStatus('FYNX story link copied.');
    }catch{fallbackLink();}
  }
  async function shareStory() {
    if(!current||sharing)return;
    sharing=true;const button=$('[data-reader-share]');button.disabled=true;
    try {
      if(typeof navigator.share==='function'){
        try{await navigator.share({title:text(current.title,600),url:storyURL()});actionStatus('Story shared.');}
        catch(error){if(error?.name==='AbortError')actionStatus('Sharing cancelled.');else await copyLink();}
      }else await copyLink();
    }finally{sharing=false;button.disabled=!current;}
  }
  function updateStatus(note) {
    if(note){status(note);return;}
    if(!current)return;
    if(refreshUnavailable){status('The brief could not be refreshed. The previously prepared source material remains visible with its dates.');return;}
    const checked=lastCheck?time(new Date(lastCheck).toISOString()):time(current.preparedAt);
    status((pendingUpdate?'An updated brief is available. Use “Read updated brief” when you’re ready.':currentStory(current)?'Current reporting · Checks every 5 minutes while open.':'Past coverage · This story is outside the current news window.')+(checked?' Last brief check: '+checked+'.':''));
  }
  function section(name, visible) { $('[data-reader-'+name+'-section]').hidden=!visible;const link=$('[data-reader-'+name+'-link]');if(link)link.hidden=!visible; }
  function metadata(article) {
    const host=$('[data-reader-meta]'), publisher=node('span',text(article.source,150));
    const publication=node('time','Published '+time(article.publishedAt));publication.dateTime=article.publishedAt;
    host.replaceChildren(publisher,publication,node('span',labelEdition(originalEdition)+' edition'),node('span',currentStory(article)?'Current coverage':'Past coverage'));
    const deck=article.coverageLevel==='headline-only'?'The headline is available. FYNX has not obtained enough source text to summarize the full report.':article.coverageLevel==='publisher-excerpt'?'A concise brief from the publisher’s available excerpt, with additional source-backed detail when available.':'A concise brief from accessible source text, with additional source-backed detail when available.';
    $('[data-reader-deck]').textContent=deck;
    const check=$('[data-reader-check]');check.replaceChildren();
    const detail=[['Publisher',text(article.source,150)],['Material available',coverageLabels[article.coverageLevel]],['Published',time(article.publishedAt)],['Brief prepared',time(article.preparedAt)],['Coverage',currentStory(article)?'Within the current news window':'Outside the current news window']];
    for(const [term,value] of detail){if(!value)continue;const row=node('div');row.append(node('dt',term),node('dd',value));check.append(row);}
    $('[data-reader-check-note]').textContent=article.coverageLevel==='headline-only'?'This page does not imply that FYNX read the complete article. The source link below is available for the full reporting.':'Check the original report for its full wording, qualifications and later corrections. A FYNX brief is not independent verification of every source claim.';
  }
  // A share-image/Open Graph URL is not a license. The optional image must be
  // bound to this exact article and carry the same approved rights as the API.
  function approvedImage(article, parentExpiry=Infinity) {
    const image=article?.image;
    if(!image||typeof image!=='object'||Array.isArray(image))return null;
    const id=article.id||article.articleId, source=safeURL(article.sourceUrl), imageSource=safeURL(image.sourceURL||image.sourceUrl);
    const url=safeURL(image.url),licenseURL=safeURL(image.licenseURL||image.licenseUrl),credit=text(image.credit,300),license=text(image.license,100);
    const licenses={'https://creativecommons.org/licenses/by/4.0/':'CC BY 4.0','https://creativecommons.org/licenses/by-sa/4.0/':'CC BY-SA 4.0','https://creativecommons.org/publicdomain/zero/1.0/':'CC0'};
    const expires=typeof image.expiresAt==='string'?Date.parse(image.expiresAt):NaN,limit=Math.min(contentExpiry(article),parentExpiry);
    if(!/^[a-f0-9]{64}$/.test(id||'')||image.articleID!==id||!source||imageSource!==source||!url||!licenseURL||licenses[licenseURL]!==license||!credit||image.credit.length>300||!Number.isFinite(expires)||!Number.isFinite(limit)||expires<=Date.now()||expires>limit||expires>Date.now()+30*24*HOUR)return null;
    if([image.width,image.height].some(value=>value!=null&&(!Number.isInteger(value)||value<1||value>10000)))return null;
    const kind=image.kind||'source',caption=text(image.caption,600),sourcePage=safeURL(image.sourcePage);
    if(!['source','article','context'].includes(kind)||(kind==='context'&&(!caption||typeof image.caption!=='string'||image.caption.length>600||!sourcePage)))return null;
    return {url,source,licenseURL,license,credit,expires,kind,caption,sourcePage,alt:text(image.alt,300)||(kind==='context'?'Context photograph: '+caption:'Article image for '+text(article.title,500))};
  }
  function imageFigure(article, {compact=false,parentExpiry=Infinity}={}) {
    const image=approvedImage(article,parentExpiry);if(!image)return null;
    const figure=node('figure',undefined,compact?'reader-related-photo':'reader-approved-photo'),img=node('img');
    figure.dataset.readerImageExpiry=String(image.expires);
    img.src=image.url;img.alt=image.alt;img.loading=compact?'lazy':'eager';img.decoding='async';img.referrerPolicy='no-referrer';
    const context=image.kind==='context';
    if(context){figure.dataset.readerImageKind='context';img.style.objectFit='contain';}
    const caption=node('figcaption');caption.append(node('strong',context?'Context photograph: ':'Source image: '));
    if(context)caption.append(image.caption+' Photo: '+image.credit+' · ');
    const source=node('a',context?'Original image source':image.credit);source.href=context?image.sourcePage:image.source;source.target='_blank';source.rel='noopener noreferrer';
    const rights=node('a',image.license);rights.href=image.licenseURL;rights.target='_blank';rights.rel='noopener noreferrer';caption.append(source,' · ',rights);
    img.addEventListener('error',()=>{figure.remove();scheduleImageExpiry();},{once:true});
    figure.append(img,caption);return figure;
  }
  function photograph(article) {
    const host=$('[data-reader-image]');host.replaceChildren();
    const figure=imageFigure(article);if(figure)host.append(figure);
    // Missing permission or failed imagery keeps a clean, readable text layout.
    // Do not ask the newsroom preview helper to retrieve an unlicensed OG image.
  }
  function clearExpiredImages() {
    root.querySelectorAll('[data-reader-image-expiry]').forEach(figure=>{
      if(Number(figure.dataset.readerImageExpiry)<=Date.now()){figure.querySelector('img')?.removeAttribute('src');figure.remove();}
    });
    scheduleImageExpiry();
  }
  function scheduleImageExpiry() {
    if(imageExpiryTimer!==null){window.clearTimeout(imageExpiryTimer);imageExpiryTimer=null;}
    const dates=[...root.querySelectorAll('[data-reader-image-expiry]')].map(figure=>Number(figure.dataset.readerImageExpiry)).filter(Number.isFinite);
    if(dates.length)imageExpiryTimer=window.setTimeout(clearExpiredImages,Math.max(1,Math.min(2147483647,Math.min(...dates)-Date.now())));
  }
  function summary(article) {
    const host=$('[data-reader-summary]');host.replaceChildren();
    const brief=text(article.summary,2500);
    host.append(node('p',brief || 'The source has not supplied enough accessible reporting for a reliable summary. The original report is linked below.'));
    $('[data-reader-access]').textContent=coverageLabels[article.coverageLevel];
    const note=$('[data-reader-coverage]');note.replaceChildren(node('strong',coverageLabels[article.coverageLevel]),node('p',text(article.coverageNote,1200) || 'The brief reflects the source material available when this page was prepared.'));
  }
  function points(article) {
    const rows=Array.isArray(article.keyPoints)?article.keyPoints.filter(row=>text(row?.text)).slice(0,6):[];
    section('points',rows.length>0);const host=$('[data-reader-points]');host.replaceChildren();
    rows.forEach((row,index)=>{const article=node('article'),detail=node('div');article.append(node('span',String(index+1).padStart(2,'0'),'reader-point-number'));detail.append(node('p',text(row.text,1800)));const evidence=text(row.evidence,600);if(evidence&&evidence!==text(row.text,1800)){const details=node('details');details.append(node('summary','See the source evidence'),node('blockquote',evidence));detail.append(details);}article.append(detail);host.append(article);});
  }
  function context(article) {
    const evidence=new Set([article.summary,...(article.keyPoints||[]).map(x=>x.text)]),sections=article.intelligence;
    const groups=[['whyItMatters','Why it matters'],['marketImpact','Potential market impact'],['context','Broader context'],['nextEvents','What happens next']];
    const host=$('[data-reader-context]');host.replaceChildren();
    if(sections?.version===1)for(const [key,title] of groups){
      const rows=(Array.isArray(sections[key])?sections[key]:[]).filter(x=>evidence.has(x.text)&&safeURL(x.sourceURL)===safeURL(article.sourceUrl)).slice(0,2);
      if(!rows.length)continue;const block=node('article');block.append(node('h3',title));
      for(const row of rows){block.append(node('p',text(row.text,2200)));block.append(node('small',row.kind==='potential'?'Potential effect described by the source':row.kind==='reported-movement'?'Source-reported movement; causal attribution not established':'Attributed to '+text(article.source,160)));}
      host.append(block);
    }
    const snapshots=(Array.isArray(article.marketContext)?article.marketContext:[]).filter(row=>{
      const age=Date.now()-Date.parse(row.asOf),maxAge=/-USD$/.test(row.symbol||'')?HOUR:4*24*HOUR;
      return text(row.symbol,24)&&text(row.name,160)&&Number.isFinite(row.price)&&row.price>0&&text(row.source,160)&&safeURL(row.sourceURL)&&Number.isFinite(age)&&age>=-300000&&age<=maxAge;
    }).slice(0,6);
    if(snapshots.length){const block=node('article');block.append(node('h3','Dated market context'),node('p','These separate market snapshots do not establish a reaction to this report.'));
      for(const row of snapshots){const value=Number(row.price).toLocaleString(undefined,{maximumFractionDigits:6}),change=Number.isFinite(row.changeValue)&&['%','bp'].includes(row.changeUnit)?' · '+(row.changeValue>=0?'+':'')+row.changeValue.toFixed(2)+row.changeUnit:Number.isFinite(row.changePercent)?' · '+(row.changePercent>=0?'+':'')+row.changePercent.toFixed(2)+'%':'';
        block.append(node('p',text(row.name,160)+' ('+text(row.symbol,24)+') · '+value+(text(row.currency,8)?' '+text(row.currency,8):'')+change));
        block.append(node('small','Data: '+text(row.source,160)+' · '+time(row.asOf)));
      }host.append(block);
    }
    section('context',host.childElementCount>0);section('questions',false);$('[data-reader-questions]').replaceChildren();
  }
  function rail(article) {
    const numbers=Array.isArray(article.numbers)?article.numbers.filter(row=>text(row?.value)&&text(row?.context)).slice(0,5):[];
    section('numbers',numbers.length>0);const host=$('[data-reader-numbers]');host.replaceChildren();
    numbers.forEach(row=>{const article=node('article');article.append(node('strong',text(row.value,80)),node('p',text(row.context,600)));host.append(article);});
    const terms=Array.isArray(article.terms)?article.terms.filter(row=>text(row?.term)&&text(row?.definition)).slice(0,6):[];
    section('terms',terms.length>0);const glossary=$('[data-reader-terms]');glossary.replaceChildren();
    terms.forEach(row=>{const item=node('div');item.append(node('dt',text(row.term,100)),node('dd',text(row.definition,1000)));glossary.append(item);});
  }
  function sources(article) {
    const host=$('[data-reader-sources]'), seen=new Set();host.replaceChildren();
    const rows=[{name:article.source,url:article.sourceUrl,accessedAt:article.preparedAt},...(Array.isArray(article.sources)?article.sources:[])];
    for(const row of rows.slice(0,8)){
      const url=safeURL(row?.url), name=text(row?.name,160);if(!url||!name||seen.has(url))continue;seen.add(url);
      // Sources are credited by name; FYNX keeps readers on its own summary instead of sending them away.
      const credit=node('div'), detail=node('span');credit.className='reader-source-credit';
      detail.append(node('strong',name),node('small','Original reporting · '+new URL(url).hostname.replace(/^www\./,'')+(row.accessedAt&&time(row.accessedAt)?' · Available material checked '+time(row.accessedAt):'')));
      credit.append(detail);host.append(credit);
    }
    $('[data-reader-method]').textContent='Prepared from available source material. Attributed reporting and separately dated market snapshots are identified explicitly. Original reporting belongs to the publishers credited here; FYNX summarises it in its own words and does not reproduce it.';
  }
  function related(article) {
    const rows=Array.isArray(article.related)?article.related:[], host=$('[data-reader-related]'),seen=new Set();host.replaceChildren();
    for(const row of rows.slice(0,12)){
      const id=row?.articleId || row?.id, published=Date.parse(row?.publishedAt);if(!/^[a-f0-9]{64}$/.test(id || '')||id===article.id||seen.has(id)||!text(row.title)||!text(row.source)||!Number.isFinite(published)||Date.now()-published>7*24*HOUR||published>Date.now()+300000)continue;
      // Verified shared-service rows retain the exact publisher source. Resolve
      // it directly instead of searching a different edition/category feed.
      const sourceValue=row.sourceUrl??row.sourceURL,source=sourceValue==null?null:safeURL(sourceValue);
      if(sourceValue!=null&&!source)continue;
      const exact=source?new URL('/news/article.html',location.origin):null;if(exact)exact.searchParams.set('url',source);
      const href=exact?.href||window.FYNXNewsReaderData?.href({...row,articleId:id,edition:row.edition||originalEdition,category:row.category||options.category});
      if(!href)continue;let target;try{target=new URL(href,location.origin);}catch{continue;}
      // Both the source-backed reader and its published FYNX Intelligence analysis are valid internal destinations.
      // An Intelligence URL has no article id parameter; only accept the exact, clean slug route.
      const readerRoute=target.pathname==='/news/article.html'&&(source?target.searchParams.get('url')===source&&!target.searchParams.has('edition'):target.searchParams.get('id')===id);
      const intelligenceRoute=/^\/intelligence\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(target.pathname)&&!target.search&&!target.hash;
      if(target.origin!==location.origin||(!readerRoute&&!intelligenceRoute))continue;
      seen.add(id);const card=node('article'),heading=node('h3'),link=node('a',text(row.title,500));const figure=imageFigure({...row,id},{compact:true,parentExpiry:contentExpiry(article)});if(figure)card.append(figure);link.href=target.pathname+target.search;heading.append(link);const publishedAt=node('time',time(row.publishedAt));publishedAt.dateTime=row.publishedAt;card.append(node('p',text(row.source,150),'reader-related-source'),heading,publishedAt);host.append(card);
      if(seen.size===5)break;
    }
    section('related',seen.size>0);
  }
  function render(article) {
    current=validate(article);pendingUpdate=null;refreshUnavailable=article.refreshUnavailable===true;
    $('[data-reader-error]').hidden=true;$('[data-reader-content]').hidden=false;$('[data-reader-content]').setAttribute('aria-busy','false');$('[data-reader-loading]').hidden=true;$('[data-reader-loaded]').hidden=false;
    $('[data-reader-title]').textContent=text(article.title,600);document.title=text(article.title,150)+' | FYNX Reader';
    $('[data-reader-copy]').disabled=false;
    $('[data-reader-share]').disabled=sharing;
    metadata(article);photograph(article);summary(article);points(article);context(article);rail(article);sources(article);related(article);scheduleImageExpiry();syncBackLinks();updateStatus();
    if(!markedOpened)try{window.FYNXYourNews?.markOpened({...article,url:article.sourceUrl,edition:originalEdition,category:options.category,...(options.symbol?{symbol:options.symbol}:{})});markedOpened=!!window.FYNXYourNews;}catch{}
  }
  function fail(message) {
    if(current&&!retained(current)){current=null;pendingUpdate=null;}
    if(current){refreshUnavailable=true;updateStatus();return;}
    const host=$('[data-reader-error]');host.hidden=false;host.replaceChildren(node('h1','This brief is not available right now.'),node('p',message || 'The source item may have left the current news window or the news service could not retrieve it. Choose a current story from the newsroom.'));
    const back=node('a','Browse the latest reporting →');back.href=deskURL(window.FynxEdition?.get()||originalEdition);host.append(back);
    $('[data-reader-content]').hidden=true;$('[data-reader-copy]').disabled=true;$('[data-reader-share]').disabled=true;status('No unverified article information is displayed.');
  }
  async function refresh(force=false) {
    if(loading)return;loading=true;lastAttempt=Date.now();const serial=++request, button=$('[data-reader-refresh]');
    button.disabled=true;button.textContent='Checking…';
    try {
      const service=window.FYNXNewsReaderData;
      if(!service?.loadArticle)throw new Error('The reader service is temporarily unavailable. Please try again.');
      const raw=resolveShared?await service.resolveArticle(sourceURL?{url:sourceURL}:{id:options.id}):await service.loadArticle({...options,force});
      if(resolveShared&&!current){options.id=raw.id;options.category=raw.category||'all';originalEdition=raw.edition||'us';options.edition=originalEdition;}
      const article=validate(raw);
      if(!retained(article))throw new Error('This story’s source material has expired.');
      if(serial!==request)return;
      if(article.refreshUnavailable){
        if(!current)render(article);
        fail('The source could not be checked just now.');
        return;
      }
      lastCheck=Date.now();refreshUnavailable=false;
      if(!current)render(article);
      else if(fingerprint(article)!==fingerprint(current)){pendingUpdate=article;updateStatus();}
      else updateStatus();
    }catch(error){if(serial===request){if(error?.status===404||error?.status===410){current=null;pendingUpdate=null;}clearExpired();fail(text(error?.message,400));}}
    finally{if(serial===request){loading=false;button.disabled=false;button.textContent=pendingUpdate?'Read updated brief':'Check for updates ↻';}}
  }
  function schedule(){if(!timer){timer=window.setInterval(()=>{if(!document.hidden)refresh();},cadence);window.setInterval(clearExpired,20000);}}
  function onReturn(){if(document.hidden)return;clearExpired();if(Date.now()-lastAttempt>=cadence)refresh();else updateStatus();}
  async function start() {
    syncBackLinks();
    if(!sourceURL&&!/^[a-f0-9]{64}$/.test(options.id)){fail('Open a story from the FYNX newsroom to see its source-backed brief. This address does not identify a verified story.');$('[data-reader-refresh]').disabled=true;return;}
    try {const saved=resolveShared?null:await window.FYNXNewsReaderData?.getCachedArticle(options);if(saved&&retained(saved))render(validate(saved));}catch{}
    refresh();schedule();
  }
  $('[data-reader-refresh]').addEventListener('click',()=>{if(pendingUpdate&&retained(pendingUpdate)){render(pendingUpdate);$('[data-reader-refresh]').textContent='Check for updates ↻';}else {pendingUpdate=null;clearExpired();refresh(true);}});
  $('[data-reader-copy]').addEventListener('click',()=>{if(current)copyLink();});
  $('[data-reader-share]').addEventListener('click',shareStory);
  $('[data-reader-share-close]').addEventListener('click',()=>{$('[data-reader-share-fallback]').hidden=true;$('[data-reader-copy]').focus();});
  $('[data-reader-share-url]').addEventListener('click',event=>event.target.select());
  try{const saved=JSON.parse(localStorage.getItem(preferenceKey));if(saved&&['standard','large','larger'].includes(saved.size))preferences.size=saved.size;if(typeof saved?.focus==='boolean')preferences.focus=saved.focus;}catch{}
  readingPreferences();
  $('[data-reader-text-size]').addEventListener('change',event=>{const value=event.target.value;if(['standard','large','larger'].includes(value)){preferences.size=value;readingPreferences(true);}});
  $('[data-reader-focus]').addEventListener('click',()=>{preferences.focus=!preferences.focus;readingPreferences(true);actionStatus(preferences.focus?'Focus view on. Navigation is hidden; source details remain below the brief. Press Escape to exit.':'Focus view off.');});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&preferences.focus){preferences.focus=false;readingPreferences(true);$('[data-reader-focus]').focus();actionStatus('Focus view off.');}});
  document.addEventListener('fynx:edition-change',()=>{
    syncBackLinks();
    // Keep a shared story tied to the edition that retrieved it. The preference
    // still applies to Back to news and subsequent browsing, without replacing
    // the report the visitor is currently reading.
    if(!resolveShared)try{const url=new URL(location.href);url.searchParams.set('edition',originalEdition);history.replaceState(history.state,'',url);}catch{}
  });
  document.addEventListener('visibilitychange',onReturn);
  window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;window.clearTimeout(imageExpiryTimer);imageExpiryTimer=null;});
  window.addEventListener('pageshow',()=>{if(/^[a-f0-9]{64}$/.test(options.id)){schedule();onReturn();}});
  start();
  import('/assets/js/account-sync.js?v=20261115-intelligence-1').then(api=>{
    shared=api;const saveButton=node('button','Save story');saveButton.type='button';$('[data-reader-share]').before(saveButton);
    let version=0;
    function sourceIdentity(value){
      const source=safeURL(value);if(!source)return null;
      const url=new URL(source);url.hash='';
      // Keep literal '+' distinct from a space, as native bookmark hashing does.
      // URLSearchParams would silently change that significant source value.
      try{const pairs=(url.search?url.search.slice(1).split('&'):[]).map(raw=>({raw,name:decodeURIComponent(raw.split('=',1)[0])}));url.search=pairs.filter(({name})=>!/^utm_|^(fbclid|gclid|oc|mc_cid|mc_eid|__source)$/i.test(name)).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).map(x=>x.raw).join('&');return window.FynxAccountSyncMapping?.canonicalStoryURL(url.href)||url.href;}catch{return null;}
    }
    function existingBookmark(article){
      const rows=[...(api.sync.rows?.values()||[])].filter(row=>!row.deleted&&row.domain==='readingRecords'&&safeURL(row.data?.url));
      // A reader ID and the original bookmark's source-URL hash are different
      // identities. Retain that original record when the resolver removes oc.
      const source=sourceIdentity(article.sourceUrl);
      return rows.find(row=>row.data.webArticleId===article.id)||(source?rows.find(row=>sourceIdentity(row.data.url)===source):null);
    }
    async function bookmark(article){const existing=existingBookmark(article);return {id:existing?.id||await api.storyID(article.sourceUrl),url:existing?.data.url||article.sourceUrl};}
    async function paint(){const request=++version,article=current,uid=api.sync.uid;if(!article){saveButton.disabled=true;return;}const {id}=await bookmark(article);if(request!==version||uid!==api.sync.uid||article!==current)return;const saved=!!api.accountData('readingRecords',id)?.saved;saveButton.disabled=false;saveButton.textContent=saved?'Saved story':'Save story';saveButton.setAttribute('aria-pressed',String(saved));}
    saveButton.onclick=async()=>{if(!current)return;if(!api.sync.uid){location.href='/auth/login.html?returnTo='+encodeURIComponent(location.pathname+location.search);return;}saveButton.disabled=true;const article=current,uid=api.sync.uid;try{const {id,url}=await bookmark(article);if(uid!==api.sync.uid)throw Error('Your account changed. Please try again.');const saved=!!api.accountData('readingRecords',id)?.saved;await api.save('readingRecords',id,{id,webArticleId:article.id,title:article.title,url,source:article.source,publishedAt:article.publishedAt,readerUrl:new URL(storyURL()).pathname+new URL(storyURL()).search,saved:!saved});actionStatus(saved?'Removed from saved stories.':'Story saved to your account.');}catch(error){actionStatus(error.message);}finally{await paint();}};
    api.subscribe(()=>{const settings=api.accountData('preferences')?.reader;if(settings){if(['standard','large','larger'].includes(settings.size))preferences.size=settings.size;if(typeof settings.focus==='boolean')preferences.focus=settings.focus;readingPreferences();}paint();});
    const observer=new MutationObserver(()=>paint());observer.observe($('[data-reader-share]'),{attributes:true,attributeFilter:['disabled']});paint();
  }).catch(()=>{});
})();
