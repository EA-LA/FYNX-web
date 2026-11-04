import { normalizeParams, closeATR, validateBars, breakoutSignal } from './backtest';
import type { BacktestResult, Bar, QuantParams, ReturnPoint, Trade } from './types';
/**
 * Compatibility model for the supplied Claude HTML (Fed H10 daily closes).
 * It rebalances daily R exposure, whereas backtest() keeps units fixed at entry.
 * Kept explicitly separate so reference parity cannot be mistaken for executable fills.
 */
export function referenceBacktest(bars:Bar[],input:Partial<QuantParams>={}):BacktestResult {
  const p=normalizeParams({...input,mode:'close'});validateBars(bars);if(p.strategy!=='breakout')throw new Error('Reference compatibility excludes the preview approximate NFP calendar.');
  const start=Math.max(p.startIndex||0,p.lookback+p.atrPeriod+1),atr=closeATR(bars.map(b=>b.close),p.atrPeriod);if(start>=bars.length-1)throw new Error('Not enough daily data for the reference model.');
  const cost=p.costPips*p.pipSize,risk=p.riskPct/100;let pos:{dir:number;entry:number;stop:number;target:number;held:number;i:number;equity:number}|null=null,eq=p.initialEquity,peak=eq,maxDrawdown=0;const dailyReturns:ReturnPoint[]=[],trades:Trade[]=[],equity:{date:string;equity:number}[]=[];
  for(let i=start;i<bars.length;i++){let r=0,traded=false,exited=false;
    if(pos){r+=(bars[i].close-bars[i-1].close)*pos.dir/pos.stop*risk;pos.held++;const move=(bars[i].close-pos.entry)*pos.dir;
      if(move<=-pos.stop||move>=pos.target||pos.held>=p.maxHold||i===bars.length-1){r-=cost/pos.stop*risk;const R=(move-cost)/pos.stop;trades.push({entryDate:new Date(bars[pos.i].time).toISOString(),exitDate:new Date(bars[i].time).toISOString(),entryPrice:pos.entry,exitPrice:bars[i].close,side:pos.dir>0?'long':'short',R,pnl:R*pos.equity*risk,reason:move<=-pos.stop?'stop':move>=pos.target?'target':i===bars.length-1?'last':'time',entryIndex:pos.i,exitIndex:i,riskAmount:pos.equity*risk});pos=null;exited=true;}}
    if(!pos&&!exited&&i<bars.length-1&&Number.isFinite(atr[i])&&atr[i]>0){const dir=breakoutSignal(bars,i,atr[i],p);if(dir){pos={dir,entry:bars[i].close,stop:p.stopS*atr[i],target:p.targetTP*atr[i],held:0,i,equity:eq};traded=true;}}
    eq*=1+r;peak=Math.max(peak,eq);maxDrawdown=Math.max(maxDrawdown,1-eq/peak);const date=new Date(bars[i].time).toISOString().slice(0,10);dailyReturns.push({date,return:r,traded,flat:!pos});equity.push({date,equity:eq});
  }
  const vals=dailyReturns.map(p=>p.return),n=vals.length,mu=vals.reduce((a,b)=>a+b,0)/n,sd=Math.sqrt(Math.max(vals.reduce((a,b)=>a+b*b,0)/n-mu*mu,1e-18)),gain=trades.reduce((s,t)=>s+Math.max(0,t.R),0),loss=-trades.reduce((s,t)=>s+Math.min(0,t.R),0),ret=eq/p.initialEquity-1;
  return {equity,dailyReturns,trades,params:p,stats:{totalReturn:ret,cagr:Math.pow(eq/p.initialEquity,1/Math.max(n/252,.01))-1,sharpe:mu/sd*Math.sqrt(252),maxDrawdown,trades:trades.length,winRate:trades.length?trades.filter(t=>t.R>0).length/trades.length:0,profitFactor:loss>0?gain/loss:gain>0?9.99:0,averageR:trades.length?trades.reduce((s,t)=>s+t.R,0)/trades.length:0,returnMaxDD:maxDrawdown>0?ret/maxDrawdown:0},notes:['Reference compatibility: reproduces the supplied daily-close model, including daily rebalanced risk exposure and population Sharpe deviation.','This model is for reference verification; deployable backtest() maintains fixed position units and includes explicit execution costs.']};
}
