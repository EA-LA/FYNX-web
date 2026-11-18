const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const m=require('./developer-markets.cjs'),{HOLIDAYS,COVERAGE}=require('./developer-markets-data.cjs');
const status=(at,ex)=>m.markets('status',{at,exchanges:[ex]}).exchanges[0];

test('backend calendars match the website holiday data',()=>{
 const w={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/exchange-holidays.js'),'utf8'),{window:w});
 for(const ex of ['TSX','TSXV','LSE','HKEX','TSE'])assert.deepEqual(JSON.parse(JSON.stringify(HOLIDAYS[ex])),JSON.parse(JSON.stringify(w.FynxExchangeHolidays[ex])),ex);
 assert.deepEqual(JSON.parse(JSON.stringify(COVERAGE)),JSON.parse(JSON.stringify(w.FynxHolidayCoverage)));
});
test('NYSE regular, holiday, early close and weekend',()=>{
 const open=status('2026-11-02T14:30:00Z','NYSE');assert.equal(open.status,'open');assert.equal(open.next_close,'2026-11-02T21:00:00Z');
 const before=status('2026-11-02T14:29:00Z','NYSE');assert.equal(before.status,'closed');assert.equal(before.next_open,'2026-11-02T14:30:00Z');
 const holiday=status('2026-11-26T15:00:00Z','NYSE');assert.equal(holiday.day_type,'holiday');assert.equal(holiday.status,'closed');assert.equal(holiday.next_open,'2026-11-27T14:30:00Z');assert.equal(holiday.next_close,'2026-11-27T18:00:00Z');
 assert.equal(status('2026-11-27T18:30:00Z','NYSE').status,'closed');
 const sat=status('2026-10-31T15:00:00Z','NYSE');assert.equal(sat.day_type,'weekend');assert.equal(sat.next_open,'2026-11-02T14:30:00Z');
});
test('daylight saving changes the UTC open',()=>{
 assert.equal(status('2027-03-12T14:30:00Z','NYSE').next_close,'2027-03-12T21:00:00Z');
 assert.equal(status('2027-03-15T13:30:00Z','NYSE').status,'open');
 assert.equal(status('2027-03-15T20:00:00Z','NYSE').next_open,'2027-03-16T13:30:00Z');
 assert.equal(status('2027-03-30T07:00:00Z','LSE').status,'open'); // BST: 08:00 London = 07:00Z
});
test('lunch breaks and Asian holidays',()=>{
 const hk=status('2026-11-03T04:30:00Z','HKEX');assert.equal(hk.status,'break');assert.equal(hk.next_open,'2026-11-03T05:00:00Z');
 const tse=status('2026-11-03T01:00:00Z','TSE');assert.equal(tse.day_type,'holiday');assert.equal(tse.next_open,'2026-11-04T00:00:00Z');
 const half=status('2026-12-24T03:00:00Z','HKEX');assert.equal(half.day_type,'early_close');assert.equal(half.next_close,'2026-12-24T04:00:00Z');
});
test('dates outside published coverage are unknown, never open',()=>{
 const u=status('2030-03-04T15:00:00Z','NASDAQ');assert.equal(u.status,'unknown');assert.ok(u.warnings.includes('date_outside_published_calendar_coverage'));
 const edge=status('2026-12-31T21:30:00Z','NASDAQ');assert.equal(edge.status,'closed');assert.equal(edge.next_open,null);assert.ok(edge.warnings.includes('next_session_beyond_calendar_coverage'));
});
test('holiday lists and coverage status',()=>{
 const ny=m.markets('holidays',{exchange:'nyse',year:2026});assert.equal(ny.coverage_status,'full_year');assert.equal(ny.days.filter(d=>d.type==='holiday').length,10);assert.deepEqual(ny.days.find(d=>d.date==='2026-11-27').sessions,['09:30-13:00']);
 assert.equal(m.markets('holidays',{exchange:'LSE',year:2026}).coverage_status,'partial_year');
 assert.equal(m.markets('holidays',{exchange:'TSE',year:2031}).coverage_status,'not_covered');
 assert.throws(()=>m.markets('holidays',{exchange:'XYZ'}),e=>e.code==='unsupported_exchange');
});
test('forex sessions, overlaps and the weekend gap',()=>{
 const s=m.markets('sessions',{at:'2026-11-02T13:30:00Z'});assert.equal(s.fx_market,'open');assert.deepEqual(s.active_sessions,['London','New York']);assert.equal(s.overlap,'London + New York');
 const sat=m.markets('sessions',{at:'2026-10-31T12:00:00Z'});assert.equal(sat.fx_market,'closed');assert.deepEqual(sat.active_sessions,[]);
 assert.equal(m.markets('sessions',{at:'2026-11-01T21:59:00Z'}).fx_market,'closed');
 assert.equal(m.markets('sessions',{at:'2026-11-01T22:00:00Z'}).fx_market,'open');
 assert.throws(()=>m.markets('sessions',{at:'2026-11-01 10:00'}),/timezone/);
});
test('reference list and unknown endpoints',()=>{
 const e=m.markets('exchanges',{});assert.equal(e.exchanges.length,7);assert.deepEqual(e.exchanges.find(x=>x.exchange==='TSE').regular_sessions,['09:00-11:30','12:30-15:30']);
 assert.throws(()=>m.markets('foo',{}),e=>e.code==='not_found');
});
