import { quantile, timeMs } from '../quant/math';
import { COT_MARKETS, EDGE_CONFIG as C } from './config';
import { known, missing, DAY } from './regime';
import type { COTRecord, Positioning } from './types';
export function netPosition(long:number,short:number):number|null{if(!Number.isFinite(long)||!Number.isFinite(short)||long<0||short<0||long+short===0)return null;return (long-short)/(long+short);}
export function positioning(symbol:string,records:COTRecord[]|undefined,asOf:string):Positioning{
  const legs=COT_MARKETS[symbol],cutoff=timeMs(asOf),empty=(reason:string):Positioning=>({net:missing(reason),crowded:missing(reason),percentile85:missing(reason),reportDate:null,availableAt:null,history:[],legs:[],basis:'CFTC futures positioning; not spot-account flows.'});
  if(!legs)return empty('No verified CFTC contract mapping is configured for this market.');if(!records?.length)return empty('CFTC positioning history is unavailable.');
  const permitted=records.filter(r=>r.report===(r.market==='XAU'||r.market==='XAG'?'DISAGGREGATED':'TFF')&&Number.isFinite(timeMs(r.availableAt))&&timeMs(r.availableAt)<=cutoff&&timeMs(r.reportDate)<=cutoff&&netPosition(r.long,r.short)!==null);
  const selected=legs.map(leg=>{const byDate=new Map<string,COTRecord>();for(const row of permitted){if(row.market!==leg.market)continue;const previous=byDate.get(row.reportDate);if(!previous||previous.availableAt<row.availableAt)byDate.set(row.reportDate,row);}const history=[...byDate.values()].sort((a,b)=>a.reportDate.localeCompare(b.reportDate));return {leg,history,byDate,current:history.at(-1)};});
  if(selected.some(x=>!x.current))return empty('No CFTC row version for every required futures leg was available at this time.');
  const current=selected.map(x=>({market:x.leg.market,direction:x.leg.direction,net:netPosition(x.current!.long,x.current!.short)!,reportDate:x.current!.reportDate,availableAt:x.current!.availableAt}));
  const net=current.reduce((s,r)=>s+r.direction*r.net,0)/current.length,reportDate=current.map(r=>r.reportDate).sort()[0],availableAt=current.map(r=>r.availableAt).sort().at(-1)!;
  const dates=[...new Set(selected.flatMap(x=>x.history.map(r=>r.reportDate)))].filter(d=>timeMs(d)>=cutoff-C.cotHistoryYears*365.25*DAY).sort();
  const history:{date:string;net:number}[]=[];
  for(const date of dates){const rows=selected.map(x=>x.byDate.get(date));if(rows.some(r=>!r))continue;history.push({date,net:rows.reduce((s,r,i)=>s+selected[i].leg.direction*netPosition(r!.long,r!.short)!,0)/rows.length});}
  const sufficient=history.length>=C.cotMinimumReports,threshold=sufficient?quantile(history.map(r=>Math.abs(r.net)).sort((a,b)=>a-b),C.crowdingQuantile):null;
  const stale=cutoff-timeMs(reportDate)>21*DAY;
  return {net:stale?missing('Latest available CFTC observation is more than 21 days old.'):known(net,availableAt),crowded:stale?missing('CFTC observation is stale.'):threshold===null?missing(`Crowding needs at least ${C.cotMinimumReports} published reports in the trailing three years; ${history.length} are available.`):known(Math.abs(net)>threshold,availableAt),percentile85:threshold===null?missing('Insufficient published three-year positioning history.'):known(threshold,availableAt),reportDate,availableAt,history:history.slice(-156),legs:current,basis:legs.length>1?'Average of signed currency-futures net ratios; a relative positioning measure, not a direct cross-pair contract.':'Signed net futures ratio. USD-base FX pairs reverse the quoted currency-futures direction.'};
}
