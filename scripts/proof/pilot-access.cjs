const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const {canUseApiPilot}=await import('data:text/javascript,'+encodeURIComponent(fs.readFileSync(path.resolve(__dirname,'../../assets/js/api-pilot-access.js'),'utf8')));
 for(const p of ['/tools/risk-reward.html','/tools/pip.html','/tools/margin.html','/tools/breakeven.html','/tools/atr-stop.html','/tools/position-size.html']){
  assert(canUseApiPilot(p,{apiPilot:true}));assert(!canUseApiPilot(p,{}));assert(!canUseApiPilot(p,{apiPilot:'true'}));
 }
 for(const p of ['/owner.html','/dashboard.html','/api/workspace.html','/tools/options.html','/tools/../owner.html','/tools/risk-reward.html/'])assert(!canUseApiPilot(p,{apiPilot:true}));
 console.log('PASS: pilot claim grants only six exact calculator routes, never owner/admin or other tools.');
})().catch(e=>{console.error(e);process.exitCode=1;});
