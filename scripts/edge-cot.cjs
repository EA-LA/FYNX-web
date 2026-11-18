'use strict';
const {EdgeService}=require('../backend/edge/snapshot.cjs');
(async()=>{const service=new EdgeService();try{const result=await service.cotHistory({force:true});console.log(JSON.stringify({source:result.source,status:result.status,records:result.records.length,latestReportDate:result.latestReportDate||null,fetchedAt:result.fetchedAt,warning:result.warning||null},null,2));if(result.status!=='available')process.exitCode=2;}finally{await service.jobs.close();}})().catch(e=>{console.error(e.code?e.message:'CFTC import failed.');process.exitCode=1;});
