import type { IntradayMark, IntradayPath } from './types';
/** Opt-in capture; execution continues when the bounded mark budget is exhausted. */
export class IntradayCapture {
  private paths = new Map<string, IntradayPath>();
  private count = 0;
  private days = 0;
  exceeded = false;
  constructor(readonly enabled: boolean, readonly timezone: 'UTC'|'Europe/Prague', readonly limit=50000, readonly skipDays=0) {}
  begin(date: string, from: number, equity: number, balance: number) {
    if (!this.enabled || ++this.days <= this.skipDays) return;
    this.paths.set(date,{timezone:this.timezone,from,to:from,openingEquity:equity,openingBalance:balance,marks:[],complete:!this.exceeded,model:'recorded-ticks'});
  }
  record(date: string, time: number, equity: number, balance: number, flat: boolean) {
    if (!this.enabled) return;
    const path=this.paths.get(date);if(!path)return;
    if(this.exceeded){path.complete=false;return;}
    const last=path.marks[path.marks.length-1];
    // A constant valuation between quotes needs only its first actual timestamp.
    if(last&&last.equity===equity&&last.balance===balance&&last.flat===flat)return;
    if(this.count>=this.limit){this.exceeded=true;path.complete=false;return;}
    path.marks.push({time,equity,balance,flat});this.count++;
  }
  cover(date:string,to:number,complete:boolean) {
    const path=this.paths.get(date);if(!path)return;path.to=to;path.complete&&=complete&&!this.exceeded;
  }
  path(date:string):IntradayPath|undefined {return this.paths.get(date);}
}
/**
 * Combine actual timestamp marks, using each sleeve's last recorded valuation
 * until its next quote. Different sleeves' daily minima are NEVER summed.
 * Same-timestamp marks are simultaneous at the feed's timestamp precision.
 * If multiple sleeves have internally ordered updates at the same timestamp,
 * their cross-sleeve order is unknowable, so completeness is withheld.
 */
export function synchronizeIntraday(paths:(IntradayPath|undefined)[],weights:number[]):{
  path:IntradayPath; minimum:number; startBalanceRatio:number; endBalanceRatio:number; flat:boolean
}|null{
  const active=paths.map((p,i)=>({p,w:weights[i]})).filter(x=>x.w>0);
  if(!active.length||active.some(x=>!x.p?.complete||x.p.timezone!=='Europe/Prague'||!(x.p.openingEquity>0)||!x.p.marks.length))return null;
  const valid=active as {p:IntradayPath;w:number}[],from=valid[0].p.from,to=valid[0].p.to;
  if(valid.some(x=>x.p.from!==from||x.p.to!==to)||to<=from)return null;
  if(valid.reduce((n,x)=>n+x.p.marks.length,0)>100000)return null;
  const events:{time:number;leg:number;mark:IntradayMark}[]=[],equities=valid.map(x=>x.p.openingEquity),balances=valid.map(x=>x.p.openingBalance),flat=valid.map(()=>true);
  for(let leg=0;leg<valid.length;leg++){
    let previous=-Infinity;
    for(const mark of valid[leg].p.marks){
      if(!Number.isFinite(mark.time)||mark.time<from||mark.time>=to||mark.time<previous||!Number.isFinite(mark.equity)||mark.equity<0||!Number.isFinite(mark.balance)||mark.balance<0)return null;
      previous=mark.time;events.push({time:mark.time,leg,mark});
    }
  }
  // Bound per-portfolio work independently of per-sleeve capture limits.
  if(events.length>100000)return null;
  events.sort((a,b)=>a.time-b.time||a.leg-b.leg);
  const aggregate=(values:number[])=>values.reduce((s,v,i)=>s+valid[i].w*v/valid[i].p.openingEquity,0);
  const openingBalance=aggregate(balances),marks:IntradayMark[]=[];let minimum=1,complete=true;
  for(let i=0;i<events.length;){
    const time=events[i].time;let end=i+1;while(end<events.length&&events[end].time===time)end++;
    const counts=new Map<number,number>();for(let j=i;j<end;j++)counts.set(events[j].leg,(counts.get(events[j].leg)||0)+1);
    const orderedSingleLeg=counts.size===1;
    if(counts.size>1&&[...counts.values()].some(n=>n>1))complete=false;
    for(let j=i;j<end;j++){
      const {leg,mark}=events[j];equities[leg]=mark.equity;balances[leg]=mark.balance;flat[leg]=mark.flat;
      if(orderedSingleLeg){const equity=aggregate(equities);minimum=Math.min(minimum,equity);marks.push({time,equity,balance:aggregate(balances),flat:flat.every(Boolean)});}
    }
    if(!orderedSingleLeg){const equity=aggregate(equities);minimum=Math.min(minimum,equity);marks.push({time,equity,balance:aggregate(balances),flat:flat.every(Boolean)});}
    i=end;
  }
  const finalEquity=aggregate(equities),finalBalance=aggregate(balances);
  return {path:{timezone:'Europe/Prague',from,to,openingEquity:1,openingBalance,marks,complete,model:'synchronized-ticks'},minimum:minimum-1,startBalanceRatio:openingBalance,endBalanceRatio:finalEquity>0?finalBalance/finalEquity:1,flat:flat.every(Boolean)};
}
