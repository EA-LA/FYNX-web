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
  const desk=id=>preferences.topics.find(item=>item.id===id);
  const time=value=>new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  function current(item) {const date=Date.parse(item.publishedAt);return Number.isFinite(date)&&date<=Date.now()+300000&&Date.now()-date<=MAX_AGE;}
  function clean(items,category,edition) {
    return (Array.isArray(items)?items:[]).flatMap(item=>{
      if(!item||!current(item)||item.edition!==edition||typeof item.title!=='string'||!item.title.trim()||typeof item.source!=='string'||!item.source.trim()||! /^[a-f0-9]{64}$/.test(item.articleId||''))return [];
      const href=window.FYNXNewsReaderData?.href(item);if(!href?.startsWith('/news/article.html?id='))return [];
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
    const chosen=preferences.getTopics(),focused=document.activeElement?.closest('[data-your-topics] button')?.dataset.topic;
    $('[data-your-topics]').replaceChildren(...preferences.topics.map(topic=>{
      const button=node('button',topic.label);button.type='button';button.dataset.topic=topic.id;button.setAttribute('aria-pressed',String(chosen.includes(topic.id)));
      button.addEventListener('click',()=>{const next=preferences.getTopics();preferences.setTopics(next.includes(topic.id)?next.filter(id=>id!==topic.id):[...next,topic.id]);});return button;
    }));
    if(focused)$('[data-your-topics]').querySelector('[data-topic="'+focused+'"]')?.focus({preventScroll:true});
    $('[data-your-topic-count]').textContent=chosen.length+' followed';
    $('[data-your-storage]').textContent=preferences.isPersistent()?'Your topic choices and reading history stay in this browser.':'Browser storage is unavailable. Choices and history last for this page visit.';
    $('[data-your-edition]').textContent=editionLabel()+' edition';
    const selector=$('[data-your-topic-filter]'),before=selector.value;
    selector.replaceChildren(node('option','All followed topics'));selector.firstChild.value='all';
    for(const id of chosen){const option=node('option',desk(id).label);option.value=id;selector.append(option);}selector.value=chosen.includes(before)?before:'all';
  }
  function history() {
    const opened=preferences.getHistory(),host=$('[data-your-history]');
    $('[data-your-clear-history]').hidden=!opened.length;
    host.replaceChildren();
    if(!opened.length){host.append(node('p','Open a FYNX brief to build your reading history here.','your-news-empty-note'));return;}
    for(const item of opened.slice(0,6)){
      const entry=node('article',undefined,'your-news-history-item'),link=node('a',item.title);link.href=item.readerUrl;
      const label=node('p',item.source+' · Opened '+time(item.openedAt));
      if(!current(item))label.append(node('span','Past coverage','your-news-past'));
      entry.append(link,label);host.append(entry);
    }
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
    const chosen=preferences.getTopics(),failed=resultState.filter(item=>item.status==='unavailable').length,saved=resultState.some(item=>item.status==='cached'||(item.stale===true&&item.status!=='unavailable')),partial=resultState.some(item=>item.partial===true);
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
    if(!visible.length){$('[data-your-empty-title]').textContent=!preferences.getTopics().length?'Build a front page around your interests.':busy?'Checking your followed topics.':rows.length?'No reports match these filters.':'No current reports available for your topics.';
      $('[data-your-empty-copy]').textContent=rows.length?'Try a broader search or turn off Unread only.':'Choose topics above or try another edition. We keep older coverage out of your current feed.';}
    $('[data-your-results]').textContent=visible.length+' report'+(visible.length===1?'':'s');
    const more=$('[data-your-more]');more.hidden=visible.length<=displayLimit;more.textContent='Show '+Math.min(18,visible.length-displayLimit)+' more reports';
    status();history();
    window.FYNXNewsReaderData?.prefetch(visible.slice(0,4));
  }
  function schedule() {clearTimeout(timer);timer=null;if(!document.hidden)timer=setTimeout(()=>refresh(false),Math.max(1000,CADENCE-(Date.now()-lastAttempt)));}
  async function refresh(force=false) {
    const run=++generation,edition=selectedEdition(),chosen=preferences.getTopics(),scope=edition+'|'+chosen.slice().sort().join(','),preserve=scope===activeScope&&rows.some(current),nextRows=[],nextState=[];
    for(const work of queue.splice(0))work.resolve(null);
    lastAttempt=Date.now();busy=true;activeScope=scope;
    if(!preserve){displayLimit=18;rows=[];resultState=[];}
    topicControls();render();$('[data-your-stories]').setAttribute('aria-busy','true');
    if(!chosen.length){busy=false;$('[data-your-stories]').setAttribute('aria-busy','false');render();schedule();return;}
    await Promise.all(chosen.map(async(category,index)=>{
      const result=await load(category,edition,force,run);if(run!==generation||edition!==selectedEdition()||!result)return;
      nextState[index]=result;
      const incoming=clean(result.items,category,edition),existing=new Map(nextRows.map(item=>[item.articleId,item]));
      for(const item of incoming){const previous=existing.get(item.articleId);if(previous){if(!previous.desks.includes(category))previous.desks.push(category);}else{nextRows.push(item);existing.set(item.articleId,item);}}
      nextRows.sort((a,b)=>(a.rank||1000)-(b.rank||1000)||(b.priorityScore||0)-(a.priorityScore||0)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
      // Keep the current, still-fresh edition in place during a periodic check.
      // A changed edition/topic starts empty so old preferences never leak through.
      if(!preserve){rows=nextRows.slice();resultState=nextState.slice();render();}
    }));
    if(run!==generation)return;
    rows=nextRows;resultState=nextState;busy=false;$('[data-your-stories]').setAttribute('aria-busy','false');render();schedule();
  }
  $('[data-your-filter-form]').addEventListener('submit',event=>event.preventDefault());
  for(const selector of ['[data-your-search]','[data-your-topic-filter]','[data-your-sort]','[data-your-unread]'])$(selector).addEventListener(selector==='[data-your-search]'?'input':'change',()=>{displayLimit=18;render();});
  $('[data-your-refresh]').addEventListener('click',()=>refresh(true));
  $('[data-your-more]').addEventListener('click',()=>{displayLimit+=18;render();});
  $('[data-your-reset-filters]').addEventListener('click',()=>{$('[data-your-search]').value='';$('[data-your-topic-filter]').value='all';$('[data-your-unread]').checked=false;render();});
  $('[data-your-clear-history]').addEventListener('click',()=>{preferences.clearHistory();});
  document.addEventListener('fynx:news-preferences-change',()=>refresh(false));
  document.addEventListener('fynx:edition-change',()=>refresh(false));
  document.addEventListener('fynx:news-history-change',render);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else if(Date.now()-lastAttempt>=CADENCE)refresh(false);else{render();schedule();}});
  window.addEventListener('pagehide',()=>{clearTimeout(timer);timer=null;});
  window.addEventListener('pageshow',event=>{if(event.persisted){if(Date.now()-lastAttempt>=CADENCE)refresh(false);else{render();schedule();}}});
  if(window.FYNXMarketIntelligenceData)refresh(false);else{$('[data-your-status-title]').textContent='News service unavailable';$('[data-your-status]').textContent='Reload to try again. Your topic choices remain saved.';}
})();
