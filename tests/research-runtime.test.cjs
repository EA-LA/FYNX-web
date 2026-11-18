'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {Records, ResearchQuantStore, ResearchEdgeStore} = require('../backend/research-runtime/records.cjs');
const {ResearchData} = require('../backend/research-runtime/market-data.cjs');
const {PublishedEdge} = require('../backend/research-runtime/edge.cjs');
const {handlers} = require('../backend/research-runtime/service.cjs');
const engine = require('../backend/quant/engine.cjs');

const archiveRoot = path.join(__dirname, '../assets/data/research');
const readArchive = async file => JSON.parse(await fs.readFile(path.join(archiveRoot, file), 'utf8'));

// Mock only the Firestore transport. Actual record keys, compression, owner
// scopes, queries and transaction logic come from the production adapter.
function firestore() {
  const docs = new Map();
  let last = Promise.resolve();
  const ref = key => ({
    path:key,
    async get(){const value=docs.get(key);return {ref:this,exists:!!value,get:field=>value?.[field]};},
    async set(value){docs.set(key,value);},
    async delete(){docs.delete(key);}
  });
  function query(collection,filters=[],limit=Infinity) {
    return {
      doc:id=>ref(collection+'/'+id),
      where(field,operator,value){assert.equal(operator,'==');return query(collection,[...filters,[field,value]],limit);},
      limit:n=>query(collection,filters,n),
      async get(){
        const selected=[...docs].filter(([key,value])=>key.startsWith(collection+'/')&&filters.every(([field,wanted])=>value[field]===wanted)).slice(0,limit);
        return {docs:await Promise.all(selected.map(([key])=>ref(key).get())),empty:!selected.length};
      }
    };
  }
  function writes(){
    const ops=[];
    return {
      get:target=>target.get(),
      set(target,value){ops.push(()=>target.set(value));},
      delete(target){ops.push(()=>target.delete());},
      async commit(){for(const op of ops)await op();}
    };
  }
  return {
    collection:name=>query(name),batch:writes,
    runTransaction(fn){
      const run=last.then(async()=>{const tx=writes();const result=await fn(tx);await tx.commit();return result;});
      last=run.catch(()=>{});return run;
    }
  };
}

test('private research records with the same item ID stay isolated by account and survive concurrent saves; failed transactions roll back',async()=>{
  const records=new Records(firestore());
  const quant=new ResearchQuantStore(records);
  const one={id:'same-id',name:'Alice first',updatedAt:'2026-10-12T10:00:00Z'};
  const two={...one,id:'second-id',name:'Alice second'};
  const bob={...one,name:'Bob settings'};
  await Promise.all([quant.userSave('alice','strategies',one),quant.userSave('bob','strategies',bob),quant.userSave('alice','strategies',two)]);
  assert.deepEqual((await quant.userRead('alice','strategies')).items.map(item=>item.name).sort(),['Alice first','Alice second']);
  assert.deepEqual((await quant.userRead('bob','strategies')).items,[bob]);
  await assert.rejects(records.atomic(async()=>{
    await quant.userSave('alice','strategies',{...one,name:'Uncommitted'});
    assert.equal((await quant.userRead('alice','strategies')).items.find(item=>item.id===one.id).name,'Uncommitted');
    throw new Error('Test rollback');
  }),/Test rollback/);
  assert.equal((await quant.userRead('alice','strategies')).items.find(item=>item.id===one.id).name,'Alice first');
  await quant.userSave('alice','strategies',{...one,name:'Alice updated'});
  await quant.userDelete('alice','strategies','second-id');
  assert.deepEqual((await quant.userRead('alice','strategies')).items.map(item=>item.name),['Alice updated']);
  await records.erase('alice');
  assert.deepEqual((await quant.userRead('alice','strategies')).items,[]);
  assert.deepEqual((await quant.userRead('bob','strategies')).items,[bob]);
});

