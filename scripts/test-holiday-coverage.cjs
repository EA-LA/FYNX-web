const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('tools/market-holidays.html','utf8'),context=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync('assets/js/exchange-holidays.js','utf8'),context);
vm.runInContext(html.slice(html.indexOf('    const MS_DAY'),html.indexOf('    /* ------------------------------ UI helpers')),context);
const date=h=>[h.date.getFullYear(),String(h.date.getMonth()+1).padStart(2,'0'),String(h.date.getDate()).padStart(2,'0')].join('-');
for(const year of [2025,2026,2027,2028]){
 const rows=context.buildUSHolidays(year),closed=new Set(rows.filter(h=>h.status==='closed').map(date));
 assert(!rows.some(h=>h.status==='early'&&closed.has(date(h))),'An early close cannot also be a full closure');
 assert(!rows.some(h=>[0,6].includes(h.date.getDay())),'Cash equity events must be weekdays');
}
assert(context.buildUSHolidays(2025).some(h=>date(h)==='2025-01-09'));
assert(!context.buildUSHolidays(2028).some(h=>h.name==='New Year’s Day'));
assert(context.buildUSHolidays(2028).some(h=>date(h)==='2028-07-03'&&h.status==='early'));
assert(context.buildJPHolidays(2026).some(h=>date(h)==='2026-09-22'));
assert.equal(context.buildHKHolidays(2026).length,17);
assert.equal(context.buildHKHolidays(2027).length,16);
assert.equal(context.buildHKHolidays(2028).length,0,'Do not manufacture unsupported exchange dates');
assert(context.buildUKHolidays(2026).some(h=>date(h)==='2026-12-28'));
assert(context.buildUKHolidays(2027).some(h=>date(h)==='2027-12-27'));
console.log('Holiday coverage: exception closure, weekend substitutes, mutually exclusive early/full closures and published Asia dates passed.');

assert(context.buildUKHolidays(2028).some(h=>date(h)==='2028-12-22'&&h.status==='early'));
assert.equal(context.publishedExchangeHolidays('TSX',2026).length,11);
assert(context.publishedExchangeHolidays('TSXV',2026).some(h=>date(h)==='2026-12-24'&&h.status==='early'&&h.regions.includes('Americas')));
assert.equal(context.publishedExchangeHolidays('TSX',2027).length,0);

// Compare every generated exchange/date/status against the separately reviewed
// official-calendar baseline, including absent/unverified exchange-years.
const baseline=JSON.parse(fs.readFileSync('docs/qa/holiday-calendar-baseline-2026-09-28.json','utf8')).calendars;
const all=context.buildHolidayDataset();let checked=0;
for(const [exchange,years] of Object.entries(baseline))for(const year of [2025,2026,2027,2028,2029]){
 const expected=years[year]||{};
 for(const status of ['closed','early']){
  const actual=Array.from(all.filter(h=>h.exchanges.includes(exchange)&&h.date.getFullYear()===year&&h.status===status),h=>date(h).slice(5)).sort();
  assert.deepEqual(actual,[...(expected[status]||[])].sort(),`${exchange} ${year} ${status}`);checked+=actual.length;
 }
}
for(const exchange of Object.keys(baseline)){
 const rows=all.filter(h=>h.exchanges.includes(exchange));
 assert.equal(new Set(rows.map(date)).size,rows.length,`${exchange}: duplicate/contradictory date`);
 assert(!rows.some(h=>[0,6].includes(h.date.getDay())),`${exchange}: weekend closure entry`);
}
assert.equal(context.buildUSHolidays(2029).length,0,'Do not project US rules beyond verified coverage');
assert.equal(context.buildUSHolidays(2024).length,0);
assert.equal(context.buildUKHolidays(2029).length,1);
assert.equal(context.buildUKHolidays(2030).length,0);
assert.equal(context.formatExchangeDate(new Date(2028,6,3),{year:'numeric',month:'2-digit',day:'2-digit'}),'07/03/2028');
assert.equal(context.formatExchangeDate(new Date(2029,0,1),{year:'numeric',month:'2-digit',day:'2-digit'}),'01/01/2029');
console.log(`Compared ${checked} exchange/date/status entries with the reviewed official-calendar baseline; unverified years remain empty.`);
