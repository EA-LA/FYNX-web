const assert=require('node:assert/strict');
const {fixtures,browserResult}=require('./calculator-parity.cjs');
const engine=require('../../backend/developer-engine.cjs');
(async()=>{
 for(const fixture of fixtures){
  const sample=await browserResult({...fixture,mode:'pilot'});
  assert.equal(sample.endpoint,fixture.endpoint,fixture.name);
  const actual=engine.risk(sample.endpoint,sample.input);
  assert.equal(Number(actual[sample.resultKey]).toFixed(sample.precision),sample.local,fixture.name);
 }
 // A genuine provider-incompatible instrument must not be silently sent as Forex.
 await assert.rejects(browserResult({...fixtures.find(f=>f.file==='atr-stop'),fields:{pair:'XAU/USD',entry:'2000',atrValue:'5',period:'14'},mode:'pilot'}),/Forex/);
 console.log('PASS: all 16 first-party adapter cases agree with the engine; unsupported gold verification rejected.');
})().catch(e=>{console.error(e);process.exitCode=1;});
