export type EAPlatform = 'mt5' | 'mt4' | 'ctrader';
export interface EASettings {
  platform: EAPlatform; symbol: string; timeframe: string;
  params: { lookback?:number; atrPeriod?:number; entryK?:number; stopS?:number; targetTP?:number; maxHold?:number; riskPct?:number; mode?:string; strategy?:string; costPips?:number; slippagePips?:number; [key:string]:unknown };
  dailyLossPct?:number; maxLossPct?:number; initialBalance?:number;
}
export interface GeneratedEA { filename:string; mime:string; source:string; notes:string[] }
function bounded(v:unknown,fallback:number,min:number,max:number,label:string,integer=false):number {
  const n=v===undefined?fallback:Number(v);
  if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new Error(`Invalid ${label}.`);
  return n;
}
function normalize(input:EASettings) {
  if(!input || !['mt5','mt4','ctrader'].includes(input.platform))throw new Error('Choose MT5, MT4 or cTrader.');
  const symbol=String(input.symbol||'').toUpperCase().replace('/','');
  if(!/^[A-Z0-9]{3,12}$/.test(symbol))throw new Error('Invalid export symbol.');
  if(!['M1','M5','H1','H4','D1'].includes(input.timeframe))throw new Error('EA exports need a tested M1, M5, H1, H4 or D1 candle timeframe. Tick-only settings cannot be silently converted.');
  const p=input.params||{};
  if(p.strategy && p.strategy!=='breakout')throw new Error('News strategies need an execution-time calendar integration; only tested ATR breakout settings can be exported.');
  if(p.mode && !['close','ohlc'].includes(p.mode))throw new Error('Tick-mode strategy export is unavailable. Backtest a candle timeframe first.');
  return {platform:input.platform,symbol,tf:input.timeframe,
    n:bounded(p.lookback,20,2,500,'lookback',true),a:bounded(p.atrPeriod,14,2,500,'ATR period',true),
    k:bounded(p.entryK,.25,0,10,'entry ATR'),s:bounded(p.stopS,2,.05,20,'stop ATR'),tp:bounded(p.targetTP,4,.05,40,'target ATR'),
    h:bounded(p.maxHold,20,1,10000,'max hold',true),risk:bounded(p.riskPct,.5,.001,10,'risk percentage'),
    close:p.mode===undefined||p.mode==='close',daily:bounded(input.dailyLossPct,4,.1,20,'daily guard'),max:bounded(input.maxLossPct,9,.1,50,'maximum guard'),
    balance:bounded(input.initialBalance,10000,1,100000000,'initial balance')};
}
type Settings=ReturnType<typeof normalize>;
const notes=[
  'Generated source requires compilation and Strategy Tester/demo validation in the target platform; native compilation is not verified by this website.',
  'The signal uses the last completed candle and orders execute on the first tick of the next candle. Historical close-only fills and fixed research costs do not reproduce broker spreads, commissions, slippage or gaps.',
  'Set the exact broker symbol, tested timeframe and initial account balance. At first attachment, supply the verified start-of-day equity or the bot waits for the next Prague trading day.',
  'Guards measure total account equity and close positions owned by this bot only. Other trading can breach the account limits. Daily and maximum breaches latch; restart does not intentionally reset them.',
  'Use desktop execution for persistent guards. Confirm time, costs, volume limits and rules on the broker/demo account before any challenge.'
];
export function generateEA(input:EASettings):GeneratedEA {
  const p=normalize(input),ext=p.platform==='mt5'?'mq5':p.platform==='mt4'?'mq4':'cs';
  return {filename:`FynxQuant_${p.symbol}_${p.tf}.${ext}`,mime:'text/plain;charset=utf-8',source:p.platform==='ctrader'?csharp(p):mql(p),notes:[...notes]};
}

