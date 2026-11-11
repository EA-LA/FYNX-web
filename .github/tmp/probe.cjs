const {preview}=require('../../fn/preview.js');const market=require('../../fn/market.js');
const EP='https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
(async()=>{
 const links=[];for(const c of ['finance','economics','technology','energy','politics','industries']){const d=await (await fetch(`${EP}?edition=global&category=${c}`)).json();links.push(...d.items.slice(0,3).map(i=>i.link));}
 let ok=0;await Promise.all(links.map(async u=>{const t=Date.now();try{const p=await preview(u);if(p.image)ok++;console.log('PV',Date.now()-t+'ms',u.slice(0,50),'->',p.url.slice(0,70),'|',p.site,'|',(p.image||'NOIMG').slice(0,90));}catch(e){console.log('PV ERR',Date.now()-t+'ms',u.slice(0,60),e.message)}}));
 console.log('PVOK',ok,'/',links.length);
 for(const s of ['XAUUSD=X','XAGUSD=X','GC=F','EURUSD=X','^DJI','^NDX','^GSPC','BTC-USD','ETH-USD']){const res={_h:{},setHeader(){},status(c){this.c=c;return this},json(b){console.log('MK',s,this.c,JSON.stringify(b).slice(0,200))}};await market({method:'GET',query:{op:'quotes',symbols:s}},res);}
 const res={setHeader(){},status(c){this.c=c;return this},json(b){console.log('NEWS',this.c,JSON.stringify(b.news).slice(0,600))}};await market({method:'GET',query:{op:'search',q:'EUR/USD'}},res);
})();
