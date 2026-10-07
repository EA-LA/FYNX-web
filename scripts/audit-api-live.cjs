'use strict';
// Bounded, read-only audit of public API pages and the local links they expose.
const fs=require('node:fs'),{JSDOM}=require('jsdom');
const origin='https://www.fynxfinanceworld.com';
const paths=['/api/','/api/index.html','/api/risk.html','/api/prop-firm.html','/api/pricing.html','/api/docs.html','/api/access.html','/api/workspace.html'];
async function request(url){const r=await fetch(url,{signal:AbortSignal.timeout(15000)});return {status:r.status,url:r.url,body:await r.text()};}
(async()=>{
 const report={checked_at:new Date().toISOString(),scope:'All public API HTML routes and their same-origin links/assets; not authenticated UI or the entire Finance World site',pages:[],links:[],excluded:[]};const links=new Set();
 for(const path of paths){const r=await request(origin+path),dom=new JSDOM(r.body,{url:origin+path}),d=dom.window.document;report.pages.push({path,status:r.status,title:d.title,h1:d.querySelectorAll('h1').length,bytes:r.body.length});
 for(const e of d.querySelectorAll('a[href],script[src],link[rel=stylesheet]')){const raw=e.getAttribute('href')||e.getAttribute('src');if(!raw||raw.startsWith('#'))continue;const u=new URL(raw,origin+path);if(u.origin===origin){if(u.pathname==='/cdn-cgi/l/email-protection'){report.excluded.push({url:u.origin+u.pathname,reason:'Cloudflare client-decoded email link; bare proxy URL is not a page destination.'});continue;}u.hash='';links.add(u.href);}}
 dom.window.close();}
 for(const url of [...links].sort()){try{const r=await request(url);report.links.push({url,status:r.status});}catch(e){report.links.push({url,status:0,error:e.name});}}
 report.complete=report.pages.every(p=>p.status===200&&p.h1===1)&&report.links.every(l=>l.status===200);
 const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));if(!report.complete)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
