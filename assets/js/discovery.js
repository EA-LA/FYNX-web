/* Public discovery remains useful without this enhancement or browser storage. */
(() => {
  'use strict';
  const savedKey='fynx.saved-resources.v1', recentKey='fynx.recent-resources.v1';
  const read=key=>{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(x=>typeof x==='string'&&/^\/(?:[a-z0-9-]+\/)*(?:[a-z0-9-]+\.html)?$/.test(x)).map(url=>url==='/tools/options-payoff.html'?'/tools/debt-payoff.html':url).slice(0,100):[];}catch{return [];}};
  let saved=new Set(read(savedKey));
  let indexPromise;
  // Bounded resource-index loading: a stalled network must not leave Save buttons disabled forever.
  // Keep one shared request for quick taps and allow retry when the request fails or times out.
  const index=()=>indexPromise ||= (()=>{
    const controller=typeof AbortController==='function'?new AbortController():null;
    let timeoutId;
    const request=fetch('/assets/resource-index.json',controller?{signal:controller.signal}:undefined)
      .then(r=>{if(!r.ok)throw Error('index');return r.json();})
      // A transient 200 response with an empty, truncated or malformed index
      // must not be mistaken for a valid resource library and cached forever.
      .then(rows=>{
        const safePath=/^\\/(?:[a-z0-9-]+\\/)*(?:[a-z0-9-]+\\.html)?$/;
        if(!Array.isArray(rows)||!rows.length||rows.some(row=>!row||typeof row.url!=='string'||!safePath.test(row.url))) {
          throw new Error('Resource index unavailable');
        }
        return rows;
      });
    const timeout=new Promise((_,reject)=>{
      timeoutId=setTimeout(()=>{
        controller?.abort();
        reject(new Error('Resource index timed out'));
      },8000);
    });
    return Promise.race([request,timeout])
      .catch(()=>{indexPromise=null;return [];})
      .finally(()=>clearTimeout(timeoutId));
  })();
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
  let notice;
  function announce(message){
    let el=document.querySelector('.discovery-toast');
    if(!el){el=document.createElement('div');el.className='discovery-toast';el.setAttribute('role','status');document.body.append(el);}
    el.hidden=false;el.textContent=message;clearTimeout(notice);notice=setTimeout(()=>{el.hidden=true;},3500);
  }
  const canonicalPath=(()=>{try{return new URL(document.querySelector('link[rel=canonical]')?.href||location.href).pathname;}catch{return location.pathname;}})();
  const saveURL=button=>button.dataset.saveResource||canonicalPath;
  function updateSaves(){document.querySelectorAll('[data-save-resource]').forEach(button=>{
    const active=saved.has(saveURL(button));button.setAttribute('aria-pressed',String(active));
    button.textContent=button.closest('.discovery-card')?(active?'✓':'＋'):(active?'Saved':'Save resource');
    const card=button.closest('.discovery-card');if(card)button.setAttribute('aria-label',`${active?'Remove saved':'Save'} ${card.querySelector('h2').textContent.replace('↗︎','').trim()}`);
  });}
  let filterLibrary=()=>{};
  // A slow first index request must not turn two quick taps into a save + unsave.
  const pendingSaves=new Set();
  function setSavePending(url,pending){
    document.querySelectorAll('[data-save-resource]').forEach(button=>{
      if(saveURL(button)!==url)return;
      button.disabled=pending;
      if(pending)button.setAttribute('aria-busy','true');
      else button.removeAttribute('aria-busy');
    });
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-save-resource]');if(!button)return;
    const url=saveURL(button);
    if(pendingSaves.has(url))return;
    pendingSaves.add(url);setSavePending(url,true);
    try{
      const rows=await index();
      if(!rows.some(row=>row.url===url)){announce('This resource cannot be saved right now. Please try again.');return;}
      const active=saved.has(url);if(active)saved.delete(url);else saved.add(url);
      const persisted=write(savedKey,[...saved]);updateSaves();filterLibrary();renderWorkspace();
      announce(persisted?(active?'Removed from saved resources.':'Saved. Find it in your workspace or the Saved filter.'):'Saved for this visit. Browser storage is unavailable.');
    }finally{
      pendingSaves.delete(url);setSavePending(url,false);
    }
  });
  const library=document.querySelector('[data-discovery-library]');
  if(library){
    const input=document.getElementById('resource-query'), form=input.closest('form'), cards=[...library.querySelectorAll('.discovery-card')],buttons=[...library.querySelectorAll('[data-filter]')];
    const allowed=new Set(buttons.map(b=>b.dataset.filter));let selected='All';
    const normalize=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
    const synonyms={leverage:['margin'],sizing:['position'],lot:['forex','position'],cpi:['inflation','economic'],nfp:['jobs','economic'],etf:['funds'],pnl:['profit'],rr:['reward'],tp:['target'],takeprofit:['target']};
    function restore(){const params=new URLSearchParams(location.search);input.value=params.get('q')||'';selected=allowed.has(params.get('category'))?params.get('category'):'All';}
    // Short tokens (rsi, atr, pip) must start a word, so "rsi" no longer matches "conversion".
    const wordsOf=s=>s.split(/[^a-z0-9]+/).filter(Boolean);
    const info=cards.map(card=>{const text=normalize(card.dataset.search||''),title=normalize(card.querySelector('h2').textContent);return {text,title,words:wordsOf(text+' '+title),joined:wordsOf(text).join(' ')+' '+wordsOf(title).join(' ')};});
    // Joined spellings ("breakeven", "stoploss", "positionsize") also match "break-even", "stop loss", "position size".
    const joinedHit=(t,row)=>t.length>=6&&/^[a-z0-9]+$/.test(t)&&new RegExp('(^| )'+t.split('').join(' ?')).test(row.joined);
    const hit=(t,row)=>t.length<=3&&/^[a-z0-9]+$/.test(t)?row.words.some(w=>w.startsWith(t)):(row.text.includes(t)||row.title.includes(t)||joinedHit(t,row));
    const vocab=new Map(),pairs=new Map();info.forEach(row=>{new Set(row.words).forEach(w=>{if(w.length>=3&&!/^\d+$/.test(w))vocab.set(w,(vocab.get(w)||0)+1);});row.words.forEach((w,k)=>{const n=row.words[k+1];if(n&&w.length>=3&&n.length>=3&&!/\d/.test(w+n))pairs.set(w+n,(pairs.get(w+n)||0)+1);});});
    // Bigger typos are only corrected to topic words (seen in a resource title) that are not too generic, so "taxes" no longer becomes "takes" and "trailing" no longer becomes "trading".
    const topics=new Set();info.forEach(row=>{const w=wordsOf(row.title);w.forEach((x,k)=>{topics.add(x);if(w[k+1])topics.add(x+w[k+1]);});});
    // "Generic" is judged on the core library only: the growing set of dated Intelligence stories must not make "trading" look rare.
    const coreRows=info.filter((row,i)=>!/^\/intelligence\//.test(cards[i].dataset.resourceUrl||'')),coreCount=new Map();
    coreRows.forEach(row=>new Set(row.words).forEach(w=>coreCount.set(w,(coreCount.get(w)||0)+1)));
    const generic=coreRows.length*0.2,isGeneric=w=>(coreCount.get(w)||0)>generic;
    // Optimal string alignment distance: one typo, missing letter or swapped pair counts as 1.
    function distance(a,b,max){
      if(Math.abs(a.length-b.length)>max)return max+1;
      let prev2=null,prev=Array.from({length:b.length+1},(_,j)=>j);
      for(let i=1;i<=a.length;i++){
        const cur=[i];let best=i;
        for(let j=1;j<=b.length;j++){
          let v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
          if(prev2&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,prev2[j-2]+1);
          cur[j]=v;if(v<best)best=v;
        }
        if(best>max)return max+1;
        prev2=prev;prev=cur;
      }
      return prev[b.length];
    }
    function correct(t){
      if(t.length<4||synonyms[t]||[...vocab.keys()].some(w=>w.startsWith(t)))return t;
      const max=t.length<=5?1:2;let best=t,bestD=max+1,bestN=0;
      const consider=(n,w,cap=max)=>{const topic=topics.has(w),common=isGeneric(w);if(common||!topic)cap=Math.min(cap,1);if(!topic&&w.length===t.length)return;const d=Math.min(distance(t,w,max),w.length>t.length?distance(t,w.slice(0,t.length),max)+0.5:max+1);const rank=d+(topic&&!common?0:0.25);if(d<=cap&&(rank<bestD||(rank===bestD&&n>bestN))){best=w;bestD=rank;bestN=n;}};
      vocab.forEach((n,w)=>consider(n,w));if(t.length>=6)pairs.forEach((n,w)=>{if(!vocab.has(w))consider(n,w,1);});
      return best;
    }
    const matches=(tokens,i)=>tokens.every(t=>[t,...(synonyms[t]||[])].some(word=>hit(word,info[i])));
    const inView=card=>selected==='All'||selected===card.dataset.category||(selected==='Saved'&&saved.has(card.dataset.resourceUrl));
    filterLibrary=()=>{
      const query=input.value.trim();let tokens=normalize(query).replace(/\btake[\s-]+profits?\b/g,'takeprofit').split(/\s+/).filter(Boolean),fixed=null;
      const countFor=list=>cards.reduce((n,card,i)=>n+(matches(list,i)&&inView(card)?1:0),0);
      if(tokens.length&&!countFor(tokens)){const alt=tokens.map(correct);if(alt.join(' ')!==tokens.join(' ')&&countFor(alt)){fixed=alt.join(' ');tokens=alt;}}
      let count=0;
      const ranked=cards.map((card,i)=>{
        const visible=matches(tokens,i)&&inView(card);
        card.hidden=!visible;if(visible)count++;
        const row=info[i],titleWords=wordsOf(row.title);
        return {card,i,score:tokens.reduce((n,t)=>n+(titleWords.some(w=>w.startsWith(t))?10:row.title.includes(t)||(t.length>=6&&titleWords.join('').includes(t))?6:0),0)+(card.dataset.category==='Tools'&&tokens.length?1:0)};
      });
      const grid=library.querySelector('.discovery-grid');ranked.sort((a,b)=>b.score-a.score||a.i-b.i).forEach(row=>grid.append(row.card));
      const label=`${count} ${count===1?'resource':'resources'}`;
      const countEl=document.getElementById('discovery-count');countEl.style.whiteSpace=fixed?'normal':'';countEl.style.flexBasis=fixed?'100%':'';countEl.textContent=fixed?`No exact match for \u201c${query}\u201d. Showing ${label} for \u201c${fixed}\u201d.`:`${label}${query?' found':''}`;
      document.getElementById('discovery-empty').hidden=count!==0;
      buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===selected)));
    };
    function urlUpdate(){const url=new URL(location.href);input.value.trim()?url.searchParams.set('q',input.value.trim()):url.searchParams.delete('q');selected==='All'?url.searchParams.delete('category'):url.searchParams.set('category',selected);try{history.replaceState(null,'',url);}catch{}filterLibrary();}
    input.addEventListener('input',urlUpdate);form.addEventListener('submit',e=>{e.preventDefault();urlUpdate();library.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
    buttons.forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.filter;urlUpdate();}));
    document.querySelector('[data-discovery-reset]')?.addEventListener('click',()=>{selected='All';input.value='';urlUpdate();input.focus();});
    window.addEventListener('popstate',()=>{restore();filterLibrary();});restore();filterLibrary();
  }
  async function renderWorkspace(){
    const host=document.querySelector('[data-workspace-saved]');if(!host)return;
    const rows=await index();const byURL=new Map(rows.map(r=>[r.url,r]));
    const render=(node,urls,empty)=>{if(!node)return;node.replaceChildren();const valid=urls.map(url=>byURL.get(url)).filter(Boolean).slice(0,6);if(!valid.length){const p=document.createElement('p');p.textContent=empty;node.append(p);return;}valid.forEach(r=>{const a=document.createElement('a');a.href=r.url;a.textContent=r.title;node.append(a);});};
    render(host,[...saved],'Save tools and lessons from the resource library to keep them here.');
    render(document.querySelector('[data-workspace-recent]'),read(recentKey),'Your recently opened resources will appear here.');
  }
  // Store resource paths only. Never record account pages, queries, inputs or trade data.
  const pathname=location.pathname;
  if(/^\/(tools|learn\/lessons|markets)\//.test(pathname))index().then(rows=>{if(rows.some(r=>r.url===pathname))write(recentKey,[pathname,...read(recentKey).filter(x=>x!==pathname)].slice(0,8));});
  window.addEventListener('storage',event=>{if(event.key===savedKey){saved=new Set(read(savedKey));updateSaves();filterLibrary();renderWorkspace();}});
  updateSaves();renderWorkspace();
})();
