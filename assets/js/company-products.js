/* One accessible product directory, independent of page/account logic. */
(function () {
 'use strict';
 function element(tag, cls, text) {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
 function setupFilter(scope) {
  const search=scope.querySelector('[data-company-products-search]');if(!search)return;
  const items=Array.from(scope.querySelectorAll('[data-product-item]'));
  const groups=Array.from(scope.querySelectorAll('[data-product-group]'));
  const columns=Array.from(scope.querySelectorAll('.fp-menu-column'));
  const count=scope.querySelector('[data-company-products-count]');
  const empty=scope.querySelector('[data-product-empty]');
  function filter(){const query=search.value.trim().toLocaleLowerCase();let matches=0;items.forEach(item=>{item.hidden=!item.textContent.toLocaleLowerCase().includes(query);if(!item.hidden)matches++;});groups.forEach(group=>{group.hidden=!Array.from(group.querySelectorAll('[data-product-item]')).some(item=>!item.hidden);});columns.forEach(column=>{column.hidden=!Array.from(column.querySelectorAll('[data-product-group]')).some(group=>!group.hidden);});count.textContent=matches+' of '+items.length+' products & resources';if(empty)empty.hidden=matches>0;}
  search.addEventListener('input',filter);filter();
  const wrapper=scope.querySelector('[data-product-filter]');if(wrapper)wrapper.hidden=false;
 }
 function init() {
  const trigger=document.querySelector('[data-company-products-open]');
  if(!trigger||trigger.dataset.ready)return;trigger.dataset.ready='true';
  const launch=document.getElementById('fynx-products-launch');
  function mount(){const actions=document.querySelector('.terminal-utility-actions');if(actions&&!actions.contains(trigger)){const categories=actions.querySelector('.terminal-category-links');if(categories)categories.after(trigger);else actions.prepend(trigger);launch.hidden=true;}}
  mount();document.addEventListener('fynx:terminal-header',mount);
  if(document.body.classList.contains('fp-directory'))setupFilter(document.querySelector('main'));
  if(!Array.isArray(window.FynxCompanyProducts)||typeof HTMLDialogElement==='undefined'||typeof HTMLDialogElement.prototype.showModal!=='function')return;
  const dialog=element('dialog','fp-dialog');dialog.id='fynx-products-dialog';dialog.setAttribute('aria-labelledby','fp-menu-title');
  const shell=element('div','fp-shell');
  const top=element('div','fp-menu-top');
  const heading=element('h2','','The company & its products');heading.id='fp-menu-title';
  const close=element('button','fp-close','×');close.type='button';close.dataset.companyProductsClose='';close.setAttribute('aria-label','Close Company & Products');
  const searchWrap=element('div','fp-menu-search');
  const label=element('label','fp-search-label','Find a product or tool');label.htmlFor='fp-menu-search';
  const search=element('input','fp-search');search.type='search';search.id='fp-menu-search';search.dataset.companyProductsSearch='';search.placeholder='Find a product…';
  searchWrap.append(label,search);top.append(heading,searchWrap,close);
  const layout=element('div','fp-menu-layout');const columns=element('div','fp-menu-groups');
  const ordered=[['company','products'],['research','intelligence'],['tools'],['media','business']];
  ordered.forEach(ids=>{const column=element('div','fp-menu-column');ids.forEach(id=>{const group=window.FynxCompanyProducts.find(value=>value.id===id);if(!group)return;const section=element('section','fp-group');section.dataset.productGroup='';section.append(element('h3','',group.title));const list=element('ul');group.items.forEach(item=>{const li=element('li');li.dataset.productItem='';const a=element('a');a.href=item.href;const title=element('span','fp-item-title',item.name);a.append(title);if(item.status)a.append(element('span','fp-status',item.status));const desc=element('span','fp-description',item.description);a.append(desc);li.append(a);list.append(li);});section.append(list);column.append(section);});columns.append(column);});
  const empty=element('p','fp-empty','No matches. Try a different product, topic or tool.');empty.dataset.productEmpty='';empty.hidden=true;layout.append(empty,columns);
  // Flagship product: a featured card above the columns, with a live-style preview of the terminal desks.
  const flagship=window.FynxCompanyProducts.flatMap(group=>group.items).find(item=>item.featured);
  if(flagship){const card=element('a','fp-featured');card.href=flagship.href;card.dataset.productItem='';
   const preview=element('span','fp-featured-preview');preview.setAttribute('aria-hidden','true');
   const bar=element('span','fp-featured-bar');bar.append(element('b','','FYNX'),element('i','','TERMINAL'),element('em','','● LIVE'));preview.append(bar);
   const desks=element('span','fp-featured-desks');(flagship.desks||[]).slice(0,6).forEach((d,i)=>desks.append(element('span',i===0?'on':'',d.toUpperCase())));preview.append(desks);
   const cells=element('span','fp-featured-grid');for(let i=0;i<8;i++)cells.append(element('span',''));preview.append(cells);
   const text=element('span','fp-featured-text');text.append(element('span','fp-featured-kicker',flagship.status||'Flagship'),element('span','fp-featured-title',flagship.name),element('span','fp-featured-desc',flagship.description));
   const list=element('span','fp-featured-list');(flagship.desks||[]).forEach(d=>list.append(element('span','',d)));text.append(list,element('span','fp-featured-cta','Open terminal →'));
   card.append(preview,text);layout.prepend(card);}
  const footer=element('div','fp-menu-footer');const directory=element('a','fp-directory-link','All products & details →');directory.href='/products.html';
  const count=element('p','fp-count');count.dataset.companyProductsCount='';count.setAttribute('role','status');count.setAttribute('aria-live','polite');footer.append(directory,count);
  shell.append(top,layout,footer);dialog.append(shell);document.body.append(dialog);setupFilter(dialog);
  function positionMenu(){const header=document.querySelector('#header, .terminal-masthead, .company-header, .discovery-header, .accounts-header, .fp-directory-header');const utility=document.querySelector('.terminal-utility')||launch;const anchor=window.innerWidth<=700?utility:header||utility;const bottom=anchor?anchor.getBoundingClientRect().bottom:0;dialog.style.setProperty('--fp-menu-top',Math.max(0,Math.min(bottom,window.innerWidth<=700?60:160))+'px');}
  window.addEventListener('resize',()=>{if(dialog.open)positionMenu();});
  trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',dialog.id);trigger.setAttribute('aria-expanded','false');
  function finish(){trigger.setAttribute('aria-expanded','false');document.documentElement.classList.remove('fp-menu-open');trigger.focus({preventScroll:true});}
  function hide(){if(dialog.open)dialog.close();}
  trigger.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(dialog.open){hide();return;}if(typeof window.closeAllBars==='function')window.closeAllBars();if(typeof window.closeMobileMenu==='function')window.closeMobileMenu();document.querySelectorAll('.fynx-menu.open').forEach(menu=>menu.classList.remove('open'));document.querySelectorAll('.terminal-topic-more[open]').forEach(menu=>menu.removeAttribute('open'));positionMenu();dialog.showModal();trigger.setAttribute('aria-expanded','true');document.documentElement.classList.add('fp-menu-open');search.focus({preventScroll:true});});
  close.addEventListener('click',hide);dialog.addEventListener('close',finish);dialog.addEventListener('cancel',event=>{event.preventDefault();hide();});dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}});
  dialog.addEventListener('click',event=>{if(event.target===dialog)hide();});
  dialog.addEventListener('click',event=>{if(event.target.closest('a'))hide();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
/* Site-wide: replace manual Refresh buttons with automatic 10-minute updates (assets/js/auto-refresh.js). */
(function () {
 if (typeof document === 'undefined' || /^\/terminal(\.html)?$/.test(location.pathname) || document.querySelector('script[data-fx-auto-refresh]')) return;
 const own = document.querySelector('script[src*="company-products.js?v=20261113-world-ships-pro-1"]'), v = own && /[?&]v=([^&]+)/.exec(own.src);
 const s = document.createElement('script'); s.src = '/assets/js/auto-refresh.js' + (v ? '?v=' + v[1] : ''); s.defer = true; s.dataset.fxAutoRefresh = '1';
 document.head.append(s);
})();

/* Site-wide: "Sign in" / "Create account" links open the sign-in window over the current page. */
(function () {
 if (typeof document === 'undefined' || /^\/auth\//.test(location.pathname) || document.querySelector('script[data-fx-auth-launcher]')) return;
 const s = document.createElement('script'); s.src = '/assets/js/auth-launcher.js?v=20261112-signin-1'; s.defer = true; s.dataset.fxAuthLauncher = '1';
 document.head.append(s);
})();
