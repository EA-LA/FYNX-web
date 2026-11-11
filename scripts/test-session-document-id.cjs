const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('assets/js/account-system.js','utf8');
const expression=source.match(/const sessionId = (.+);/)[1];
for(const zone of ['America/Los_Angeles','Europe/London','UTC']){
 const id=vm.runInNewContext(expression,{user:{uid:'test-user'},navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS)'},Intl:{DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:zone})})}});
 assert(!id.includes('/'),'Session IDs must be one document path segment');
 assert(decodeURIComponent(id).includes(zone));
}
console.log('Session document IDs remain a single segment for browser and timezone names.');
