/* Read-only daily research archive. Never attach account headers or cookies to archive requests. */
(function () {
  'use strict';
  const local='/assets/data/research/',branch='https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data'+local;
  const saved=new Map(),day=86400000,minute=60000;
  const known=id=>window.FynxQuant.SYMBOLS.some(m=>m.id===id);
  const validDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
  const freshTimestamp=s=>validDate(s)&&Date.parse(s)<=Date.now()+minute;
  async function fetchJSON(path,signal,timeout) {
    const ac=new AbortController(),abort=()=>ac.abort();
    if(signal?.aborted)throw new Error('Cancelled.');
    signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeout);
    try {
      const response=await fetch(path,{signal:ac.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-cache'});
      if(!response.ok)throw new Error('Archive unavailable.');
      return await response.json();
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async function archive(file,validate,signal) {
    if(signal?.aborted)throw new Error('Cancelled.');
    const cached=saved.get(file);if(cached&&Date.now()-cached.time<10*minute)return cached.data;
    const roots=window.FynxResearchService?.production?[branch,local]:[local];
    for(const base of roots){
      try{
        const data=validate(await fetchJSON(base+file,signal,base===branch?4000:7000));
        if(signal?.aborted)throw new Error('Cancelled.');
        saved.set(file,{time:Date.now(),data});return data;
      }catch(error){if(signal?.aborted)throw error;}
    }
    throw new Error('The verified daily archive could not be retrieved.');
  }
  function checkedMarket(data,id) {
    if(data?.symbol!==id||data.timeframe!=='D1'||data.completeBarsOnly!==true||typeof data.source!=='string'||!data.source.trim()||!freshTimestamp(data.updatedAt)||!Array.isArray(data.bars)||!data.bars.length||data.bars.length>20000)throw new Error('Invalid history.');
    let last=-Infinity;
    for(const b of data.bars){
      const stamp=Date.parse(b?.time);
      if(!Number.isFinite(stamp)||stamp<=last||stamp+day>Date.now()+minute||![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close))throw new Error('Invalid bar.');
      last=stamp;
    }
    return data;
  }
  async function bars(params,signal) {
    const symbol=params.get('symbol'),tf=params.get('tf'),start=Date.parse(params.get('from')),end=Date.parse(params.get('to'));
    if(tf!=='D1'||!known(symbol)||!Number.isFinite(start)||!Number.isFinite(end)||start>=end||start>Date.now()||end>Date.now()+minute)throw new Error('Choose a valid daily history range ending today or earlier.');
    const data=await archive('bars/'+symbol+'-D1.json',d=>checkedMarket(d,symbol),signal);
    const bars=data.bars.filter(b=>{const t=Date.parse(b.time);return t>=start&&t+day<=end;});
    if(!bars.length)throw new Error('The selected range does not overlap the published daily archive.');
    const partial=start<Date.parse(data.requestedFrom||data.bars[0].time)||end>Date.parse(data.requestedTo||data.bars.at(-1).time);
    return {...data,bars,from:bars[0].time,to:bars.at(-1).time,status:'published history',requestedFrom:new Date(start).toISOString(),requestedTo:new Date(end).toISOString(),
      warning:[data.warning,partial?'Partial requested coverage: results use only the dates shown.':'',Date.now()-Date.parse(data.updatedAt)>3*day?'Archive refresh is delayed.':''].filter(Boolean).join(' ')};
  }
  async function summary() {
    return archive('manifest.json',d=>{
      if(d?.version!==1||!freshTimestamp(d.generatedAt)||!Array.isArray(d.markets))throw new Error('Invalid archive manifest.');
      return d.markets.filter(m=>known(m.symbol)&&m.timeframe==='D1'&&typeof m.source==='string'&&m.source.trim()&&Number.isFinite(m.price)&&m.price>0&&freshTimestamp(m.asOf));
    });
  }
  async function upcoming(currencies,from,to) {
    const data=await archive('calendar.json',d=>{
      if(!freshTimestamp(d?.updatedAt)||!validDate(d.from)||!validDate(d.to)||!Array.isArray(d.events)||!d.source||Date.parse(d.to)<Date.now())throw new Error('Calendar archive expired.');
      return d;
    });
    const events=data.events.filter(e=>e&&typeof e.name==='string'&&validDate(e.time)&&Date.parse(e.time)>=Math.max(Date.now(),Date.parse(from))&&Date.parse(e.time)<Date.parse(to)&&e.impact==='high'&&currencies.includes(e.currency));
    return {...data,events,scheduled:true};
  }
  window.FynxQuantArchive=Object.freeze({bars,summary,upcoming});
})();
