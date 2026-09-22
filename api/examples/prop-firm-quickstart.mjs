// Node.js 22+. TEST keys only. Creates one synthetic rule set and account.
// Each complete run uses six successful test calls and retains its test records.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const key=process.env.FYNX_API_KEY;
assert.match(key||'',/^fynx_test_[a-f0-9]{64}$/,'Set FYNX_API_KEY to a TEST key from your developer workspace.');
const base='https://us-central1-fynx-c7a28.cloudfunctions.net/developerGateway';
const runId=randomUUID();
async function request(route,body,expected=200){
 const res=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 const data=await res.json();
 assert.equal(res.status,expected,`${route}: ${data.error?.message||'Unexpected response'}; request ${data.request_id||res.headers.get('X-Request-Id')}`);
 return data;
}
// Creation endpoints are not idempotent. Do not automatically retry a timed-out
// create: first inspect the workspace for the unique run name printed below.
console.log(JSON.stringify({stage:'starting',run_id:runId,record_name:'Beta integration '+runId}));
const rule=await request('/v1/propfirm/rule-sets',{name:'Beta integration '+runId,starting_balance:'10000',daily_loss_percent:'5',max_loss_percent:'10',profit_target_percent:'8',max_loss_type:'static',consistency_percent:'40',min_trading_days:5,reset_hour_utc:22});
const account=await request('/v1/propfirm/accounts',{name:'Beta integration '+runId,rule_set_id:rule.result.rule_set_id});
const route='/v1/propfirm/accounts/'+account.result.account_id;
console.log(JSON.stringify({stage:'account_created',account_id:account.result.account_id,rule_set_id:rule.result.rule_set_id}));
const event={idempotency_key:runId+'-one',source_event_id:runId+'-source-one',sequence:1,event_type:'closed_trade',timestamp:new Date().toISOString(),realized_pnl:'-100',unrealized_pnl_after:'0',open_position_count:0};
const first=await request(route+'/events',event);
assert.equal(first.result.balance,'9900');
const replay=await request(route+'/events',Object.fromEntries(Object.entries(event).reverse()));
assert.equal(replay.duplicate,true);
assert.equal(replay.result.sequence,1);
assert.equal(replay.remaining,first.remaining,'Replay must not consume another call; use a quiet test workspace.');
await request(route+'/events',{...event,realized_pnl:'-101'},409);
const next=await request(route+'/events',{...event,idempotency_key:runId+'-two',source_event_id:runId+'-source-two',sequence:2,timestamp:new Date().toISOString(),realized_pnl:'50'});
assert.equal(next.result.balance,'9950');
const status=await request(route+'/status');
assert.equal(status.result.sequence,2);assert.equal(status.result.balance,'9950');assert.equal(status.result.status,'active');
const history=await request(route+'/events');
assert.equal(history.result.items.length,2);
const ordered=history.result.items.sort((a,b)=>a.request.sequence-b.request.sequence);
assert.equal(ordered[0].previous_event_hash,null);
assert.equal(ordered[1].previous_event_hash,ordered[0].event_hash);
assert.equal(ordered[1].event_hash,status.result.last_event_hash);
console.log(JSON.stringify({integration:'passed',external_beta_verified:false,account_id:account.result.account_id,rule_set_id:rule.result.rule_set_id,balance:status.result.balance,sequence:status.result.sequence,duplicate_did_not_consume_usage:true,conflicting_retry_rejected:true,audit_chain_linked:true,request_id:status.request_id},null,2));
