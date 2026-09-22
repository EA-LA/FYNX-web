/* A single, full-width reading surface per category. */
(() => {
  const panels = [...document.querySelectorAll('.mode-content')];
  let restoring = false;
  function routeFor(panel, frame) {
    if (restoring) return;
    const url = new URL(location.href);
    url.searchParams.set('section', panel.dataset.newsPanel || panel.dataset.calendarPanel || '');
    url.searchParams.set('tool', new URL(frame.dataset.src || frame.getAttribute('src'), location.href).pathname);
    if(url.href !== location.href) history.pushState(null, '', url);
  }
  function prepare(panel) {
    const frames = [...panel.querySelectorAll('iframe')];
    if (!frames.length) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'module-toolbar';
    toolbar.setAttribute('aria-label', 'Choose a tool');
    const open = document.createElement('a');
    open.className = 'module-open';
    open.textContent = 'Open full page ↗';
    function select(frame, navigate = false) {
      frames.forEach((item, index) => {
        const card = item.closest('.module-card') || item.parentElement;
        card.hidden = item !== frame;
        toolbar.querySelectorAll('button')[index].setAttribute('aria-pressed', String(item === frame));
      });
      if (frame.dataset.src) { frame.src = frame.dataset.src; delete frame.dataset.src; }
      open.href = frame.getAttribute('src');
      panel._selected = frame;
      if(navigate) routeFor(panel, frame);
    }
    frames.forEach(frame => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = frame.title;
      button.addEventListener('click', () => select(frame, true)); toolbar.append(button);
      frame.addEventListener('load', () => {
        try {
          const doc = frame.contentDocument;
          if (!doc || new URL(frame.src).origin !== location.origin) return;
          doc.documentElement.classList.add('fynx-embedded');
          const style = doc.createElement('style');
          style.textContent = `html.fynx-embedded body{height:auto!important;min-height:0!important}html.fynx-embedded body>header,html.fynx-embedded .theme-utility{display:none!important}html.fynx-embedded body>main,html.fynx-embedded body>.wrap{width:100%!important;max-width:none!important;padding:24px!important;margin:0!important}html.fynx-embedded .hero{padding:0 0 20px!important;min-height:0!important}html.fynx-embedded .hero h1{font-size:30px!important}html.fynx-embedded .clock-wrap,html.fynx-embedded .hero-badges,html.fynx-embedded .hero-stats,html.fynx-embedded .hero-right{display:none!important}html.fynx-embedded .content{grid-template-columns:minmax(0,1fr)!important}html.fynx-embedded .side-panel{display:none!important}`;
          doc.head.append(style);
          const resize = () => { const height = Math.ceil(doc.body.getBoundingClientRect().height); if(height > 0) frame.style.height = `${height + 4}px`; };
          new ResizeObserver(resize).observe(doc.body); resize();
          doc.addEventListener('click', event => {
            const link = event.target.closest('a[href]');
            if (link && link.target !== '_blank' && !link.getAttribute('href').startsWith('#')) { event.preventDefault(); window.location.href = link.href; }
          });
        } catch (_) { /* Cross-origin providers control their own layout. */ }
      });
    });
    toolbar.append(open); panel.prepend(toolbar);
    panel._frames = frames; panel._select = select;
    panel._activate = () => { if(!frames.some(f => f.hasAttribute('src'))) select(frames[0]); };
    frames.forEach((frame, index) => { (frame.closest('.module-card') || frame.parentElement).hidden = index > 0; });
  }
  panels.forEach(prepare);
  function loadActive() {
    panels.filter(panel => panel.classList.contains('active')).forEach(panel => panel._activate?.());
    document.querySelectorAll('[role=tab]').forEach(tab => {tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;});
  }
  const observer = new MutationObserver(loadActive);
  panels.forEach(panel => observer.observe(panel, {attributes:true, attributeFilter:['class']}));
  document.querySelectorAll('[role=tablist]').forEach(list => list.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = [...list.querySelectorAll('[role=tab]')], current = tabs.indexOf(document.activeElement);
    if(current < 0) return; event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].focus(); tabs[index].click();
  }));
  function restoreRoute() {
    restoring = true;
    const params = new URLSearchParams(location.search);
    const category = params.get('section');
    const tab = [...document.querySelectorAll('[data-news-tab],[data-calendar-tab]')].find(t => (t.dataset.newsTab || t.dataset.calendarTab) === category) || document.querySelector('[data-news-tab],[data-calendar-tab]');
    if(tab) tab.click();
    const panel = panels.find(p=>p.classList.contains('active'));
    const frame = panel?._frames?.find(f => new URL(f.dataset.src || f.getAttribute('src'),location.href).pathname === params.get('tool'));
    if(panel?._frames?.length) panel._select(frame || panel._frames[0]);
    restoring = false;
    loadActive();
  }
  document.querySelectorAll('[data-news-tab],[data-calendar-tab]').forEach(tab=>tab.addEventListener('click',()=>{
    loadActive(); const panel=panels.find(p=>p.classList.contains('active'));
    if(panel?._selected)routeFor(panel,panel._selected);
  }));
  window.addEventListener('popstate',restoreRoute);
  restoreRoute();
})();
