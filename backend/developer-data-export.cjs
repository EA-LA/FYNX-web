'use strict';
// Operator-only data portability export. No auth-account or database mutations.
async function exportWorkspace(db,uid,{maxDocuments=10000}={}){
 if(typeof uid!=='string'||!uid||uid.includes('/')||uid.length>128)throw Error('A valid Firebase UID is required.');
 if(!Number.isSafeInteger(maxDocuments)||maxDocuments<1)throw Error('Invalid export document limit.');
 const base='fynxDevelopers/'+uid,documents=[];let visited=0;
 async function walk(ref){
  if(++visited>maxDocuments)throw Error('Export too large; use a reviewed paginated export instead. No partial export is returned.');
  if(ref.path!==base&&!ref.path.startsWith(base+'/'))throw Error('Export escaped workspace scope.');
  const snap=await ref.get();
  if(snap.exists){
   const data={...snap.data()};
   // Key hashes are authentication internals, not portable credentials.
   if(ref.path.split('/').at(-2)==='keys')delete data.digest;
   documents.push({path:ref.path.slice(base.length)||'/',data});
  }
  // listDocuments also finds missing parent documents with existing descendants.
  for(const collection of await ref.listCollections()){
   if(collection.id==='private')continue;
   for(const child of await collection.listDocuments())await walk(child);
  }
 }
 await walk(db.doc(base));
 return {schema_version:1,scope:'FYNX API workspace only',uid,documents,excluded:['API key digests and internal rate-limit counters','Shared Firebase Authentication identity; request separately','Stripe-held payment records; request separately'],consistency:'Best-effort read; pause workspace writes for a consistent point-in-time export.'};
}
module.exports={exportWorkspace};
