'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const {id,iso,parse,notFound}=require('./errors.cjs');
const SCHEMA=`
CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account_users(uid TEXT PRIMARY KEY,email TEXT,email_verified INTEGER NOT NULL DEFAULT 0,preferences_json TEXT NOT NULL DEFAULT '{}',revision INTEGER NOT NULL DEFAULT 0,generation INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS broker_connections(id TEXT PRIMARY KEY,uid TEXT NOT NULL,provider TEXT NOT NULL,external_id TEXT,status TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 1,credential_id TEXT,read_only_json TEXT,last_sync_at TEXT,error_code TEXT,status_since TEXT,cleanup_status TEXT,consent_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS connection_owner ON broker_connections(uid,id);
CREATE TABLE IF NOT EXISTS trading_accounts(id TEXT PRIMARY KEY,uid TEXT NOT NULL,connection_id TEXT NOT NULL REFERENCES broker_connections(id) ON DELETE CASCADE,metadata_json TEXT NOT NULL,coverage_json TEXT NOT NULL DEFAULT '{}',last_good_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS account_owner ON trading_accounts(uid,id);
CREATE TABLE IF NOT EXISTS account_snapshots(id TEXT PRIMARY KEY,uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,ts TEXT NOT NULL,data_json TEXT NOT NULL,UNIQUE(account_id,ts));
CREATE INDEX IF NOT EXISTS snapshot_owner_time ON account_snapshots(uid,account_id,ts);
CREATE TABLE IF NOT EXISTS positions(uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,external_id TEXT NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(account_id,external_id));
CREATE TABLE IF NOT EXISTS deals(uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,external_id TEXT NOT NULL,ts TEXT NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(account_id,external_id));
CREATE INDEX IF NOT EXISTS deal_owner_time ON deals(uid,account_id,ts);
CREATE TABLE IF NOT EXISTS trades(uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,id TEXT NOT NULL,closed_at TEXT,data_json TEXT NOT NULL,PRIMARY KEY(account_id,id));
CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY,uid TEXT NOT NULL,connection_id TEXT NOT NULL,provider TEXT NOT NULL,envelope_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS credential_owner ON credentials(uid,connection_id);
CREATE TABLE IF NOT EXISTS account_sessions(id TEXT PRIMARY KEY,uid TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,auth_time INTEGER NOT NULL,email_verified INTEGER NOT NULL,mfa INTEGER NOT NULL DEFAULT 0,admin INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,last_active_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT,ip TEXT,user_agent TEXT);
CREATE INDEX IF NOT EXISTS session_owner ON account_sessions(uid,id);
CREATE TABLE IF NOT EXISTS account_imports(id TEXT PRIMARY KEY,uid TEXT NOT NULL,account_id TEXT,status TEXT NOT NULL,format TEXT NOT NULL,source_hash TEXT NOT NULL,content TEXT,options_json TEXT NOT NULL,account_json TEXT NOT NULL,preview_json TEXT,normalized_json TEXT,job_id TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,committed_at TEXT,UNIQUE(uid,source_hash));
CREATE TABLE IF NOT EXISTS provider_jobs(id TEXT PRIMARY KEY,uid TEXT NOT NULL,kind TEXT NOT NULL,connection_id TEXT,account_id TEXT,generation INTEGER,state TEXT NOT NULL,stage TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,payload_json TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,max_attempts INTEGER NOT NULL DEFAULT 3,available_at INTEGER NOT NULL,lease_owner TEXT,lease_until INTEGER,result_json TEXT,error_code TEXT,dedupe_key TEXT UNIQUE,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_due ON provider_jobs(state,available_at,lease_until);
CREATE INDEX IF NOT EXISTS jobs_owner ON provider_jobs(uid,id);
CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,uid TEXT NOT NULL,action TEXT NOT NULL,resource_type TEXT,resource_id TEXT,outcome TEXT NOT NULL,details_json TEXT NOT NULL,ip TEXT,user_agent TEXT,ts TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_owner_time ON audit_log(uid,ts);
CREATE TABLE IF NOT EXISTS platform_requests(uid TEXT NOT NULL,platform TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(uid,platform));
CREATE TABLE IF NOT EXISTS account_exports(id TEXT PRIMARY KEY,uid TEXT NOT NULL,account_id TEXT,format TEXT NOT NULL,status TEXT NOT NULL,content TEXT,job_id TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deletion_requests(id TEXT PRIMARY KEY,uid TEXT NOT NULL,account_id TEXT,status TEXT NOT NULL,requested_at TEXT NOT NULL,completed_at TEXT,receipt_status TEXT NOT NULL DEFAULT 'pending',error_code TEXT);
CREATE TABLE IF NOT EXISTS oauth_states(id TEXT PRIMARY KEY,uid TEXT NOT NULL,session_id TEXT NOT NULL,provider TEXT NOT NULL,state_hash TEXT NOT NULL UNIQUE,encrypted_verifier TEXT,expires_at TEXT NOT NULL,used_at TEXT);
CREATE TABLE IF NOT EXISTS account_events(uid TEXT NOT NULL,revision INTEGER NOT NULL,id TEXT NOT NULL,account_id TEXT,type TEXT NOT NULL,ts TEXT NOT NULL,PRIMARY KEY(uid,revision));
CREATE TABLE IF NOT EXISTS strategy_bindings(id TEXT PRIMARY KEY,uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,data_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS manual_assignments(uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,trade_id TEXT NOT NULL,strategy_id TEXT NOT NULL,PRIMARY KEY(account_id,trade_id));
CREATE TABLE IF NOT EXISTS entry_facts(uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,trade_id TEXT NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(account_id,trade_id));
CREATE TABLE IF NOT EXISTS prop_rule_versions(id TEXT PRIMARY KEY,uid TEXT NOT NULL,version TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account_alerts(id TEXT PRIMARY KEY,uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,data_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notification_outbox(id TEXT PRIMARY KEY,uid TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_health(provider TEXT PRIMARY KEY,failures INTEGER NOT NULL DEFAULT 0,blocked_until INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_usage(provider TEXT NOT NULL,window INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(provider,window));
CREATE TABLE IF NOT EXISTS dashboard_activity(uid TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,active_until INTEGER NOT NULL,last_scheduled_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account_id));
`;
class AccountsDB{
 constructor({filename=path.resolve(process.env.ACCOUNTS_DB_PATH||path.join(__dirname,'../../.accounts-data/accounts.sqlite')),now=()=>Date.now()}={}){this.filename=filename;this.now=now;if(filename!==':memory:'){fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});if(!fs.existsSync(filename))fs.closeSync(fs.openSync(filename,'a',0o600));fs.chmodSync(filename,0o600);}this.db=new DatabaseSync(filename,{enableForeignKeyConstraints:true,allowExtension:false});this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF; PRAGMA secure_delete=ON;');this.db.exec(SCHEMA);this.run('INSERT OR IGNORE INTO schema_versions(version,applied_at) VALUES(1,?)',iso(this.now()));}
 run(sql,...args){return this.db.prepare(sql).run(...args.map(v=>v===undefined?null:v));}get(sql,...args){return this.db.prepare(sql).get(...args.map(v=>v===undefined?null:v));}all(sql,...args){return this.db.prepare(sql).all(...args.map(v=>v===undefined?null:v));}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();if(result&&typeof result.then==='function')throw new Error('SQLite transactions must not perform asynchronous work.');this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 user(uid){return this.get('SELECT * FROM account_users WHERE uid=?',uid);}
 ensureUser(user){const at=iso(this.now());this.run('INSERT INTO account_users(uid,email,email_verified,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email,email_verified=excluded.email_verified,updated_at=excluded.updated_at',user.uid,user.email||null,user.emailVerified?1:0,at,at);return this.user(user.uid);}
 account(uid,accountId){const row=this.get('SELECT a.*,c.provider,c.external_id,c.status,c.generation,c.read_only_json,c.last_sync_at,c.error_code,c.status_since,c.cleanup_status,c.credential_id FROM trading_accounts a JOIN broker_connections c ON c.id=a.connection_id AND c.uid=a.uid WHERE a.uid=? AND a.id=?',uid,accountId);if(!row)throw notFound();return row;}
 connection(uid,connectionId){const row=this.get('SELECT * FROM broker_connections WHERE uid=? AND id=?',uid,connectionId);if(!row)throw notFound();return row;}
 audit(uid,action,{resourceType=null,resourceId=null,outcome='success',details={},ip=null,userAgent=null}={}){const clean={};for(const key of ['provider','code','count','format','ruleId','version','confirmed','scope'])if(details[key]!==undefined)clean[key]=details[key];const row={id:id(),uid,action,resourceType,resourceId,outcome,details:clean,ip:ip?String(ip).slice(0,80):null,userAgent:userAgent?String(userAgent).slice(0,300):null,ts:iso(this.now())};this.run('INSERT INTO audit_log VALUES(?,?,?,?,?,?,?,?,?,?)',row.id,uid,action,resourceType,resourceId,outcome,JSON.stringify(clean),row.ip,row.userAgent,row.ts);return row;}
 event(uid,type,accountId=null){this.run('UPDATE account_users SET revision=revision+1 WHERE uid=?',uid);const revision=this.user(uid)?.revision||0;const row={id:id(),revision,accountId,type,ts:iso(this.now())};this.run('INSERT OR IGNORE INTO account_events(uid,revision,id,account_id,type,ts) VALUES(?,?,?,?,?,?)',uid,revision,row.id,accountId,type,row.ts);return row;}
 auditList(uid,{before=null,limit=50}={}){return this.all('SELECT * FROM audit_log WHERE uid=? AND (? IS NULL OR ts<?) ORDER BY ts DESC,id DESC LIMIT ?',uid,before,before,limit).map(r=>({id:r.id,action:r.action,resourceType:r.resource_type,resourceId:r.resource_id,outcome:r.outcome,details:parse(r.details_json),ip:r.ip,userAgent:r.user_agent,ts:r.ts}));}
 close(){this.db.close();}
}
module.exports={AccountsDB,SCHEMA};
