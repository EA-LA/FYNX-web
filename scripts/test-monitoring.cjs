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
// Long-lived tabs resume reporting after the rate window, and early startup
// failures are flushed once without retaining exception messages.
{
 let now=100000;const calls=[],listeners={},window={addEventListener(name,fn){listeners[name]=fn;}},document={createElement:()=>({}),head:{appendChild(){}},documentElement:{dataset:{},style:{}}};
 vm.runInNewContext(fs.readFileSync('assets/js/site-theme-init.js','utf8'),{window,document,localStorage:{getItem:()=>null,setItem(){}},Date,TypeError});
 window.FynxMonitor.report('auth','session-bootstrap',{code:'auth/network-request-failed',message:'private account value'});
 assert(!JSON.stringify(window.__fynxMonitorQueue).includes('private account value'));
 vm.runInNewContext(source,{window,location:{hostname:'www.fynxfinanceworld.com',pathname:'/home.html'},fetch:async(url,options)=>calls.push(JSON.parse(options.body)),Date:{now:()=>now},Map,Set,TypeError});
 assert.equal(calls.length,1);assert.equal(calls[0].operation,'session-bootstrap');
 for(let i=0;i<20;i++)window.FynxMonitor.report('save','test-'+i,{code:'network'});
 assert.equal(calls.length,12);now+=60001;
 window.FynxMonitor.report('auth','session-bootstrap',{code:'auth/network-request-failed'});
 assert.equal(calls.length,13,'A long-lived page must not stop reporting permanently');
}
console.log('Early error queue and recurring rate-window reporting passed.');
