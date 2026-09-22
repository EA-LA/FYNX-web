const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/js/monitoring.js','utf8');
for(const hostname of ['www.fynxfinanceworld.com','127.0.0.1']){
 const calls=[],window={addEventListener(){}};
 vm.runInNewContext(source,{window,location:{hostname,pathname:'/profile.html'},fetch:async(url,options)=>calls.push(JSON.parse(options.body)),Date,Map,Set,TypeError});
 window.FynxMonitor.report('save','profile-save',{code:'private@email.com',message:'secret password'});
 window.FynxMonitor.report('save','profile-save',{code:'private@email.com'});
 assert.equal(calls.length,hostname==='127.0.0.1'?0:1);
 if(calls.length)assert.deepEqual(calls[0],{category:'save',operation:'profile-save',code:'unknown',page:'/profile.html'});
}
console.log('Browser monitoring: private messages excluded, repeated events throttled, local tests do not notify production.');
