'use strict';
const functions=require('firebase-functions/v1');
const admin=require('firebase-admin');
const logger=require('firebase-functions/logger');
async function inspectBackups(){
 const project=process.env.GCLOUD_PROJECT||'fynx-c7a28';
 const {access_token}=await admin.app().options.credential.getAccessToken();
 async function get(path){const r=await fetch('https://firestore.googleapis.com/v1/'+path,{headers:{Authorization:'Bearer '+access_token},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Backup inspection failed with HTTP '+r.status);return r.json();}
 const base='projects/'+project,db=base+'/databases/(default)';
 const [database,schedules,backups]=await Promise.all([get(db),get(db+'/backupSchedules'),get(base+'/locations/nam5/backups')]);
 const latest=(backups.backups||[]).filter(b=>b.database===db&&b.state==='READY').map(b=>Date.parse(b.snapshotTime)).sort((a,b)=>b-a)[0]||0;
 const daily=(schedules.backupSchedules||[]).find(s=>s.dailyRecurrence);
 const grace=daily&&Date.now()-Date.parse(daily.createTime)<48*3600000;
 const healthy=database.pointInTimeRecoveryEnablement==='POINT_IN_TIME_RECOVERY_ENABLED'&&!!daily&&(latest>Date.now()-36*3600000||grace);
 const status={checkedAt:Date.now(),latestSnapshotAt:latest,pitr:database.pointInTimeRecoveryEnablement,healthy,awaitingFirstScheduledBackup:!!grace&&!latest};
 await admin.firestore().collection('fynxDeveloperOperations').doc('backups').set(status);
 logger[healthy?'info':'error']('FYNX API backup health',{service:'fynx_api',kind:'backups',status:healthy?200:503,...status});
 if(!healthy)throw new Error('Backup freshness or PITR check failed');
 return status;
}
exports.inspectBackups=inspectBackups;
exports.developerBackupCheck=functions.runWith({timeoutSeconds:120,memory:'256MB',maxInstances:1}).pubsub.schedule('every 6 hours').timeZone('Etc/UTC').onRun(async()=>{try{return await inspectBackups();}catch(e){logger.error('FYNX API backup inspection failed',{service:'fynx_api',kind:'backups',status:503});throw e;}});
