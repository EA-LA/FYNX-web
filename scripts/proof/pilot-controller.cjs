const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../../assets/js/api-calculator-pilot.js'),'utf8').replace(/^import .*;$/gm,'');
const tick=()=>new Promise(r=>setImmediate(r));
async function scenario({signedIn=true,enabled=true,result='3',pending=false,invalid=false}={}){
 const dom=new JSDOM('<input id="entry"><button id="api-check">Check</button><p id="api-check-result"></p>',{runScripts:'outside-only'}),w=dom.window,calls=[];
 let resolve;
 w.auth={currentUser:signedIn?{}:null};w.app={};w.authPersistenceReady=Promise.resolve();w.getFunctions=()=>({});
 w.fetch=async()=>({ok:true,json:async()=>({riskRewardEnabled:enabled})});
 w.fynxRiskPilot=async()=>{if(invalid)throw new Error('Invalid input');return {endpoint:'risk-reward',input:{entry_price:'100'},resultKey:'rr_ratio',precision:2,local:'3.00'};};
 w.httpsCallable=()=>async request=>{calls.push(request);if(request.action==='bootstrap')return {};if(pending)return await new Promise(r=>{resolve=r;});return {data:{status:200,result:{rr_ratio:result},request_id:'qa-request'}};};
 w.eval(source);w.document.getElementById('api-check').click();await tick();await tick();
 if(pending){w.document.getElementById('entry').dispatchEvent(new w.Event('input',{bubbles:true}));resolve({data:{status:200,result:{rr_ratio:'3'},request_id:'stale'}});await tick();}
 const text=w.document.getElementById('api-check-result').textContent;
 assert(calls.every(c=>c.environment==='test'));
 assert.equal(w.document.getElementById('api-check').disabled,false);
 w.close();return {text,calls};
}
(async()=>{
 assert.match((await scenario()).text,/Verified: 3.00/);
 assert.match((await scenario({result:'4'})).text,/Results differ/);
 for(const opts of [{signedIn:false},{enabled:false},{invalid:true}])assert.equal((await scenario(opts)).calls.length,0);
 assert.equal((await scenario({pending:true})).text,'');
 console.log('PASS: controller test-only requests, sign-in gate, kill switch, validation, mismatch display and stale-response suppression.');
})().catch(e=>{console.error(e);process.exitCode=1;});
