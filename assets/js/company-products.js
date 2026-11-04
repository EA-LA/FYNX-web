/* One accessible product directory, independent of page/account logic. */
(function () {
 'use strict';
 function element(tag, cls, text) {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
 function setupFilter(scope) {
  const search=scope.querySelector('[data-company-products-search]');if(!search)return;
  const items=Array.from(scope.querySelectorAll('[data-product-item]'));
  const groups=Array.from(scope.querySelectorAll('[data-product-group]'));
  const count=scope.querySelector('[data-company-products-count]');
  const empty=scope.querySelector('[data-product-empty]');
  function filter(){const query=search.value.trim().toLocaleLowerCase();let matches=0;items.forEach(item=>{item.hidden=!item.textContent.toLocaleLowerCase().includes(query);if(!item.hidden)matches++;});groups.forEach(group=>{group.hidden=!Array.from(group.querySelectorAll('[data-product-item]')).some(item=>!item.hidden);});count.textContent=matches+' of '+items.length+' products & resources';if(empty)empty.hidden=matches>0;}
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
  const heading=element('h2','','FYNX · The Company & Its Products');heading.id='fp-menu-title';
  const close=element('button','fp-close','×');close.type='button';close.dataset.companyProductsClose='';close.setAttribute('aria-label','Close Company & Products');
  top.append(heading,close);
  const layout=element('div','fp-menu-layout');const intro=element('aside','fp-menu-intro');
  intro.append(element('p','fp-eyebrow','THE FYNX ECOSYSTEM'),element('h3','','A world of tools.\nOne place to start.'),element('p','','Explore our products, research, learning and services. Find what fits the way you work.'));
  const directory=element('a','fp-directory-link','View the full directory ↗');directory.href='/products.html';intro.append(directory);
  const label=element('label','fp-search-label','Find a product or tool');label.htmlFor='fp-menu-search';
  const search=element('input','fp-search');search.type='search';search.id='fp-menu-search';search.dataset.companyProductsSearch='';search.placeholder='Try Wallet, risk or API…';
  const count=element('p','fp-count');count.dataset.companyProductsCount='';count.setAttribute('role','status');count.setAttribute('aria-live','polite');intro.append(label,search,count);
  const content=element('div','fp-menu-content');const columns=element('div','fp-menu-groups');
  window.FynxCompanyProducts.forEach(group=>{const section=element('section','fp-group');section.dataset.productGroup='';section.append(element('h3','',group.title));const list=element('ul');group.items.forEach(item=>{const li=element('li');li.dataset.productItem='';const a=element('a');a.href=item.href;const title=element('span','fp-item-title',item.name);title.append(element('span','fp-arrow',item.href.startsWith('https:')?'↗':'→'));a.append(title);if(item.status)a.append(element('span','fp-status',item.status));const desc=element('span','fp-description',item.description);a.append(desc);li.append(a);list.append(li);});section.append(list);columns.append(section);});
  const empty=element('p','fp-empty','No matches. Try a different product, topic or tool.');empty.dataset.productEmpty='';empty.hidden=true;content.append(empty,columns);layout.append(intro,content);shell.append(top,layout);dialog.append(shell);document.body.append(dialog);setupFilter(dialog);
  trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',dialog.id);trigger.setAttribute('aria-expanded','false');
  function finish(){trigger.setAttribute('aria-expanded','false');document.documentElement.classList.remove('fp-menu-open');trigger.focus({preventScroll:true});}
  function hide(){if(dialog.open)dialog.close();}
  trigger.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(dialog.open){hide();return;}if(typeof window.closeAllBars==='function')window.closeAllBars();if(typeof window.closeMobileMenu==='function')window.closeMobileMenu();document.querySelectorAll('.fynx-menu.open').forEach(menu=>menu.classList.remove('open'));document.querySelectorAll('.terminal-topic-more[open]').forEach(menu=>menu.removeAttribute('open'));dialog.showModal();trigger.setAttribute('aria-expanded','true');document.documentElement.classList.add('fp-menu-open');search.focus({preventScroll:true});});
  close.addEventListener('click',hide);dialog.addEventListener('close',finish);dialog.addEventListener('cancel',event=>{event.preventDefault();hide();});dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}});
  dialog.addEventListener('click',event=>{if(event.target===dialog)hide();});
  dialog.addEventListener('click',event=>{if(event.target.closest('a'))hide();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
