/* Shared indicative market strip. Prices and timestamps come from the existing research service. */
(function () {
  'use strict';
  let latest;
  const format = q => q.price.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:q.symbol === 'EURUSD=X' ? 4 : 2});
  const change = q => q.changePercent === null ? '—' : `${q.changePercent > 0 ? '▲ ' : q.changePercent < 0 ? '▼ ' : ''}${Math.abs(q.changePercent).toFixed(2)}%`;
  function render(data) {
    const host = document.querySelector('[data-terminal-ticker]');
    if (!host) return;
    const inner = document.createElement('div'); inner.className = 'terminal-ticker-inner';
    const label = document.createElement('a'); label.href = '/tools/research-heatmap.html'; label.className = 'terminal-ticker-label'; label.textContent = 'Market watch'; inner.append(label);
    for (const item of window.FynxTerminalData.instruments) {
      const q = data.quotes[item.symbol], link = document.createElement('a');
      link.href = '/tools/research-heatmap.html'; link.className = 'terminal-ticker-item';
      const name = document.createElement('strong'); name.textContent = item.shortName + (item.group === 'ETF' ? ' ETF' : '');
      const price = document.createElement('span'); price.textContent = q ? format(q) : 'Unavailable';
      const movement = document.createElement('span'); movement.textContent = q ? change(q) : '—';
      if (q) {
        movement.className = q.changePercent > 0 ? 'terminal-up' : q.changePercent < 0 ? 'terminal-down' : '';
        link.title = `${item.name} · ${q.currency} · ${q.source} · As of ${new Date(q.asOf).toLocaleString()} · ${q.basis}${q.delayed ? ' · Delayed' : ' · Indicative'}${data.stale ? ' · Saved quote' : ''}`;
      }
      link.append(name, price, movement); inner.append(link);
    }
    const status = document.createElement('small'); status.className = 'terminal-ticker-status';
    status.textContent = data.status === 'unavailable' ? 'Quotes unavailable' : `${data.stale ? 'Saved' : 'Indicative'} · ${data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}`;
    inner.append(status); host.replaceChildren(inner);
  }
  function start() {
    if (document.hidden || !window.FynxTerminalData || !document.body.hasAttribute('data-fynx-terminal')) return;
    window.FynxTerminalData.loadQuotes().then(data => {latest = data; render(data); document.dispatchEvent(new CustomEvent('fynx:terminal-quotes', {detail:data}));});
  }
  document.addEventListener('fynx:terminal-header', () => {if (latest) render(latest);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)start();});
  let refresh = window.setInterval(start, 60000);
  window.addEventListener('pagehide',()=>{clearInterval(refresh);refresh=null;});
  window.addEventListener('pageshow',()=>{if(!refresh)refresh=window.setInterval(start,60000);start();});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();
