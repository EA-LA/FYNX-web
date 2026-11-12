const get=async(u,h={})=>{const r=await fetch(u,{headers:{'User-Agent':'FYNX/1.0',...h},signal:AbortSignal.timeout(30000)});const t=await r.text();return [r.status,t];};
(async()=>{
 for(const u of ['https://publicreporting.cftc.gov/resource/gpe5-46if.json?$limit=2&$order=report_date_as_yyyy_mm_dd%20DESC&cftc_contract_market_code=099741',
  'https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$limit=1&$order=report_date_as_yyyy_mm_dd%20DESC&cftc_contract_market_code=088691',
  'https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=1&$order=report_date_as_yyyy_mm_dd%20DESC&cftc_contract_market_code=098662',
  'https://stats.bis.org/api/v1/data/WS_CBPOL/M.US+XM+GB+JP+CA+AU+NZ+CH?startPeriod=2024-06&format=csv',
  'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.US+XM+GB+JP+CA+AU+NZ+CH?startPeriod=2024-06&format=csv',
 ]){try{const [s,t]=await get(u);console.log('P',s,u.slice(0,60),JSON.stringify(t.slice(0,1400)));}catch(e){console.log('P ERR',u.slice(0,60),e.message)}}
 // codes check
 return;const [s,t]=await get('https://publicreporting.cftc.gov/resource/gpe5-46if.json?$select=cftc_contract_market_code,market_and_exchange_names&$where=report_date_as_yyyy_mm_dd%3E%272026-10-25%27&$limit=200');
 console.log('CODES',s,JSON.parse(t).map(r=>r.cftc_contract_market_code+'='+r.market_and_exchange_names.slice(0,45)).join(' ; '));
 const [s2,t2]=await get('https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$select=cftc_contract_market_code,market_and_exchange_names&$where=report_date_as_yyyy_mm_dd%3E%272026-10-25%27%20AND%20(market_and_exchange_names%20like%20%27%25GOLD%25%27%20OR%20market_and_exchange_names%20like%20%27%25CRUDE%25%27%20OR%20market_and_exchange_names%20like%20%27%25SILVER%25%27%20OR%20market_and_exchange_names%20like%20%27%25COPPER%25%27%20OR%20market_and_exchange_names%20like%20%27%25NAT%25GAS%25%27)&$limit=60');
 console.log('DCODES',s2,t2.slice(0,3000));
})();
