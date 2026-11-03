'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('../quant/store.cjs');
const { hash, fail } = require('../quant/common.cjs');
const TABLES = new Set(['edge_snapshots','market_state_daily','cot_weekly','event_moves','strategy_trade_tags','alerts','ea_tokens','ea_heartbeats','user_preferences','notifications','delivery_claims','provider_status','fred_vix','snapshot_jobs']);
class EdgeStore extends Store {
  constructor(root = path.resolve(process.env.EDGE_DATA_DIR || path.join(__dirname, '../../.edge-data'))) { super(root); }
  key(table, id) { if (!TABLES.has(table) || typeof id !== 'string' || !id || id.length > 1000) throw fail('Invalid Edge storage key.'); return `${table}/${hash(id)}`; }
  async get(table, id) { const record = await this.read(this.key(table,id)); return record?.value ?? null; }
  async put(table, id, value) { await this.write(this.key(table,id), { id, value }); return value; }
  async delete(table, id) { try { await fs.unlink(this.file(this.key(table,id))); } catch(e) { if(e.code!=='ENOENT') throw e; } }
  async scanEntries(table) { if(!TABLES.has(table))throw fail('Invalid Edge table.'); const keys=await this.list(table); const rows=[];for(const key of keys){const record=await this.read(key);if(record)rows.push(record);}return rows; }
  async scan(table) { return (await this.scanEntries(table)).map(row=>row.value); }
  async mutate(table, id, change) {
    const key=this.key(table,id);await fs.mkdir(path.join(this.root,'.locks'),{recursive:true,mode:0o700});const lock=path.join(this.root,'.locks',hash(key));let acquired=false;
    for(let attempt=0;attempt<80;attempt++) {try{await fs.mkdir(lock,{mode:0o700});acquired=true;break;}catch(e){if(e.code!=='EEXIST')throw e;try{const stat=await fs.stat(lock);if(Date.now()-stat.mtimeMs>60000){await fs.rmdir(lock);continue;}}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTEMPTY')throw e;}await new Promise(resolve=>setTimeout(resolve,25));}}
    if(!acquired)throw fail('Edge storage is busy. Retry shortly.',503,'STORE_BUSY');
    try{const value=await change(await this.get(table,id));await this.put(table,id,value);return value;}finally{await fs.rmdir(lock).catch(()=>{});}
  }
  async claim(id,{leaseMs=30*60000,now=Date.now(),metadata={}}={}) { const token=crypto.randomUUID();let claimed=false;const record=await this.mutate('delivery_claims',id,old=>{if(old?.status==='complete'||old?.status==='running'&&old.leaseUntil>now)return old;claimed=true;return {...metadata,id,token,status:'running',claimedAt:new Date(now).toISOString(),leaseUntil:now+leaseMs};});return {claimed,token:claimed?token:null,record}; }
  async completeClaim(id,token,{status='complete',result=null,now=Date.now()}={}) {return this.mutate('delivery_claims',id,old=>{if(old?.token!==token)throw fail('Scheduled claim no longer belongs to this runner.',409,'CLAIM_CHANGED');return {...old,status,finishedAt:new Date(now).toISOString(),result,leaseUntil:0};});}
}
module.exports={EdgeStore,TABLES};
