import { finite, integer, quantile, validateReturns } from './math';
import type { Progress, ReturnPoint } from './types';
/** Mulberry32 with a uint32 seed, stable in browser workers and Node. */
export function mulberry32(seed:number):()=>number{let a=seed>>>0;return ()=>{let t=a=(a+0x6D2B79F5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
/** Stationary bootstrap: geometric block lengths with E[length] = blockSize. */
export function stationaryIndices(length:number,horizon:number,blockSize:number,rng:()=>number):number[]{
  integer(length,'Source length',1,250000);integer(horizon,'Bootstrap horizon',1,10000);finite(blockSize,'Block size',1,250000);const out:number[]=[];let index=Math.floor(rng()*length);
  for(let i=0;i<horizon;i++){if(i&&rng()<1/blockSize)index=Math.floor(rng()*length);out.push(index);index=(index+1)%length;}return out;
}
export type MonteCarloOptions={paths?:number;horizon?:number;blockSize?:number;seed?:number;initialEquity?:number};
export function monteCarlo(input:ReturnPoint[]|number[],options:MonteCarloOptions={},onProgress?:Progress){
  const source=validateReturns(input,20),paths=integer(options.paths??2000,'Paths',1,10000),horizon=integer(options.horizon??252,'Horizon',1,2520),blockSize=finite(options.blockSize??10,'Block size',1,source.length),seed=integer(options.seed??42,'Seed',0,4294967295);
  if(paths*horizon>5000000)throw new Error('Reduce paths or horizon to at most 5,000,000 simulated daily observations.');const rng=mulberry32(seed),initial=finite(options.initialEquity??1,'Initial equity',Number.MIN_VALUE,1e12);
  const columns=Array.from({length:horizon+1},()=>new Float64Array(paths)),drawdowns:number[]=[],finalReturns:number[]=[],samples:number[][]=[];
  for(let p=0;p<paths;p++){const sample=p<40?[initial]:null;let value=1,peak=1,dd=0,index=Math.floor(rng()*source.length);columns[0][p]=initial;
    for(let day=1;day<=horizon;day++){if(day>1&&rng()<1/blockSize)index=Math.floor(rng()*source.length);value*=Math.max(0,1+source[index].return);index=(index+1)%source.length;peak=Math.max(peak,value);dd=Math.max(dd,1-value/peak);columns[day][p]=value*initial;sample?.push(value*initial);}
    if(sample)samples.push(sample);drawdowns.push(dd);finalReturns.push(value-1);if((p+1)%50===0||p===paths-1)onProgress?.((p+1)/paths);}
  const fan=columns.map((column,day)=>{column.sort();const values=Array.from(column);return {day,p05:quantile(values,.05),p25:quantile(values,.25),median:quantile(values,.5),p75:quantile(values,.75),p95:quantile(values,.95)};});
  const sortedReturns=[...finalReturns].sort((a,b)=>a-b),sortedDD=[...drawdowns].sort((a,b)=>a-b);
  return {fan,samples,drawdowns,stats:{medianReturn:quantile(sortedReturns,.5),p05Return:quantile(sortedReturns,.05),p95Return:quantile(sortedReturns,.95),lossProbability:finalReturns.filter(v=>v<0).length/paths,medianDrawdown:quantile(sortedDD,.5),p95Drawdown:quantile(sortedDD,.95),drawdownOver10Probability:drawdowns.filter(v=>v>.1).length/paths},seed,paths,horizon,blockSize,notes:['Stationary block bootstrap of observed daily returns; it does not model unseen regimes or liquidity shocks.']};
}
