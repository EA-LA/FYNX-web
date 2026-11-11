/* Search stays local; category links work as direct, shareable URLs. */
(() => {
  const search = document.getElementById('partnerSearch');
  const clear = document.getElementById('clearPartnerSearch');
  const sections = [...document.querySelectorAll('.partner-section')];
  const links = [...document.querySelectorAll('[data-partner-category]')];
  const entries = sections.map(section => ({section,cards:[...section.querySelectorAll('.partner-card')].map(card=>({card,text:card.textContent.toLowerCase()}))}));
  function category() { const value=location.hash.slice(1);return sections.some(s=>s.id===value)?value:'all'; }
  function render() {
    const selected=category();const query=search.value.trim().toLowerCase();let total=0;
    for(const {section,cards} of entries){
      let count=0;
      for(const {card,text} of cards){const visible=(selected==='all'||selected===section.id)&&text.includes(query);card.hidden=!visible;if(visible)count++;}
      section.hidden=count===0;total+=count;
    }
    for(const link of links){const active=link.dataset.partnerCategory===selected;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');}
    document.getElementById('partnerResultCount').textContent=`${total} ${total===1?'platform':'platforms'}${query?' found':''}`;
    document.getElementById('partnerEmpty').hidden=total!==0;clear.hidden=!search.value;
  }
  function reset(){search.value='';history.replaceState(null,'',location.pathname+location.search+'#all');render();search.focus();}
  search.addEventListener('input',render);
  clear.addEventListener('click',()=>{search.value='';render();search.focus();});
  document.getElementById('resetPartnerFilters').addEventListener('click',reset);
  links.forEach(link=>link.addEventListener('click',event=>{event.preventDefault();history.pushState(null,'',link.getAttribute('href'));render();}));
  window.addEventListener('hashchange',render);window.addEventListener('popstate',render);
  render();
})();
