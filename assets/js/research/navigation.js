import {routes} from './routes.js';

export const currentRoute=()=>routes.find(route=>route.url===location.pathname)||routes[0];
let shownURL=null;
export function updatePageIdentity(route) {
  if(shownURL===route.url)return;
  shownURL=route.url;
  const url='https://www.fynxfinanceworld.com'+route.url;
  document.title=route.title;
  document.body.dataset.researchPanel=route.panel;
  document.querySelector('.desk-heading h1').textContent=route.heading;
  document.querySelector('.desk-lead').textContent=route.lead;
  document.querySelector('link[rel=canonical]').href=url;
  for(const [selector,value] of [['meta[name=description]',route.description],['meta[property="og:title"]',route.title],['meta[property="og:description"]',route.description],['meta[property="og:url"]',url]])document.querySelector(selector)?.setAttribute('content',value);
  let guide=document.getElementById('research-tool-guide');
  if(!route.instructions)guide?.remove();
  else {
    if(!guide){guide=document.createElement('section');guide.id='research-tool-guide';guide.className='desk-sources tool-explainer';const heading=document.createElement('h2');heading.textContent='How to use this tool';guide.append(heading,document.createElement('p'));document.getElementById('sources').before(guide);}
    guide.querySelector('p').textContent=route.instructions;
  }
  // Keep the browser history entry, visible content and search identity aligned.
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
    const data=JSON.parse(script.textContent);
    if(data['@type']==='BreadcrumbList'){const last=data.itemListElement.at(-1);last.name=route.heading;last.item=url;}
    for(const entity of data['@graph']||[]){
      if(entity['@type']==='WebPage')Object.assign(entity,{'@id':url+'#webpage',url,name:route.title,description:route.description,mainEntity:{'@id':url+'#tool'}});
      if(entity['@type']==='WebApplication')Object.assign(entity,{'@id':url+'#tool',url,name:route.heading,description:route.description});
    }
    script.textContent=JSON.stringify(data);
  }
}
export function enableRouteNavigation(navigate) {
  addEventListener('popstate',navigate);
  document.getElementById('desk-nav').addEventListener('click',event=>{
    const link=event.target.closest('a');
    if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target==='_blank')return;
    const destination=new URL(link.href);
    if(destination.origin!==location.origin||!routes.some(route=>route.url===destination.pathname))return;
    event.preventDefault();
    if(location.pathname!==destination.pathname||location.hash)history.pushState(null,'',destination.pathname);
    navigate();
    const panel=document.getElementById('research-panel');panel.focus({preventScroll:true});
    if(panel.getBoundingClientRect().top<0)panel.scrollIntoView({block:'start'});
  });
}
