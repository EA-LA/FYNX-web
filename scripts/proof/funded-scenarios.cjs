'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
const engine=require('../../backend/developer-engine.cjs'),funded=process.env.FYNX_FUNDED_REPO||path.resolve(__dirname,'../../../fynxfunded');
const ts=require(path.join(funded,'node_modules/typescript'));
const policy={name:'FYNX 2-phase phase 1 baseline',starting_balance:'10000',daily_loss_percent:'5',max_loss_percent:'10',profit_target_percent:'8',max_loss_type:'static',consistency_percent:'40',min_trading_days:5,reset_hour_utc:22,breach_on_touch:false};
const sequence=pnls=>pnls.map((p,i)=>({timestamp:`2026-09-${String(i+1).padStart(2,'0')}T16:00:00Z`,pnl:p}));
const scenarios=[
 {name:'existing/pass-target-and-days',source:'src/test/rulesEngine.test.ts: automatically passes',trades:sequence([200,200,200,100,100]),expected:'eligible'},
 {name:'existing/incomplete',source:'src/test/rulesEngine.test.ts: incomplete account',trades:sequence([100,100]),expected:'active'},
 {name:'existing/daily-breach',source:'src/test/rulesEngine.test.ts: daily loss breach',trades:sequence([-501]),expected:'breached'},
 {name:'policy/static-vs-trailing',trades:sequence([400,400,400,400,400,-400,-400,-400]),expected:'active',reason:'Legacy peak drawdown differs from selected static initial-balance maximum loss.'},
 {name:'policy/consistency',trades:sequence([700,25,25,25,25]),expected:'active',reason:'Legacy progression omits the selected 40% consistency condition.'},
 {name:'policy/intraday-breach-recovery',trades:[{timestamp:'2026-09-01T12:00:00Z',pnl:-501},{timestamp:'2026-09-01T16:00:00Z',pnl:701},...sequence([200,200,200,200]).map((t,i)=>({...t,timestamp:`2026-09-0${i+2}T16:00:00Z`}))],expected:'breached',reason:'Net daily P&L can hide an earlier hard breach.'},
 {name:'policy/daily-balance-reference',trades:sequence([400,400,400,400,400,-550]),expected:'eligible',reason:'Legacy percentage uses initial balance; selected daily floor uses prior closing balance.'},
 {name:'policy/reset-hour',trades:[{timestamp:'2026-09-01T21:30:00Z',pnl:100},{timestamp:'2026-09-01T22:30:00Z',pnl:100}],expected:'active',reason:'UTC calendar dates differ from the selected 22:00 UTC trading-day reset.'},
 {name:'policy/touch-daily-limit',trades:sequence([-500]),expected:'active'},
];
function load(file,stubs,append=''){const source=fs.readFileSync(path.join(funded,file),'utf8'),compiled=ts.transpileModule(source+append,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};vm.runInNewContext(compiled,{module,exports:module.exports,require:name=>{if(!(name in stubs))throw new Error('Unexpected import '+name);return stubs[name];},console},{filename:file});return {api:module.exports,sha256:createHash('sha256').update(source).digest('hex')};}
async function run(){
 const client=load('src/services/rules-engine.ts',{'./database':{dataService:{addAuditLog:async()=>{}}}}),rows=[];
 for(const scenario of scenarios){
  const trades=scenario.trades.map((t,i)=>({tradeId:'fixture-'+i,closeTime:t.timestamp,openTime:t.timestamp,pnl:t.pnl,commission:0,symbol:'EURUSD',type:'buy',lots:1}));
  let balance=10000;const equity=trades.map(t=>({timestamp:t.closeTime,balance:balance+=t.pnl,equity:balance}));
  const oldClient=await client.api.evaluateRules('fixture',{accountSize:10000,profitTargetPct:8,dailyLossPct:5,maxLossPct:10,minTradingDays:5},{getTrades:async()=>trades,getEquityTimeline:async()=>equity});
  const docs=trades.map((t,i)=>({id:'fixture-'+i,data:()=>t}));const store={collection:name=>({doc:()=>({get:async()=>({exists:true,data:()=>({phase:'2-phase',accountSize:10000,currentPhase:1})})}),where:()=>({get:async()=>({empty:false,docs})})}),batch:()=>({set:()=>{},commit:async()=>{}})};
  const oldServer=load('functions/src/challengeProgression.ts',{'firebase-admin':{firestore:Object.assign(()=>store,{Timestamp:class{},FieldValue:{serverTimestamp:()=>0}})},'firebase-functions/v2/firestore':{onDocumentWritten:()=>null},'firebase-functions/v2/https':{onCall:()=>null,HttpsError:Error}},'\nexport { evaluateChallenge };');
  const old=await oldServer.api.evaluateChallenge('fixture','proof');const rule=engine.rules(policy);let a=engine.account(rule,'2026-09-01T00:00:00Z');
  for(const t of trades)a=engine.event(a,rule,{sequence:a.sequence+1,event_type:'closed_trade',timestamp:t.closeTime,realized_pnl:String(t.pnl),unrealized_pnl_after:'0',open_position_count:0});
  if(a.status!==scenario.expected)throw new Error(scenario.name+' unexpected API result '+a.status);
  const normalized=x=>({passed:'eligible',failed:'breached',active:'active'}[x]);
  const match=normalized(old.status)===a.status&&old.metrics.tradingDays===a.metrics.trading_days;
  rows.push({scenario:scenario.name,kind:'synthetic_regression_not_customer_history',legacy_client:oldClient.status,legacy_server:old.status,api:a.status,legacy_days:old.metrics.tradingDays,api_days:a.metrics.trading_days,match,explanation:scenario.reason||'Equivalent under these fixture inputs.'});
 }
 return {sources:{client_sha256:client.sha256,server_sha256:createHash('sha256').update(fs.readFileSync(path.join(funded,'functions/src/challengeProgression.ts'))).digest('hex')},rows,excluded_existing_fixtures:[{name:'maximum drawdown breach',reason:'Standalone equity values have no linked realized/open-position event stream; cannot claim a historical replay.'},{name:'exact configured limits',reason:'Trade loss -500 and equity/balance 9000 cannot be reconciled without missing position or adjustment data.'}]};
}
module.exports={run,scenarios,policy};
if(require.main===module)run().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
