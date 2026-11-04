import type { QuantParams } from './types';
export const DEFAULT_PARAMS: Readonly<QuantParams> = Object.freeze({
  lookback: 20, atrPeriod: 14, entryK: .25, stopS: 2, targetTP: 4, maxHold: 20,
  costPips: 1.5, riskPct: .5, pipSize: .0001, spreadPips: 0, slippagePips: 0,
  mode: 'close', strategy: 'breakout', newsWindowMinutes: 15, initialEquity: 10000,
});
export type SymbolConfig = {
  id: string; symbol: string; label: string; name: string; group: string;
  pipSize: number; dukascopy: string; dukascopyId: string; quoteSymbol: string;
  currencies: string[]; aliases: string[];
};
const symbol = (id: string, label: string, name: string, group: string, pipSize: number, dukascopyId: string, currencies: string[], aliases: string[] = []): SymbolConfig =>
  ({ id, symbol: label, label, name, group, pipSize, dukascopy: dukascopyId, dukascopyId, quoteSymbol: label, currencies, aliases: [id.toLowerCase(), label.toLowerCase(), ...aliases] });
/** Sole symbol registry. Index feeds are broker CFD prices, not exchange cash-index histories. */
export const SYMBOLS: SymbolConfig[] = [
  symbol('EURUSD','EUR/USD','Euro / US dollar','Forex majors',.0001,'eurusd',['EUR','USD'],['euro']),
  symbol('GBPUSD','GBP/USD','British pound / US dollar','Forex majors',.0001,'gbpusd',['GBP','USD'],['cable']),
  symbol('USDJPY','USD/JPY','US dollar / Japanese yen','Forex majors',.01,'usdjpy',['USD','JPY'],['dollar yen']),
  symbol('AUDUSD','AUD/USD','Australian dollar / US dollar','Forex majors',.0001,'audusd',['AUD','USD'],['aussie']),
  symbol('USDCAD','USD/CAD','US dollar / Canadian dollar','Forex majors',.0001,'usdcad',['USD','CAD'],['loonie']),
  symbol('USDCHF','USD/CHF','US dollar / Swiss franc','Forex majors',.0001,'usdchf',['USD','CHF'],['swissy']),
  symbol('NZDUSD','NZD/USD','New Zealand dollar / US dollar','Forex majors',.0001,'nzdusd',['NZD','USD'],['kiwi']),
  symbol('XAUUSD','XAU/USD','Gold','Metals & crosses',.1,'xauusd',['USD'],['gold','xau']),
  symbol('XAGUSD','XAG/USD','Silver','Metals & crosses',.01,'xagusd',['USD'],['silver','xag']),
  symbol('EURJPY','EUR/JPY','Euro / Japanese yen','Metals & crosses',.01,'eurjpy',['EUR','JPY']),
  symbol('GBPJPY','GBP/JPY','British pound / Japanese yen','Metals & crosses',.01,'gbpjpy',['GBP','JPY']),
  symbol('EURGBP','EUR/GBP','Euro / British pound','Metals & crosses',.0001,'eurgbp',['EUR','GBP']),
  symbol('US30','US30','US 30 CFD','Indices & crypto',1,'usa30idxusd',['USD'],['dow','dow jones']),
  symbol('NAS100','NAS100','US Tech 100 CFD','Indices & crypto',1,'usatechidxusd',['USD'],['nasdaq','nasdaq 100']),
  symbol('SPX500','SPX500','US 500 CFD','Indices & crypto',.1,'usa500idxusd',['USD'],['sp500','s&p 500','s&p']),
  symbol('BTCUSD','BTC/USD','Bitcoin','Indices & crypto',1,'btcusd',['USD'],['bitcoin','btc']),
  symbol('ETHUSD','ETH/USD','Ethereum','Indices & crypto',.1,'ethusd',['USD'],['ethereum','eth']),
];
export const FTMO_ACCOUNT_SIZES = [10000,25000,50000,100000,200000];
export type FTMORules = {
  id: string; label: string; phaseTargets: number[]; dailyLoss: number; maxLoss: number;
  trailing: boolean; minTradingDays: number; bestDayLimit: number | null;
  bestDayBasis: 'net-profit' | 'positive-days' | null;
  source: string; verifiedOn: string; timezone: string;
};
const ftmoCommon = {source:'https://ftmo.com/en/trading-objectives/',verifiedOn:'2026-11-03',timezone:'Europe/Prague'};
/** Percentages are fractions of INITIAL capital. Trailing high is end-of-day BALANCE. */
export const FTMO_RULES: Record<string, FTMORules> = {
  '2-step': { ...ftmoCommon,id:'2-step',label:'FTMO 2-Step',phaseTargets:[.10,.05],dailyLoss:.05,maxLoss:.10,trailing:false,minTradingDays:4,bestDayLimit:null,bestDayBasis:null },
  '1-step': { ...ftmoCommon,id:'1-step',label:'FTMO 1-Step · current consistency',phaseTargets:[.10],dailyLoss:.03,maxLoss:.10,trailing:true,minTradingDays:0,bestDayLimit:.50,bestDayBasis:'net-profit' },
  '1-step-legacy': { ...ftmoCommon,id:'1-step-legacy',label:'FTMO 1-Step · pre-12 Oct 2026',phaseTargets:[.10],dailyLoss:.03,maxLoss:.10,trailing:true,minTradingDays:0,bestDayLimit:.50,bestDayBasis:'positive-days' },
};
