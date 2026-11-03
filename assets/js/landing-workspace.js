/* Rotate the public workspace overview automatically without a play/stop control. */
(() => {
  'use strict';
  const terminal = document.querySelector('.fw-terminal');
  if (!terminal) return;
  const tabs = [...terminal.querySelectorAll('[data-fw-tab]')];
  const panels = [...terminal.querySelectorAll('.fw-panel')];
  if (!tabs.length || tabs.length !== panels.length) return;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let index = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
  let visible = !('IntersectionObserver' in window), timer = null, suspended = false;

  function sync() {
    clearInterval(timer);
    timer = null;
    // Never hide a focused link or override the reader's reduced-motion preference.
    const paused = suspended || motion?.matches || !visible || document.hidden || terminal.contains(document.activeElement);
    terminal.classList.toggle('fw-paused', Boolean(paused));
    if (!paused) timer = setInterval(() => show((index + 1) % tabs.length), 7000);
  }
  function show(next) {
    index = next;
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    const bar = terminal.querySelector('.fw-progress>span');
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { show(i); sync(); });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      show(next);
      tabs[next].focus();
      sync();
    });
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold: .25 }).observe(terminal);
  }
  terminal.addEventListener('focusin', sync);
  terminal.addEventListener('focusout', () => queueMicrotask(sync));
  document.addEventListener('visibilitychange', sync);
  motion?.addEventListener?.('change', sync);
  window.addEventListener('pagehide', () => { suspended = true; sync(); });
  window.addEventListener('pageshow', () => { suspended = false; sync(); });
  show(index);
  sync();
})();
