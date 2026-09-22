// Explicit test requests only. Private keys never enter browser code.
import {app,auth,authPersistenceReady} from '/auth/firebase.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
const button=document.getElementById('api-check'),output=document.getElementById('api-check-result');
let generation=0;
function invalidate(){generation++;output.textContent='';}
// Capture edits, presets, side/multiplier changes and clears before local handlers.
for(const event of ['input','change'])document.addEventListener(event,invalidate,true);
document.addEventListener('click',event=>{if(event.target.closest('button')!==button&&event.target.closest('button'))invalidate();},true);
button.addEventListener('click',async()=>{
 const version=++generation;button.disabled=true;output.textContent='Checking with FYNX Risk API…';
 try{
  await authPersistenceReady;
  if(version!==generation)return;
  if(!auth.currentUser){output.textContent='Sign in to your FYNX developer workspace, then return here to check this calculation.';return;}
  const config=await fetch('/api/first-party-pilot.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Pilot configuration unavailable.');return r.json();});
  if(version!==generation)return;
  const sample=await window.fynxRiskPilot();
  if(version!==generation)return;
  const enabled=sample.endpoint==='risk-reward'?config.riskRewardEnabled===true:Array.isArray(config.enabledCalculators)&&config.enabledCalculators.includes(sample.endpoint);
  if(!enabled){output.textContent='API verification is temporarily paused. You can still use the calculator.';return;}
  const invoke=httpsCallable(getFunctions(app,'us-central1'),'developerWorkspace');
  await invoke({action:'bootstrap',environment:'test'});
  if(version!==generation)return;
  const {data}=await invoke({action:'run',environment:'test',route:'/v1/risk/'+sample.endpoint,input:sample.input});
  if(version!==generation)return;
  if(data.status!==200)throw new Error(data.error?.message||'API request was rejected.');
  const value=Number(data.result[sample.resultKey]);
  if(!Number.isFinite(value))throw new Error('API returned an invalid result.');
  const formatted=value.toFixed(sample.precision);
  output.textContent=formatted===sample.local?`Verified: ${formatted}. The API and calculator agree at the displayed precision. Test request ${data.request_id}.`:`Results differ: calculator ${sample.local}, API ${formatted}. Review the inputs and model before relying on this result. Request ${data.request_id}.`;
 }catch(e){if(version===generation)output.textContent='API check unavailable: '+e.message;}
 finally{button.disabled=false;}
});
