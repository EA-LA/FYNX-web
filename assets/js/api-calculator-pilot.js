// First-party rollout: an explicit, authenticated test request. No private API key in the browser.
import {app,auth,authPersistenceReady} from '/auth/firebase.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
const button=document.getElementById('api-check'),output=document.getElementById('api-check-result');
const inputs=['entry','sl','tp'].map(id=>document.getElementById(id));let generation=0;
document.getElementById('clearBtn').addEventListener('click',()=>{generation++;output.textContent='';});
inputs.forEach(el=>el.addEventListener('input',()=>{generation++;output.textContent='';}));
button.addEventListener('click',async()=>{
 const version=++generation;button.disabled=true;output.textContent='Checking with FYNX Risk API…';
 try{
  await authPersistenceReady;
  if(!auth.currentUser){output.textContent='Sign in to your FYNX developer workspace, then return here to check this calculation.';return;}
  const config=await fetch('/api/first-party-pilot.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Pilot configuration unavailable.');return r.json();});
  if(!config.riskRewardEnabled){output.textContent='API verification is temporarily paused. You can still use the calculator.';return;}
  const [entry,stop,target]=inputs.map(el=>el.value.trim());
  document.getElementById('calcBtn').click();
  if(document.getElementById('error').textContent){output.textContent='Correct the prices above before checking with the API.';return;}
  const local=document.getElementById('rrOut').textContent,invoke=httpsCallable(getFunctions(app,'us-central1'),'developerWorkspace');
  await invoke({action:'bootstrap',environment:'test'});
  const {data}=await invoke({action:'run',environment:'test',route:'/v1/risk/risk-reward',input:{entry_price:entry,stop_loss_price:stop,take_profit_price:target,direction:Number(stop)<Number(entry)?'long':'short'}});
  if(version!==generation)return;
  if(data.status!==200)throw new Error(data.error?.message||'API request was rejected.');
  const ratio=Number(data.result.rr_ratio).toFixed(2),match=ratio===local;
  output.textContent=match?`Verified: R:R ${ratio}. The API and calculator agree at the displayed precision. Test request ${data.request_id}.`:`Results differ: calculator ${local}, API ${ratio}. Do not rely on the result until reviewed. Request ${data.request_id}.`;
 }catch(e){if(version===generation)output.textContent='API check unavailable: '+e.message;}
 finally{button.disabled=false;}
});
