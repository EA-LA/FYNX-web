const EP='https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
(async()=>{
 for (const ed of ['global','us']) for (const c of ['all','finance','economics','technology','politics','industries','energy']) {
  const t=Date.now(); try{const r=await fetch(`${EP}?edition=${ed}&category=${c}`,{headers:{Origin:'https://www.fynxfinanceworld.com'}});const d=await r.json();
   const hosts={};for(const i of d.items){const h=new URL(i.link||i.url).hostname;hosts[h]=(hosts[h]||0)+1;}
   const recent=d.items.filter(i=>Date.now()-Date.parse(i.pubDate||i.publishedAt)<864e5).length;
   console.log('FEED',ed,c,r.status,Date.now()-t+'ms','items',d.items.length,'recent24h',recent,'img',d.items.filter(i=>i.image).length,'fetched',d.fetchedAt,JSON.stringify(hosts).slice(0,300));
   if(c==='finance'&&ed==='global')console.log('SAMPLE',JSON.stringify(d.items.slice(0,2)).slice(0,1500));
  }catch(e){console.log('FEED',ed,c,'ERR',e.message,Date.now()-t+'ms')}
 }
 // og:image test on a few article URLs
 const r=await fetch(`${EP}?edition=us&category=finance`);const d=await r.json();
 for(const i of d.items.slice(0,8)){const u=i.link||i.url;try{const p=await fetch(u,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; FYNXFinanceWorld/1.0)'},signal:AbortSignal.timeout(8000)});const h=(await p.text()).slice(0,300000);const m=h.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i);console.log('OG',p.status,p.url.slice(0,90),m?m[0].slice(0,200):'none');}catch(e){console.log('OG ERR',u.slice(0,90),e.message)}}
})();
