'use strict';
// Produces a script for the approved browser-control channel. Never launches or connects to a browser.
const fs=require('node:fs'),path=require('node:path');
const [axePath,output]=process.argv.slice(2);
if(!axePath||!output){console.error('Usage: node scripts/edge-audit-payload.cjs /absolute/path/axe.min.js /absolute/path/audit-payload.js');process.exit(1);}
const source=fs.readFileSync(path.resolve(axePath),'utf8');if(!source.includes('axe'))throw new Error('Expected the axe-core browser distribution.');
const audit=String.raw`
;(async()=>{
  const collect=async type=>{const rows=[];if(!PerformanceObserver.supportedEntryTypes.includes(type))return rows;const observer=new PerformanceObserver(list=>rows.push(...list.getEntries().map(e=>e.toJSON())));observer.observe({type,buffered:true});await new Promise(r=>setTimeout(r,100));observer.disconnect();return rows;};
  const [lcp,shifts,longTasks]=await Promise.all(['largest-contentful-paint','layout-shift','longtask'].map(collect));
  let cls=0,session=0,first=0,last=0;for(const e of shifts.filter(x=>!x.hadRecentInput).sort((a,b)=>a.startTime-b.startTime)){if(!session||e.startTime-last>1000||e.startTime-first>5000){session=e.value;first=e.startTime;}else session+=e.value;last=e.startTime;cls=Math.max(cls,session);}
  const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});
  const simplify=rows=>rows.map(r=>({id:r.id,impact:r.impact,help:r.help,helpUrl:r.helpUrl,nodes:r.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))}));
  return {capturedAt:new Date().toISOString(),url:location.href,axeVersion:axe.version,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},pageWidth:document.documentElement.scrollWidth,noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth,accessibility:{violations:simplify(result.violations),incomplete:simplify(result.incomplete),passes:result.passes.length,inapplicable:result.inapplicable.length},observedPerformance:{navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),paint:performance.getEntriesByType('paint').map(e=>e.toJSON()),lcp:lastValue(lcp,'startTime'),cls,observedLongTasks:longTasks.length,observedLongTaskBlockingMs:longTasks.reduce((n,t)=>n+Math.max(0,t.duration-50),0)},limitations:['Rendered-state axe audit, not a Lighthouse accessibility score or a complete accessibility certification.','Performance entries are observed in this browser session without Lighthouse navigation gathering, network/CPU simulation or scoring.','LCP and CLS describe available buffered entries for this navigation. Long-task blocking time is not Lighthouse TBT.']};
  function lastValue(rows,key){return rows.length?rows[rows.length-1][key]:null;}
})()
`;
fs.writeFileSync(path.resolve(output),source+audit);
console.log(JSON.stringify({output:path.resolve(output),bytes:Buffer.byteLength(source+audit),browserControlled:false}));
