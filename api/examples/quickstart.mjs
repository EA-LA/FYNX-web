// Node.js 22+. Keep the key in your local environment, never in browser code or Git.
import assert from 'node:assert/strict';
const key=process.env.FYNX_API_KEY;
assert.match(key||'',/^fynx_test_[a-f0-9]{64}$/,'Set FYNX_API_KEY to a TEST key from your developer workspace.');
const base='https://us-central1-fynx-c7a28.cloudfunctions.net/developerGateway';
const input={instrument_type:'forex',symbol:'EURUSD',account_currency:'USD',contract_size:'100000',quote_to_account_rate:'1',lot_step:'0.01',minimum_lot:'0.01',account_balance:'10000',risk_percent:'1',entry_price:'1.0850',stop_loss_price:'1.0820',direction:'long'};
async function request(body){const response=await fetch(base+'/v1/risk/position-size',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const data=await response.json();return {status:response.status,data};}
const valid=await request(input);assert.equal(valid.status,200,valid.data.error?.message);assert.equal(valid.data.result.position_size,'0.33');
const invalid=await request({...input,stop_loss_price:'1.09'});assert.equal(invalid.status,422);assert.equal(invalid.data.error.code,'invalid_stop_loss');
console.log(JSON.stringify({integration:'passed',position_size:valid.data.result.position_size,expected_validation_error:invalid.data.error.code,request_id:valid.data.request_id},null,2));
// One successful test call is consumed. These are illustrative contract values, not a broker catalog.
