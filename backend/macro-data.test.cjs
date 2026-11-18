const {test}=require('node:test');const assert=require('node:assert/strict');const {_test:{parseRates,parseIndicators}}=require('./macro-data');
test('BIS parser preserves zero and negative rates and observation dates',()=>{
 const xml='<message:StructureSpecificData xmlns:message="x"><DataSet><Series REF_AREA="CH" SOURCE_REF="SNB" COMPILATION="Policy rate"><Obs TIME_PERIOD="2026-01-02" OBS_VALUE="0"/></Series><Series REF_AREA="JP"><Obs TIME_PERIOD="2026-01-01" OBS_VALUE="-0.1"/></Series></DataSet></message:StructureSpecificData>';
 const data=parseRates(xml);assert.equal(data.rows.length,2);assert.equal(data.rows[0].value,0);assert.equal(data.rows[1].value,-.1);assert.equal(data.rows[0].observationDate,'2026-01-02');assert.equal(data.rows[0].definition,'Policy rate');
});
test('BIS malformed or missing observations do not become zero',()=>{
 assert.throws(()=>parseRates('<StructureSpecificData><DataSet><Series REF_AREA="US"><Obs TIME_PERIOD="2026-01-01"/></Series></DataSet></StructureSpecificData>'));
 assert.throws(()=>parseRates('<error>unavailable</error>'));
});
test('World Bank missing observations stay missing; source and observation dates remain distinct',()=>{
 const row={countryiso3code:'USA',indicator:{id:'FP.CPI.TOTL.ZG'},value:0,date:'2025'};
 const data=parseIndicators([{lastupdated:'2026-07-13'},[row,{...row,countryiso3code:'CAN',value:null}]]);
 assert.equal(data.rows.length,1);assert.equal(data.rows[0].value,0);assert.equal(data.rows[0].year,'2025');assert.equal(data.sourceUpdatedAt,'2026-07-13');assert.throws(()=>parseIndicators([{message:'rate limit'}]));
});
