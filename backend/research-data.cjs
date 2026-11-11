'use strict';
const C=require('./research-core.cjs');
const SEC_AGENT='FYNX Finance World Research https://www.fynxfinanceworld.com/contact.html';

function createResearchService({fetcher=fetch,now=()=>Date.now()}={}) {
  const cache=new Map(),pending=new Map();let secTail=Promise.resolve(),lastSEC=0,secPause=0;
  async function json(url,limit=12000000) {
    const sec=url.startsWith('https://data.sec.gov/')||url.startsWith('https://www.sec.gov/');
    if(sec) {
      if(now()<secPause)throw Error('SEC requested a pause. Please retry in a minute.');
      const turn=secTail.then(async()=>{const delay=Math.max(0,550-(now()-lastSEC));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastSEC=now();});
      secTail=turn.catch(()=>{});await turn;
    }
    const response=await fetcher(url,{signal:AbortSignal.timeout(14000),headers:{Accept:'application/json','User-Agent':sec?SEC_AGENT:'FYNX-FinanceWorld/1.0'}});
    if(!response.ok){if(sec&&[403,429].includes(response.status))secPause=now()+60000;throw Error(sec?'SEC data is temporarily unavailable. Try again later or open SEC directly.':'Market data is temporarily unavailable. Try again later.');}
    if(Number(response.headers.get('content-length'))>limit)throw Error('Source response is too large.');
    let text;
    if(response.body?.getReader) {
      const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;const parts=[];
      try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Source response is too large.');parts.push(decoder.decode(value,{stream:true}));}parts.push(decoder.decode());text=parts.join('');}finally{await reader.cancel();}
    }else{text=await response.text();if(Buffer.byteLength(text)>limit)throw Error('Source response is too large.');}
    return JSON.parse(text);
  }
  async function cached(key,ttl,load) {
    const old=cache.get(key);if(old&&now()-old.at<ttl)return old.data;
    if(pending.has(key))return pending.get(key);
    if(pending.size>=12)throw Error('The research service is busy. Please retry shortly.');
    const task=(async()=>{
      try {const data=await load();cache.delete(key);cache.set(key,{at:now(),data});while(cache.size>128)cache.delete(cache.keys().next().value);return data;}
      finally{pending.delete(key);}
    })();pending.set(key,task);return task;
  }
  const chart=(symbol,range,interval)=>json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,5000000);
  function chartResult(payload,symbol) {
    const r=payload?.chart?.result?.[0];
    if(payload?.chart?.error||r?.meta?.symbol?.toUpperCase()!==symbol.toUpperCase())throw Error('The provider returned an unexpected instrument.');
    return r;
  }
  async function quote(symbol) {
    return cached('quote:'+symbol,45000,async()=>{
      const asset=C.symbolMap[symbol];let result;
      if(asset.group==='Crypto') {
        const [ticker,stats]=await Promise.all([json(`https://api.exchange.coinbase.com/products/${symbol}/ticker`,30000),json(`https://api.exchange.coinbase.com/products/${symbol}/stats`,30000)]);
        const price=Number(ticker.price),open=Number(stats.open);
        result={symbol,price,currency:'USD',asOf:ticker.time,changePercent:open>0?(price/open-1)*100:null,source:'Coinbase Exchange',sourceURL:`https://www.coinbase.com/price/${({BTC:'bitcoin',ETH:'ethereum',SOL:'solana',LTC:'litecoin'})[symbol.split('-')[0]]}`,basis:'24 hours'};
      }else {
        const r=chartResult(await chart(symbol,'5d','1d'),symbol),m=r.meta;
        // chartPreviousClose for a 5d request is the start-of-window close. Use the last
        // completed daily close for the actual latest session percentage instead.
        const timestamps=r.timestamp||[],closes=r.indicators?.quote?.[0]?.close||[];
        let reference=null;
        const zone=m.exchangeTimezoneName||'UTC';
        const localDate=t=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t*1000));
        const quoteDate=localDate(m.regularMarketTime);
        for(let i=timestamps.length-1;i>=0;i--)if(localDate(timestamps[i])<quoteDate && C.finite(closes[i])&&closes[i]>0){reference=closes[i];break;}
        if(reference===null&&C.finite(m.previousClose))reference=m.previousClose;
        result={symbol,price:m.regularMarketPrice,currency:m.currency,asOf:new Date(m.regularMarketTime*1000).toISOString(),changePercent:reference>0?(m.regularMarketPrice/reference-1)*100:null,source:'Yahoo Finance',sourceURL:`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,basis:'Previous session',delayed:true};
      }
      if(!C.usableQuote(result,now())||typeof result.currency!=='string'||!/^[A-Z]{3}$/.test(result.currency)||result.changePercent!==null&&!C.finite(result.changePercent))throw Error('No recent, validated quote is available.');
      return {...result,fetchedAt:new Date(now()).toISOString()};
    });
  }
  async function history(symbol) {
    return cached('history:'+symbol,6*3600000,async()=>{
      const r=chartResult(await chart(symbol,'2y','1d'),symbol),m=r.meta;
      if(m.currency!=='USD')throw Error('Strategy Lab supports USD history only.');
      const times=r.timestamp,ohlc=r.indicators?.quote?.[0],adjusted=r.indicators?.adjclose?.[0]?.adjclose;
      if(!Array.isArray(times)||!ohlc||!Array.isArray(adjusted)||times.length!==adjusted.length||!['open','high','low','close'].every(k=>Array.isArray(ohlc[k])&&ohlc[k].length===times.length))throw Error('Adjusted daily history is unavailable.');
      const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:m.exchangeTimezoneName||'UTC',year:'numeric',month:'2-digit',day:'2-digit'});
      const today=formatter.format(new Date(now())),bars=[];let omitted=0;
      for(let i=0;i<times.length;i++) {
        if(!C.finite(times[i])){omitted++;continue;}
        const date=formatter.format(new Date(times[i]*1000));
        if(date>=today){omitted++;continue;}
        if(!['open','high','low','close'].every(k=>C.finite(ohlc[k][i])&&ohlc[k][i]>0)||!C.finite(adjusted[i])||adjusted[i]<=0){omitted++;continue;}
        const ratio=adjusted[i]/ohlc.close[i];
        bars.push({date,open:ohlc.open[i]*ratio,high:ohlc.high[i]*ratio,low:ohlc.low[i]*ratio,close:adjusted[i]});
      }
      C.validateBars(bars,now());
      return {symbol,currency:'USD',bars,omitted,adjusted:true,source:'Yahoo Finance',sourceURL:`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`,fetchedAt:new Date(now()).toISOString()};
    });
  }
  async function query(params) {
    const action=params.action;
    if(action==='directory')return cached('directory',86400000,async()=>({companies:C.directory(await json('https://www.sec.gov/files/company_tickers.json',5000000)),fetchedAt:new Date(now()).toISOString(),source:'SEC EDGAR'}));
    if(action==='financials') {
      if(!/^\d{1,10}$/.test(String(params.cik))||Number(params.cik)<1)throw Object.assign(Error('Choose a valid SEC company.'),{status:400});
      const cik=Number(params.cik);
      return cached('facts:'+cik,12*3600000,async()=>C.parseFinancials(await json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10,'0')}.json`),cik,now()));
    }
    if(action==='history') {
      if(!C.symbolMap[params.symbol]||C.symbolMap[params.symbol].group==='FX')throw Object.assign(Error('Choose a supported USD instrument.'),{status:400});
      return history(params.symbol);
    }
    if(action==='quotes') {
      const symbols=[...new Set(String(params.symbols||'').split(','))];
      if(!symbols.length||symbols.length>40||symbols.some(s=>!C.symbolMap[s]))throw Object.assign(Error('Choose 1–40 supported instruments.'),{status:400});
      const quotes={},errors={};let cursor=0;
      await Promise.all(Array.from({length:Math.min(4,symbols.length)},async()=>{
        while(cursor<symbols.length){const symbol=symbols[cursor++];try{quotes[symbol]=await quote(symbol);}catch(error){errors[symbol]=error.message;}}
      }));
      return {quotes,errors,fetchedAt:new Date(now()).toISOString()};
    }
    throw Object.assign(Error('Choose a supported research action.'),{status:400});
  }
  return {query};
}
module.exports={createResearchService};
