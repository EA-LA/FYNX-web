'use strict';
const {fetchJSON,fail}=require('../quant/common.cjs');
// Official futures-only CFTC contract identifiers, validated against PRE on 2026-11-03.
const COT_MARKETS={EUR:['TFF','099741'],GBP:['TFF','096742'],JPY:['TFF','097741'],AUD:['TFF','232741'],CAD:['TFF','090741'],CHF:['TFF','092741'],NZD:['TFF','112741'],SPX500:['TFF','13874A'],NAS100:['TFF','209742'],US30:['TFF','124603'],BTC:['TFF','133741'],ETH:['TFF','146021'],XAU:['DISAGGREGATED','088691'],XAG:['DISAGGREGATED','084691']};
const DATASETS={TFF:'gpe5-46if',DISAGGREGATED:'72hh-3qpy'};
function timestamp(value){const n=Date.parse(String(value||''));return Number.isFinite(n)?new Date(n).toISOString():null;}
function normalizeCot(raw,report,fetchedAt){
  const code=String(raw.cftc_contract_market_code||''),market=Object.keys(COT_MARKETS).find(k=>COT_MARKETS[k][0]===report&&COT_MARKETS[k][1]===code);if(!market)return null;
  const reportDate=String(raw.report_date_as_yyyy_mm_dd||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)||!Number.isFinite(Date.parse(reportDate)))throw fail('CFTC returned an invalid report date.',503,'COT_INVALID');
  const longRaw=raw[report==='TFF'?'lev_money_positions_long':'m_money_positions_long_all'],shortRaw=raw[report==='TFF'?'lev_money_positions_short':'m_money_positions_short_all'];
  if(longRaw===undefined||shortRaw===undefined||longRaw===null||shortRaw===null||longRaw===''||shortRaw==='')throw fail('CFTC returned missing positioning counts.',503,'COT_INVALID');const long=Number(longRaw),short=Number(shortRaw);if(!Number.isSafeInteger(long)||!Number.isSafeInteger(short)||long<0||short<0)throw fail('CFTC returned invalid positioning counts.',503,'COT_INVALID');
  const created=timestamp(raw[':created_at']),updated=timestamp(raw[':updated_at']);const availableAt=[created,updated].filter(Boolean).sort().at(-1)||fetchedAt;
  return {market,reportDate,availableAt,long,short,report,contractCode:code,contractName:String(raw.market_and_exchange_names||''),source:'CFTC Commitments of Traders',sourceURL:`https://publicreporting.cftc.gov/resource/${DATASETS[report]}.json`,fetchedAt,availabilityBasis:created||updated?'socrata-row-version':'first-observed',publicationNote:'Availability is the current Socrata row version timestamp. Historical revisions/bulk loads are not assigned an invented earlier publication time.'};
}
class CFTCProvider{
  constructor({fetcher=fetch,now=()=>Date.now()}={}){this.fetcher=fetcher;this.now=now;}
  async history({from,to}={}){
    const end=to||new Date(this.now()).toISOString().slice(0,10),start=from||new Date(this.now()-13*366*86400000).toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw fail('Invalid CFTC date range.');const fetchedAt=new Date(this.now()).toISOString(),records=[];
    for(const report of Object.keys(DATASETS)){
      const codes=Object.values(COT_MARKETS).filter(v=>v[0]===report).map(v=>`'${v[1]}'`).join(',');
      const longs=report==='TFF'?'lev_money_positions_long':'m_money_positions_long_all',shorts=report==='TFF'?'lev_money_positions_short':'m_money_positions_short_all';
      const url=new URL(`https://publicreporting.cftc.gov/resource/${DATASETS[report]}.json`);url.searchParams.set('$select',`cftc_contract_market_code,market_and_exchange_names,report_date_as_yyyy_mm_dd,${longs},${shorts},:created_at,:updated_at`);url.searchParams.set('$where',`cftc_contract_market_code in(${codes}) AND report_date_as_yyyy_mm_dd >= '${start}T00:00:00' AND report_date_as_yyyy_mm_dd <= '${end}T23:59:59'`);url.searchParams.set('$order','report_date_as_yyyy_mm_dd ASC,cftc_contract_market_code ASC');url.searchParams.set('$limit','50000');
      const rows=await fetchJSON(url,{fetcher:this.fetcher,provider:'CFTC public reporting',limit:24000000,timeout:30000});if(!Array.isArray(rows)||rows.length>=50000)throw fail('CFTC history is unavailable or exceeds the bounded import range.',503,'COT_UNAVAILABLE');
      for(const raw of rows){const record=normalizeCot(raw,report,fetchedAt);if(record&&record.reportDate>=start&&record.reportDate<=end)records.push(record);}
    }
    if(!records.length)throw fail('CFTC returned no matching positions.',503,'COT_UNAVAILABLE');
    return {records,source:'CFTC Commitments of Traders',sourceURL:'https://publicreporting.cftc.gov/stories/s/r4w3-av2u',fetchedAt,from:start,to:end,latestReportDate:records.map(r=>r.reportDate).sort().at(-1),status:'available'};
  }
}
class FREDProvider{
  constructor({key=process.env.EDGE_FRED_API_KEY,fetcher=fetch,now=()=>Date.now()}={}){this.key=key;this.fetcher=fetcher;this.now=now;}
  async vix({from,to,asOf}={}){
    if(!this.key)throw fail('VIX needs EDGE_FRED_API_KEY. Other available mood inputs are still shown.',503,'FRED_NOT_CONFIGURED');
    const vintage=new Date(Date.parse(asOf||new Date(this.now()).toISOString())-86400000).toISOString().slice(0,10),start=from||new Date(this.now()-400*86400000).toISOString().slice(0,10),end=to||vintage;
    for(const date of [vintage,start,end])if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw fail('Invalid FRED date range.');
    const url=new URL('https://api.stlouisfed.org/fred/series/observations');for(const[k,v]of Object.entries({api_key:this.key,file_type:'json',series_id:'VIXCLS',observation_start:start,observation_end:end,realtime_start:vintage,realtime_end:vintage,sort_order:'asc'}))url.searchParams.set(k,v);
    const body=await fetchJSON(url,{fetcher:this.fetcher,provider:'FRED',limit:5000000});if(!Array.isArray(body.observations))throw fail('FRED VIX observations are unavailable.',503,'FRED_UNAVAILABLE');const fetchedAt=new Date(this.now()).toISOString();
    const observations=body.observations.filter(r=>r.value!=='.'&&r.value!==''&&r.value!==null).map(r=>{const close=Number(r.value);if(!Number.isFinite(close)||close<0||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw fail('FRED returned an invalid VIX observation.',503,'FRED_INVALID');return {date:r.date,close,availableAt:new Date(Date.parse(r.date)+86400000).toISOString(),vintage,source:'FRED VIXCLS',sourceURL:'https://fred.stlouisfed.org/series/VIXCLS'};}).filter(r=>r.date>=start&&r.date<=end&&r.availableAt<=(asOf||fetchedAt));
    return {observations,source:'FRED VIXCLS',sourceURL:'https://fred.stlouisfed.org/series/VIXCLS',vintage,fetchedAt,status:observations.length?'available':'no-data',availabilityNote:'Previous-UTC-day vintage requested from FRED to avoid using same-day later revisions; each daily close is usable only from the following UTC day.'};
  }
}
module.exports={CFTCProvider,FREDProvider,COT_MARKETS,DATASETS,normalizeCot};
