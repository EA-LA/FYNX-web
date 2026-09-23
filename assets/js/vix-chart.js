(() => {
 const root=document.getElementById('volWidget'),button=document.getElementById('retryVix');let busy=false;
 async function load(){if(busy)return;busy=true;button.disabled=true;
 try{const response=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketAnalytics?kind=vix',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Unavailable');const data=await response.json(),rows=data.rows;
 const values=rows.map(r=>r.close),min=Math.floor(Math.min(...values)-1),max=Math.ceil(Math.max(...values)+1),y=v=>300-(v-min)/(max-min)*260,x=i=>60+i/(rows.length-1)*600;
 root.innerHTML=`<p style="font-size:32px;font-weight:700;margin:16px 0">${values.at(-1).toFixed(2)} <span style="font-size:14px;font-weight:400">VIX · ${rows.at(-1).date}</span></p><svg viewBox="0 0 700 360" style="width:100%;height:auto" role="img" aria-label="Last 90 Cboe VIX daily closing observations">${[min,(min+max)/2,max].map(v=>`<line x1="60" y1="${y(v)}" x2="660" y2="${y(v)}" stroke="currentColor" opacity=".12"/><text x="8" y="${y(v)+5}" fill="currentColor" font-size="14">${v.toFixed(1)}</text>`).join('')}<polyline fill="none" stroke="#50856b" stroke-width="3" points="${rows.map((r,i)=>x(i)+','+y(r.close)).join(' ')}"/><text x="60" y="340" fill="currentColor" font-size="14">${rows[0].date}</text><text x="660" y="340" text-anchor="end" fill="currentColor" font-size="14">${rows.at(-1).date}</text></svg>`;
 const status=document.createElement('p');status.className='desc';status.textContent=(data.stale?'Stale observations · ':'')+'Source date '+data.observationDate+' · Retrieved '+new Date(data.fetchedAt).toLocaleString();root.append(status);
 }catch{root.textContent='Cboe data is temporarily unavailable. Retry or open the source below.';}finally{busy=false;button.disabled=false;}}
 window.FynxVix={load};button.addEventListener('click',load);load();
})();
