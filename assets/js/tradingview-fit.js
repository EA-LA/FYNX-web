(function () {
  function ensureLiveStyles() {
    if (document.getElementById('fynx-live-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'fynx-live-widget-styles';
    style.textContent = `
      .fynx-live-host{position:relative}
      .fynx-live-badge{
        position:absolute;
        top:10px;
        right:10px;
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:4px 8px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.16);
        background:rgba(0,0,0,.45);
        color:rgba(255,255,255,.9);
        font-size:10px;
        font-weight:700;
        letter-spacing:.08em;
        text-transform:uppercase;
        pointer-events:none;
        z-index:5;
      }
      body:not(.dark-mode) .fynx-live-badge{
        border-color:rgba(0,0,0,.12);
        background:rgba(255,255,255,.82);
        color:rgba(0,0,0,.82);
      }
      .fynx-live-dot{
        width:6px;
        height:6px;
        border-radius:50%;
        background:currentColor;
        opacity:.75;
        animation:fynxLivePulse 1.4s ease-in-out infinite;
      }
      @keyframes fynxLivePulse{
        0%,100%{opacity:.45;transform:scale(.85)}
        50%{opacity:1;transform:scale(1)}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLiveBadge(container) {
    const host = container.closest('.widget-wrap, .widget, .card, .tv-wrap, .tradingview-widget-container') || container;
    const h = host.getBoundingClientRect().height;
    if (h < 220) return;
    host.classList.add('fynx-live-host');
    if (host.querySelector(':scope > .fynx-live-badge')) return;
    const badge = document.createElement('span');
    badge.className = 'fynx-live-badge';
    badge.innerHTML = '<span class="fynx-live-dot"></span>Live';
    host.appendChild(badge);
  }

  function stretchTradingViewWidgets() {
    ensureLiveStyles();

    document.querySelectorAll('.tradingview-widget-container').forEach((container) => {
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.minHeight = '100%';
      container.style.overflow = 'hidden';

      Array.from(container.children).forEach((child) => {
        if (child.tagName !== 'SCRIPT') {
          child.style.width = '100%';
          child.style.height = '100%';
          child.style.minHeight = '100%';
          child.style.display = 'block';
        }
      });

      container.querySelectorAll('iframe').forEach((iframe) => {
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.minHeight = '100%';
        iframe.style.display = 'block';
        iframe.setAttribute('width', '100%');
        iframe.setAttribute('height', '100%');
      });

      ensureLiveBadge(container);
    });

    document.querySelectorAll('.tradingview-widget-container__widget').forEach((widget) => {
      widget.style.width = '100%';
      widget.style.height = '100%';
      widget.style.minHeight = '100%';
      widget.style.display = 'block';
    });
  }

  let raf = null;
  function scheduleStretch() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      stretchTradingViewWidgets();
      raf = null;
    });
  }

  window.FYNXTradingViewFit = {
    refresh: scheduleStretch
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleStretch, { once: true });
  } else {
    scheduleStretch();
  }

  window.addEventListener('resize', scheduleStretch);
  window.addEventListener('orientationchange', scheduleStretch);

  const observer = new MutationObserver(scheduleStretch);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();