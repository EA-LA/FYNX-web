const EP='https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
const A='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
(async()=>{
 const d=await (await fetch(`${EP}?edition=global&category=energy`)).json();const u=d.items.find(i=>i.link.includes('news.google')).link;const id=new URL(u).pathname.split('/').pop();
 for(const url of [u,`https://news.google.com/rss/articles/${id}?hl=en-US&gl=US&ceid=US:en`,`https://news.google.com/articles/${id}?hl=en-US&gl=US&ceid=US:en`,`https://news.google.com/read/${id}?hl=en-US&gl=US&ceid=US:en`]){
  const r=await fetch(url,{headers:{'User-Agent':A,'Cookie':'CONSENT=YES+'}});const b=await r.text();
  console.log('G',r.status,r.url.slice(0,90),b.length,'sg',/data-n-a-sg/.test(b),'ts',/data-n-a-ts/.test(b));
  const m=b.match(/data-n-a-[a-z]+="[^"]{0,40}/g);console.log('GA',JSON.stringify(m).slice(0,300));console.log('GB',b.replace(/\s+/g,' ').slice(0,400));
 }
})();
