const {preview}=require('../../fn/preview.js');
const EP='https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
(async()=>{
 const links=[];for(const c of ['finance','economics','technology','energy','politics','industries']){const d=await (await fetch(`${EP}?edition=global&category=${c}`)).json();links.push(...d.items.filter(i=>i.link.includes('news.google')).slice(0,4).map(i=>i.link));}
 let ok=0;await Promise.all(links.map(async u=>{const t=Date.now();try{const p=await preview(u);if(p.image)ok++;console.log('PV',Date.now()-t+'ms','->',p.url.slice(0,70),'|',p.site,'|',(p.image||'NOIMG').slice(0,90));}catch(e){console.log('PV ERR',Date.now()-t+'ms',e.message)}}));
 console.log('PVOK',ok,'/',links.length);
})();
