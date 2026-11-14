/* Source-backed reading, with explicit evidence limits and stable reading state. */
(function () {
  'use strict';
  const root = document.querySelector('[data-news-reader]');
  if (!root || root.dataset.readerReady) return;
  root.dataset.readerReady = 'true';
  const $ = selector => root.querySelector(selector);
  const HOUR = 3600000, cadence = 5 * 60000;
  const params = new URLSearchParams(location.search);
  const originalEdition = params.get('edition') || window.FynxEdition?.get() || 'us';
  const options = {id:params.get('id') || '', edition:originalEdition, category:params.get('category') || 'all'};
  if (params.get('symbol')) options.symbol = params.get('symbol');
  let current = null, pendingUpdate = null, request = 0, loading = false, timer = null, lastCheck = 0, lastAttempt = 0, refreshUnavailable = false;
  let sharing = false, markedOpened = false, shared=null;
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
  function fingerprint(article) {return JSON.stringify([article.id,article.title,article.sourceUrl,article.publishedAt,article.coverageLevel,article.coverageNote,article.summary,article.keyPoints,article.numbers,article.context,article.questions,article.terms,article.image,article.related]);}
  function currentStory(article) {const age=Date.now()-Date.parse(article.publishedAt);return article.isCurrent!==false&&age>=-300000&&age<=24*HOUR;}
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
    url.searchParams.set('id',options.id);url.searchParams.set('edition',originalEdition);url.searchParams.set('category',options.category);
    if(options.symbol)url.searchParams.set('symbol',options.symbol);
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
    const deck=article.coverageLevel==='headline-only'?'The headline is available. FYNX has not obtained enough source text to summarize the full report.':article.coverageLevel==='publisher-excerpt'?'A concise brief from the publisher’s available excerpt, followed by clear FYNX context.':'A concise brief from accessible source text, followed by clear FYNX context.';
    $('[data-reader-deck]').textContent=deck;
    const check=$('[data-reader-check]');check.replaceChildren();
    const detail=[['Publisher',text(article.source,150)],['Material available',coverageLabels[article.coverageLevel]],['Published',time(article.publishedAt)],['Brief prepared',time(article.preparedAt)],['Coverage',currentStory(article)?'Within the current news window':'Outside the current news window']];
    for(const [term,value] of detail){if(!value)continue;const row=node('div');row.append(node('dt',term),node('dd',value));check.append(row);}
    $('[data-reader-check-note]').textContent=article.coverageLevel==='headline-only'?'This page does not imply that FYNX read the complete article. The source link below is available for the full reporting.':'Check the original report for its full wording, qualifications and later corrections. A FYNX brief is not independent verification of every source claim.';
  }
  function contextFigure(article) {
    const category=article.category || options.category;
    const contextRules=[
      ['markets',/\b(?:stock markets?|stock exchanges?|S&P\s*500|Nasdaq|Dow Jones|Wall Street|equities)\b/i],
      ['finance',/\b(?:earnings|quarterly results|revenue|profits?|banking|bonds?|yields?|loans?|credit markets?|financing)\b/i],
      ['technology',/\b(?:artificial intelligence|AI|semiconductors?|computer chips?|chipmakers?|software|cybersecurity|data cent(?:er|re)s?|technology)\b/i],
      ['economics',/\b(?:inflation|CPI|GDP|unemployment|payrolls?|jobs report|central banks?|Federal Reserve|policy rates?|interest rates?|economic growth)\b/i],
      ['energy',/\b(?:crude oil|oil prices?|natural gas|renewables?|energy|wind farms?|solar power|OPEC)\b/i],
      ['industries',/\b(?:manufacturing|factories|factory|automotive|airlines?|aviation|industrial|supply chains?)\b/i],
      ['markets',/\b(?:stocks?|forex|currencies|bitcoin|crypto|ethereum)\b/i],
      ['politics',/\b(?:elections?|parliament|congress|government|president|politics|legislation)\b/i]
    ];
    let context=sections[category] || (category==='forex'||category==='crypto'?'markets':'world');
    if(['all','analysis','official'].includes(category)){
      // Infer only from reported material, never from the generic explanations.
      // Prefer the headline's subject before looking for detail in the brief.
      const sourceBrief=[article.summary,...(Array.isArray(article.keyPoints)?article.keyPoints.map(point=>point?.text):[])].map(value=>text(value,1800)).join(' ');
      context=contextRules.find(([,pattern])=>pattern.test(text(article.title,600)))?.[0]
        ||contextRules.find(([,pattern])=>pattern.test(sourceBrief))?.[0]||'world';
    }
    if(originalEdition!=='us'&&['politics','economics','energy','markets'].includes(context))context=originalEdition==='uk'&&context==='markets'?'finance':'world';
    return window.FYNXNewsroomMedia?.createFigure(context,{loading:'eager',story:{url:article.sourceUrl,title:article.title},captionTitle:false}) || null;
  }
  function photograph(article) {
    const host=$('[data-reader-image]'), image=article.image;
    host.replaceChildren();
    const license=text(image?.license,100), credit=text(image?.credit,200), source=safeURL(image?.sourceUrl || image?.sourceURL), url=safeURL(image?.url);
    const reusable=/^(CC0|CC BY(?:-SA)? [34]\.0|Public domain)$/i.test(license);
    if(!url||!credit||!reusable){const figure=contextFigure(article);if(figure)host.append(figure);return;}
    const figure=node('figure'), img=node('img');img.src=url;img.alt=text(image.alt,300);img.loading='eager';img.decoding='async';img.referrerPolicy='no-referrer';
    const caption=node('figcaption');caption.append(node('strong','Source image: '));
    if(source){const a=node('a',credit);a.href=source;a.target='_blank';a.rel='noopener noreferrer';caption.append(a);}else caption.append(credit);
    const licenseURL=safeURL(image.licenseUrl || image.licenseURL);
    caption.append(' · ');if(licenseURL){const a=node('a',license);a.href=licenseURL;a.target='_blank';a.rel='noopener noreferrer';caption.append(a);}else caption.append(license);
    img.addEventListener('error',()=>{const fallback=contextFigure(article);if(fallback)figure.replaceWith(fallback);else figure.remove();},{once:true});
    figure.append(img,caption);host.append(figure);
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
    const rows=Array.isArray(article.context)?article.context.filter(row=>text(row?.title)&&text(row?.text)).slice(0,5):[];
    section('context',rows.length>0);const host=$('[data-reader-context]');host.replaceChildren();
    rows.forEach(row=>{const article=node('article');article.append(node('h3',text(row.title,200)),node('p',text(row.text,2200)));host.append(article);});
    const questions=Array.isArray(article.questions)?article.questions.map(row=>text(row,800)).filter(Boolean).slice(0,6):[];
    section('questions',questions.length>0);$('[data-reader-questions]').replaceChildren(...questions.map(value=>node('li',value)));
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
      const link=node('a'), detail=node('span');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
      detail.append(node('strong',name),node('small',new URL(url).hostname+(row.accessedAt&&time(row.accessedAt)?' · Available material checked '+time(row.accessedAt):'')));
      link.append(detail,node('span','↗︎','reader-source-arrow'));link.setAttribute('aria-label','Read original reporting at '+name+' (opens in a new tab)');host.append(link);
    }
    $('[data-reader-method]').textContent='Prepared from available source material. Source-backed points and FYNX explanatory context are identified separately. Publisher access terms apply to the original report.';
  }
  function related(article) {
    const rows=Array.isArray(article.related)?article.related:[], host=$('[data-reader-related]'),seen=new Set();host.replaceChildren();
    for(const row of rows.slice(0,12)){
      const id=row?.articleId || row?.id, published=Date.parse(row?.publishedAt);if(!/^[a-f0-9]{64}$/.test(id || '')||id===article.id||seen.has(id)||!text(row.title)||!text(row.source)||!Number.isFinite(published)||Date.now()-published>24*HOUR||published>Date.now()+300000)continue;
      const href=window.FYNXNewsReaderData?.href({...row,articleId:id,edition:row.edition||originalEdition,category:row.category||options.category});
      if(!href)continue;let target;try{target=new URL(href,location.origin);}catch{continue;}
      // Both the source-backed reader and its published FYNX Intelligence analysis are valid internal destinations.
      // An Intelligence URL has no article id parameter; only accept the exact, clean slug route.
      const readerRoute=target.pathname==='/news/article.html'&&target.searchParams.get('id')===id;
      const intelligenceRoute=/^\/intelligence\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(target.pathname)&&!target.search&&!target.hash;
      if(target.origin!==location.origin||(!readerRoute&&!intelligenceRoute))continue;
      seen.add(id);const card=node('article'),heading=node('h3'),link=node('a',text(row.title,500));link.href=target.pathname+target.search;heading.append(link);const publishedAt=node('time',time(row.publishedAt));publishedAt.dateTime=row.publishedAt;card.append(node('p',text(row.source,150),'reader-related-source'),heading,publishedAt);host.append(card);
      if(seen.size===3)break;
    }
    section('related',seen.size>0);
  }
  function render(article) {
    current=validate(article);pendingUpdate=null;refreshUnavailable=article.refreshUnavailable===true;
    $('[data-reader-error]').hidden=true;$('[data-reader-content]').hidden=false;$('[data-reader-content]').setAttribute('aria-busy','false');$('[data-reader-loading]').hidden=true;$('[data-reader-loaded]').hidden=false;
    $('[data-reader-title]').textContent=text(article.title,600);document.title=text(article.title,150)+' | FYNX Reader';
    $('[data-reader-copy]').disabled=false;
    $('[data-reader-share]').disabled=sharing;
    metadata(article);photograph(article);summary(article);points(article);context(article);rail(article);sources(article);related(article);syncBackLinks();updateStatus();
    if(!markedOpened)try{window.FYNXYourNews?.markOpened({...article,url:article.sourceUrl,edition:originalEdition,category:options.category,...(options.symbol?{symbol:options.symbol}:{})});markedOpened=!!window.FYNXYourNews;}catch{}
  }
  function fail(message) {
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
      const article=validate(await service.loadArticle({...options,force}));
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
    }catch(error){if(serial===request)fail(text(error?.message,400));}
    finally{if(serial===request){loading=false;button.disabled=false;button.textContent=pendingUpdate?'Read updated brief':'Check for updates ↻';}}
  }
  function schedule(){if(!timer)timer=window.setInterval(()=>{if(!document.hidden)refresh();},cadence);}
  function onReturn(){if(document.hidden)return;if(Date.now()-lastAttempt>=cadence)refresh();else updateStatus();}
  async function start() {
    syncBackLinks();
    if(!/^[a-f0-9]{64}$/.test(options.id)){fail('Open a story from the FYNX newsroom to see its source-backed brief. This address does not identify a verified story.');$('[data-reader-refresh]').disabled=true;return;}
    try {const saved=await window.FYNXNewsReaderData?.getCachedArticle(options);if(saved)render(validate(saved));}catch{}
    refresh();schedule();
  }
  $('[data-reader-refresh]').addEventListener('click',()=>{if(pendingUpdate){render(pendingUpdate);$('[data-reader-refresh]').textContent='Check for updates ↻';}else refresh(true);});
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
    try{const url=new URL(location.href);url.searchParams.set('edition',originalEdition);history.replaceState(history.state,'',url);}catch{}
  });
  document.addEventListener('visibilitychange',onReturn);
  window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;});
  window.addEventListener('pageshow',()=>{if(/^[a-f0-9]{64}$/.test(options.id)){schedule();onReturn();}});
  start();
  import('/assets/js/account-sync.js?v=20261113-world-ships-pro-2').then(api=>{
    shared=api;const saveButton=node('button','Save story');saveButton.type='button';$('[data-reader-share]').before(saveButton);
    let version=0;
    async function paint(){const request=++version;if(!current){saveButton.disabled=true;return;}saveButton.disabled=false;const id=await api.storyID(current.sourceUrl);if(request!==version)return;saveButton.textContent=api.accountData('readingRecords',id)?.saved?'Saved story':'Save story';saveButton.setAttribute('aria-pressed',String(!!api.accountData('readingRecords',id)?.saved));}
    saveButton.onclick=async()=>{if(!current)return;if(!api.sync.uid){location.href='/auth/login.html?returnTo='+encodeURIComponent(location.pathname+location.search);return;}saveButton.disabled=true;const article=current;try{const id=await api.storyID(article.sourceUrl),saved=!!api.accountData('readingRecords',id)?.saved;await api.save('readingRecords',id,{id,webArticleId:article.id,title:article.title,url:article.sourceUrl,source:article.source,publishedAt:article.publishedAt,readerUrl:new URL(storyURL()).pathname+new URL(storyURL()).search,saved:!saved});actionStatus(saved?'Removed from saved stories.':'Story saved to your account.');await paint();}catch(error){actionStatus(error.message);}finally{saveButton.disabled=false;}};
    api.subscribe(()=>{const settings=api.accountData('preferences')?.reader;if(settings){if(['standard','large','larger'].includes(settings.size))preferences.size=settings.size;if(typeof settings.focus==='boolean')preferences.focus=settings.focus;readingPreferences();}paint();});
    const observer=new MutationObserver(()=>paint());observer.observe($('[data-reader-share]'),{attributes:true,attributeFilter:['disabled']});paint();
  }).catch(()=>{});
})();
