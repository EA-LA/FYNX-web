/* Search stays local; category links work as direct, shareable URLs. */
(() => {
  const search = document.getElementById('partnerSearch');
  const clear = document.getElementById('clearPartnerSearch');
  const sections = [...document.querySelectorAll('.partner-section')];
  const links = [...document.querySelectorAll('[data-partner-category]')];
  const normalizeSearch = value => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const entries = sections.map(section => ({
    section,
    cards: [...section.querySelectorAll('.partner-card')].map(card => ({
      card,
      // Disclosure and link labels repeat on every card; do not index that boilerplate.
      searchFields: [...card.querySelectorAll('h3, .partner-category, p')]
        .map(field => normalizeSearch(field.textContent))
    }))
  }));
  function category() { const value=location.hash.slice(1);return sections.some(s=>s.id===value)?value:'all'; }
  function render() {
    const selected=category();const query=normalizeSearch(search.value);const words=query.split(' ').filter(Boolean);let total=0;
    for(const {section,cards} of entries){
      let count=0;
      for(const {card,searchFields} of cards){const visible=(selected==='all'||selected===section.id)&&words.every(word=>searchFields.some(field=>field.includes(word)));card.hidden=!visible;if(visible)count++;}
      section.hidden=count===0;total+=count;
    }
    for(const link of links){const active=link.dataset.partnerCategory===selected;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');}
    document.getElementById('partnerResultCount').textContent=`${total} ${total===1?'platform':'platforms'}${query?' found':''}`;
    document.getElementById('partnerEmpty').hidden=total!==0;clear.hidden=!search.value;
  }
  // pushState keeps category URLs shareable but suppresses the browser's native
  // anchor scrolling. Explicitly reveal the results after a category click,
  // especially on iPhone where the filters stack above the platform cards.
  function revealResults(selected, focusHeading = false) {
    const empty = document.getElementById('partnerEmpty');
    const target = !empty.hidden ? empty
      : selected === 'all' ? document.getElementById('all')
      : sections.find(section => section.id === selected && !section.hidden);
    if (!target) return;
    if (typeof target.scrollIntoView === 'function') {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
    // Native hash navigation normally moves keyboard focus. pushState does not:
    // return that expected behavior for keyboard / assistive-technology activation,
    // without stealing focus from pointer and touch users.
    if (focusHeading) {
      const focusTarget = selected === 'all' && empty.hidden
        ? sections.find(section => !section.hidden) || target : target;
      const heading = focusTarget.querySelector?.('h2') || focusTarget;
      if (!heading.hasAttribute?.('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
  function reset(){search.value='';history.replaceState(null,'',location.pathname+location.search+'#all');render();search.focus();}
  search.addEventListener('input',render);
  clear.addEventListener('click',()=>{search.value='';render();search.focus();});
  document.getElementById('resetPartnerFilters').addEventListener('click',reset);
  links.forEach(link=>link.addEventListener('click',event=>{
    // Keep native link behavior for new tabs/windows and already handled clicks.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null,'',link.getAttribute('href'));
    render();
    revealResults(category(), event.detail === 0);
  }));
  window.addEventListener('hashchange',render);window.addEventListener('popstate',render);
  render();
})();
