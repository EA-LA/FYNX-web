/* Public discovery remains useful without this enhancement or browser storage. */
(() => {
  'use strict';
  const savedKey='fynx.saved-resources.v1', recentKey='fynx.recent-resources.v1';
  const read=key=>{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(x=>typeof x==='string'&&/^\/(?:[a-z0-9-]+\/)*(?:[a-z0-9-]+\.html)?$/.test(x)).slice(0,100):[];}catch{return [];}};
  let saved=new Set(read(savedKey));
  let indexPromise;
  const index=()=>indexPromise ||= fetch('/assets/resource-index.json').then(r=>{if(!r.ok)throw Error('index');return r.json();}).then(rows=>Array.isArray(rows)?rows:[]).catch(()=>{indexPromise=null;return [];});
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
    const card=button.closest('.discovery-card');if(card)button.setAttribute('aria-label',`${active?'Remove saved':'Save'} ${card.querySelector('h2').textContent.replace('↗','').trim()}`);
  });}
  let filterLibrary=()=>{};
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-save-resource]');if(!button)return;
    const url=saveURL(button),rows=await index();
    if(!rows.some(row=>row.url===url)){announce('This resource cannot be saved right now. Please try again.');return;}
    const active=saved.has(url);if(active)saved.delete(url);else saved.add(url);
    const persisted=write(savedKey,[...saved]);updateSaves();filterLibrary();renderWorkspace();
    announce(persisted?(active?'Removed from saved resources.':'Saved. Find it in your workspace or the Saved filter.'):'Saved for this visit. Browser storage is unavailable.');
  });
  const library=document.querySelector('[data-discovery-library]');
  if(library){
    const input=document.getElementById('resource-query'), form=input.closest('form'), cards=[...library.querySelectorAll('.discovery-card')],buttons=[...library.querySelectorAll('[data-filter]')];
    const allowed=new Set(buttons.map(b=>b.dataset.filter));let selected='All';
    const normalize=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
    const synonyms={leverage:['margin'],sizing:['position'],lot:['forex','position'],cpi:['inflation','economic'],nfp:['jobs','economic'],etf:['funds'],pnl:['profit'],rr:['reward']};
    function restore(){const params=new URLSearchParams(location.search);input.value=params.get('q')||'';selected=allowed.has(params.get('category'))?params.get('category'):'All';}
    filterLibrary=()=>{
      const tokens=normalize(input.value.trim()).split(/\s+/).filter(Boolean);let count=0;
      const ranked=cards.map((card,i)=>{
        const text=normalize(card.dataset.search),title=normalize(card.querySelector('h2').textContent),match=tokens.every(t=>[t,...(synonyms[t]||[])].some(word=>text.includes(word)));
        const visible=match&&(selected==='All'||selected===card.dataset.category||(selected==='Saved'&&saved.has(card.dataset.resourceUrl)));
        card.hidden=!visible;if(visible)count++;
        return {card,i,score:tokens.reduce((n,t)=>n+(title.includes(t)?10:0),0)+(card.dataset.category==='Tools'&&tokens.length?1:0)};
      });
      const grid=library.querySelector('.discovery-grid');ranked.sort((a,b)=>b.score-a.score||a.i-b.i).forEach(row=>grid.append(row.card));
      document.getElementById('discovery-count').textContent=`${count} ${count===1?'resource':'resources'}${input.value.trim()?' found':''}`;
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
