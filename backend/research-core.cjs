/* Shared, dependency-free research calculations. Also copied to the browser by the build. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxResearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  const metrics = [
    ['revenue', 'Revenue', false, ['RevenuesNetOfInterestExpense','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','Revenues','SalesRevenueNet']],
    ['income', 'Net income', false, ['NetIncomeLoss','ProfitLoss']],
    ['eps', 'Diluted EPS', false, ['EarningsPerShareDiluted','EarningsPerShareBasicAndDiluted']],
    ['cash', 'Cash and equivalents', true, ['CashAndCashEquivalentsAtCarryingValue']],
    ['assets', 'Total assets', true, ['Assets']],
    ['liabilities', 'Total liabilities', true, ['Liabilities']],
    ['equity', 'Stockholders’ equity', true, ['StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']],
    ['longTermDebt', 'Long-term debt, noncurrent', true, ['LongTermDebtNoncurrent']],
    ['currentDebt', 'Current portion of long-term debt', true, ['LongTermDebtCurrent']],
    ['operatingCash', 'Operating cash flow', false, ['NetCashProvidedByUsedInOperatingActivities']],
    ['capex', 'Property / equipment purchases', false, ['PaymentsToAcquirePropertyPlantAndEquipment']]
  ].map(([id,title,instant,tags]) => ({id,title,instant,tags,unit:id==='eps'?'USD/shares':'USD'}));
  const catalog = [
    ['AAPL','Apple','Stocks'],['MSFT','Microsoft','Stocks'],['NVDA','NVIDIA','Stocks'],['AMZN','Amazon','Stocks'],['GOOGL','Alphabet','Stocks'],['META','Meta','Stocks'],['TSLA','Tesla','Stocks'],['JPM','JPMorgan Chase','Stocks'],['V','Visa','Stocks'],['WMT','Walmart','Stocks'],['XOM','Exxon Mobil','Stocks'],['JNJ','Johnson & Johnson','Stocks'],['BRK-B','Berkshire Hathaway','Stocks'],['AVGO','Broadcom','Stocks'],['COST','Costco','Stocks'],['NFLX','Netflix','Stocks'],['AMD','AMD','Stocks'],['DIS','Disney','Stocks'],['KO','Coca-Cola','Stocks'],['BAC','Bank of America','Stocks'],
    ['SPY','S&P 500 ETF','ETFs'],['QQQ','Nasdaq 100 ETF','ETFs'],['IWM','Russell 2000 ETF','ETFs'],['DIA','Dow Jones ETF','ETFs'],['VTI','US total market ETF','ETFs'],['TLT','Long Treasury ETF','ETFs'],['GLD','Gold ETF','ETFs'],['XLF','Financials ETF','ETFs'],['XLK','Technology ETF','ETFs'],['XLE','Energy ETF','ETFs'],
    ['BTC-USD','Bitcoin','Crypto'],['ETH-USD','Ethereum','Crypto'],['SOL-USD','Solana','Crypto'],['LTC-USD','Litecoin','Crypto'],
    ['EURUSD=X','Euro / US dollar','FX'],['GBPUSD=X','Pound / US dollar','FX'],['JPY=X','US dollar / yen','FX'],['AUDUSD=X','Australian / US dollar','FX'],['CAD=X','US dollar / Canadian dollar','FX'],['CHF=X','US dollar / Swiss franc','FX']
  ].map(([symbol,name,group]) => ({symbol,name,group}));
  const symbolMap = Object.fromEntries(catalog.map(item => [item.symbol,item]));
  const seedCompanies = [
    [320193,'AAPL','Apple'],[789019,'MSFT','Microsoft'],[1045810,'NVDA','NVIDIA'],[1018724,'AMZN','Amazon'],[1652044,'GOOGL','Alphabet'],[1326801,'META','Meta'],[1318605,'TSLA','Tesla'],[19617,'JPM','JPMorgan Chase'],[1403161,'V','Visa'],[104169,'WMT','Walmart'],[34088,'XOM','Exxon Mobil'],[200406,'JNJ','Johnson & Johnson'],[1067983,'BRK-B','Berkshire Hathaway'],[1730168,'AVGO','Broadcom'],[909832,'COST','Costco'],[1065280,'NFLX','Netflix']
  ].map(([cik,symbol,name])=>({cik,symbol,name}));
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function fail(message) { throw new Error(message); }
  function day(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const time = Date.parse(text+'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===text ? time : null;
  }
  function validCompany(c) { return c && Number.isSafeInteger(c.cik) && c.cik>0 && c.cik<=9999999999 && typeof c.symbol==='string' && /^[A-Za-z0-9., /-]{1,100}$/.test(c.symbol) && typeof c.name==='string' && c.name.length>0 && c.name.length<=500; }
  function directory(data) {
    if (!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).length>50000) fail('The SEC directory could not be validated.');
    const companies=new Map();
    for (const row of Object.values(data)) {
      const c={cik:row.cik_str,symbol:row.ticker,name:row.title};
      if (!validCompany(c)) fail('The SEC directory contains an unsupported record.');
      const old=companies.get(c.cik);
      if (old) old.symbols.add(c.symbol); else companies.set(c.cik,{...c,symbols:new Set([c.symbol])});
    }
    if (!companies.size) fail('The SEC directory is empty.');
    return [...companies.values()].map(({symbols,...c})=>({...c,symbol:[...symbols].sort().join(', ')})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  }
  function parseFinancials(data,cik,now=Date.now()) {
    const gaap=data?.facts?.['us-gaap'];
    if (data?.cik!==cik || typeof data.entityName!=='string' || !gaap) fail('No supported US-GAAP annual facts were returned. Open the SEC filings for other accounting standards or custom tags.');
    const selected={};
    for (const m of metrics) {
      selected[m.id]={};
      for (const tag of m.tags) {
        const candidates={};
        for (const r of gaap[tag]?.units?.[m.unit] || []) {
          const end=day(r.end),filed=day(r.filed),start=day(r.start);
          if (!['10-K','10-K/A'].includes(r.form) || end===null || filed===null || end>now || filed>now || filed<end || !finite(r.val) || !/^\d{10}-\d{2}-\d{6}$/.test(r.accn||'')) continue;
          if (m.instant ? r.start!=null : start===null || (end-start)/DAY<330 || (end-start)/DAY>400) continue;
          const fact={value:r.val,start:m.instant?null:r.start,end:r.end,filed:r.filed,accession:r.accn,tag,unit:m.unit};
          const old=candidates[r.end];
          if (!old || r.filed+r.accn>old.filed+old.accession) candidates[r.end]=fact;
        }
        for (const [end,fact] of Object.entries(candidates)) if (!selected[m.id][end]) selected[m.id][end]=fact;
      }
    }
    const periods=[...new Set(metrics.filter(m=>!m.instant).flatMap(m=>Object.keys(selected[m.id])))].sort().reverse().slice(0,10);
    const annual=Object.fromEntries(periods.map(end=>[end,Object.fromEntries(metrics.filter(m=>selected[m.id][end]).map(m=>[m.id,selected[m.id][end]]))]));
    return {version:1,cik,name:data.entityName,periods,annual,fetchedAt:new Date(now).toISOString(),source:'SEC EDGAR',stale:false};
  }
  function margin(report,period=report.periods[0]) {
    const {revenue,income}=report.annual[period] || {};
    return revenue?.value>0 && income && revenue.start===income.start && finite(income.value/revenue.value*100) ? income.value/revenue.value*100 : null;
  }
  function filingURL(cik,fact) {
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${fact.accession.replace(/-/g,'')}/${fact.accession}-index.html`;
  }
  function screen(report,filter) {
    const f=report.annual[report.periods[0]];
    if (!f) return false;
    if (filter.minimumRevenue!==null && (!f.revenue || f.revenue.value<filter.minimumRevenue)) return false;
    const m=margin(report);
    if (filter.minimumMargin!==null && (m===null || m<filter.minimumMargin)) return false;
    if (filter.profitable && !(f.income?.value>0)) return false;
    return !filter.positiveOperatingCash || f.operatingCash?.value>0;
  }
  function brief(report) {
    const period=report.periods[0],f=report.annual[period];
    if (!f) return 'No supported annual facts are available for this company.';
    return [`${report.name}. SEC annual facts. Year ended ${period}.`,...metrics.filter(m=>f[m.id]).map(m=>`${m.title}: ${f[m.id].value.toLocaleString('en-US',{maximumFractionDigits:2})} ${m.unit}. ${f[m.id].start?f[m.id].start+' to ':''}${period}; filed ${f[m.id].filed}.`),'Missing facts are unavailable, not zero. Debt components may omit other borrowings and leases. These are reported historical facts, not forecasts or current valuation.','Source filings:',...[...new Set(Object.values(f).map(v=>filingURL(report.cik,v)))]].join('\n');
  }
  function validateBars(bars,now=Date.now()) {
    if (!Array.isArray(bars) || bars.length<2 || bars.length>20000) fail('Use between 2 and 20,000 daily rows.');
    let previous='';
    for (const b of bars) {
      const date=day(b.date);
      if (date===null || date>now || b.date<=previous || !['open','high','low','close'].every(k=>finite(b[k]) && b[k]>=1e-12 && b[k]<=1e12) || b.low>Math.min(b.open,b.close) || b.high<Math.max(b.open,b.close) || b.low>b.high) fail('Every row needs a unique past date and consistent positive OHLC prices.');
      previous=b.date;
    }
    return bars;
  }
  function parseCSV(text,now=Date.now()) {
    if (typeof text!=='string' || new TextEncoder().encode(text).length>3000000) fail('CSV files must be 3 MB or smaller.');
    const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const split=line=>line.split(',').map(cell=>{const t=cell.trim();return /^"[^"\r\n]*"$/.test(t)?t.slice(1,-1):t;});
    const headers=split(lines.shift()||'').map(h=>h.toLowerCase());
    if (new Set(headers).size!==headers.length || !['date','open','high','low','close'].every(h=>headers.includes(h))) fail('CSV needs unique date, open, high, low, close columns. Use plain numbers without separators.');
    if (lines.length<2 || lines.length>20000) fail('Use between 2 and 20,000 daily rows.');
    const bars=lines.map((line,i)=>{
      const cells=split(line);if(cells.length!==headers.length)fail(`CSV row ${i+2} has the wrong number of columns.`);
      const row=Object.fromEntries(headers.map((h,j)=>[h,cells[j]]));
      const bar={date:row.date};
      for (const k of ['open','high','low','close']) {
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(row[k])) fail(`CSV row ${i+2}: ${k} must be a number.`);
        bar[k]=Number(row[k]);
      }
      return bar;
    }).sort((a,b)=>a.date.localeCompare(b.date));
    return validateBars(bars,now);
  }
  function backtest(bars,settings) {
    validateBars(bars);
    const {fast,slow,startingCash,costBasisPoints,commission}=settings;
    if (!Number.isInteger(fast)||fast<2||fast>100||!Number.isInteger(slow)||slow<3||slow>250||fast>=slow||!finite(startingCash)||startingCash<1||startingCash>1e9||!finite(costBasisPoints)||costBasisPoints<0||costBasisPoints>500||!finite(commission)||commission<0||commission>startingCash/10) fail('Use fast 2–100, slow 3–250 (fast < slow), cash $1–$1B, costs 0–500 bps, and commission at most 10% of cash.');
    if (bars.length<slow+2) fail(`This strategy needs at least ${slow+2} daily rows.`);
    const prefix=[0];for(const b of bars)prefix.push(prefix[prefix.length-1]+b.close);
    const points=[{date:bars[slow-1].date,equity:startingCash}],trades=[];
    let cash=startingCash,units=0,invested=0,entryDate='',entryPrice=0,totalCosts=0,peak=cash,maxDrawdown=0;
    const cost=costBasisPoints/10000;
    const sell=(bar,price,reason)=>{
      const fill=price*(1-cost);cash=units*fill-commission;
      totalCosts+=units*price*cost+commission;
      trades.push({entryDate,exitDate:bar.date,entryPrice,exitPrice:fill,units,profit:cash-invested,returnPercent:(cash/invested-1)*100,reason});units=0;
    };
    for(let i=slow;i<bars.length;i++) {
      const bar=bars[i],shouldHold=(prefix[i]-prefix[i-fast])/fast>(prefix[i]-prefix[i-slow])/slow;
      if(shouldHold && units===0 && cash>2*commission) {
        entryPrice=bar.open*(1+cost);units=(cash-commission)/entryPrice;invested=cash;cash=0;entryDate=bar.date;
        totalCosts+=commission+units*bar.open*cost;
      }else if(!shouldHold && units>0)sell(bar,bar.open,'SMA exit');
      if(i===bars.length-1 && units>0)sell(bar,bar.close,'End of test');
      const equity=cash+units*bar.close;
      if(!finite(equity))fail('The calculation exceeded its numeric range.');
      peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak*100);
      points.push({date:bar.date,equity});
    }
    const benchmarkUnits=(startingCash-commission)/(bars[slow].open*(1+cost));
    const benchmarkEquity=benchmarkUnits*bars[bars.length-1].close*(1-cost)-commission;
    return {endingEquity:cash,benchmarkEquity,drawdownPercent:maxDrawdown,trades,points,totalCosts,returnPercent:(cash/startingCash-1)*100,winRate:trades.length?trades.filter(t=>t.profit>0).length/trades.length*100:null,settings};
  }
  function usableQuote(q,now=Date.now(),maxAge=4*DAY) {
    const at=Date.parse(q?.asOf);
    return q && finite(q.price) && q.price>0 && finite(at) && now-at>=-300000 && now-at<=maxAge;
  }
  function portfolio(holdings,cash,quotes,now=Date.now()) {
    let markedValue=0,markedCost=0;const missing=[];
    const rows=holdings.map(h=>{
      const q=quotes[h.symbol];const cost=h.units*h.averageCost;
      if(q?.symbol!==h.symbol||q?.currency!=='USD'||!usableQuote(q,now)) {missing.push(h.symbol);return {...h,cost,value:null,profit:null,quote:q||null};}
      const value=h.units*q.price;markedValue+=value;markedCost+=cost;
      return {...h,cost,value,profit:value-cost,quote:q};
    });
    return {rows,missing,complete:missing.length===0,markedValue,markedCost,unrealized:markedValue-markedCost,total:missing.length?null:cash+markedValue,cash};
  }
  const kinds=['priceAbove','priceBelow','changeAbove','changeBelow'];
  function advanceAlert(rule,quote,now=Date.now()) {
    const age=now-Date.parse(quote?.asOf);
    if(!rule.enabled || quote?.symbol!==rule.symbol || !usableQuote(quote,now,900000) || age< -60000 || (rule.baseline && Date.parse(quote.asOf)<=Date.parse(rule.baseline.asOf)))return {rule,triggered:false};
    const value=rule.kind.startsWith('price')?quote.price:quote.changePercent;
    if(!finite(value))return {rule,triggered:false};
    const match=v=>rule.kind.endsWith('Above')?v>=rule.threshold:v<=rule.threshold;
    const triggered=!!rule.baseline && !match(rule.baseline.value) && match(value);
    return {rule:{...rule,baseline:{value,asOf:quote.asOf},enabled:!triggered,triggeredAt:triggered?new Date(now).toISOString():rule.triggeredAt},triggered};
  }
  const defaultState=()=>({version:1,revision:0,cash:0,holdings:[],companies:seedCompanies.slice(0,6),filters:{minimumRevenue:null,minimumMargin:null,profitable:false,positiveOperatingCash:false},watchlist:['AAPL','MSFT','NVDA','SPY','BTC-USD'],alerts:[],history:[]});
  function validateState(s) {
    const validNum=(n,min,max)=>finite(n)&&n>=min&&n<=max;
    const validID=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
    const unique=list=>new Set(list.map(x=>x.id)).size===list.length;
    if(!s||s.version!==1||!Number.isSafeInteger(s.revision)||s.revision<0||!validNum(s.cash,0,1e15)||!Array.isArray(s.holdings)||s.holdings.length>100||!unique(s.holdings)||!s.holdings.every(h=>validID(h.id)&&symbolMap[h.symbol]&&symbolMap[h.symbol].group!=='FX'&&validNum(h.units,1e-8,1e12)&&validNum(h.averageCost,0,1e12)&&h.units*h.averageCost<=1e15))fail('Saved portfolio data is invalid.');
    if(!Array.isArray(s.companies)||s.companies.length>30||new Set(s.companies.map(c=>c.cik)).size!==s.companies.length||!s.companies.every(validCompany)||!Array.isArray(s.watchlist)||s.watchlist.length>40||new Set(s.watchlist).size!==s.watchlist.length||!s.watchlist.every(x=>symbolMap[x]))fail('Saved research lists are invalid.');
    const f=s.filters;if(!f||!(f.minimumRevenue===null||validNum(f.minimumRevenue,0,1e15))||!(f.minimumMargin===null||validNum(f.minimumMargin,-1e6,1e6))||typeof f.profitable!=='boolean'||typeof f.positiveOperatingCash!=='boolean')fail('Saved filters are invalid.');
    if(!Array.isArray(s.alerts)||s.alerts.length>50||!unique(s.alerts)||!s.alerts.every(a=>validID(a.id)&&symbolMap[a.symbol]&&kinds.includes(a.kind)&&typeof a.enabled==='boolean'&&validNum(a.threshold,a.kind.startsWith('price')?1e-8:-100,a.kind.startsWith('price')?1e12:10000)&&(!a.baseline||(finite(a.baseline.value)&&finite(Date.parse(a.baseline.asOf))))&&(!a.triggeredAt||finite(Date.parse(a.triggeredAt)))))fail('Saved alert rules are invalid.');
    if(!Array.isArray(s.history)||s.history.length>100||!s.history.every(h=>validID(h.id)&&symbolMap[h.symbol]&&kinds.includes(h.kind)&&finite(h.threshold)&&finite(h.value)&&finite(Date.parse(h.at))))fail('Saved alert history is invalid.');
    return s;
  }
  return {DAY,metrics,catalog,symbolMap,seedCompanies,finite,day,validCompany,directory,parseFinancials,margin,filingURL,screen,brief,validateBars,parseCSV,backtest,usableQuote,portfolio,kinds,advanceAlert,defaultState,validateState};
});
