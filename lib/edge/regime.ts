import { wilderATR } from '../quant/backtest';
import { timeMs } from '../quant/math';
import type { Bar } from '../quant/types';
import { EDGE_CONFIG as C } from './config';
import type { MarketState, Regime, Value, VolBucket } from './types';
export const known=<T>(value:T,asOf?:string):Value<T>=>({value,reason:null,...(asOf?{asOf}:{})});
export const missing=<T>(reason:string):Value<T>=>({value:null,reason});
export const DAY=86400000;
export function completedDailyBars(bars:Bar[],asOf:string|number):Bar[]{const cutoff=timeMs(asOf);let last=-Infinity;return bars.filter(b=>{const t=timeMs(b.time);if(t<=last)throw new Error('Daily bars must be unique and increasing.');last=t;if(!(Number.isFinite(b.close)&&b.close>0))throw new Error('Daily close is invalid.');return t+DAY<=cutoff;});}
export function efficiencyRatio(closes:number[],period=20,index=closes.length-1):number|null{
  if(index<period)return null;let path=0;for(let i=index-period+1;i<=index;i++)path+=Math.abs(closes[i]-closes[i-1]);return path===0?0:Math.abs(closes[index]-closes[index-period])/path;
}
/** Wilder directional movement; first ADX averages period DX values after the DM warmup. */
export function adxSeries(bars:Bar[],period=14):(number|null)[]{
  const out:(number|null)[]=Array(bars.length).fill(null);let trSum=0,plus=0,minus=0,dxSum=0,adx=0,dxCount=0;
  for(let i=1;i<bars.length;i++){
    const b=bars[i],prev=bars[i-1];if([b.high,b.low,prev.high,prev.low].some(v=>!Number.isFinite(v)))return out;
    const up=b.high!-prev.high!,down=prev.low!-b.low!,pd=up>down&&up>0?up:0,md=down>up&&down>0?down:0;
    const tr=Math.max(b.high!-b.low!,Math.abs(b.high!-prev.close),Math.abs(b.low!-prev.close));
    if(i<=period){trSum+=tr;plus+=pd;minus+=md;}else{trSum=trSum-trSum/period+tr;plus=plus-plus/period+pd;minus=minus-minus/period+md;}
    if(i<period)continue;const pdi=trSum>0?100*plus/trSum:0,mdi=trSum>0?100*minus/trSum:0,dx=pdi+mdi>0?100*Math.abs(pdi-mdi)/(pdi+mdi):0;
    if(dxCount<period){dxSum+=dx;dxCount++;if(dxCount===period)out[i]=adx=dxSum/period;}else out[i]=adx=(adx*(period-1)+dx)/period;
  }return out;
}
/** Empirical lower rank (ties share the same rank), 0..100. */
export function percentileRank(value:number,history:number[]):number|null{if(history.length<2||!Number.isFinite(value))return null;return Math.min(100,100*history.filter(v=>v<value).length/(history.length-1));}
export function classifyRegime(er:number,adx:number,volatilityPercentile:number):Regime{
  if(er>=C.regimes.strong.er&&adx>=C.regimes.strong.adx)return 'Strong trend';if(er>=C.regimes.trend.er&&adx>=C.regimes.trend.adx)return 'Trend';if(er>=C.regimes.weakER)return 'Weak trend';return volatilityPercentile<C.regimes.rangeVolatility?'Range':'Choppy';
}
export function volatilityBucket(percentile:number):VolBucket{return percentile<C.volatilityBuckets.low?'low':percentile>C.volatilityBuckets.high?'high':'mid';}
export function stateSeries(bars:Bar[]):MarketState[]{
  const closes=bars.map(b=>b.close),hasOHLC=bars.every(b=>[b.open,b.high,b.low].every(v=>typeof v==='number'&&Number.isFinite(v))&&b.high!>=Math.max(b.open!,b.close)&&b.low!<=Math.min(b.open!,b.close));
  const atr=hasOHLC?wilderATR(bars,C.atrPeriod):Array(bars.length).fill(NaN),adx=hasOHLC?adxSeries(bars,C.adxPeriod):Array(bars.length).fill(null),normalized=atr.map((a,i)=>a/bars[i].close);
  return bars.map((b,i)=>{
    const date=new Date(timeMs(b.time)).toISOString().slice(0,10),availableAt=new Date(timeMs(b.time)+DAY).toISOString(),er=efficiencyRatio(closes,C.erPeriod,i),volHistory=normalized.slice(Math.max(0,i-C.volatilityWindow+1),i+1).filter(Number.isFinite);
    const vol=volHistory.length===C.volatilityWindow?percentileRank(normalized[i],volHistory):null,regime=er!==null&&adx[i]!==null&&vol!==null?classifyRegime(er,adx[i],vol):null;
    const directional=er===null?null:er*Math.sign(b.close-closes[i-C.erPeriod]);const range=bars.slice(Math.max(0,i-C.erPeriod+1),i+1);
    return {date,availableAt,regime:regime?known(regime,availableAt):missing<Regime>(!hasOHLC?'Daily OHLC is required for ADX and true ATR.':'At least 252 valid ATR observations are required to classify regime and volatility.'),efficiencyRatio:er===null?missing<number>('Twenty prior completed daily closes are required.'):known(er,availableAt),trendStrength:directional===null?missing<number>('Twenty prior completed daily closes are required.'):known(directional,availableAt),adx:adx[i]===null?missing<number>(!hasOHLC?'Daily OHLC is unavailable.':'ADX needs 28 daily bars.'):known(adx[i],availableAt),atr:Number.isFinite(atr[i])?known(atr[i],availableAt):missing<number>('Fourteen daily OHLC bars are required.'),volatilityPercentile:vol===null?missing<number>('A full 252-observation history of ATR/close is required.'):known(vol,availableAt),volatilityBucket:vol===null?missing<VolBucket>('Volatility percentile is unavailable.'):known(volatilityBucket(vol),availableAt),high20:range.length===C.erPeriod&&hasOHLC?known(Math.max(...range.map(x=>x.high!)),availableAt):missing<number>('Twenty completed daily OHLC bars are required.'),low20:range.length===C.erPeriod&&hasOHLC?known(Math.min(...range.map(x=>x.low!)),availableAt):missing<number>('Twenty completed daily OHLC bars are required.'),close:known(b.close,availableAt)};
  });
}
export function emptyState(reason='No completed daily bars are available.'):MarketState{return {date:null,availableAt:null,regime:missing(reason),efficiencyRatio:missing(reason),trendStrength:missing(reason),adx:missing(reason),atr:missing(reason),volatilityPercentile:missing(reason),volatilityBucket:missing(reason),high20:missing(reason),low20:missing(reason),close:missing(reason)};}
export function computeRegime(bars:Bar[],asOf:string):MarketState{const completed=completedDailyBars(bars,asOf);return stateSeries(completed).at(-1)||emptyState();}
export function weeklyRegimes(states:MarketState[],asOf:string):{week:string;regime:Regime|null}[]{
  const end=new Date(asOf);end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()-((end.getUTCDay()+6)%7));
  return Array.from({length:52},(_,i)=>{const monday=end.getTime()-(51-i)*7*DAY,cutoff=Math.min(timeMs(asOf),monday+7*DAY);let selected:MarketState|undefined;for(const state of states){if(timeMs(state.availableAt!)<=cutoff)selected=state;else break;}return {week:new Date(monday).toISOString().slice(0,10),regime:selected?.regime.value??null};});
}
