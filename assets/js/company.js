/* Progressive enhancement: all stories, links, and roadmap disclosures work without JS. */
(() => {
  const menu = document.querySelector('.company-menu');
  const nav = document.querySelector('#company-navigation');
  if (menu && nav) {
    menu.hidden = false;
    const close = () => menu.setAttribute('aria-expanded', 'false');
    menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(menu.getAttribute('aria-expanded') !== 'true')));
    nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { close(); menu.focus(); }
    });
  }
  const links = [...document.querySelectorAll('.profile-sidebar nav a')];
  if (links.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      links.forEach(link => {
        if (link.hash === '#' + visible[0].target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-8% 0px -55% 0px', threshold: 0 });
    links.forEach(link => { const section = document.querySelector(link.hash); if (section) observer.observe(section); });
  }
})();
