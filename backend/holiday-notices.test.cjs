const {test}=require('node:test');const assert=require('node:assert/strict');const {fingerprint}=require('./holiday-notices')._test;
test('holiday monitor ignores executable content but notices closure text changes',()=>{
 const calendar='<h1>Market holidays</h1><p>Holiday schedule: December 25 closed.</p><p>Early close December 24 at 13:00.</p>';
 assert.equal(fingerprint(calendar),fingerprint(calendar+'<script>price=123</script><style>.price{color:red}</style>'));
 assert.notEqual(fingerprint(calendar),fingerprint(calendar.replace('13:00','12:00')));
 assert.throws(()=>fingerprint('<h1>Access denied</h1>'));
});
test('uses current LSE source and distinguishes a browser-only calendar from an HTTP outage',()=>{
 const {sources}=require('./holiday-notices')._test;
 assert.equal(sources.lse,'https://www.londonstockexchange.com/trade/trading-access/business-days');
 assert.throws(()=>fingerprint('<main>London Stock Exchange</main><script>loadCalendar()</script>'),e=>e.code==='calendar-browser-review');
});
