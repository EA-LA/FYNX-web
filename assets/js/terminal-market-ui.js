/* Five-second strip movement; actual prices refresh at the source/cache cadence. */
(function () {
  'use strict';
  let latest, rendered, refresh, motion, paused=false;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const format=q=>q.price.toLocaleString('en-US',{minimumFractionDigits:['EURUSD=X','GBPUSD=X'].includes(q.symbol)?4:2,maximumFractionDigits:['EURUSD=X','GBPUSD=X'].includes(q.symbol)?4:2});
  const change=q=>q.changePercent===null?'—':`${q.changePercent>0?'▲ ':q.changePercent<0?'▼ ':''}${Math.abs(q.changePercent).toFixed(2)}%`;
  function move(direction=1){
    const track=document.querySelector('.terminal-ticker-track');if(!track)return;
    const max=track.scrollWidth-track.clientWidth;
    if(max<=0)return;
    const next=direction>0?(track.scrollLeft>=max-2?0:Math.min(max,track.scrollLeft+185)):(track.scrollLeft<=2?max:Math.max(0,track.scrollLeft-185));
    track.scrollTo({left:next,behavior:reduced?.matches?'auto':'smooth'});
  }
  function render(data) {
    const host=document.querySelector('[data-terminal-ticker]');if(!host)return;
    if(rendered===data&&host.querySelector('.terminal-ticker-track'))return;
    const previous=rendered;rendered=data;
    const track=document.createElement('div');track.className='terminal-ticker-track';track.tabIndex=0;track.setAttribute('aria-label','Global market quotes. Scroll to see more.');
    const inner=document.createElement('div');inner.className='terminal-ticker-inner';
    const label=document.createElement('a');label.href='/tools/research-heatmap.html';label.className='terminal-ticker-label';label.textContent='Global markets';inner.append(label);
    for(const item of window.FynxTerminalData.instruments){
      const q=data.quotes[item.symbol],a=document.createElement('a');a.href='/tools/research-heatmap.html';a.className='terminal-ticker-item';
      const name=document.createElement('strong');name.textContent=item.shortName+(item.group==='ETF'?' ETF':'');
      const price=document.createElement('span');price.textContent=q?format(q):'Unavailable';
      const movement=document.createElement('span');movement.textContent=q?change(q):'—';
      if(q){movement.className=q.changePercent>0?'terminal-up':q.changePercent<0?'terminal-down':'';a.title=`${item.name} · ${q.currency} · ${q.source} · As of ${new Date(q.asOf).toLocaleString()} · ${q.basis}${q.delayed?' · Delayed':' · Indicative'}${data.stale?' · Saved quote':''}`;
        if(previous?.quotes[item.symbol]&&previous.quotes[item.symbol].price!==q.price)price.classList.add('terminal-price-changed');}
      a.append(name,price,movement);inner.append(a);
    }
    const status=document.createElement('small');status.className='terminal-ticker-status';status.textContent=data.status==='unavailable'?'Quotes unavailable':`${data.stale?'Saved':'Indicative / may be delayed'} · ${data.fetchedAt?new Date(data.fetchedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''} · Checks every minute`;
    inner.append(status);track.append(inner);
    const controls=document.createElement('div');controls.className='terminal-ticker-controls';
    for(const [text,label,action] of [['‹','Previous market quotes',()=>move(-1)],['Ⅱ','Pause market strip',null],['›','Next market quotes',()=>move(1)]]){
      const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',label);
      if(action)button.addEventListener('click',action);else{button.textContent=paused||reduced?.matches?'▶':'Ⅱ';button.setAttribute('aria-label',paused||reduced?.matches?'Resume market strip':'Pause market strip');button.setAttribute('aria-pressed',String(paused));button.addEventListener('click',()=>{paused=!paused;button.textContent=paused?'▶':'Ⅱ';button.setAttribute('aria-pressed',String(paused));button.setAttribute('aria-label',paused?'Resume market strip':'Pause market strip');});}controls.append(button);
    }
    const left=host.querySelector('.terminal-ticker-track')?.scrollLeft||0;host.replaceChildren(track,controls);track.scrollLeft=left;
  }
  function start(){if(document.hidden||!window.FynxTerminalData||!document.body.hasAttribute('data-fynx-terminal'))return;window.FynxTerminalData.loadQuotes().then(data=>{latest=data;render(data);document.dispatchEvent(new CustomEvent('fynx:terminal-quotes',{detail:data}));});}
  function timers(){if(!refresh)refresh=setInterval(start,60000);if(!motion)motion=setInterval(()=>{const host=document.querySelector('[data-terminal-ticker]');if(!document.hidden&&!paused&&!reduced?.matches&&host&&!host.matches(':hover')&&!host.contains(document.activeElement))move();},5000);}
  document.addEventListener('fynx:terminal-header',()=>{if(latest)render(latest);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)start();});
  window.addEventListener('pagehide',()=>{clearInterval(refresh);clearInterval(motion);refresh=motion=null;});
  window.addEventListener('pageshow',()=>{timers();start();});
  timers();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
