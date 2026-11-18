import type { EquityPoint, ReturnPoint, Stats, Trade } from './types';
export function finite(value: unknown, name: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be a finite number between ${min} and ${max}.`);
  return value;
}
export function integer(value: unknown, name: string, min: number, max: number): number {
  const n=finite(value,name,min,max);if(!Number.isInteger(n))throw new Error(`${name} must be an integer.`);return n;
}
export const mean = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
export function variance(values: number[]): number { const m=mean(values);return values.length > 1 ? values.reduce((s,v)=>s+(v-m)**2,0)/(values.length-1):0; }
export function quantile(sorted: number[], q: number): number { if(!sorted.length)return 0;const i=(sorted.length-1)*q,j=Math.floor(i);return sorted[j]+(sorted[Math.min(j+1,sorted.length-1)]-sorted[j])*(i-j); }
export const timeMs = (time: string|number) => {const t=typeof time==='number'?time:Date.parse(time);if(!Number.isFinite(t))throw new Error('A valid ISO timestamp or epoch milliseconds is required.');return t;};
export function validateReturns(input: ReturnPoint[] | number[], minLength=2): ReturnPoint[] {
  if(!Array.isArray(input)||input.length<minLength||input.length>250000)throw new Error(`At least ${minLength} returns (maximum 250,000) are required.`);
  let previous='';return input.map((p,i)=>{const row:ReturnPoint=typeof p==='number'?{date:new Date(Date.UTC(2000,0,1+i)).toISOString().slice(0,10),return:p}:{...p};
    finite(row.return,'Return',-1,100);if(typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||new Date(row.date).toISOString().slice(0,10)!==row.date||row.date<=previous)throw new Error('Return dates must be unique and increasing ISO calendar dates.');previous=row.date;
    if(row.intradayMin!==undefined){finite(row.intradayMin,'Intraday minimum',-1,100);if(row.intradayMin>Math.min(0,row.return)+1e-9)throw new Error('Intraday minimum cannot exceed the opening or closing equity.');}
    if(row.startBalanceRatio!==undefined)finite(row.startBalanceRatio,'Opening balance ratio',0,100);
    if(row.endBalanceRatio!==undefined)finite(row.endBalanceRatio,'Closing balance ratio',0,100);
    return row;});
}
export function equityFromReturns(returns: ReturnPoint[], initial=10000): EquityPoint[] { let e=initial;return returns.map(p=>{e*=1+p.return;return {date:p.date,equity:e};}); }
export function statistics(returns: ReturnPoint[] | number[], trades: Trade[] = [], initial=10000): Stats {
  const vals=returns.map(p=>typeof p==='number'?p:p.return);let value=1,peak=1,dd=0;for(const r of vals){value*=Math.max(0,1+r);peak=Math.max(peak,value);dd=Math.max(dd,peak?1-value/peak:0);}
  const totalReturn=value-1;const first=returns[0],last=returns[returns.length-1];
  const years=typeof first==='object'&&typeof last==='object'&&last.date!==first.date?Math.max(1/252,(timeMs(last.date)-timeMs(first.date))/86400000/365.25):Math.max(1/252,vals.length/252);
  const wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<0),profit=wins.reduce((s,t)=>s+t.pnl,0),loss=-losses.reduce((s,t)=>s+t.pnl,0);const sd=Math.sqrt(variance(vals));
  return {totalReturn,cagr:value===0?-1:Math.pow(value,1/years)-1,sharpe:sd>1e-15?mean(vals)/sd*Math.sqrt(252):0,maxDrawdown:dd,trades:trades.length,winRate:trades.length?wins.length/trades.length:null,profitFactor:loss>0?profit/loss:null,averageR:trades.length?mean(trades.map(t=>t.R)):null,returnMaxDD:dd>0?totalReturn/dd:null};
}
export function correlation(a:number[],b:number[]):number {const ma=mean(a),mb=mean(b);let ab=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;ab+=x*y;aa+=x*x;bb+=y*y;}return aa>0&&bb>0?Math.max(-1,Math.min(1,ab/Math.sqrt(aa*bb))):0;}
