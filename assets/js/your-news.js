/* A personal front page built from existing verified, edition-aware feeds. */
(function () {
  'use strict';
  const app=document.querySelector('[data-your-news]'), preferences=window.FYNXYourNews;
  if(!app||!preferences||app.dataset.ready)return;
  app.dataset.ready='true';
  const $=selector=>app.querySelector(selector), CADENCE=300000, MAX_AGE=86400000;
  let generation=0, rows=[], resultState=[], lastAttempt=0, timer=null, displayLimit=18, busy=false, activeScope='';
  const queue=[];let active=0;
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  const selectedEdition=()=>window.FynxEdition?.get()||'us';
  const editionLabel=()=>window.FynxEdition?.editions?.find(item=>item.id===selectedEdition())?.label||selectedEdition();
  const desk=id=>preferences.topics.find(item=>item.id===id)||preferences.regions?.find(r=>'region:'+r.id===id)||preferences.companies?.find(c=>'company:'+c.id===id);
  const time=value=>new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  function current(item) {const date=Date.parse(item.publishedAt);return Number.isFinite(date)&&date<=Date.now()+300000&&Date.now()-date<=MAX_AGE;}
  // The newsroom resolver may point a verified report to a published FYNX Intelligence page.
  // Only keep known internal brief routes; never render a feed-supplied external destination.
  function safeBriefHref(href, articleId) {
    if (typeof href !== 'string' || href.length > 1024 || !href.startsWith('/') || href.startsWith('//')) return false;
    if (/^\/intelligence\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(href)) return true;
    if (!href.startsWith('/news/article.html?id=')) return false;
    try {
      const url = new URL(href, window.location.origin);
      const keys = ['id', 'edition', 'category', 'symbol'];
      return url.origin === window.location.origin &&
        url.pathname === '/news/article.html' && !url.hash &&
        url.searchParams.get('id') === articleId &&
        keys.every(key => url.searchParams.getAll(key).length <= 1) &&
        [...url.searchParams.keys()].every(key => keys.includes(key));
    } catch { return false; }
  }
  function clean(items,category,edition) {
    return (Array.isArray(items)?items:[]).flatMap(item=>{
      if(!item||!current(item)||item.edition!==edition||typeof item.title!=='string'||!item.title.trim()||typeof item.source!=='string'||!item.source.trim()||! /^[a-f0-9]{64}$/.test(item.articleId||''))return [];
      const href=window.FYNXNewsReaderData?.href(item);if(!safeBriefHref(href,item.articleId))return [];
      return [{...item,readerUrl:href,desk:category,desks:[category]}];
    });
  }
  function pump() {
    while(active<3&&queue.length){const work=queue.shift();if(work.generation!==generation){work.resolve(null);continue;}active++;
      Promise.resolve().then(()=>window.FYNXMarketIntelligenceData.loadHeadlines(work.category,{edition:work.edition,force:work.force}))
        .then(result=>result&&Array.isArray(result.items)&&['fresh','cached','unavailable'].includes(result.status)?result:{items:[],status:'unavailable',stale:true})
        .catch(()=>({items:[],status:'unavailable',stale:true})).then(work.resolve).finally(()=>{active--;pump();});
    }
  }
  function load(category,edition,force,run){return new Promise(resolve=>{queue.push({category,edition,force,generation:run,resolve});pump();});}
  function topicControls() {
    const chosen=preferences.getTopics(),focused=document.activeElement?.closest('[data-topic]')?.dataset.topic;
    const makeTopic=topic=>{
      const button=node('button',topic.label);button.type='button';button.dataset.topic=topic.id;button.setAttribute('aria-pressed',String(chosen.includes(topic.id)));
      button.addEventListener('click',()=>{const next=preferences.getTopics();preferences.setTopics(next.includes(topic.id)?next.filter(id=>id!==topic.id):[...next,topic.id]);});return button;
    };
    const primary=preferences.topics.filter(t=>t.broad),extra=preferences.topics.filter(t=>!t.broad);
    $('[data-your-topics]').replaceChildren(...primary.map(makeTopic));
    let details=$('[data-your-more-interests]');if(!details){details=node('details');details.dataset.yourMoreInterests='';details.append(node('summary','More topics, regions and companies'));$('[data-your-topics]').after(details);}
    const wasOpen=details.open;details.replaceChildren(node('summary','More topics, regions and companies'));const more=node('div',undefined,'your-news-topic-buttons');more.append(...extra.map(makeTopic));details.append(node('h3','Topics'),more);
    for(const [label,items,get,set] of [['Regions',preferences.regions,preferences.getRegions,preferences.setRegions],['Companies and instruments',preferences.companies,preferences.getCompanies,preferences.setCompanies]]){const group=node('div',undefined,'your-news-topic-buttons');for(const item of items||[]){const b=node('button',item.label);b.type='button';b.setAttribute('aria-pressed',String(get().includes(item.id)));b.onclick=()=>{const selected=get();set(selected.includes(item.id)?selected.filter(id=>id!==item.id):[...selected,item.id]);};group.append(b);}details.append(node('h3',label),group);}details.open=wasOpen;
    if(focused)app.querySelector('[data-topic="'+focused+'"]')?.focus({preventScroll:true});
    $('[data-your-topic-count]').textContent=chosen.length+' followed';
    const sync=window.FynxAccountSync?.sync;$('[data-your-storage]').textContent=sync?.uid?(sync.status==='synced'?'Your topics and reading history are shared with your iPhone.':sync.error||'Your account is syncing…'):preferences.isPersistent()?'Guest topic choices and reading history stay in this browser. Sign in to share them with your iPhone.':'Browser storage is unavailable. Choices and history last for this page visit.';
    $('[data-your-edition]').textContent=editionLabel()+' edition';
    const selector=$('[data-your-topic-filter]'),before=selector.value;
    selector.replaceChildren(node('option','All followed topics'));selector.firstChild.value='all';
    for(const id of chosen){const option=node('option',desk(id).label);option.value=id;selector.append(option);}selector.value=chosen.includes(before)?before:'all';
  }
  function history() {
    const opened=preferences.getHistory(),host=$('[data-your-history]');
    $('[data-your-clear-history]').hidden=!opened.length;
    host.replaceChildren();
    if(!opened.length)host.append(node('p','Open a story on the web or iPhone to build your reading history here.','your-news-empty-note'));
    for(const item of opened.slice(0,6)){
      const entry=node('article',undefined,'your-news-history-item'),link=node('a',item.title);link.href=item.readerUrl;if(!item.readerUrl.startsWith('/')){link.target='_blank';link.rel='noopener noreferrer';}
      const label=node('p',item.source+' · Opened '+time(item.openedAt));
      if(!current(item))label.append(node('span','Past coverage','your-news-past'));
      entry.append(link,label);host.append(entry);
    }
    const savedHost=$('[data-your-saved]');if(savedHost){savedHost.replaceChildren();const saved=preferences.getSaved?.()||[];if(!saved.length)savedHost.append(node('p','Stories saved on the web or iPhone appear here.'));for(const item of saved.slice(0,12)){const entry=node('article',undefined,'your-news-history-item'),link=node('a',item.title);link.href=item.readerUrl;if(!item.readerUrl.startsWith('/')){link.target='_blank';link.rel='noopener noreferrer';}entry.append(link,node('p',item.source));savedHost.append(entry);}}
  }
  function story(item,index) {
    const article=node('article',undefined,'your-news-story'+(index===0?' your-news-story-lead':''));
    const meta=node('div',undefined,'your-news-story-meta');meta.append(node('span',item.desks.map(id=>desk(id)?.label).filter(Boolean).join(' / ')||'Reporting'),node('span',item.source));
    const published=node('time',time(item.publishedAt));published.dateTime=item.publishedAt;meta.append(published);
    if(preferences.isRead(item))meta.append(node('span','Opened','your-news-read-label'));
    const heading=node(index===0?'h2':'h3'),link=node('a',item.title);link.href=item.readerUrl;heading.append(link);
    if(index===0){
      const context=desk(item.desk)?.href.split('/').pop().replace('.html','')||'world';
      const region=selectedEdition();
      const figure=window.FYNXNewsroomMedia?.createFigure(region!=='us'&&['politics','economics','energy','markets'].includes(context)?'world':context,{story:item});
      if(figure)article.append(figure);
    }
    article.append(meta,heading);
    const summary=item.reader?.summary;
    if(typeof summary==='string'&&summary.trim()&&item.reader.coverageLevel!=='headline-only')article.append(node('p',summary.slice(0,500),'your-news-summary'));
    else article.append(node('p','Open the FYNX brief for available reporting, context and the original source.','your-news-summary'));
    const more=node('a','Read brief →','your-news-read');more.href=item.readerUrl;article.append(more);return article;
  }
  function status() {
    const chosen=preferences.coveragePlan(),failed=resultState.filter(item=>item.status==='unavailable').length,saved=resultState.some(item=>item.status==='cached'||(item.stale===true&&item.status!=='unavailable')),partial=resultState.some(item=>item.partial===true);
    const state=!chosen.length?'Choose your topics':busy?'Checking sources':failed===chosen.length?'Sources unavailable':failed||saved||partial?'Partly refreshed':'Coverage updated';
    $('[data-your-status-title]').textContent=state;
    const checked=resultState.map(item=>Date.parse(item.fetchedAt)).filter(Number.isFinite),oldest=checked.length?Math.min(...checked):null;
    $('[data-your-status]').textContent=!chosen.length?'Follow one or more topics to create your front page.':[
      editionLabel()+' edition','Past 24 hours',oldest?'Oldest desk check '+time(oldest):'Checking source availability','Refreshes every 5 minutes while visible',failed?failed+' topic feed'+(failed===1?' is':'s are')+' temporarily unavailable':partial?'Some sources are temporarily unavailable':'',saved?'Some reports are from dated saved coverage':''
    ].filter(Boolean).join(' · ');
  }
  function render() {
    rows=rows.filter(current);
    const query=$('[data-your-search]').value.trim().toLocaleLowerCase(),topic=$('[data-your-topic-filter]').value,onlyUnread=$('[data-your-unread]').checked;
    let visible=rows.filter(item=>(topic==='all'||item.desks.includes(topic))&&(!query||(item.title+' '+item.source+' '+(item.reader?.summary||'')).toLocaleLowerCase().includes(query))&&(!onlyUnread||!preferences.isRead(item)));
    if($('[data-your-sort]').value==='latest')visible.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
    const stories=$('[data-your-stories]');stories.replaceChildren(...visible.slice(0,displayLimit).map(story));
    const empty=$('[data-your-empty]');empty.hidden=visible.length>0;
    if(!visible.length){$('[data-your-empty-title]').textContent=!preferences.coveragePlan().length?'Build a front page around your interests.':busy?'Checking your followed topics.':rows.length?'No reports match these filters.':'No current reports available for your topics.';
      $('[data-your-empty-copy]').textContent=rows.length?'Try a broader search or turn off Unread only.':'Choose topics above or try another edition. We keep older coverage out of your current feed.';}
    $('[data-your-results]').textContent=visible.length+' report'+(visible.length===1?'':'s');
    const more=$('[data-your-more]');more.hidden=visible.length<=displayLimit;more.textContent='Show '+Math.min(18,visible.length-displayLimit)+' more reports';
    status();history();
    window.FYNXNewsReaderData?.prefetch(visible.slice(0,4));
  }
  function schedule() {clearTimeout(timer);timer=null;if(!document.hidden)timer=setTimeout(()=>refresh(false),Math.max(1000,CADENCE-(Date.now()-lastAttempt)));}
  async function refresh(force=false) {
    const run=++generation,edition=selectedEdition(),chosen=preferences.coveragePlan(),scope=edition+'|'+JSON.stringify(chosen)+'|'+preferences.getTopics().join(',')+'|'+preferences.getCompanies().join(',')+'|'+preferences.getRegions().join(','),preserve=scope===activeScope&&rows.some(current),nextRows=[],nextState=[];
    for(const work of queue.splice(0))work.resolve(null);
    lastAttempt=Date.now();busy=true;activeScope=scope;
    if(!preserve){displayLimit=18;rows=[];resultState=[];}
    topicControls();render();$('[data-your-stories]').setAttribute('aria-busy','true');
    if(!chosen.length){busy=false;$('[data-your-stories]').setAttribute('aria-busy','false');render();schedule();return;}
    await Promise.all(chosen.map(async(plan,index)=>{
      const category=plan.category,feedEdition=plan.edition||edition;
      const result=await load(category,feedEdition,force,run);if(run!==generation||edition!==selectedEdition()||!result)return;
      nextState[index]=result;
      const incoming=clean(result.items,category,feedEdition).map(item=>({...item,desks:preferences.reasons(item)})).filter(item=>item.desks.length),existing=new Map(nextRows.map(item=>[item.articleId,item]));
      for(const item of incoming){const previous=existing.get(item.articleId);if(previous){for(const reason of item.desks)if(!previous.desks.includes(reason))previous.desks.push(reason);}else{nextRows.push(item);existing.set(item.articleId,item);}}
      nextRows.sort((a,b)=>(a.rank||1000)-(b.rank||1000)||(b.priorityScore||0)-(a.priorityScore||0)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
      // Keep the current, still-fresh edition in place during a periodic check.
      // A changed edition/topic starts empty so old preferences never leak through.
      if(!preserve){rows=nextRows.slice();resultState=nextState.slice();render();}
    }));
    if(run!==generation)return;
    rows=nextRows;resultState=nextState;busy=false;$('[data-your-stories]').setAttribute('aria-busy','false');render();schedule();
  }
  function setupTopicTransfer() {
    const section=app.querySelector('.your-news-topics');
    if(!section)return;
    const group=node('div',undefined,'your-news-transfer');
    const actions=node('div',undefined,'your-news-transfer-actions');
    const save=node('button','Download topics'),restore=node('button','Restore topics');
    save.type=restore.type='button';
    const file=node('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
    file.setAttribute('aria-label','Select a FYNX topic backup JSON file');
    const note=node('p','Move your followed topics to another browser or iPhone. Files contain only topic choices, never reading history or account details. Restoring replaces your followed topics, not your reading history.','your-news-transfer-note');
    const feedback=node('p',undefined,'your-news-transfer-status');
    feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    actions.append(save,restore,file);group.append(actions,note,feedback);section.append(group);
    save.addEventListener('click',()=>{
      let href;
      try {
        href=URL.createObjectURL(new Blob([preferences.exportTopicBackup()],{type:'application/json'}));
        const link=node('a');link.href=href;link.download='fynx-your-news-topics.json';
        document.body.append(link);link.click();link.remove();
        feedback.textContent='Topic backup prepared. Keep the downloaded file somewhere private.';
      } catch {
        feedback.textContent='Could not download a backup in this browser.';
      } finally {
        if(href)window.setTimeout(()=>URL.revokeObjectURL(href),3000);
      }
    });
    restore.addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{
      const chosen=file.files?.[0];file.value='';
      if(!chosen)return;
      if(chosen.size<1||chosen.size>4096){feedback.textContent='Choose a FYNX topic backup smaller than 4 KB.';return;}
      restore.disabled=true;feedback.textContent='Checking the selected topic backup…';
      try {
        const result=preferences.importTopicBackup(await chosen.text());
        feedback.textContent=!result.ok?result.error:result.saved?
          'Restored '+result.count+' followed topic'+(result.count===1?'':'s')+' in this browser.':
          'Topics restored for this visit, but browser storage is unavailable.';
      } catch {feedback.textContent='Could not read the selected file. Your topics were not changed.';}
      finally {restore.disabled=false;}
    });
  }
  setupTopicTransfer();
  $('[data-your-filter-form]').addEventListener('submit',event=>event.preventDefault());
  for(const selector of ['[data-your-search]','[data-your-topic-filter]','[data-your-sort]','[data-your-unread]'])$(selector).addEventListener(selector==='[data-your-search]'?'input':'change',()=>{displayLimit=18;render();});
  $('[data-your-refresh]').addEventListener('click',()=>refresh(true));
  $('[data-your-more]').addEventListener('click',()=>{displayLimit+=18;render();});
  $('[data-your-reset-filters]').addEventListener('click',()=>{$('[data-your-search]').value='';$('[data-your-topic-filter]').value='all';$('[data-your-unread]').checked=false;render();});
  $('[data-your-clear-history]').addEventListener('click',()=>{preferences.clearHistory();});
  let lastInterests='';document.addEventListener('fynx:news-preferences-change',()=>{const current=JSON.stringify([preferences.getTopics(),preferences.getRegions(),preferences.getCompanies(),preferences.getNewsSymbols(),preferences.coveragePlan()]);if(current!==lastInterests){lastInterests=current;refresh(false);}else{topicControls();history();}});
  document.addEventListener('fynx:edition-change',()=>refresh(false));
  document.addEventListener('fynx:news-history-change',render);
  document.addEventListener('fynx:news-sync-error',event=>{$('[data-your-storage]').textContent=event.detail;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else if(Date.now()-lastAttempt>=CADENCE)refresh(false);else{render();schedule();}});
  window.addEventListener('pagehide',()=>{clearTimeout(timer);timer=null;});
  window.addEventListener('pageshow',event=>{if(event.persisted){if(Date.now()-lastAttempt>=CADENCE)refresh(false);else{render();schedule();}}});
  if(window.FYNXMarketIntelligenceData)refresh(false);else{$('[data-your-status-title]').textContent='News service unavailable';$('[data-your-status]').textContent='Reload to try again. Your topic choices remain saved.';}
})();
