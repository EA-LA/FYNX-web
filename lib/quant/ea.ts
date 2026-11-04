export type EAPlatform = 'mt5' | 'mt4' | 'ctrader';
export interface EASettings {
  platform: EAPlatform; symbol: string; timeframe: string;
  params: { lookback?:number; atrPeriod?:number; entryK?:number; stopS?:number; targetTP?:number; maxHold?:number; riskPct?:number; mode?:string; strategy?:string; costPips?:number; slippagePips?:number; [key:string]:unknown };
  dailyLossPct?:number; maxLossPct?:number; initialBalance?:number; ruleId?:string; phase?:number;
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
    balance:bounded(input.initialBalance,10000,1,100000000,'initial balance'),
    ruleId:input.ruleId===undefined?'2-step':['2-step','1-step','1-step-legacy'].includes(input.ruleId)?input.ruleId:(()=>{throw new Error('Invalid FTMO rule version.');})(),phase:bounded(input.phase,1,1,input.ruleId==='2-step'||!input.ruleId?2:1,'phase',true)};
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
  return {filename:`FynxQuant_${p.symbol}_${p.tf}.${ext}`,mime:'text/plain;charset=utf-8',source:p.platform==='ctrader'?csharp(p):mql(p),notes:[...notes,...(p.platform==='mt5'?['Optional Edge heartbeat is disabled by default. Create a token in Profile, enter it only in MT5 EA inputs, and allow https://fynxfinanceworld.com in Expert Advisors WebRequest settings. All account positions are reported. Never share a .set file containing your token.', 'Edge day-start balance/equity and end-of-day high-water are unavailable unless you supply verified values with the current Prague date. A later observation is never substituted for midnight; these facts expire at the next date rollover.']:[])]};
}

/** Account reporting only: no trading classes, commands, strategy signals or liquidation guards. */
export function generateAccountMonitorEA():GeneratedEA {
  const p=normalize({platform:'mt5',symbol:'EURUSD',timeframe:'D1',params:{mode:'ohlc'}});
  const source=`// FYNX My Accounts - MT5 reporting only. This EA cannot place, modify or close a trade.
// Compile in MetaEditor and verify on a demo. No native compilation is claimed by FYNX.
#property strict
input double InpInitBal = 0; // Enter the actual initial account balance; zero refuses initialization.
input double InpDailyStop = 4; // Reporting preference only; this monitor never liquidates positions.
string guardKey="";double dayStartEq=0;bool waitingForDay=true;
double Balance(){return AccountInfoDouble(ACCOUNT_BALANCE);}
double Equity(){return AccountInfoDouble(ACCOUNT_EQUITY);}
int PragueDay(){
  datetime utc=TimeGMT();MqlDateTime d;TimeToStruct(utc,d);
  MqlDateTime end;ZeroMemory(end);end.year=d.year;end.mon=3;end.day=31;end.hour=1;
  datetime march=StructToTime(end);TimeToStruct(march,end);march-=end.day_of_week*86400;
  ZeroMemory(end);end.year=d.year;end.mon=10;end.day=31;end.hour=1;
  datetime october=StructToTime(end);TimeToStruct(october,end);october-=end.day_of_week*86400;
  TimeToStruct(utc+((utc>=march&&utc<october)?7200:3600),d);return d.year*10000+d.mon*100+d.day;
}
${heartbeatMql(p,false)}
int OnInit(){
  if(MQLInfoInteger(MQL_TESTER)||InpInitBal<=0||InpDailyStop<=0||InpDailyStop>20)return INIT_PARAMETERS_INCORRECT;
  guardKey="FynxMonitor_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"_";
  EdgeInitialize();EventSetTimer(1);return INIT_SUCCEEDED;
}
void OnTimer(){EdgeHeartbeat();}
void OnDeinit(const int reason){EventKillTimer();GlobalVariablesFlush();}
`;
  return {filename:'FynxAccountMonitor.mq5',mime:'text/plain;charset=utf-8',source,notes:[
    'This standalone MT5 monitor contains reporting and account-history reads only; it cannot place, modify or close trades.',
    'Create an Edge token, enter it only in MT5 inputs, enable InpEdgeEnabled and allow https://fynxfinanceworld.com in WebRequest settings. Enter the actual initial balance.',
    'After the first report, link that token in My Accounts. Then enable InpAccountsHistoryEnabled and enter the broker-confirmed IANA timezone. Never guess UTC or reuse the current server offset for old deals.',
    'Reset facts require verified InpEdgeBaselineDate and day-start/high-water inputs for the current Prague date. Near-midnight samples and local trading-guard baselines are never reported as exact reset facts; values expire at rollover.',
    'History sends at most 100 deals per acknowledged minute. Restarting the EA replays the configured broker history window for server-side deduplication. Records predating that window or missing at the broker remain unavailable.',
    'The website receives account telemetry; it cannot prove a modified local EA reports truthful data. Reports retain that provenance. Native compilation and terminal delivery require separate demo validation.'
  ]};
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
${five?heartbeatMql(p):''}
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
  double rawLots=(Equity()*InpRiskPct/100.0)/(stopDistance/tickSize*tickValue);
  double lots=MathFloor((MathMin(rawLots,maximum)+1e-10)/step)*step;
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
  SaveGuards();${five?'EdgeInitialize();':''}lastBar=iTime(_Symbol,InpTimeframe,0);EventSetTimer(1);
  if(waitingForDay)Print("Waiting for next Prague trading day: first-day starting equity was not supplied.");
  return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){SaveGuards();EventKillTimer();}
