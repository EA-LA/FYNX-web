import { FTMO_ACCOUNT_SIZES, FTMO_RULES } from './config';
import type { FTMORules } from './config';
import { finite, integer, quantile, validateReturns } from './math';
import { mulberry32 } from './bootstrap';
import type { Progress, ReturnPoint } from './types';
export type FTMOOptions={attempts?:number;horizon?:number;riskScale?:number;intradayBufferPct?:number;accountSize?:number;ruleId?:string;seed?:number;blockSize?:number;includeRiskScan?:boolean;riskScales?:number[]};
export type PhaseOutcome={status:'pass'|'daily-loss'|'max-loss'|'timeout';days:number;tradingDays:number;equity:number;balance:number;bestDay:number;positiveProfit:number};
/** Deterministic phase evaluator also used by tests and imported chronological paths.
 * Intraday paths must be relative to each day's OPENING equity, not yesterday's balance.
 * Targets require closed positions and four actual opening days for the 2-Step rule.
 */
export function evaluatePhase(path:ReturnPoint[],rules:FTMORules,target:number,options:{accountSize?:number;riskScale?:number;intradayBufferPct?:number}={}):PhaseOutcome{
  const initial=options.accountSize??10000,scale=options.riskScale??1,buffer=(options.intradayBufferPct??1)/100;let equity=initial,balance=initial,highBalance=initial,tradingDays=0,bestDay=0,positiveProfit=0;
  for(let i=0;i<path.length;i++){const row=path[i],startEquity=equity;
    const hasIntraday=row.intradayComplete===true&&row.intradayMin!==undefined&&row.dayTimezone==='Europe/Prague';
    // A daily-only estimate explicitly tightens the loss amount by the buffer.
    const effectiveDailyLoss=Math.max(0,rules.dailyLoss-(hasIntraday?0:buffer));
    const openingBalance=startEquity*(1+scale*((row.startBalanceRatio??1)-1));
    const closingRatio=(1+row.return)*(row.endBalanceRatio??1);
    equity=startEquity*Math.max(0,1+row.return*scale);balance=startEquity*Math.max(0,1+(closingRatio-1)*scale);
    const minimum=startEquity*Math.max(0,1+scale*(hasIntraday?row.intradayMin!:Math.min(0,row.return)));
    if(row.traded??row.return!==0)tradingDays++;
    const pnl=balance-openingBalance;bestDay=Math.max(bestDay,pnl);positiveProfit+=Math.max(0,pnl);
    const result=(status:PhaseOutcome['status']):PhaseOutcome=>({status,days:i+1,tradingDays,equity,balance,bestDay,positiveProfit});
    const dailyFloor=openingBalance-effectiveDailyLoss*initial,maxFloor=(rules.trailing?highBalance:initial)-rules.maxLoss*initial;
    // Attribute simultaneous breaches to max loss; categories remain mutually exclusive.
    if(minimum<maxFloor-1e-8)return result('max-loss');
    if(minimum<dailyFloor-1e-8)return result('daily-loss');
    highBalance=Math.max(highBalance,balance);
    const denominator=rules.bestDayBasis==='positive-days'?positiveProfit:balance-initial;
    const consistent=rules.bestDayLimit===null||denominator>0&&bestDay<=denominator*rules.bestDayLimit+1e-8;
    if(balance>=initial*(1+target)-1e-8&&row.flat!==false&&tradingDays>=rules.minTradingDays&&consistent)return result('pass');
  }
  return {status:'timeout',days:path.length,tradingDays,equity,balance,bestDay,positiveProfit};
}
function attemptsAtScale(source:ReturnPoint[],options:Required<Omit<FTMOOptions,'riskScales'>> & {rules:FTMORules},scale:number,onProgress?:Progress){
  const rng=mulberry32(options.seed),rules=options.rules;let phase1=0,both=0,daily=0,max=0,timeout=0;const days1:number[]=[],days2:number[]=[];
  for(let attempt=0;attempt<options.attempts;attempt++){
    let passed=true;
    for(let phase=0;phase<rules.phaseTargets.length;phase++){
      const path:ReturnPoint[]=[];let index=Math.floor(rng()*source.length);for(let day=0;day<options.horizon;day++){if(day&&rng()<1/options.blockSize)index=Math.floor(rng()*source.length);path.push(source[index]);index=(index+1)%source.length;}
      // A fresh evaluation resets equity, static/trailing floors and trading-day counters for phase 2.
      const outcome=evaluatePhase(path,rules,rules.phaseTargets[phase],{accountSize:options.accountSize,riskScale:scale,intradayBufferPct:options.intradayBufferPct});
      if(outcome.status==='pass'){if(phase===0){phase1++;days1.push(outcome.days);}else days2.push(outcome.days);}
      else{passed=false;if(outcome.status==='daily-loss')daily++;else if(outcome.status==='max-loss')max++;else timeout++;break;}
    }
    if(passed)both++;if((attempt+1)%100===0||attempt===options.attempts-1)onProgress?.((attempt+1)/options.attempts);
  }
  days1.sort((a,b)=>a-b);days2.sort((a,b)=>a-b);return {phase1PassRate:phase1/options.attempts,bothPassRate:both/options.attempts,dailyLossRate:daily/options.attempts,maxLossRate:max/options.attempts,timeoutRate:timeout/options.attempts,medianDaysPhase1:days1.length?quantile(days1,.5):null,medianDaysPhase2:days2.length?quantile(days2,.5):null};
}
export function ftmo(input:ReturnPoint[]|number[],requested:FTMOOptions={},onProgress?:Progress){
  const source=validateReturns(input,20),ruleId=requested.ruleId||'2-step',rules=FTMO_RULES[ruleId];if(!rules)throw new Error('Choose a configured FTMO rule version.');
  const options={attempts:integer(requested.attempts??2000,'Attempts',1,10000),horizon:integer(requested.horizon??120,'Phase horizon',4,1000),riskScale:finite(requested.riskScale??1,'Risk scale',.05,10),intradayBufferPct:finite(requested.intradayBufferPct??1,'Intraday buffer percent',0,rules.dailyLoss*100-.01),accountSize:finite(requested.accountSize??10000,'Account size',10000,200000),ruleId,seed:integer(requested.seed??42,'Seed',0,4294967295),blockSize:finite(requested.blockSize??10,'Block size',1,source.length),includeRiskScan:requested.includeRiskScan!==false,rules};
  if(!FTMO_ACCOUNT_SIZES.includes(options.accountSize))throw new Error('Choose a configured FTMO account size.');
  const riskScales=requested.riskScales||Array.from({length:20},(_,i)=>(i+1)*.25);if(riskScales.length>30)throw new Error('Use at most 30 risk scales.');riskScales.forEach(s=>finite(s,'Risk scan scale',.05,10));
  if(options.attempts*options.horizon*(options.includeRiskScan?riskScales.length+1:1)>60000000)throw new Error('Reduce attempts, horizon or risk-scan points to fit the simulation budget.');
  const work=options.includeRiskScan?riskScales.length+1:1,stats=attemptsAtScale(source,options,options.riskScale,p=>onProgress?.(p/work));
  const riskScan=options.includeRiskScan?riskScales.map((riskScale,i)=>{const s=attemptsAtScale(source,options,riskScale);onProgress?.((i+2)/work);return {riskScale,passRate:s.bothPassRate,breachRate:s.dailyLossRate+s.maxLossRate,timeoutRate:s.timeoutRate};}):[];
  const verdict=stats.bothPassRate>=.7?'Most simulated attempts passed at this risk scale; historical resampling cannot establish future reliability.':stats.bothPassRate>=.3?'Results are mixed. Loss-limit breaches and timeouts remain material.':'Most simulated attempts did not pass. Review losses and timeouts before increasing risk.';
  return {stats,riskScan,verdict,rules,seed:options.seed,attempts:options.attempts,horizon:options.horizon,accountSize:options.accountSize,riskScale:options.riskScale,intradayBufferPct:options.intradayBufferPct,notes:['Simulated from past returns. An estimate, not a promise. Confirm current rules on ftmo.com.', 'Minimum days count days with positions opened, when that metadata is available. Imported return-only series infer a trading day from a nonzero return.', 'Each phase starts with the original account balance. The horizon is a simulation cap, not an FTMO time limit.',source.every(r=>r.intradayComplete&&r.intradayMin!==undefined&&r.dayTimezone==='Europe/Prague')?'Recorded intraday equity minima are checked and no daily buffer is applied. Validate that day boundaries match Europe/Prague.':`Daily-only paths use a ${options.intradayBufferPct}% initial-balance buffer; daily-close returns cannot prove intraday compliance.`, 'Bootstrap transitions may splice different open-position states; pass rates are statistical estimates rather than broker-rule certification.']};
}
export const simulateFTMO=ftmo;
