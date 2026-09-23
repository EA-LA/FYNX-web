/* TradingView percentage heights require a definite containing block. */
(function () {
  const watched=new WeakSet();
  const resize=new ResizeObserver(()=>refresh());
  function fit() {
    document.querySelectorAll('.tradingview-widget-container').forEach(container => {
      if (container.closest('#tvTapeWrap')) return;
      const host = container.closest('.widget-shell, .widget, .tv-wrap') || container.parentElement;
      if (!host) return;
      if (!watched.has(host)) { watched.add(host); resize.observe(host); }
      if (!host.clientWidth) return;
      const minimum = parseFloat(getComputedStyle(host).minHeight) || 0;
      // Only size known chart hosts; do not turn ticker/quote badges into charts.
      if (minimum < 200 && host.clientHeight < 200) return;
      const target = minimum >= 200 ? minimum : host.getBoundingClientRect().height;
      host.style.height = target + 'px';
      Object.assign(container.style,{width:'100%',height:'100%',minHeight:'0',overflow:'hidden'});
      if (container.querySelector(':scope > iframe')) {
        Array.from(container.children).filter(e => e.tagName === 'DIV' && !e.classList.contains('tradingview-widget-copyright') && !e.children.length).forEach(e => { e.style.height = '0'; e.style.minHeight = '0'; });
      }
      const copyright = container.querySelector('.tradingview-widget-copyright');
      const height = Math.max(0, host.clientHeight - (copyright ? copyright.offsetHeight : 0));
      container.querySelectorAll(':scope > iframe, :scope > .tradingview-widget-container__widget > iframe').forEach(frame => {
        frame.style.width = '100%';
        frame.style.height = height + 'px';
        frame.style.minHeight = '0';
        frame.style.display = 'block';
        frame.setAttribute('height', String(height));
      });
    });
  }
  let queued = false;
  function refresh() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; fit(); }); } }
  window.FYNXTradingViewFit = {refresh};
  document.addEventListener('DOMContentLoaded', refresh);
  window.addEventListener('resize', refresh);
  new MutationObserver(refresh).observe(document.documentElement, {childList:true, subtree:true});
  refresh();
})();