void OnTimer(){Guard();${five?'EdgeHeartbeat();':''}}
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
${five?'':'  if(stop<minStop||target<minStop){Print("Broker stop-distance restriction: skipped.");return;}'}
${five?`  MqlTick quote;if(!SymbolInfoTick(_Symbol,quote))return;
  double price=direction>0?quote.ask:quote.bid;
  double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);if(tickSize<=0)return;
  double sl=NormalizeDouble((direction>0?MathFloor((price-stop+1e-10)/tickSize):MathCeil((price+stop-1e-10)/tickSize))*tickSize,_Digits);
  double tp=NormalizeDouble((direction>0?MathCeil((price+target-1e-10)/tickSize):MathFloor((price-target+1e-10)/tickSize))*tickSize,_Digits);
  if(MathAbs(price-sl)<minStop||MathAbs(tp-price)<minStop){Print("Broker stop-distance restriction: skipped.");return;}
  lots=LotsFor(MathAbs(price-sl));if(lots<=0)return;
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

function heartbeatMql(p:Settings,canonicalSymbol=true):string {
  return String.raw`// Edge Radar: reporting is optional; trading never depends on an HTTP response.
input bool InpEdgeEnabled = false;
input string InpEdgeToken = ""; // Paste Profile's shown-once token here; do not share a .set file.
input bool InpAccountsHistoryEnabled = false; // Enable only after linking this EA token in My Accounts.
input string InpAccountsBrokerTimezone = ""; // Broker-confirmed IANA zone, e.g. Europe/Helsinki; never guess.
input int InpAccountsHistoryDays = 30; // 1..366; broker-retained history only, 100 deals per acknowledged batch.
input string InpEdgeRule = "${p.ruleId}";
input int InpEdgePhase = ${p.phase};
input string InpEdgeBaselineDate = ""; // YYYY-MM-DD Prague date of verified reset inputs; blank = unknown.
input double InpEdgeDayStartBalance = 0; // Verified balance at that Prague midnight; 0 = unknown.
input double InpEdgeDayStartEquity = 0; // Verified equity at that Prague midnight; never a later trading-guard sample.
input double InpEdgeHighWaterBalance = 0; // Verified highest completed EOD balance through that midnight; 0 = unknown.
datetime edgeLastSend=0;
int edgeDay=0;double edgeDayBalance=0,edgeDayEquity=0,edgeHighBalance=0;
long accountsCursorMsc=0,accountsPendingMsc=0;ulong accountsCursorTicket=0,accountsPendingTicket=0;
string EdgeNumber(double value){return MathIsValidNumber(value)?DoubleToString(value,10):"null";}
string EdgePositive(double value){return value>0?EdgeNumber(value):"null";}
string EdgeString(string value){StringReplace(value,"\\","\\\\");StringReplace(value,"\"","\\\"");StringReplace(value,"\r"," ");StringReplace(value,"\n"," ");StringReplace(value,"\t"," ");return "\""+value+"\"";}
string EdgeSymbol(string name){return ${canonicalSymbol?`name==_Symbol?"${p.symbol}":name`:'name'};}
string EdgeDayString(int day){return StringFormat("%04d-%02d-%02d",day/10000,(day/100)%100,day%100);}
string AccountsBrokerTime(long msc){string value=TimeToString((datetime)(msc/1000),TIME_DATE|TIME_SECONDS);StringReplace(value,".","-");return value+StringFormat(".%03d",(int)(msc%1000));}
bool AccountsEnabled(){return InpAccountsHistoryEnabled&&StringLen(InpAccountsBrokerTimezone)>0&&InpAccountsHistoryDays>=1&&InpAccountsHistoryDays<=366;}
string AccountsHistory(){
  datetime end=TimeTradeServer(),start=end-InpAccountsHistoryDays*86400;
  bool selected=HistorySelect(start,end);int total=selected?HistoryDealsTotal():0;
  ulong tickets[100];long times[100];int count=0,remaining=0;
  accountsPendingMsc=accountsCursorMsc;accountsPendingTicket=accountsCursorTicket;
  // Select the oldest unsent 100 by (time,ticket), regardless of terminal array ordering.
  if(selected&&total<=100000)for(int i=0;i<total;i++){
    ulong ticket=HistoryDealGetTicket(i);if(ticket==0)continue;long msc=HistoryDealGetInteger(ticket,DEAL_TIME_MSC);
    if(msc<accountsCursorMsc||(msc==accountsCursorMsc&&ticket<=accountsCursorTicket))continue;
    remaining++;int at=count;while(at>0&&(times[at-1]>msc||(times[at-1]==msc&&tickets[at-1]>ticket)))at--;
    if(at>=100)continue;for(int j=MathMin(count,99);j>at;j--){tickets[j]=tickets[j-1];times[j]=times[j-1];}tickets[at]=ticket;times[at]=msc;if(count<100)count++;
  }
  string deals="[";
  for(int i=0;i<count;i++){
    ulong ticket=tickets[i];long type=HistoryDealGetInteger(ticket,DEAL_TYPE),entry=HistoryDealGetInteger(ticket,DEAL_ENTRY);
    bool trade=type==DEAL_TYPE_BUY||type==DEAL_TYPE_SELL;
    string kind=type==DEAL_TYPE_BUY?"buy":type==DEAL_TYPE_SELL?"sell":type==DEAL_TYPE_BALANCE?"balance":type==DEAL_TYPE_CREDIT?"credit":type==DEAL_TYPE_CHARGE||type==DEAL_TYPE_COMMISSION||type==DEAL_TYPE_COMMISSION_DAILY||type==DEAL_TYPE_COMMISSION_MONTHLY||type==DEAL_TYPE_COMMISSION_AGENT_DAILY||type==DEAL_TYPE_COMMISSION_AGENT_MONTHLY||type==DEAL_TAX?"fee":"adjustment";
    string entryType=entry==DEAL_ENTRY_IN?"in":entry==DEAL_ENTRY_OUT?"out":entry==DEAL_ENTRY_INOUT?"inout":"out-by";
    if(i>0)deals+=",";
    deals+="{\"id\":"+EdgeString(IntegerToString(ticket))+",\"positionId\":"+EdgeString(IntegerToString(HistoryDealGetInteger(ticket,DEAL_POSITION_ID)))+",\"orderId\":"+EdgeString(IntegerToString(HistoryDealGetInteger(ticket,DEAL_ORDER)))+",\"brokerTime\":"+EdgeString(AccountsBrokerTime(times[i]))+",\"type\":"+EdgeString(kind)+",\"entryType\":"+(trade?EdgeString(entryType):"null")+",\"rawSymbol\":"+(trade?EdgeString(HistoryDealGetString(ticket,DEAL_SYMBOL)):"null")+",\"volume\":"+EdgeNumber(HistoryDealGetDouble(ticket,DEAL_VOLUME))+",\"price\":"+EdgeNumber(HistoryDealGetDouble(ticket,DEAL_PRICE))+",\"profit\":"+EdgeNumber(HistoryDealGetDouble(ticket,DEAL_PROFIT))+",\"commission\":"+EdgeNumber(HistoryDealGetDouble(ticket,DEAL_COMMISSION))+",\"swap\":"+EdgeNumber(HistoryDealGetDouble(ticket,DEAL_SWAP))+",\"fee\":"+EdgeNumber(HistoryDealGetDouble(ticket,DEAL_FEE))+",\"sl\":"+EdgePositive(HistoryDealGetDouble(ticket,DEAL_SL))+",\"tp\":"+EdgePositive(HistoryDealGetDouble(ticket,DEAL_TP))+",\"magic\":"+EdgeString(IntegerToString(HistoryDealGetInteger(ticket,DEAL_MAGIC)))+"}";
    accountsPendingMsc=times[i];accountsPendingTicket=ticket;
  }deals+="]";
  bool complete=selected&&total<=100000&&remaining<=100;
  return "{\"brokerTimezone\":"+EdgeString(InpAccountsBrokerTimezone)+",\"fromBrokerTime\":"+EdgeString(AccountsBrokerTime((long)start*1000))+",\"toBrokerTime\":"+EdgeString(AccountsBrokerTime((long)end*1000+999))+",\"complete\":"+(complete?"true":"false")+",\"deals\":"+deals+"}";
}
void EdgeSaveBaseline(){
  GlobalVariableSet(guardKey+"edgeBasisVersion",0);
  GlobalVariableSet(guardKey+"edgeDay",edgeDay);GlobalVariableSet(guardKey+"edgeBalance",edgeDayBalance);GlobalVariableSet(guardKey+"edgeEquity",edgeDayEquity);GlobalVariableSet(guardKey+"edgeHigh",edgeHighBalance);
  GlobalVariableSet(guardKey+"edgeBasisVersion",2);GlobalVariablesFlush();
}
void EdgeInitialize(){
  edgeDay=PragueDay();edgeDayBalance=0;edgeDayEquity=0;edgeHighBalance=0;
  // Version 1 used near-midnight samples. Never restore those as exact reset facts.
  if(GlobalVariableCheck(guardKey+"edgeBasisVersion")&&GlobalVariableGet(guardKey+"edgeBasisVersion")==2&&GlobalVariableCheck(guardKey+"edgeDay")&&(int)GlobalVariableGet(guardKey+"edgeDay")==edgeDay){edgeDayBalance=GlobalVariableGet(guardKey+"edgeBalance");edgeDayEquity=GlobalVariableGet(guardKey+"edgeEquity");edgeHighBalance=GlobalVariableGet(guardKey+"edgeHigh");}
  if(InpEdgeBaselineDate==EdgeDayString(edgeDay)){edgeDayBalance=InpEdgeDayStartBalance;edgeDayEquity=InpEdgeDayStartEquity;edgeHighBalance=InpEdgeHighWaterBalance;}
  EdgeSaveBaseline();
}
void EdgeAdvanceDay(int today){
  // A close/deposit can occur between midnight and this callback. Without exact
  // reset reconstruction, all three reset facts become unknown at rollover.
  if(today!=edgeDay){edgeDay=today;edgeDayBalance=0;edgeDayEquity=0;edgeHighBalance=0;EdgeSaveBaseline();}
}
void EdgeHeartbeat(){
  if(!InpEdgeEnabled||StringLen(InpEdgeToken)==0||MQLInfoInteger(MQL_TESTER)||!TerminalInfoInteger(TERMINAL_CONNECTED))return;
  datetime now=TimeGMT();EdgeAdvanceDay(PragueDay());
  if(now-edgeLastSend<60)return;edgeLastSend=now;
  string positions="[";int reported=0;
  for(int i=0;i<PositionsTotal();i++){
    ulong ticket=PositionGetTicket(i);if(ticket==0)continue;
    string name=PositionGetString(POSITION_SYMBOL);bool buy=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY;
    double volume=PositionGetDouble(POSITION_VOLUME),entry=PositionGetDouble(POSITION_PRICE_OPEN),price=PositionGetDouble(POSITION_PRICE_CURRENT),sl=PositionGetDouble(POSITION_SL),tp=PositionGetDouble(POSITION_TP),profit=0;
    string risk="null";if(sl>0&&OrderCalcProfit(buy?ORDER_TYPE_BUY:ORDER_TYPE_SELL,name,volume,price,sl,profit))risk=EdgeNumber(MathMax(0,-profit));
    string currencies="[",base=SymbolInfoString(name,SYMBOL_CURRENCY_BASE),quote=SymbolInfoString(name,SYMBOL_CURRENCY_PROFIT);if(StringLen(base)>=3&&StringLen(base)<=8)currencies+=EdgeString(base);if(StringLen(quote)>=3&&StringLen(quote)<=8&&quote!=base){if(StringLen(currencies)>1)currencies+=",";currencies+=EdgeString(quote);}currencies+="]";
    if(reported++>0)positions+=",";
    string details="";if(AccountsEnabled())details=",\"floatingPL\":"+EdgeNumber(PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP))+",\"magic\":"+EdgeString(IntegerToString(PositionGetInteger(POSITION_MAGIC)))+",\"positionId\":"+EdgeString(IntegerToString(PositionGetInteger(POSITION_IDENTIFIER)))+",\"openedAtBroker\":"+EdgeString(AccountsBrokerTime(PositionGetInteger(POSITION_TIME_MSC)));
    positions+="{\"id\":"+EdgeString(IntegerToString(ticket))+",\"symbol\":"+EdgeString(EdgeSymbol(name))+",\"side\":"+EdgeString(buy?"buy":"sell")+",\"volume\":"+EdgeNumber(volume)+",\"entry\":"+EdgeNumber(entry)+",\"price\":"+EdgeNumber(price)+",\"sl\":"+EdgePositive(sl)+",\"tp\":"+EdgePositive(tp)+",\"riskToStop\":"+risk+",\"currencies\":"+currencies+details+"}";
  }positions+="]";
  string currency=AccountInfoString(ACCOUNT_CURRENCY),instruments="[]";MqlTick quote;
  if(${canonicalSymbol?'':'false&&'}SymbolInfoTick(_Symbol,quote)){
    double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE),tickValue=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE_LOSS),vmin=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),vmax=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX),step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
    datetime tickUtc=quote.time-(TimeTradeServer()-TimeGMT());
    if(tickSize>0&&tickValue>0&&vmin>0&&vmax>=vmin&&step>0&&quote.bid>0&&quote.ask>=quote.bid&&now-tickUtc<=180&&tickUtc<=now+5)
      instruments="[{\"symbol\":\"${p.symbol}\",\"brokerSymbol\":"+EdgeString(_Symbol)+",\"tickSize\":"+EdgeNumber(tickSize)+",\"tickValueLoss\":"+EdgeNumber(tickValue)+",\"volumeMin\":"+EdgeNumber(vmin)+",\"volumeMax\":"+EdgeNumber(vmax)+",\"volumeStep\":"+EdgeNumber(step)+",\"digits\":"+IntegerToString(_Digits)+",\"stopLevel\":"+IntegerToString(SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL))+",\"accountCurrency\":"+EdgeString(currency)+",\"asOf\":"+IntegerToString(tickUtc)+",\"bid\":"+EdgeNumber(quote.bid)+",\"ask\":"+EdgeNumber(quote.ask)+"}]";
  }
  string account=AccountInfoString(ACCOUNT_SERVER)+":"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
  string extra="";if(AccountsEnabled())extra=",\"accountHistory\":"+AccountsHistory()+",\"accountMetadata\":{\"margin\":"+EdgeNumber(AccountInfoDouble(ACCOUNT_MARGIN))+",\"freeMargin\":"+EdgeNumber(AccountInfoDouble(ACCOUNT_MARGIN_FREE))+",\"leverage\":"+IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE))+",\"accountMode\":"+EdgeString(AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING?"hedging":"netting")+"}";
  string body="{\"version\":"+(AccountsEnabled()?"2":"1")+",\"sentAt\":"+IntegerToString(now)+",\"accountRef\":"+EdgeString(account)+",\"currency\":"+EdgeString(currency)+",\"balance\":"+EdgeNumber(Balance())+",\"equity\":"+EdgeNumber(Equity())+",\"dayStartEquity\":"+EdgePositive(edgeDayEquity)+",\"dayStartBalance\":"+EdgePositive(edgeDayBalance)+",\"dayStartDate\":"+EdgeString(EdgeDayString(edgeDay))+",\"initialBalance\":"+EdgeNumber(InpInitBal)+",\"ruleId\":"+EdgeString(InpEdgeRule)+",\"phase\":"+IntegerToString(InpEdgePhase)+",\"safetyDailyPct\":"+EdgeNumber(InpDailyStop)+",\"highWaterBalance\":"+EdgePositive(edgeHighBalance)+",\"positions\":"+positions+",\"instruments\":"+instruments+extra+"}";
  uchar encoded[];StringToCharArray(body,encoded,0,WHOLE_ARRAY,CP_UTF8);char data[],result[];int size=ArraySize(encoded)-1;ArrayResize(data,size);for(int i=0;i<size;i++)data[i]=(char)encoded[i];
  string responseHeaders,headers="Content-Type: application/json\r\nAuthorization: Bearer "+InpEdgeToken+"\r\n";
  int status=WebRequest("POST","https://fynxfinanceworld.com/api/edge/heartbeat",headers,1500,data,result,responseHeaders);
  if(status==202&&AccountsEnabled()){accountsCursorMsc=accountsPendingMsc;accountsCursorTicket=accountsPendingTicket;}
  // Never log headers, token, body or provider response. A status code is sufficient.
  if(status!=202)Print("Edge heartbeat unavailable (HTTP status ",status,"). Check Profile and WebRequest settings.");
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