function mql(p:Settings):string {
  const five=p.platform==='mt5';
  return `// FYNX Quant Analyst - ATR breakout, ${p.symbol} ${p.tf}
// Adapted from the approved reference genEa() with strict completed-bar signals,
// risk rounded DOWN, persistent equity guards and explicit chart validation.
// Educational research source. Compile and test on a demo first.
// Costs are broker actuals; the web backtest's fixed cost is not an execution promise.
#property strict
${five?'#include <Trade/Trade.mqh>\nCTrade trade;':''}
input string InpSymbol = "${p.symbol}"; // Change only for your broker's equivalent symbol suffix.
input ENUM_TIMEFRAMES InpTimeframe = PERIOD_${p.tf};
input int InpLookback = ${p.n};
input int InpAtrPeriod = ${p.a};
input double InpEntryAtr = ${p.k};
input double InpStopAtr = ${p.s};
input double InpTargetAtr = ${p.tp};
input int InpMaxHold = ${p.h};
input double InpRiskPct = ${p.risk};
input bool InpCloseAtr = ${p.close};
input double InpInitBal = ${p.balance};
input double InpDailyStop = ${p.daily};
input double InpMaxStop = ${p.max};
input double InpFirstDayEquity = 0; // Actual equity at Prague midnight; 0 waits until next day.
input int InpSlippagePoints = 20; // Broker points; set and retest for this instrument.
input int InpMagic = 770101;
// Strategy Tester must set its simulated server offset correctly for Prague guards.
input int InpTesterServerUtcOffset = 0;
datetime lastBar=0; string guardKey=""; double dayStartEq=0; int dayId=0;
bool dailyLocked=false, maxLocked=false, waitingForDay=false;
double Equity(){return ${five?'AccountInfoDouble(ACCOUNT_EQUITY)':'AccountEquity()'};}
double Balance(){return ${five?'AccountInfoDouble(ACCOUNT_BALANCE)':'AccountBalance()'};}
int PragueDay(){
  datetime utc=${five?'MQLInfoInteger(MQL_TESTER)':'IsTesting()'} ? TimeCurrent()-InpTesterServerUtcOffset*3600 : TimeGMT();
  MqlDateTime d; TimeToStruct(utc,d);
  MqlDateTime end; ZeroMemory(end); end.year=d.year; end.mon=3; end.day=31; end.hour=1;
  datetime march=StructToTime(end); TimeToStruct(march,end); march-=end.day_of_week*86400;
  ZeroMemory(end); end.year=d.year; end.mon=10; end.day=31; end.hour=1;
  datetime october=StructToTime(end); TimeToStruct(october,end); october-=end.day_of_week*86400;
  TimeToStruct(utc+((utc>=march && utc<october)?7200:3600),d);
  return d.year*10000+d.mon*100+d.day;
}
void SaveGuards(){
  // A stale chart shutdown must never clear another instance's maximum breach.
  if(maxLocked)GlobalVariableSet(guardKey+"max",1);
  else if(!GlobalVariableCheck(guardKey+"max"))GlobalVariableSet(guardKey+"max",0);
  if(GlobalVariableGet(guardKey+"max")>0)maxLocked=true;
  int storedDay=GlobalVariableCheck(guardKey+"day")?(int)GlobalVariableGet(guardKey+"day"):0;
  if(storedDay>dayId){GlobalVariablesFlush();return;}
  if(storedDay==dayId&&GlobalVariableGet(guardKey+"daily")>0)dailyLocked=true;
  GlobalVariableSet(guardKey+"day",dayId); GlobalVariableSet(guardKey+"eq",dayStartEq);
  GlobalVariableSet(guardKey+"daily",dailyLocked?1:0);
  GlobalVariableSet(guardKey+"wait",waitingForDay?1:0); GlobalVariablesFlush();
}
void CloseOwned(){
${five?`  for(int i=PositionsTotal()-1;i>=0;i--){
    ulong ticket=PositionGetTicket(i); if(ticket==0 || PositionGetInteger(POSITION_MAGIC)!=InpMagic)continue;
    if(!trade.PositionClose(ticket))Print("Guard close failed: ",trade.ResultRetcodeDescription());
  }`:`  for(int i=OrdersTotal()-1;i>=0;i--){
    if(!OrderSelect(i,SELECT_BY_POS,MODE_TRADES)||OrderMagicNumber()!=InpMagic)continue;
    int type=OrderType(); if(type!=OP_BUY&&type!=OP_SELL)continue;
    double price=MarketInfo(OrderSymbol(),type==OP_BUY?MODE_BID:MODE_ASK);
    if(!OrderClose(OrderTicket(),OrderLots(),price,InpSlippagePoints,clrNONE))Print("Guard close failed: ",GetLastError());
  }`}
}
bool Guard(){
  int today=PragueDay();
  if(GlobalVariableCheck(guardKey+"max")&&GlobalVariableGet(guardKey+"max")>0)maxLocked=true;
  if(today!=dayId){
    dayId=today;
    if(GlobalVariableCheck(guardKey+"day")&&(int)GlobalVariableGet(guardKey+"day")==today){dayStartEq=GlobalVariableGet(guardKey+"eq");dailyLocked=GlobalVariableGet(guardKey+"daily")>0;waitingForDay=GlobalVariableGet(guardKey+"wait")>0;}
    else{dayStartEq=MathMax(Balance(),Equity());dailyLocked=false;waitingForDay=false;SaveGuards();}
  }
  // Persisted locks are shared by this magic number on the account.
  if(GlobalVariableCheck(guardKey+"max")&&GlobalVariableGet(guardKey+"max")>0)maxLocked=true;
  if(GlobalVariableCheck(guardKey+"daily")&&GlobalVariableGet(guardKey+"daily")>0)dailyLocked=true;
  double equity=Equity();
  if(equity<=InpInitBal*(1-InpMaxStop/100.0)){maxLocked=true;SaveGuards();}
  if(!waitingForDay && dayStartEq-equity>=InpInitBal*InpDailyStop/100.0){dailyLocked=true;SaveGuards();}
  if(maxLocked||dailyLocked){CloseOwned();return false;}
  return !waitingForDay;
}
double Atr(){
  int count=iBars(_Symbol,InpTimeframe); if(count<InpAtrPeriod+2)return 0;
  if(InpCloseAtr){double sum=0;for(int i=1;i<=InpAtrPeriod;i++)sum+=MathAbs(iClose(_Symbol,InpTimeframe,i)-iClose(_Symbol,InpTimeframe,i+1));return sum/InpAtrPeriod;}
  // Wilder seed followed by recursive true-range smoothing, using completed bars only.
  double atr=0;int observations=0;
  for(int i=count-2;i>=1;i--){double prev=iClose(_Symbol,InpTimeframe,i+1),hi=iHigh(_Symbol,InpTimeframe,i),lo=iLow(_Symbol,InpTimeframe,i);
    double tr=MathMax(hi-lo,MathMax(MathAbs(hi-prev),MathAbs(lo-prev)));
    if(observations<InpAtrPeriod){atr+=tr;observations++;if(observations==InpAtrPeriod)atr/=InpAtrPeriod;}
    else atr=(atr*(InpAtrPeriod-1)+tr)/InpAtrPeriod;
  }return observations>=InpAtrPeriod?atr:0;
}
bool HasSymbolPosition(){
${five?`  for(int i=PositionsTotal()-1;i>=0;i--){ulong ticket=PositionGetTicket(i);if(ticket>0&&PositionGetString(POSITION_SYMBOL)==_Symbol)return true;}`:`  for(int i=OrdersTotal()-1;i>=0;i--)if(OrderSelect(i,SELECT_BY_POS,MODE_TRADES)&&OrderSymbol()==_Symbol&&(OrderType()==OP_BUY||OrderType()==OP_SELL))return true;`}
  return false; // Do not merge with another EA/manual position on this symbol.
}
bool ManageHold(){bool owned=false;
${five?`  for(int i=PositionsTotal()-1;i>=0;i--){ulong ticket=PositionGetTicket(i);
    if(ticket==0||PositionGetString(POSITION_SYMBOL)!=_Symbol||PositionGetInteger(POSITION_MAGIC)!=InpMagic)continue;
    owned=true;int held=iBarShift(_Symbol,InpTimeframe,(datetime)PositionGetInteger(POSITION_TIME),false);
    if(held>=InpMaxHold&&!trade.PositionClose(ticket))Print("Time exit failed: ",trade.ResultRetcodeDescription());
  }`:`  for(int i=OrdersTotal()-1;i>=0;i--){
    if(!OrderSelect(i,SELECT_BY_POS,MODE_TRADES)||OrderSymbol()!=_Symbol||OrderMagicNumber()!=InpMagic||(OrderType()!=OP_BUY&&OrderType()!=OP_SELL))continue;
    owned=true;int held=iBarShift(_Symbol,InpTimeframe,OrderOpenTime(),false);
    if(held>=InpMaxHold){RefreshRates();if(!OrderClose(OrderTicket(),OrderLots(),OrderType()==OP_BUY?Bid:Ask,InpSlippagePoints,clrNONE))Print("Time exit failed: ",GetLastError());}
  }`}
  return owned;
}
double LotsFor(double stopDistance){
  double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
  double tickValue=${five?'SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE_LOSS)':'MarketInfo(_Symbol,MODE_TICKVALUE)'};
  double step=${five?'SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP)':'MarketInfo(_Symbol,MODE_LOTSTEP)'};
  double minimum=${five?'SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN)':'MarketInfo(_Symbol,MODE_MINLOT)'};
  double maximum=${five?'SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX)':'MarketInfo(_Symbol,MODE_MAXLOT)'};
  if(tickSize<=0||tickValue<=0||step<=0||stopDistance<=0)return 0;
  double lots=MathFloor((Equity()*InpRiskPct/100.0)/(stopDistance/tickSize*tickValue)/step)*step;
  // Never round UP to minimum volume; that could exceed the tested risk budget.
  if(lots<minimum)return 0;
  return NormalizeDouble(MathMin(lots,maximum),8);
}
int OnInit(){
  if(_Symbol!=InpSymbol||Period()!=InpTimeframe){Print("Attach to the exact tested broker symbol and timeframe.");return INIT_PARAMETERS_INCORRECT;}
  if(InpLookback<2||InpAtrPeriod<2||InpStopAtr<=0||InpTargetAtr<=0||InpRiskPct<=0||InpRiskPct>10||InpInitBal<=0||InpDailyStop<=0||InpMaxStop<=0||InpMaxHold<1)return INIT_PARAMETERS_INCORRECT;
${five?'  trade.SetExpertMagicNumber(InpMagic);trade.SetDeviationInPoints(InpSlippagePoints);trade.SetTypeFillingBySymbol(_Symbol);':''}
  guardKey="FQ"+IntegerToString(${five?'AccountInfoInteger(ACCOUNT_LOGIN)':'AccountNumber()'})+"_"+IntegerToString(InpMagic)+"_";
  dayId=PragueDay();maxLocked=GlobalVariableCheck(guardKey+"max")&&GlobalVariableGet(guardKey+"max")>0;
  if(GlobalVariableCheck(guardKey+"day")&&(int)GlobalVariableGet(guardKey+"day")==dayId){
    dayStartEq=GlobalVariableGet(guardKey+"eq");dailyLocked=GlobalVariableGet(guardKey+"daily")>0;waitingForDay=GlobalVariableGet(guardKey+"wait")>0;
  }else{dayStartEq=InpFirstDayEquity;waitingForDay=InpFirstDayEquity<=0;dailyLocked=false;}
  SaveGuards();lastBar=iTime(_Symbol,InpTimeframe,0);EventSetTimer(1);
  if(waitingForDay)Print("Waiting for next Prague trading day: first-day starting equity was not supplied.");
  return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){SaveGuards();EventKillTimer();}
void OnTimer(){Guard();}
void OnTick(){
  if(!Guard())return;
  datetime bar=iTime(_Symbol,InpTimeframe,0);if(bar<=0||bar==lastBar)return;lastBar=bar;
  if(ManageHold()||HasSymbolPosition())return;
  if(iBars(_Symbol,InpTimeframe)<MathMax(InpLookback,InpAtrPeriod)+3)return;
  double atr=Atr(),close=iClose(_Symbol,InpTimeframe,1);if(atr<=0||close<=0)return;
  double high=-DBL_MAX,low=DBL_MAX;
  for(int i=2;i<InpLookback+2;i++){double c=iClose(_Symbol,InpTimeframe,i);high=MathMax(high,c);low=MathMin(low,c);}
  int direction=close>high+InpEntryAtr*atr?1:(close<low-InpEntryAtr*atr?-1:0);if(direction==0)return;
  double stop=InpStopAtr*atr,target=InpTargetAtr*atr,lots=LotsFor(stop);if(lots<=0)return;
  double minStop=${five?'(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point':'MarketInfo(_Symbol,MODE_STOPLEVEL)*Point'};
  if(stop<minStop||target<minStop){Print("Broker stop-distance restriction: skipped.");return;}
${five?`  MqlTick quote;if(!SymbolInfoTick(_Symbol,quote))return;
  double price=direction>0?quote.ask:quote.bid;
  double sl=NormalizeDouble(price-direction*stop,_Digits),tp=NormalizeDouble(price+direction*target,_Digits);
  bool ok=direction>0?trade.Buy(lots,_Symbol,0,sl,tp,"FynxQuant"):trade.Sell(lots,_Symbol,0,sl,tp,"FynxQuant");
  if(!ok)Print("Entry failed: ",trade.ResultRetcodeDescription());`:`  RefreshRates();double price=direction>0?Ask:Bid;
  double sl=NormalizeDouble(price-direction*stop,Digits),tp=NormalizeDouble(price+direction*target,Digits);
  int type=direction>0?OP_BUY:OP_SELL;
  if(AccountFreeMarginCheck(_Symbol,type,lots)<=0){Print("Insufficient free margin: skipped.");return;}
  int ticket=OrderSend(_Symbol,type,lots,price,InpSlippagePoints,sl,tp,"FynxQuant",InpMagic,0,clrNONE);
  if(ticket<0)Print("Entry failed: ",GetLastError());`}
}
`;
}

