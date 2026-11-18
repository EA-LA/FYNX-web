'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildSync}=require('esbuild');
const {EdgeStore}=require('../../backend/edge/store.cjs');
const {validateHeartbeat,createProtectionService,pragueDate}=require('../../backend/edge/identity.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'account-ea-'));
buildSync({entryPoints:[path.join(__dirname,'../../lib/quant/ea.ts')],outfile:path.join(dir,'ea.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const {generateEA,generateAccountMonitorEA}=require(path.join(dir,'ea.cjs'));process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
const NOW=Date.parse('2026-11-03T12:00:00Z');
function report(version=2){return {version,sentAt:NOW/1000,accountRef:'Broker-Demo:12345',currency:'USD',balance:10000,equity:10010,initialBalance:10000,dayStartEquity:null,dayStartBalance:null,dayStartDate:pragueDate(NOW),highWaterBalance:null,ruleId:'2-step',phase:1,safetyDailyPct:4,positions:[],instruments:[],...(version===2?{accountMetadata:{margin:0,freeMargin:10010,leverage:100,accountMode:'hedging'},accountHistory:{brokerTimezone:'Europe/Helsinki',fromBrokerTime:'2026-11-01 00:00:00.000',toBrokerTime:'2026-11-03 14:00:00.999',complete:true,deals:[{id:'10',positionId:'20',orderId:'30',brokerTime:'2026-11-03 12:00:00.123',type:'sell',entryType:'out',rawSymbol:'EURUSD.r',volume:.1,price:1.1,profit:10,commission:-1,swap:0,fee:0,sl:1.09,tp:1.12,magic:'770101'}]}}:{})};}
test('v1 stays strict and v2 requires bounded schema, real dates and explicit timezone',()=>{
  assert.equal(validateHeartbeat(report(1),NOW).version,1);assert.equal(validateHeartbeat(report(),NOW).accountHistory.deals.length,1);
  const unknown=report(1);unknown.accountHistory=report().accountHistory;assert.throws(()=>validateHeartbeat(unknown,NOW),/fields/);
  for(const mutate of [b=>b.accountHistory.brokerTimezone='',b=>b.accountHistory.brokerTimezone='GuessBrokerZone',b=>b.accountHistory.deals[0].brokerTime='2026-02-31 00:00:00.000',b=>b.accountHistory.deals[0].apiKey='secret',b=>b.accountHistory.deals.push({...b.accountHistory.deals[0]}),b=>b.accountHistory.complete='true',b=>b.accountHistory.deals[0].profit=Infinity,b=>b.accountHistory.deals[0].type='withdraw-now',b=>b.accountHistory.deals=Array.from({length:101},(_,i)=>({...b.accountHistory.deals[0],id:String(i)})),b=>delete b.accountMetadata]) {const b=report();mutate(b);assert.throws(()=>validateHeartbeat(b,NOW));}
});
test('Accounts hook receives verified owner/token binding after persistence and never raw account credentials',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'account-hook-')),store=new EdgeStore(root),received=[];
  let clock=NOW;const service=createProtectionService({store,now:()=>clock,env:{},onHeartbeat:async value=>{assert.ok((await store.scan('ea_heartbeats')).some(row=>row.uid===value.uid&&row.accountHash===value.accountHash));received.push(value);}});
  try {const created=await service.createToken({uid:'owner-a',email:'a@example.test',emailVerified:true,authTime:NOW/1000},'Monitor');
    await assert.rejects(service.receive('invalid',report()));assert.equal(received.length,0);
    await service.receive(created.token,report());assert.equal(received.length,1);assert.equal(received[0].uid,'owner-a');assert.equal(received[0].tokenId,created.id);assert.match(received[0].accountHash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(received).includes(created.token),false);assert.equal(JSON.stringify(received).includes('Broker-Demo:12345'),false);
    await assert.rejects(service.receive(created.token,report()),/replay/);assert.equal(received.length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('failed history ingestion gives a safe retry outcome without leaking hook errors',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'account-hook-fail-')),store=new EdgeStore(root);let clock=NOW,calls=0;
  const service=createProtectionService({store,now:()=>clock,env:{},onHeartbeat:async()=>{calls++;if(calls===1)throw new Error('secret-CANARY');}});
  try {const token=(await service.createToken({uid:'a',email:'a@example.test',emailVerified:true,authTime:NOW/1000},'Monitor')).token;
    await assert.rejects(service.receive(token,report()),e=>e.code==='ACCOUNT_HISTORY_PENDING'&&!String(e).includes('CANARY'));
    clock+=60000;const retry=report();retry.sentAt=clock/1000;await service.receive(token,retry);assert.equal(calls,2);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('standalone account monitor has no trade commands and history advances only after acknowledgement',()=>{
  const {source:s,filename}=generateAccountMonitorEA();assert.equal(filename,'FynxAccountMonitor.mq5');
  assert.doesNotMatch(s,/#include <Trade|CTrade|OrderSend\s*\(|OrderSendAsync\s*\(|PositionClose\s*\(|PositionModify\s*\(|trade\.Buy|trade\.Sell|void OnTick/);
  assert.match(s,/input double InpInitBal = 0/);assert.match(s,/input bool InpEdgeEnabled = false/);assert.match(s,/input bool InpAccountsHistoryEnabled = false/);assert.match(s,/input string InpAccountsBrokerTimezone = ""/);
  assert.match(s,/tickets\[100\]/);assert.match(s,/total<=100000/);assert.match(s,/status==202&&AccountsEnabled\(\)/);assert.match(s,/DEAL_POSITION_ID/);assert.match(s,/DEAL_TIME_MSC/);assert.match(s,/DEAL_FEE/);
  assert.doesNotMatch(s,/GlobalVariableSet\([^;]*(?:InpEdgeToken|accountsCursor)/);assert.match(s,/return name;/);
  const trading=generateEA({platform:'mt5',symbol:'EURUSD',timeframe:'D1',params:{mode:'ohlc'}}).source;assert.match(trading,/AccountsEnabled\(\)\?"2":"1"/);assert.match(trading,/POSITION_IDENTIFIER/);
});
test('generated reset-state transitions discard legacy samples and never turn late closes or deposits into midnight facts',()=>{
  const vm=require('node:vm');
  for(const source of [generateAccountMonitorEA().source,generateEA({platform:'mt5',symbol:'EURUSD',timeframe:'D1',params:{mode:'ohlc'}}).source]){
    // Execute the actual generated, arithmetic-only state functions after removing
    // MQL declarations/casts. This does not claim a native MQL compilation.
    const functions=['EdgeSaveBaseline','EdgeInitialize','EdgeAdvanceDay'].map(name=>{
      const match=source.match(new RegExp('void '+name+'\\(([^)]*)\\)\\{([\\s\\S]*?)\\n\\}'));
      assert.ok(match,name);return 'function '+name+'('+match[1].replace('int ','')+'){'+match[2].replace(/\(int\)/g,'')+'\n}';
    }).join('\n');
    const saved=new Map([['test_edgeDay',20261103],['test_edgeBalance',10000],['test_edgeHigh',11000]]);
    const state={guardKey:'test_',edgeDay:0,edgeDayBalance:0,edgeDayEquity:0,edgeHighBalance:0,InpEdgeBaselineDate:'',InpEdgeDayStartBalance:0,InpEdgeDayStartEquity:0,InpEdgeHighWaterBalance:0,PragueDay:()=>20261103,EdgeDayString:d=>String(d).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),GlobalVariableCheck:k=>saved.has(k),GlobalVariableGet:k=>saved.get(k)||0,GlobalVariableSet:(k,v)=>saved.set(k,v),GlobalVariablesFlush:()=>{}};
    vm.createContext(state);vm.runInContext(functions,state);state.EdgeInitialize();
    assert.equal(state.edgeDayBalance,0,'legacy approximate state is not restored');assert.equal(state.edgeHighBalance,0);
    Object.assign(state,{InpEdgeBaselineDate:'2026-11-03',InpEdgeDayStartBalance:10000,InpEdgeDayStartEquity:9990,InpEdgeHighWaterBalance:11000});state.EdgeInitialize();
    assert.deepEqual([state.edgeDayBalance,state.edgeDayEquity,state.edgeHighBalance],[10000,9990,11000]);
    Object.assign(state,{Balance:()=>12000,Equity:()=>11900,edgeLastObserved:1,edgePreviousBalance:10000,dayStartEq:11900});
    state.EdgeAdvanceDay(20261104);
    assert.deepEqual([state.edgeDayBalance,state.edgeDayEquity,state.edgeHighBalance],[0,0,0],'post-midnight close/deposit cannot supply any reset fact');
    state.PragueDay=()=>20261104;state.EdgeInitialize();assert.equal(state.edgeDayBalance,0,'restart and yesterday inputs remain unknown');
    assert.equal(saved.get('test_edgeBasisVersion'),2);
    const payload=source.slice(source.indexOf('string body='),source.indexOf('uchar encoded[]'));
    assert.match(payload,/EdgePositive\(edgeDayEquity\)/);assert.doesNotMatch(payload,/\bwaitingForDay\b|\bdayStartEq\b/);
  }
});
test('revocation waits for accepted report persistence so deletion cannot be undone by a late heartbeat',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'account-hook-delete-')),store=new EdgeStore(root);
 let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),put=store.put.bind(store);let held=false;
 store.put=async(table,id,value)=>{if(table==='ea_heartbeats'&&!held){held=true;entered();await gate;}return put(table,id,value);};
 const service=createProtectionService({store,now:()=>NOW,env:{}});
 try{const created=await service.createToken({uid:'owner-a',email:'a@example.test',emailVerified:true,authTime:NOW/1000},'Monitor'),token=(await store.scan('ea_tokens'))[0];
  const pending=service.receive(created.token,report(1));await started;
  const removal=(async()=>{await store.mutate('ea_tokens',token.tokenHash,old=>({...old,revokedAt:new Date(NOW).toISOString()}));for(const row of await store.scanEntries('ea_heartbeats'))if(row.value.uid==='owner-a')await store.delete('ea_heartbeats',row.id);})();
  release();await Promise.all([pending,removal]);assert.equal((await store.scan('ea_heartbeats')).length,0);assert.ok((await store.get('ea_tokens',token.tokenHash)).revokedAt);
  await assert.rejects(service.receive(created.token,report(1)),e=>e.code==='INVALID_EA_TOKEN');
 }finally{release();fs.rmSync(root,{recursive:true,force:true});}
});
test('an explicit Accounts Guard source preserves its unavailable state instead of falling back to another account',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'account-guard-source-')),store=new EdgeStore(root);let selected=null;
 const service=createProtectionService({store,now:()=>NOW,env:{},guardResolver:async uid=>{assert.equal(uid,'owner-a');return selected;}});
 try{assert.equal((await service.guardFor('owner-a')).connected,false);selected={connected:false,status:'delayed',accountId:'selected-account',reasons:['Actual selected account observations are stale.']};assert.deepEqual(await service.guardFor('owner-a'),selected);selected={...selected,connected:true,status:'live',equity:10000,instruments:[]};assert.deepEqual(await service.guardFor('owner-a'),selected);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