test('published market observations show guest models only to guests and use only the authenticated user’s saved strategies',async()=>{
  const records=new Records(firestore()),store=new ResearchQuantStore(records),quant=new ResearchData({store});
  quant.file=readArchive;
  const edge=new PublishedEdge({store:new ResearchEdgeStore(records),quant});
  const processed=[];
  edge.protection={guardFor:async()=>({connected:false}),processSnapshot:async(uid,snapshot)=>{processed.push([uid,snapshot.guest]);}};
  const guest=await edge.today({});
  assert.equal(guest.guest,true);assert.equal(guest.publicResearch,true);assert(guest.strategies.length>0);assert(guest.markets.some(m=>m.fits.length));
  await store.userSave('another-user','strategies',{id:'private-other',symbol:'EURUSD',name:'Other user private strategy',params:{...engine.DEFAULT_PARAMS,mode:'ohlc'},timeframe:'D1'});
  await edge.setWatchlist('alice',{symbols:['EURUSD'],timeZone:'UTC'});
  const empty=await edge.today({uid:'alice'});
  assert.equal(empty.guest,false);assert.deepEqual(empty.strategies,[]);
  assert.deepEqual(empty.markets.map(m=>m.symbol),['EURUSD']);assert(empty.markets[0].price.value>0);
  assert.deepEqual(empty.markets[0].fits,[]);assert.equal(empty.bestFit,null);
  await store.userSave('alice','strategies',{id:'private-alice',name:'Owned strategy',symbol:'EURUSD',params:{...engine.DEFAULT_PARAMS,mode:'ohlc'},timeframe:'D1'});
  const owned=await edge.today({uid:'alice'});
  assert.deepEqual(owned.strategies.map(s=>s.id),['private-alice']);assert.deepEqual(owned.markets[0].fits.map(f=>f.strategyId),['private-alice']);
  assert(!JSON.stringify(owned).includes('private-other'));
  assert.deepEqual(processed,[['alice',false],['alice',false]]);
  assert.equal((await edge.today({})).guest,true);
});

// Functions supplies rawBody after it consumes the request stream. Any attempt
// to read that stream again fails this test, just as it would lose the live body.
async function requestRaw(run,route,rawBody,extras={}) {
  const req={method:'POST',url:route,rawBody,headers:{'content-type':'application/json',origin:'https://www.fynxfinanceworld.com',...extras},socket:{remoteAddress:'127.0.0.1'},
    [Symbol.asyncIterator](){throw new Error('Request stream has already been consumed.');}};
  const headers={};
  const response={setHeader(k,v){headers[k.toLowerCase()]=v;},writeHead(code){this.statusCode=code;this.headersSent=true;},end(s){this.body=s?JSON.parse(s):null;}};
  await run(req,response);return {...response,headers};
}
test('cloud handler processes the raw POST body and returns a completed real worker result in its HTTP response',async()=>{
  const run=handlers(new Records(firestore()));
  const bars=(await readArchive('bars/EURUSD-D1.json')).bars.slice(-600);
  const params={...engine.DEFAULT_PARAMS,mode:'ohlc'};
  const expected=engine.backtest(bars,params);
  const response=await requestRaw(run,'/api/quant/backtest',Buffer.from(JSON.stringify({bars,params})));
  assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(response.headers['access-control-allow-origin'],'https://www.fynxfinanceworld.com');
  assert.equal(response.body.status,'complete');
  assert.deepEqual(response.body.result.stats,JSON.parse(JSON.stringify(expected.stats)));
  assert.equal(response.body.result.trades.length,expected.trades.length);
  assert(expected.trades.length>0);
  const bad=await requestRaw(run,'/api/quant/backtest',Buffer.from('{truncated'));
  assert.equal(bad.statusCode,400);assert.match(bad.body.error,/JSON object/);
  const unauth=await requestRaw(run,'/api/quant/strategies',Buffer.from('{"id":"private"}'));
  assert.equal(unauth.statusCode,401);
});