function csharp(p:Settings):string {
  const tf={M1:'Minute',M5:'Minute5',H1:'Hour',H4:'Hour4',D1:'Daily'}[p.tf];
  return `// FYNX Quant Analyst - ${p.symbol} ${p.tf} ATR breakout.
// Completed-candle signals; next-bar market execution. Actual broker costs apply.
// Compile in cTrader Algo, backtest, then demo before using a challenge.
// Persistent guard state is intended for desktop, not cTrader Cloud memory-only storage.
using System;
using System.Globalization;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Internals;
namespace cAlgo.Robots
{
  [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
  public class FynxQuantATR : Robot
  {
    [Parameter("Tested symbol", DefaultValue = "${p.symbol}")] public string TestedSymbol { get; set; }
    [Parameter("Lookback", DefaultValue = ${p.n}, MinValue = 2)] public int Lookback { get; set; }
    [Parameter("ATR period", DefaultValue = ${p.a}, MinValue = 2)] public int AtrPeriod { get; set; }
    [Parameter("Entry ATR", DefaultValue = ${p.k}, MinValue = 0)] public double EntryAtr { get; set; }
    [Parameter("Stop ATR", DefaultValue = ${p.s}, MinValue = 0.05)] public double StopAtr { get; set; }
    [Parameter("Target ATR", DefaultValue = ${p.tp}, MinValue = 0.05)] public double TargetAtr { get; set; }
    [Parameter("Max hold bars", DefaultValue = ${p.h}, MinValue = 1)] public int MaxHold { get; set; }
    [Parameter("Risk %", DefaultValue = ${p.risk}, MinValue = 0.001, MaxValue = 10)] public double RiskPct { get; set; }
    [Parameter("Close-only ATR", DefaultValue = ${p.close})] public bool CloseAtr { get; set; }
    [Parameter("Initial balance", DefaultValue = ${p.balance}, MinValue = 1)] public double InitialBalance { get; set; }
    [Parameter("Daily loss guard %", DefaultValue = ${p.daily}, MinValue = 0.1)] public double DailyLossPct { get; set; }
    [Parameter("Max loss guard %", DefaultValue = ${p.max}, MinValue = 0.1)] public double MaxLossPct { get; set; }
    [Parameter("First-day midnight equity (0 waits)", DefaultValue = 0)] public double FirstDayEquity { get; set; }
    [Parameter("Strategy label", DefaultValue = "FynxQuant770101")] public string Label { get; set; }
    private int _day; private double _dayStart; private bool _dailyLocked, _maxLocked, _waiting; private string _key;
    private int PragueDay()
    {
      var utc=Server.Time; var march=new DateTime(utc.Year,3,31,1,0,0,DateTimeKind.Utc);
      march=march.AddDays(-(int)march.DayOfWeek); var october=new DateTime(utc.Year,10,31,1,0,0,DateTimeKind.Utc);
      october=october.AddDays(-(int)october.DayOfWeek);var local=utc.AddHours(utc>=march&&utc<october?2:1);
      return local.Year*10000+local.Month*100+local.Day;
    }
    private void Save()
    {
      LocalStorage.SetString(_key, string.Join("|", _day.ToString(), _dayStart.ToString("R",CultureInfo.InvariantCulture),_dailyLocked?"1":"0",_maxLocked?"1":"0",_waiting?"1":"0"),LocalStorageScope.Instance);
      LocalStorage.Flush(LocalStorageScope.Instance);
    }
    protected override void OnStart()
    {
      if(SymbolName!=TestedSymbol||Bars.TimeFrame!=TimeFrame.${tf}){Print("Attach to the tested symbol and ${p.tf} timeframe.");Stop();return;}
      _key="FynxGuard "+Account.Number.ToString();_day=PragueDay();_dayStart=FirstDayEquity;_waiting=FirstDayEquity<=0;
      var saved=LocalStorage.GetString(_key,LocalStorageScope.Instance);
      if(!string.IsNullOrEmpty(saved))
      {
        var v=saved.Split('|');int savedDay;double savedEquity;
        if(v.Length!=5||!int.TryParse(v[0],out savedDay)||!double.TryParse(v[1],NumberStyles.Float,CultureInfo.InvariantCulture,out savedEquity)){Print("Invalid persisted guard state; stopping.");Stop();return;}
        _maxLocked=v[3]=="1";
        if(savedDay==_day){_dayStart=savedEquity;_dailyLocked=v[2]=="1";_waiting=v[4]=="1";}
      }
      Save();Timer.Start(TimeSpan.FromSeconds(1));
      if(_waiting)Print("Waiting for next Prague day; enter verified start-of-day equity to start today.");
    }
    private bool Guard()
    {
      int today=PragueDay();if(today!=_day){_day=today;_dayStart=Math.Max(Account.Balance,Account.Equity);_dailyLocked=false;_waiting=false;Save();}
      if(Account.Equity<=InitialBalance*(1-MaxLossPct/100)){_maxLocked=true;Save();}
      if(!_waiting&&_dayStart-Account.Equity>=InitialBalance*DailyLossPct/100){_dailyLocked=true;Save();}
      if(_maxLocked||_dailyLocked)
      {
        foreach(var position in Positions.Where(x=>x.Label==Label).ToArray()){var result=ClosePosition(position);if(!result.IsSuccessful)Print("Guard close failed: {0}",result.Error);}
        return false;
      }
      return !_waiting;
    }
    protected override void OnTimer(){Guard();}
    protected override void OnTick(){Guard();}
    protected override void OnStop(){if(!string.IsNullOrEmpty(_key))Save();}
    private double Atr(int last)
    {
      if(CloseAtr){double sum=0;for(int i=last-AtrPeriod+1;i<=last;i++)sum+=Math.Abs(Bars.ClosePrices[i]-Bars.ClosePrices[i-1]);return sum/AtrPeriod;}
      double atr=0;int observations=0;
      for(int i=1;i<=last;i++)
      {
        double prev=Bars.ClosePrices[i-1];double tr=Math.Max(Bars.HighPrices[i]-Bars.LowPrices[i],Math.Max(Math.Abs(Bars.HighPrices[i]-prev),Math.Abs(Bars.LowPrices[i]-prev)));
        if(observations<AtrPeriod){atr+=tr;observations++;if(observations==AtrPeriod)atr/=AtrPeriod;}
        else atr=(atr*(AtrPeriod-1)+tr)/AtrPeriod;
      }
      return observations>=AtrPeriod?atr:0;
    }
    protected override void OnBar()
    {
      if(!Guard())return;
      bool owned=false;
      foreach(var position in Positions.FindAll(Label,SymbolName))
      {
        owned=true;int entry=Bars.OpenTimes.GetIndexByTime(position.EntryTime);
        if(entry>=0&&Bars.Count-1-entry>=MaxHold){var result=ClosePosition(position);if(!result.IsSuccessful)Print("Time exit failed: {0}",result.Error);}
      }
      if(owned||Positions.Any(x=>x.SymbolName==SymbolName))return;
      int last=Bars.Count-2;if(last<Math.Max(Lookback,AtrPeriod)+1)return;
      double atr=Atr(last);if(atr<=0)return;
      double high=double.MinValue,low=double.MaxValue;
      for(int i=last-Lookback;i<last;i++){high=Math.Max(high,Bars.ClosePrices[i]);low=Math.Min(low,Bars.ClosePrices[i]);}
      double close=Bars.ClosePrices[last];int direction=close>high+EntryAtr*atr?1:(close<low-EntryAtr*atr?-1:0);if(direction==0)return;
      double stopPips=StopAtr*atr/Symbol.PipSize,targetPips=TargetAtr*atr/Symbol.PipSize;
      double volume=Symbol.VolumeForFixedRisk(Account.Equity*RiskPct/100,stopPips,RoundingMode.Down);
      volume=Symbol.NormalizeVolumeInUnits(Math.Min(volume,Symbol.VolumeInUnitsMax),RoundingMode.Down);
      if(volume<Symbol.VolumeInUnitsMin)return;
      var resultEntry=ExecuteMarketOrder(direction>0?TradeType.Buy:TradeType.Sell,SymbolName,volume,Label,stopPips,targetPips);
      if(!resultEntry.IsSuccessful)Print("Entry failed: {0}",resultEntry.Error);
    }
  }
}
`;
}
