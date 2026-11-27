'use strict';
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runInNewContext}=require('node:vm');
const source=readFileSync(join(__dirname,'../assets/js/terminal/satellite-map.js'),'utf8');
const start=source.indexOf('  async function searchPlaces(q)');
const end=source.indexOf('  function buildSearch(tools)',start);
assert.ok(start>=0 && end>start);
function fixture(config, respond) {
  const calls=[];
  const search=runInNewContext(source.slice(start,end)+'\nsearchPlaces;',{
    readConfig:async()=>config,
    fetch:async url=>{calls.push(url);return respond(url);}
  });
  return {search,calls};
}
test('no configured geocoder makes no external autocomplete request',async()=>{
  const h=fixture({},async()=>({json:async()=>[]}));
  const result=await h.search('Ottawa');
  assert.deepEqual(h.calls,[]);
  assert.equal(result,undefined);
});
test('the existing configured geocoder still returns ordinary place suggestions',async()=>{
  const h=fixture({key:'mock-key'},async()=>({json:async()=>({features:[
    {text:'Ottawa',place_name:'Ottawa, Canada',center:[-75.69,45.42],place_type:['city']}
  ]})}));
  const results=await h.search('Ottawa');
  assert.equal(h.calls.length,1);
  const u=new URL(h.calls[0]);
  assert.equal(u.hostname,'api.maptiler.com');
  assert.equal(u.pathname,'/geocoding/Ottawa.json');
  assert.equal(u.searchParams.get('key'),'mock-key');
  assert.equal(results[0].title,'Ottawa');
  assert.equal(results[0].sub,'Ottawa, Canada');
  assert.equal(results[0].zoom,10);
});
test('a configured request failure does not fall back to another service',async()=>{
  const h=fixture({key:'mock-key'},async()=>{throw Error('offline fixture');});
  assert.equal(await h.search('Ottawa'),null);
  assert.equal(h.calls.length,1);
  assert.equal(new URL(h.calls[0]).hostname,'api.maptiler.com');
});
