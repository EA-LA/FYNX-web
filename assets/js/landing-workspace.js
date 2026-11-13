/* Rotate the public Market Desk overview with an explicit pause/resume control. */
(() => {
  'use strict';
  const terminal = document.querySelector('.fw-terminal');
  if (!terminal) return;
  const tabs = [...terminal.querySelectorAll('[data-fw-tab]')];
  const panels = [...terminal.querySelectorAll('.fw-panel')];
  if (!tabs.length || tabs.length !== panels.length) return;
  // Insert the control only when the slideshow is functional.
  const footer = terminal.querySelector('.fw-terminal-foot');
  if (!footer) return;
  const rotationToggle = document.createElement('button');
  rotationToggle.type = 'button';
  rotationToggle.className = 'fw-rotation-toggle';
  rotationToggle.setAttribute('data-fw-rotation-toggle', '');
  footer.append(rotationToggle);
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let userPaused = Boolean(motion?.matches);
  let index = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
  let visible = !('IntersectionObserver' in window), timer = null, suspended = false;
  let pointerReading = false;

  function sync() {
    const wasPaused = terminal.classList.contains('fw-paused');
    clearInterval(timer);
    timer = null;
    // Don't move content while the visitor is interacting with a tab or its panel.
    // The toggle itself stays focused when Resume is explicitly requested.
    const focusWithin = terminal.contains(document.activeElement) && document.activeElement !== rotationToggle;
    const paused = suspended || userPaused || pointerReading || !visible || document.hidden || focusWithin;
    terminal.classList.toggle('fw-paused', Boolean(paused));
    rotationToggle.textContent = userPaused ? 'Resume rotation' : 'Pause rotation';
    rotationToggle.setAttribute('aria-label', userPaused
      ? 'Resume automatic Market Desk rotation'
      : 'Pause automatic Market Desk rotation');
    if (!paused) {
      if (wasPaused) {
        const bar = terminal.querySelector('.fw-progress>span');
        if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
      }
      timer = setInterval(() => show((index + 1) % tabs.length), 7000);
    }
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
  rotationToggle.addEventListener('click', () => {
    userPaused = !userPaused;
    sync();
  });
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
  // Pause while a desktop visitor is reading or comparing Market Desk panels.
  // Touch movement must not stop the slideshow; focus and manual pause remain independent.
  function pointerHover(event) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    pointerReading = event.type === 'pointerenter';
    sync();
  }
  terminal.addEventListener('pointerenter', pointerHover);
  terminal.addEventListener('pointerleave', pointerHover);
  terminal.addEventListener('focusin', sync);
  terminal.addEventListener('focusout', () => queueMicrotask(sync));
  document.addEventListener('visibilitychange', sync);
  motion?.addEventListener?.('change', () => {
    if (motion.matches) userPaused = true;
    sync();
  });
  window.addEventListener('pagehide', () => { suspended = true; sync(); });
  window.addEventListener('pageshow', () => { suspended = false; sync(); });
  show(index);
  sync();
})();
