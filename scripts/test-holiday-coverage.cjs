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
