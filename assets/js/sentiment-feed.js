(() => {
 const status=document.getElementById('sentimentStatus'),refresh=document.getElementById('sentimentRefresh'),rows=document.getElementById('sentimentHistory');
 async function load(){refresh.disabled=true;status.textContent='Checking the latest daily observation…';try{
  const response=await fetch('https://api.alternative.me/fng/?limit=7',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Feed unavailable');const payload=await response.json();
  const data=payload.data?.filter(x=>x.value!==undefined&&Number.isFinite(Number(x.value))&&Number(x.value)>=0&&Number(x.value)<=100&&Number.isFinite(Number(x.timestamp))&&Number(x.timestamp)>0);if(!data?.length)throw Error('Invalid feed');
  const latest=data[0],date=new Date(Number(latest.timestamp)*1000);document.getElementById('sentimentValue').textContent=latest.value+' / 100';document.getElementById('sentimentClass').textContent=latest.value_classification;document.getElementById('sentimentMeter').value=Number(latest.value);
  status.textContent=`Observation: ${date.toLocaleDateString()} · Daily Bitcoin sentiment index${Date.now()-date.getTime()>172800000?' · Older observation; check the source for updates.':'.'}`;
  rows.replaceChildren();for(const item of data){const tr=document.createElement('tr');for(const value of [new Date(Number(item.timestamp)*1000).toLocaleDateString(),item.value,item.value_classification]){const td=document.createElement('td');td.textContent=value;tr.append(td);}rows.append(tr);}
 }catch{status.textContent='Daily sentiment feed is unavailable. Use the source link or try again. No estimated scores are displayed.';document.getElementById('sentimentValue').textContent='Unavailable';document.getElementById('sentimentClass').textContent='';rows.replaceChildren();document.getElementById('sentimentMeter').removeAttribute('value');}finally{refresh.disabled=false;}}
 refresh.addEventListener('click',load);load();
})();
