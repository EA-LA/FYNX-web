/* TradingView percentage heights require a definite containing block. */
(function () {
  const watched=new WeakSet();
  // Older iPhone webviews may not support ResizeObserver; window resize
  // and widget insertion still provide useful fallback triggers.
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => refresh()) : null;
  function fit() {
    document.querySelectorAll('.tradingview-widget-container').forEach(container => {
      if (container.closest('#tvTapeWrap')) return;
      const host = container.closest('.widget-shell, .widget, .tv-wrap') || container.parentElement;
      if (!host) return;
      if (!watched.has(host)) { watched.add(host); resize?.observe(host); }
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
  // Market prices, clocks and headlines change often. An unrelated DOM update
  // should not rescan and resize every embedded chart on the page.
  function hasChart(node) {
    return node?.nodeType === 1 && (
      node.matches?.('.tradingview-widget-container') ||
      node.querySelector?.('.tradingview-widget-container')
    );
  }
  function chartMutation(records) {
    if (records.some(record => {
      const target = record.target;
      if (target?.nodeType === 1 && (
        target.matches?.('.tradingview-widget-container') ||
        target.closest?.('.tradingview-widget-container')
      )) return true;
      return [...record.addedNodes, ...record.removedNodes].some(hasChart);
    })) refresh();
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(chartMutation).observe(document.documentElement, {childList:true, subtree:true});
  }
  refresh();
})();
