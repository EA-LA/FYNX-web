import type { EdgeStrategy } from './types';
export const EDGE_CONFIG={
  erPeriod:20,adxPeriod:14,atrPeriod:14,volatilityWindow:252,
  regimes:{strong:{er:.45,adx:30},trend:{er:.30,adx:22},weakER:.20,rangeVolatility:50},
  volatilityBuckets:{low:33,high:66},cotHistoryYears:3,cotMinimumReports:104,crowdingQuantile:.85,
  similarDesired:30,similarMinimum:15,shrinkagePriorTrades:30,minimumBucketTrades:10,
  weights:{regime:40,volatility:25,record:20,positioningPositive:15,positioningNegative:10,eventPenalty:20},
  recordMapping:{zeroAtAvgR:-.25,fullAtAvgR:.50},fitThreshold:70,maybeThreshold:45,
  mood:{riskOffVix:25,riskOnVix:15,threshold:.25,minimumMoveParts:4},
  dailyFreshnessMs:4*86400000,correlationWindow:20,correlationWarning:.8,brokerFreshnessMs:180000,quoteFreshnessMs:900000,
} as const;
export const DEFAULT_STRATEGIES:EdgeStrategy[]=[
  {id:'builtin-atr-breakout',name:'ATR breakout',kind:'breakout',params:{strategy:'breakout',lookback:20,atrPeriod:14,entryK:.25,stopS:2,targetTP:4,maxHold:20,riskPct:.5,costPips:1.5,mode:'ohlc'},description:'Completed close breaks the prior 20 closes by 0.25 ATR; next-bar entry, 2 ATR stop, 4 ATR target, 20-bar hold.'},
  {id:'builtin-mean-reversion',name:'Mean reversion',kind:'mean-reversion',params:{strategy:'mean-reversion',meanLookback:20,meanEntryZ:1.5,lookback:20,atrPeriod:14,entryK:0,stopS:2,targetTP:2,maxHold:10,riskPct:.5,costPips:1.5,mode:'ohlc'},description:'Fade a completed close more than 1.5 sample standard deviations from the preceding 20 closes; next-bar entry, 2 ATR stop/target, 10-bar hold.'},
  {id:'builtin-news-drift',name:'News drift',kind:'news',params:{strategy:'news',lookback:20,atrPeriod:14,entryK:.25,stopS:2,targetTP:4,maxHold:5,riskPct:.5,costPips:1.5,mode:'close',newsWindowMinutes:60},description:'Follow the recorded high-impact release day close-to-close move beyond 0.25 ATR; daily proxy, not a 60-minute fill. Requires actual calendar history.'},
];
/** Futures positions are quoted as currency/USD. USD/JPY therefore reverses JPY. */
export const COT_MARKETS:Record<string,{market:string;direction:1|-1}[]>={
 EURUSD:[{market:'EUR',direction:1}],GBPUSD:[{market:'GBP',direction:1}],USDJPY:[{market:'JPY',direction:-1}],AUDUSD:[{market:'AUD',direction:1}],USDCAD:[{market:'CAD',direction:-1}],USDCHF:[{market:'CHF',direction:-1}],NZDUSD:[{market:'NZD',direction:1}],
 EURJPY:[{market:'EUR',direction:1},{market:'JPY',direction:-1}],GBPJPY:[{market:'GBP',direction:1},{market:'JPY',direction:-1}],EURGBP:[{market:'EUR',direction:1},{market:'GBP',direction:-1}],XAUUSD:[{market:'XAU',direction:1}],XAGUSD:[{market:'XAG',direction:1}],US30:[{market:'US30',direction:1}],NAS100:[{market:'NAS100',direction:1}],SPX500:[{market:'SPX500',direction:1}],BTCUSD:[{market:'BTC',direction:1}],ETHUSD:[{market:'ETH',direction:1}],
};
export const BRIEF_TEMPLATES={
 fits:'{first} with {firstStrategy} scores {firstScore}; {second} with {secondStrategy} scores {secondScore}.',
 oneFit:'{first} with {firstStrategy} is the strongest measured fit at {firstScore}.',
 noFits:'No strategy has a complete, sufficiently sampled fit score for this snapshot.',
 avoid:'{market} is the weakest measured fit ({score}); its historical sample contains {count} trades.',
 event:'Next high-impact release: {event} ({currency}) at {time}.',
} as const;
