'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{exportWorkspace}=require('./developer-data-export.cjs');
function database(){
 const records=new Map([['fynxDevelopers/alice',{name:'Alice'}],['fynxDevelopers/alice/environments/test/keys/key',{label:'one',digest:'SECRET_HASH'}],['fynxDevelopers/alice/environments/test/accounts/a/events/e',{sequence:1}],['fynxDevelopers/alice/private/rate',{count:2}],['fynxDevelopers/bob',{name:'Bob'}]]);
 const ref=path=>({path,get:async()=>({exists:records.has(path),data:()=>records.get(path)}),listCollections:async()=>[...new Set([...records.keys()].filter(k=>k.startsWith(path+'/')).map(k=>k.slice(path.length+1).split('/')[0]))].map(id=>({id,listDocuments:async()=>[...new Set([...records.keys()].filter(k=>k.startsWith(path+'/'+id+'/')).map(k=>k.slice(0,(path+'/'+id+'/').length)+k.slice((path+'/'+id+'/').length).split('/')[0]))].map(ref)}))});
 return {doc:ref};
}
test('export traverses missing parents, includes events, excludes credentials and other tenants',async()=>{const x=await exportWorkspace(database(),'alice');assert.equal(x.documents.length,3);assert(x.documents.some(d=>d.path.endsWith('/events/e')));assert(!JSON.stringify(x).includes('SECRET_HASH'));assert(!JSON.stringify(x).includes('Bob'));assert(!x.documents.some(d=>d.path.includes('/private/')));});
test('invalid UID and oversized export fail without returning partial data',async()=>{await assert.rejects(exportWorkspace(database(),'alice/../bob'));await assert.rejects(exportWorkspace(database(),'alice',{maxDocuments:1}),/too large/);});
