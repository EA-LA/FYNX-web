(function () {
  function stretchTradingViewWidgets() {
    document.querySelectorAll('.tradingview-widget-container').forEach((container) => {
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.minHeight = '100%';

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
