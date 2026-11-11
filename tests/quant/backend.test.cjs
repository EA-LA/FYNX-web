'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { Store } = require('../../backend/quant/store.cjs');
const { range } = require('../../backend/quant/common.cjs');
const { DukascopyProvider, TwelveDataQuotes, TradingEconomicsCalendar, normalizeEvent, aggregate } = require('../../backend/quant/providers.cjs');
const { QuantData } = require('../../backend/quant/data.cjs');
const { JobQueue } = require('../../backend/quant/jobs.cjs');
const { createQuantAPI, RateLimiter } = require('../../backend/quant/api.cjs');
const { partitionPlan } = require('../../backend/quant/history-plan.cjs');
const { ingest } = require('../../backend/quant/ingest.cjs');
const { validateSaved } = require('../../backend/quant/auth.cjs');
const { publicFile } = require('../../scripts/quant-dev-server.cjs');
async function temporary(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fynx-quant-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return new Store(root); }
function fixtureBars() { return Array.from({ length: 160 }, (_, i) => ({ time: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(), open: 1 + i * .001, close: 1 + i * .001 + Math.sin(i) * .001, high: 1 + i * .001 + .003, low: 1 + i * .001 - .003 })); }
test('range accepts ISO dates and rejects rollover/ambiguous/oversized requests', () => { assert.equal(range('2024-01-01', '2024-02-01').days, 31); for (const value of ['2024-02-30', '01/01/2024', '0']) assert.throws(() => range(value, '2024-03-01')); assert.throws(() => range('2000-01-01', '2024-01-01')); });
test('gzip store rejects traversal, persists atomically and isolates verified users', async t => { const store = await temporary(t); await store.write('history/test', { source: 'test-fixture', n: 1 }); assert.equal((await store.read('history/test')).n, 1); assert.throws(() => store.file('../../secrets')); await Promise.all([store.userSave('u1', 'strategies', { id: 'a', name: 'A' }), store.userSave('u1', 'strategies', { id: 'b', name: 'B' })]); assert.equal((await store.userRead('u1', 'strategies')).items.length, 2); assert.deepEqual((await store.userRead('u2', 'strategies')).items, []); });
test('Dukascopy adapter validates OHLC, excludes unfinished candles and retains tick bid/ask', async () => { const from = '2024-01-01T00:00:00Z', to = '2024-01-02T12:00:00Z'; const base = { timestamp: Date.parse(from), open: 1, high: 2, low: .5, close: 1.5 }; const p = new DukascopyProvider({ download: async () => [base, { ...base, timestamp: Date.parse('2024-01-02T00:00:00Z') }] }); assert.equal((await p.history({ symbol: { dukascopy: 'eurusd' }, timeframe: 'D1', from, to })).length, 1); const broken = new DukascopyProvider({ download: async () => [{ ...base, high: .2 }] }); await assert.rejects(() => broken.history({ symbol: {}, timeframe: 'D1', from, to }), /invalid candle/); const ticks = new DukascopyProvider({ download: async () => [{ timestamp: Date.parse(from), bidPrice: 1, askPrice: 1.01 }] }); assert.equal((await ticks.history({ symbol: {}, timeframe: 'TICK', from, to }))[0].ask, 1.01); });
test('aggregation preserves OHLC and actual tick execution data', () => { const bars = aggregate([{ time: '2024-01-01T00:00:01Z', bid: 1, ask: 1.01 }, { time: '2024-01-01T00:00:30Z', bid: 2, ask: 2.01 }], 'M1', { tick: true, includeTicks: true }); assert.deepEqual([bars[0].open, bars[0].high, bars[0].low, bars[0].close], [1, 2, 1, 2]); assert.equal(bars[0].ticks.length, 2); });
test('unconfigured quote/calendar providers fail explicitly without synthetic records', async () => { await assert.rejects(() => new TwelveDataQuotes({ key: '' }).quote({}), /QUANT_QUOTES_API_KEY/); await assert.rejects(() => new TradingEconomicsCalendar({ key: '' }).calendar({}), /QUANT_CALENDAR_API_KEY/); });
test('calendar normalization keeps actual/forecast/previous and estimated timing', () => { const e = normalizeEvent({ CalendarId: '1', Date: '2024-01-05T13:30:00', Event: 'Non Farm Payrolls', Country: 'United States', Importance: 3, DateSpan: '1', Actual: '216K', Forecast: '170K', Previous: '173K' }); assert.equal(e.time, '2024-01-05T13:30:00.000Z'); assert.equal(e.currency, 'USD'); assert.equal(e.type, 'NFP'); assert.equal(e.timing, 'estimated'); assert.equal(e.actual, '216K'); assert.equal(e.forecast, '170K'); });
test('data requests retain source and update provenance, cache identical work and reject unknown instruments', async t => { const store = await temporary(t); let calls = 0; const data = new QuantData({ store, history: { history: async () => { calls++; return fixtureBars(); } } }); const a = await data.bars({ symbol: 'EURUSD', tf: 'D1', from: '2024-01-01', to: '2024-07-01' }); await data.bars({ symbol: 'EURUSD', tf: 'D1', from: '2024-01-01', to: '2024-07-01' }); assert.equal(calls, 1); assert.equal(a.source, 'Dukascopy'); assert.equal(a.priceSide, 'bid'); assert.ok(a.updatedAt); await assert.rejects(() => data.bars({ symbol: '../../x' }), /supported Quant/); await assert.rejects(() => data.bars({ symbol: 'EURUSD', tf: 'tick', from: '2024-01-01', to: '2024-07-01' }), /not fully stored/); });
test('history imports resume completed gzip partitions and report actual incomplete budget state', async t => { const store = await temporary(t); let calls = 0; const provider = { history: async ({ from }) => { calls++; return [{ time: from, bid: 1, ask: 1.01 }]; } }; const options = { symbol: 'XAUUSD', tf: 'tick', from: '2024-01-01T00:00:00Z', to: '2024-01-01T02:00:00Z', maxChunks: 1, store, provider }; const first = await ingest(options); assert.equal(first.complete, false); assert.equal(first.chunksDownloaded, 1); const second = await ingest(options); assert.equal(second.complete, true); assert.equal(second.chunksReused, 1); assert.equal(second.chunksDownloaded, 1); assert.equal(calls, 2); const manifest = await store.read('history/XAUUSD/TICK/manifest'); assert.equal(manifest.chunks.length, 2); });
test('rate limiter rejects a peer after quota and resets after window', () => { let clock = 0; const limiter = new RateLimiter({ limit: 2, windowMs: 1000, now: () => clock }); limiter.take('peer'); limiter.take('peer'); assert.throws(() => limiter.take('peer'), /Too many/); clock = 1001; assert.doesNotThrow(() => limiter.take('peer')); });
test('private save validation rejects invalid dates and caller-injected identity', () => { const good = validateSaved({ name: 'Strategy', symbol: 'EURUSD', timeframe: 'D1', returns: [{ date: '2024-01-01', return: .01 }], uid: 'victim' }, 'strategies'); assert.equal(good.uid, undefined); assert.throws(() => validateSaved({ name: 'Bad', symbol: 'EURUSD', timeframe: 'D1', returns: [{ date: '2024-02-30', return: .01 }] }, 'strategies'), /Invalid/); });
test('preview static server blocks private files and traversal', () => { for (const request of ['/.env', '/backend/quant/auth.cjs', '/scripts/quant-history.cjs', '/../package.json', '/%2eenv', '/package-lock.json', '/docs/quant-data.md']) assert.equal(publicFile(request), null); assert.ok(publicFile('/favicon-32x32.png')); });
test('worker queue computes off-thread, caches the full input and expires opaque results', async t => { let now = Date.now(); const jobs = new JobQueue({ concurrency: 1, ttl: 60000, now: () => now }); t.after(() => jobs.close()); const payload = { bars: fixtureBars(), params: { mode: 'ohlc' } }; const first = jobs.submit('backtest', payload); assert.match(first.jobId, /^[A-Za-z0-9_-]{32}$/); let job; for (let n = 0; n < 200; n++) { await new Promise(r => setTimeout(r, 10)); job = jobs.get(first.jobId); if (['complete', 'failed'].includes(job.status)) break; } assert.equal(job.status, 'complete', job.error); assert.ok(job.result.dailyReturns.length); assert.equal(jobs.submit('backtest', payload).jobId, first.jobId); assert.notEqual(jobs.submit('backtest', { ...payload, params: { mode: 'ohlc', costPips: 2 } }).jobId, first.jobId); now += 60001; assert.throws(() => jobs.get(first.jobId), /expired/); });
test('API uses verified identity for writes, rejects foreign origins and exposes provider failures', async t => { const store = await temporary(t); const data = new QuantData({ store }); const jobs = new JobQueue(); const api = createQuantAPI({ data, jobs, authenticate: async req => { if (req.headers.authorization !== 'Bearer accepted') throw Object.assign(new Error('Sign in required.'), { status: 401 }); return { uid: 'verified-user' }; } }); const server = http.createServer(async (req, res) => { await api(req, res); }); await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(async () => { await api.close(); await new Promise(r => server.close(r)); }); const base = `http://127.0.0.1:${server.address().port}/api/quant`;
  assert.equal((await fetch(base + '/strategies')).status, 401);
  assert.equal((await fetch(base + '/symbols', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const saved = await fetch(base + '/strategies', { method: 'POST', headers: { Authorization: 'Bearer accepted', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ATR', symbol: 'EURUSD', timeframe: 'D1', params: { lookback: 20 }, uid: 'victim' }) }); assert.equal(saved.status, 200);
  assert.equal((await store.userRead('victim', 'strategies')).items.length, 0); assert.equal((await store.userRead('verified-user', 'strategies')).items.length, 1);
  const read = await (await fetch(base + '/strategies', { headers: { Authorization: 'Bearer accepted' } })).json(); assert.equal(read.strategies.length, 1);
  const quotes = await (await fetch(base + '/quotes?symbols=EURUSD')).json(); assert.equal(quotes.status, 'unavailable'); assert.deepEqual(quotes.quotes, []);
});

test('partition coverage rejects gaps and does not duplicate overlapping history', () => {
  const chunks = [{ key:'a',from:'2024-01-01T00:00:00.000Z',to:'2024-01-01T02:00:00.000Z' },{ key:'b',from:'2024-01-01T01:00:00.000Z',to:'2024-01-01T03:00:00.000Z' }];
  const plan = partitionPlan({chunks},chunks[0].from,chunks[1].to); assert.equal(plan.length,2); assert.equal(plan[1].readFrom,chunks[0].to); assert.throws(()=>partitionPlan({chunks:[chunks[0]]},chunks[0].from,chunks[1].to),/not been fully imported/);
});
test('saved portfolios reject malformed sleeves and preserve imported provenance', () => {
  assert.throws(()=>validateSaved({name:'Bad',sleeves:[{name:'A',returns:[{date:'2024-02-30',return:.01}]}]},'portfolios'),/Invalid/);
  const p=validateSaved({name:'Valid',method:'equal-risk',sleeves:[{name:'A',returns:[{date:'2024-01-01',return:.01}]}],provenance:{source:'csv-realized-trades',warnings:['No intraday equity']}},'portfolios'); assert.equal(p.provenance.warnings.length,1);
});
test('streaming tick jobs read bounded partitions and match in-memory execution', async t => {
  const store=await temporary(t), quotes=Array.from({length:120},(_,i)=>({time:new Date(Date.UTC(2024,0,1,0,i)).toISOString(),bid:1+i*.0001+Math.sin(i)*.0002,ask:1+i*.0001+Math.sin(i)*.0002+.0001}));
  const from=quotes[0].time,to=new Date(Date.UTC(2024,0,1,2,0)).toISOString(),mid=new Date(Date.UTC(2024,0,1,1,0)).toISOString(),updatedAt=new Date().toISOString();
  const chunks=[{key:'history/EURUSD/TICK/chunks/a',from,to:mid},{key:'history/EURUSD/TICK/chunks/b',from:mid,to}];
  for(const chunk of chunks)await store.write(chunk.key,{rows:quotes.filter(q=>q.time>=chunk.from&&q.time<chunk.to)});
  await store.write('history/EURUSD/TICK/manifest',{source:'test-fixture',updatedAt,chunks});
  const data=new QuantData({store}),history=await data.streamingHistory({symbol:'EURUSD',tf:'tick',from,to}),jobs=new JobQueue();t.after(()=>jobs.close());
  const params={mode:'tick'},job=jobs.submit('backtest-history',{history,params});let done;
  for(let n=0;n<200;n++){await new Promise(r=>setTimeout(r,10));done=jobs.get(job.jobId);if(['complete','failed'].includes(done.status))break;}
  assert.equal(done.status,'complete',done.error);const expected=require('../../backend/quant/engine.cjs').backtest(aggregate(quotes,'M1',{tick:true,includeTicks:true}),params);
  assert.deepEqual(done.result.trades,expected.trades);assert.deepEqual(done.result.dailyReturns,expected.dailyReturns);assert.equal(done.result.provenance.recordedTicks,quotes.length);
  const options={entryValues:[0,.25],stopValues:[1,2],minTrades:1};const optimization=jobs.submit('optimize-history',{history,params,options});
  for(let n=0;n<200;n++){await new Promise(r=>setTimeout(r,10));done=jobs.get(optimization.jobId);if(['complete','failed'].includes(done.status))break;}
  assert.equal(done.status,'complete',done.error);const expectedOpt=require('../../backend/quant/engine.cjs').optimize(aggregate(quotes,'M1',{tick:true,includeTicks:true}),params,options);
  assert.deepEqual(done.result.cells,expectedOpt.cells);assert.deepEqual(done.result.best,expectedOpt.best);assert.deepEqual(done.result.inSample?.trades,expectedOpt.inSample?.trades);assert.deepEqual(done.result.outOfSample?.dailyReturns,expectedOpt.outOfSample?.dailyReturns);assert.equal(done.result.splitDate,expectedOpt.splitDate);

});

test('server cancellation terminates long jobs and clears their queued payload', async t => {
  const jobs=new JobQueue({concurrency:1});t.after(()=>jobs.close());const job=jobs.submit('montecarlo',{returns:Array.from({length:252},(_,i)=>Math.sin(i)*.01),options:{paths:10000,horizon:252}});
  const cancelled=jobs.cancel(job.jobId);assert.equal(cancelled.status,'failed');assert.match(cancelled.error,/cancelled/);await new Promise(r=>setTimeout(r,30));assert.equal(jobs.active.size,0);
});

test('missing calendar partitions fail closed instead of labeling missing releases as normal days', async t => {
  const store=await temporary(t),from='2024-01-01T00:00:00.000Z',to='2024-07-01T00:00:00.000Z';
  await store.write('calendar/manifest',{updatedAt:'2024-07-02T00:00:00.000Z',chunks:[{key:'calendar/chunks/missing',from,to}]});
  await assert.rejects(()=>new QuantData({store}).calendar({from,to,symbol:'EURUSD'}),/partition is missing/);
});
test('partial M1 imports do not claim complete coarser-bar coverage', async t => {
  const store=await temporary(t),from='2024-01-01T00:01:00.000Z',to='2024-01-01T00:04:00.000Z';
  const provider={history:async()=>[1,2,3].map(minute=>({time:new Date(Date.UTC(2024,0,1,0,minute)).toISOString(),open:1,high:1.1,low:.9,close:1}))};
  const receipt=await ingest({symbol:'EURUSD',tf:'M1',from,to,store,provider});assert.equal(receipt.complete,true);assert.equal(await store.read('history/EURUSD/M5/manifest'),null);assert.equal(await store.read('history/EURUSD/D1/manifest'),null);
});

test('online tick-to-M1 API excludes incomplete first and last minute bars', async t => {
  const store=await temporary(t),history={history:async()=>['00:00:40','00:01:10','00:02:10'].map(time=>({time:`2024-01-01T${time}.000Z`,bid:1,ask:1.01}))};
  const result=await new QuantData({store,history}).bars({symbol:'EURUSD',tf:'tick',from:'2024-01-01T00:00:30Z',to:'2024-01-01T00:02:30Z'});
  assert.equal(result.completeBarsOnly,true);assert.equal(result.bars.length,1);assert.equal(result.bars[0].time,'2024-01-01T00:01:00.000Z');
});
test('quote provider budget caps a 17-market request, caches fresh quotes and returns stale provenance without waiting', async t => {
  const store=await temporary(t);let now=Date.parse('2024-01-01T00:00:00Z'),calls=0;
  const provider={configured:true,quote:async market=>{calls++;return {symbol:market.id,price:1,asOf:new Date(now-1000).toISOString(),fetchedAt:new Date(now).toISOString(),source:'test-fixture',status:'recent'};}};
  const data=new QuantData({store,quotes:provider,now:()=>now,quoteLimit:8}),ids=require('../../backend/quant/engine.cjs').SYMBOLS.map(s=>s.id);
  const first=await data.quotes(ids.join(','));assert.equal(calls,8);assert.equal(first.quotes.length,8);assert.equal(Object.keys(first.errors).length,9);assert.equal(first.budget.remaining,0);assert.equal(first.retryAfterSeconds,60);
  const repeat=await data.quotes(ids[0]);assert.equal(calls,8);assert.equal(repeat.quotes[0].status,'recent');
  const original=first.quotes[0];now+=60000;const rotated=await data.quotes(ids.slice(8).join(','));assert.equal(calls,16);assert.equal(rotated.quotes.length,8);
  const stale=await data.quotes(ids[0]);assert.equal(calls,16);assert.equal(stale.quotes[0].status,'stale');assert.equal(stale.quotes[0].asOf,original.asOf);assert.equal(stale.quotes[0].fetchedAt,original.fetchedAt);assert.equal(stale.errors[ids[0]].code,'QUOTE_BUDGET');
});
test('unconfigured quotes consume no credits and provider outages preserve last real quote timestamps', async t => {
  const store=await temporary(t);let now=Date.parse('2024-01-01T00:00:00Z'),calls=0,broken=false;
  const disabled=new QuantData({store,quotes:{configured:false,quote:async()=>{calls++;}},quoteLimit:8});const missing=await disabled.quotes('EURUSD,XAUUSD');assert.equal(missing.configured,false);assert.equal(calls,0);assert.equal(missing.budget.remaining,8);
  const provider={configured:true,quote:async market=>{calls++;if(broken)throw Object.assign(new Error('Provider temporarily unavailable.'),{code:'PROVIDER_UNAVAILABLE'});return {symbol:market.id,price:1,asOf:new Date(now).toISOString(),fetchedAt:new Date(now).toISOString(),source:'test-fixture'};}};
  const data=new QuantData({store,quotes:provider,now:()=>now});const first=await data.quotes('EURUSD');now+=60001;broken=true;const outage=await data.quotes('EURUSD');assert.equal(outage.quotes[0].status,'stale');assert.equal(outage.quotes[0].asOf,first.quotes[0].asOf);assert.equal(outage.quotes[0].fetchedAt,first.quotes[0].fetchedAt);assert.equal(outage.errors.EURUSD.code,'PROVIDER_UNAVAILABLE');assert.equal(outage.budget.remaining,7);
});
test('concurrent requests for one quote share one provider credit', async t => {
  const store=await temporary(t);let calls=0;const provider={configured:true,quote:async market=>{calls++;await new Promise(r=>setTimeout(r,10));return {symbol:market.id,price:1,asOf:'2024-01-01T00:00:00Z',fetchedAt:'2024-01-01T00:00:00Z'};}};
  const data=new QuantData({store,quotes:provider,quoteLimit:1});const [a,b]=await Promise.all([data.quotes('EURUSD'),data.quotes('EURUSD')]);assert.equal(calls,1);assert.equal(a.quotes.length,1);assert.equal(b.quotes.length,1);assert.equal(data.quoteBudget().remaining,0);
});

test('calendar normalization preserves numeric zero and distinguishes missing values', () => {
  const base={CalendarId:'zero-rate',Date:'2024-01-05T13:30:00',Event:'Interest Rate Decision',Country:'Japan',Importance:3,DateSpan:'0'};
  const zero=normalizeEvent({...base,Actual:0,Forecast:0,Previous:0,Revised:0});
  for(const field of ['actual','forecast','previous','revised'])assert.equal(zero[field],0);
  const missing=normalizeEvent({...base,Actual:'',Forecast:null,Previous:undefined});
  for(const field of ['actual','forecast','previous','revised'])assert.equal(missing[field],null);
});
