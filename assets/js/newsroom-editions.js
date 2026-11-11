/* An explicit reading preference. No IP lookup or location tracking. */
(function(root){
  'use strict';
  const editions=Object.freeze([
    ['global','Global'],['us','US'],['uk','UK'],['canada','Canada'],['europe','Europe'],['asia','Asia'],['india','India'],['middle-east','Middle East'],['africa','Africa'],['latin-america','Latin America'],['japan','Japan'],['australia','Australia']
  ].map(([id,label])=>Object.freeze({id,label})));
  const sections=Object.freeze([
    ['markets','Markets','stocks'],['finance','Finance','finance'],['economics','Economics','economics'],['technology','Technology','technology'],['politics','Politics & Policy','politics'],['industries','Industries','industries'],['energy','Energy','energy'],['world','World','world']
  ].map(([id,label,category])=>Object.freeze({id,label,category,href:'/news/'+id+'.html'})));
  const valid=value=>editions.some(x=>x.id===value), key='fynx_news_edition_v1';
  let current='us';
  let requested;
  try {requested=new URL(root.location.href).searchParams.get('edition');}catch{}
  if(valid(requested))current=requested;
  else try {const saved=root.localStorage.getItem(key);if(valid(saved))current=saved;}catch{}
  function sync(){
    document.documentElement.dataset.newsEdition=current;
    document.querySelectorAll('[data-edition-select]').forEach(select=>{select.value=current;});
    document.querySelectorAll('[data-edition-label]').forEach(el=>{el.textContent=editions.find(x=>x.id===current).label+' edition';});
  }
  function set(next,persist=true){
    if(!valid(next))return false;
    const previous=current;current=next;
    if(persist)try{root.localStorage.setItem(key,current);}catch{}
    // Keep a shared URL's edition truthful when the reader selects another one.
    try{const url=new URL(root.location.href);if(url.searchParams.has('edition')){url.searchParams.set('edition',current);root.history.replaceState(root.history.state,'',url);}}catch{}
    sync();
    if(previous!==current)document.dispatchEvent(new CustomEvent('fynx:edition-change',{bubbles:true,detail:{edition:current,previous}}));
    return true;
  }
  root.FynxEdition=Object.freeze({get:()=>current,set,editions,sections});
  document.addEventListener('change',event=>{if(event.target.matches('[data-edition-select]'))set(event.target.value);});
  root.addEventListener('storage',event=>{if(event.key===key&&valid(event.newValue))set(event.newValue,false);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})(window);
