'use strict';
function parseVix(csv){
 const rows=csv.trim().split(/\r?\n/).slice(1).flatMap(line=>{
 const [date,open,high,low,close]=line.split(','),parts=date?.split('/');
 if(parts?.length!==3)return [];
 const iso=`${parts[2]}-${parts[0]}-${parts[1]}`,value=Number(close);
 if(!Number.isFinite(Date.parse(iso))||!Number.isFinite(value)||value<=0)return [];
 return [{date:iso,close:value}];
 }).sort((a,b)=>a.date.localeCompare(b.date)).slice(-90);
 if(!rows.length)throw Error('No VIX observations');
 return {source:'Cboe VIX daily history',observationDate:rows.at(-1).date,rows};
}
module.exports={parseVix};
