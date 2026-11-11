'use strict';
const PAIRS=['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD'];
function pearson(a,b){
 if(a.length!==b.length||a.length<2)return null;
 const mean=x=>x.reduce((s,v)=>s+v,0)/x.length,ma=mean(a),mb=mean(b);
 let covariance=0,va=0,vb=0;
 for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;covariance+=x*y;va+=x*x;vb+=y*y;}
 return va===0||vb===0?null:Math.max(-1,Math.min(1,covariance/Math.sqrt(va*vb)));
}
function correlation(rows,window=60,now=Date.now()){
 if(![30,60,90].includes(window)||!Array.isArray(rows))throw Error('Invalid data');
 const dates=new Map();
 for(const r of rows){if(r.base!=='EUR'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||Date.parse(r.date)>now||!['USD','GBP','JPY','CHF','AUD','CAD'].includes(r.quote)||!Number.isFinite(r.rate)||r.rate<=0)continue;
 const row=dates.get(r.date)||{};row[r.quote]=r.rate;dates.set(r.date,row);}
 const aligned=[...dates].filter(([,r])=>['USD','GBP','JPY','CHF','AUD','CAD'].every(q=>Number.isFinite(r[q]))).sort((a,b)=>a[0].localeCompare(b[0])).slice(-(window+1));
 if(aligned.length!==window+1)throw Error('Not enough aligned observations');
 const values=aligned.map(([,r])=>[r.USD,r.USD/r.GBP,r.JPY/r.USD,r.CHF/r.USD,r.USD/r.AUD,r.CAD/r.USD]);
 const returns=PAIRS.map((_,j)=>values.slice(1).map((r,i)=>r[j]/values[i][j]-1));
 return {pairs:PAIRS,window,observations:window,startDate:aligned[0][0],observationDate:aligned.at(-1)[0],matrix:returns.map(a=>returns.map(b=>pearson(a,b))),source:'ECB reference rates via Frankfurter',method:'Pearson correlation of daily simple returns on aligned observation dates. Cross rates derived from EUR reference rates.'};
}
function liquidity(book,product,now=Date.now()){
 const bid=Number(book?.bids?.[0]?.[0]),ask=Number(book?.asks?.[0]?.[0]),bidSize=Number(book?.bids?.[0]?.[1]),askSize=Number(book?.asks?.[0]?.[1]);
 const time=Date.parse(book?.time);
 if(![bid,ask,bidSize,askSize].every(n=>Number.isFinite(n)&&n>0)||ask<bid||!Number.isFinite(time)||time>now+5000||now-time>60000||book.auction_mode===true)throw Error('Invalid, stale, or auction order book');
 const mid=(bid+ask)/2;
 return {product,bid,ask,bidSize,askSize,spread:ask-bid,spreadBps:(ask-bid)/mid*10000,observationTime:book.time,sequence:book.sequence,source:'Coinbase Exchange',depth:1};
}
module.exports={pearson,correlation,liquidity};
