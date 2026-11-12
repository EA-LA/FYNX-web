const H={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36','Accept':'application/json, text/plain, */*','Origin':'https://www.nasdaq.com','Referer':'https://www.nasdaq.com/'};
const get=async(u,h=H)=>{const t0=Date.now();const r=await fetch(u,{headers:h,signal:AbortSignal.timeout(40000)});const t=await r.text();return [r.status,t,Date.now()-t0];};
(async()=>{
 let [s,t,ms]=await get('https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true');
 console.log('NQ',s,ms,t.length);try{const d=JSON.parse(t);const rows=d.data.rows;console.log('NQROWS',rows.length,JSON.stringify(rows.slice(0,2)),JSON.stringify(d.data.headers));console.log('NQAI',JSON.stringify(rows.filter(r=>/\bAI\b|\.ai\b|Artificial/i.test(r.name)).slice(0,30).map(r=>r.symbol+':'+r.lastsale+':'+r.name.slice(0,30))));}catch(e){console.log('NQERR',t.slice(0,300))}
 ;[s,t,ms]=await get('https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true');console.log('ETF',s,ms,t.length,t.slice(0,400));
 ;[s,t,ms]=await get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=1&price_change_percentage=1h,24h,7d',{'User-Agent':'FYNX/1.0','Accept':'application/json'});console.log('CG',s,ms,t.length,t.slice(0,500));
 ;[s,t,ms]=await get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=100&category=artificial-intelligence',{'User-Agent':'FYNX/1.0','Accept':'application/json'});console.log('CGAI',s,ms,t.length,t.slice(0,300));
 ;[s,t,ms]=await get('https://api.coingecko.com/api/v3/coins/categories/list',{'User-Agent':'FYNX/1.0'});console.log('CGCAT',s,t.length,t.slice(0,800));
})();
