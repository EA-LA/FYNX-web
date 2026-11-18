'use strict';
// Live MT4/MT5 login (MetaApi) is a FYNX Professional feature: server-side plan check, per-plan limit,
// pause/resume on subscription changes, and the Stripe-backed resolver's verification rules.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {AccountsDB}=require('../../backend/accounts/db.cjs'),{AccountsRepository}=require('../../backend/accounts/repository.cjs'),{AccountsService}=require('../../backend/accounts/service.cjs');
const {createConsumerPlanResolver,meetsPlan}=require('../../backend/accounts/entitlements.cjs'),{PRICES}=require('../../backend/consumer-live-policy.cjs');
let at=Date.parse('2026-11-13T12:00:00Z');const now=()=>at;
function setup(plan,env={}){const db=new AccountsDB({filename:':memory:',now});db.ensureUser({uid:'alice',email:'alice@example.test',emailVerified:true});let calls=0;
  const adapter={enabled:true,configured:true,descriptor:{id:'mt5',scope:'test'}};
  const service=new AccountsService({repository:new AccountsRepository({db}),now,startJobs:false,inlineJobs:false,planResolver:async()=>plan.value,
    registry:{get:()=>{calls++;return adapter;},list:()=>[{id:'mt5',name:'MetaTrader 5',kind:'login',enabled:true,configured:true},{id:'binance',name:'Binance',kind:'apikey',enabled:true,configured:true}],has:()=>true},
    env:{NODE_ENV:'test',ACCOUNTS_ALLOW_LOCAL_KEY:'true',ACCOUNTS_LOCAL_KEK:crypto.randomBytes(32).toString('base64'),ACCOUNTS_FREE_CONNECTION_LIMIT:'5',...env}});
  return{db,service,calls:()=>calls};}
const req=n=>({provider:'mt5',account:{nickname:'Acct '+n,kind:'personal'},credentials:{login:'12345'+n,investorPassword:'fixture',server:'Broker-Live'},consent:true});

test('free, Essential and Plus members cannot start a paid MT login connection; nothing is stored or sent',async()=>{
  for(const tier of [null,'starter','plus']){const plan={value:tier},{service,db,calls}=setup(plan);try{
    await assert.rejects(service.connect('alice',req(1)),e=>e.code==='PLAN_REQUIRED'&&e.status===402&&/Professional/.test(e.message));
    assert.equal(db.get('SELECT COUNT(*) n FROM credentials').n,0);assert.equal(db.get('SELECT COUNT(*) n FROM broker_connections').n,0);assert.equal(calls(),0,'provider never touched');
  }finally{await service.close();}}
});
test('Professional members can connect, up to the configured live MT limit',async()=>{
  const {service,db}=setup({value:'pro'},{ACCOUNTS_PRO_MT_CONNECTIONS:'1'});try{
    const r=await service.connect('alice',req(1));assert.ok(r.connectionId);
    await assert.rejects(service.connect('alice',req(2)),{code:'MT_CONNECTION_LIMIT'});
    assert.equal(db.get("SELECT COUNT(*) n FROM broker_connections WHERE provider='mt5'").n,1);
  }finally{await service.close();}
  const two=setup({value:'pro'},{ACCOUNTS_PRO_MT_CONNECTIONS:'2'});try{await two.service.connect('alice',req(1));await two.service.connect('alice',req(2));}finally{await two.service.close();}
});
test('without a plan resolver (no billing configured) everyone is refused by default',async()=>{
  const db=new AccountsDB({filename:':memory:',now});db.ensureUser({uid:'alice',emailVerified:true});
  const service=new AccountsService({repository:new AccountsRepository({db}),now,startJobs:false,registry:{get:()=>({enabled:true,configured:true,descriptor:{}}),list:()=>[]},env:{NODE_ENV:'test',ACCOUNTS_ALLOW_LOCAL_KEY:'true',ACCOUNTS_LOCAL_KEK:crypto.randomBytes(32).toString('base64')}});
  try{await assert.rejects(service.connect('alice',req(1)),{code:'PLAN_REQUIRED'});}finally{await service.close();}
});
test('providers list tells the page which plan unlocks MT login, per member',async()=>{
  const plan={value:'plus'},{service}=setup(plan);try{
    let r=await service.providersFor('alice');const mt=r.providers.find(p=>p.id==='mt5');assert.equal(r.plan,'plus');assert.equal(mt.requiredPlan,'pro');assert.equal(mt.planAllowed,false);
    assert.equal(r.providers.find(p=>p.id==='binance').requiredPlan,undefined);
    plan.value='pro';r=await service.providersFor('alice');assert.equal(r.providers.find(p=>p.id==='mt5').planAllowed,true);
  }finally{await service.close();}
});
test('a lapsed subscription pauses syncing (no provider usage) and renewal resumes it',async()=>{
  const plan={value:'pro'},{service,db}=setup(plan);try{
    const {connectionId}=await service.connect('alice',req(1));db.run("UPDATE broker_connections SET status='live',last_sync_at=? WHERE id=?",new Date(at).toISOString(),connectionId);
    plan.value=null;await service.schedule();let c=db.get('SELECT status,error_code FROM broker_connections WHERE id=?',connectionId);assert.deepEqual({...c},{status:'paused',error_code:'PLAN_REQUIRED'});
    assert.equal(db.get("SELECT COUNT(*) n FROM provider_jobs WHERE kind='sync'").n,0);
    plan.value='pro';await service.schedule();c=db.get('SELECT status,error_code FROM broker_connections WHERE id=?',connectionId);assert.equal(c.status,'delayed');assert.equal(c.error_code,null);
  }finally{await service.close();}
});
test('meetsPlan ordering: Professional covers every tier, lower tiers do not reach Professional',()=>{
  assert.equal(meetsPlan('pro','pro'),true);assert.equal(meetsPlan('plus','pro'),false);assert.equal(meetsPlan(null,'pro'),false);assert.equal(meetsPlan('pro','plus'),true);
});
test('Stripe resolver only trusts an active, paid, live, correctly priced subscription owned by this member',async()=>{
  const price={id:PRICES.pro,livemode:true,currency:'usd',unit_amount:3099,type:'recurring',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const sub=over=>({customer:'cus_1',status:'active',livemode:true,metadata:{product:'fynx_consumer_live',fynx_uid:'alice',tier:'pro'},items:{data:[{quantity:1,price}]},latest_invoice:{livemode:true,customer:'cus_1',status:'paid'},...over});
  const make=(subs,profile={customer:'cus_1'})=>createConsumerPlanResolver({stripe:{subscriptions:{list:async()=>({data:subs})}},profileOf:async()=>profile,now});
  assert.equal(await make([sub()])('alice'),'pro');
  assert.equal(await make([sub({status:'past_due'})])('alice'),null);
  assert.equal(await make([sub({latest_invoice:{livemode:true,customer:'cus_1',status:'open'}})])('alice'),null);
  assert.equal(await make([sub({metadata:{product:'fynx_consumer_live',fynx_uid:'mallory',tier:'pro'}})])('alice'),null);
  assert.equal(await make([sub()],{})('alice'),null,'no billing customer');
  const failing=createConsumerPlanResolver({stripe:{subscriptions:{list:async()=>{throw new Error('down');}}},profileOf:async()=>({customer:'cus_1'}),now});assert.equal(await failing('alice'),null,'errors never grant access');
});
