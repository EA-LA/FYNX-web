'use strict';
// Members-only pages (the dashboard and personal account screens) must stay locked:
// the gate loads before any content, both lists agree, and the page runs the session check.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const gateSrc=fs.readFileSync(path.join(root,'assets/js/auth-gate.js'),'utf8');
const boot=fs.readFileSync(path.join(root,'assets/js/session-bootstrap.js'),'utf8');
const gateList=eval(gateSrc.match(/const PRIVATE_PAGES = (\[[^\]]*\]);/)[1]);
const bootList=eval(boot.match(/const privatePages = new Set\((\[[^\]]*\])\);/)[1]);
assert.deepEqual([...gateList].sort(),[...bootList].sort(),'auth-gate.js and session-bootstrap.js must lock the same pages');
for(const must of ['home.html','profile.html','account-settings.html'])assert(gateList.includes(must),`${must} must be members-only`);
for(const page of gateList){
 const html=fs.readFileSync(path.join(root,page),'utf8');
 const gate=html.indexOf('/assets/js/auth-gate.js'),theme=html.indexOf('/assets/js/site-theme-init.js'),body=html.indexOf('<body');
 assert(gate>0&&gate<body,`${page}: auth gate must load in <head>`);
 assert(theme<gate&&html.slice(theme,gate).split('<script').length===2,`${page}: auth gate must follow site-theme-init.js directly`);
 assert(/<script[^>]+src="[^"]*session-bootstrap\.js/.test(html),`${page}: must run the session check`);
}
// Behaviour: a private page is hidden until released; a public page is untouched.
function run(pathname){
 const cls=new Set(),timers=[];let replaced=null;
 const ctx={location:{pathname,search:'',hash:'',replace:u=>{replaced=u;}},window:{},setTimeout:(f,ms)=>{timers.push([f,ms]);return 1;},clearTimeout:()=>{timers.length=0;},
  document:{documentElement:{classList:{add:c=>cls.add(c),remove:c=>cls.delete(c)}},head:{appendChild(){}},createElement:()=>({})}};
 ctx.window=ctx;vm.runInNewContext(gateSrc,ctx);return {ctx,cls,timers,replaced:()=>replaced};
}
const priv=run('/home.html');assert(priv.cls.has('fynx-auth-pending'));assert.equal(priv.timers[0][1],15000);
priv.timers[0][0]();assert.equal(priv.replaced(),'/auth/login.html?returnTo=%2Fhome.html&reason=verify','unverified sessions go to sign-in, not a blank page');
const ok=run('/profile.html');ok.ctx.FynxAuthGate.release();assert(!ok.cls.has('fynx-auth-pending'));assert.equal(ok.timers.length,0,'release cancels the fallback');
const pub=run('/journal.html');assert(!pub.cls.has('fynx-auth-pending'));assert.equal(pub.timers.length,0);
console.log(`Auth gate: ${gateList.length} members-only pages locked before first paint; public pages untouched.`);
