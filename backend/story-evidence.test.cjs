'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{sections}=require('./story-evidence.cjs'),Reader=require('./news-reader.cjs');
const now=Date.parse('2026-11-15T12:00:00Z'),sourceUrl='https://www.federalreserve.gov/report.htm';
const brief=(summary,extra={})=>({summary,keyPoints:[],sourceUrl,coverageLevel:'publisher-excerpt',...extra});
const item=description=>({title:'Central bank reports policy decision',source:'Federal Reserve',link:sourceUrl,pubDate:new Date(now-60000).toISOString(),category:'economics',edition:'us',description});
test('headline-only, incomplete, and truncated material cannot become additional evidence claims',()=>{
 for(const b of [brief('Interest costs will change because the committee cut rates.',{coverageLevel:'headline-only'}),brief('Interest costs will change because'),brief('Interest costs will change because the committee…'),brief('Interest costs will change because the committee...',{}),brief('A reported fact because there is evidence.',{sourceUrl:'javascript:alert(1)'})])assert.deepEqual(sections(b,{now}),{version:1,whyItMatters:[],context:[],nextEvents:[],marketImpact:[]});
});
test('source sentences and attribution are retained verbatim without adding entities, figures or dates',()=>{
 const text='The change affects borrowing costs because the policy rate fell by 25 basis points.';
 const output=sections(brief(text,{keyPoints:[{text:'The previous policy rate was 5 percent before the latest decision.'}]}),{now});
 assert.deepEqual(output.whyItMatters,[{text,sourceURL:sourceUrl,kind:'source-reported'}]);assert.equal(output.context[0].sourceURL,sourceUrl);assert(output.context[0].text.includes('5 percent'));
});
test('next events require a complete future calendar date and a definite source-reported schedule',()=>{
 for(const text of ['The committee will meet on November 16, 2026 to decide its policy rate.','The policy change takes effect on 16 November 2026 after the published notice.','The bank will publish the next release on 2026-11-16 according to the schedule.'])assert.equal(sections(brief(text),{now}).nextEvents.length,1,text);
 for(const text of ['The committee will meet on Monday to decide its policy rate.','The committee will meet on November 14, 2026 to decide its policy rate.','The committee will meet on November 15, 2026 to decide its policy rate.','The committee could publish the release on November 16, 2026 if approved.','The committee will not meet on November 16, 2026 after cancellation.','The committee was scheduled to meet on November 16, 2026 before cancellation.','The committee will meet on February 30, 2027 to decide its policy rate.'])assert.equal(sections(brief(text),{now}).nextEvents.length,0,text);
});
test('reported movements and possible effects are distinguished without causal or independent-verification claims',()=>{
 const actual=sections(brief('Stocks rose in May after the company published its quarterly report.'),{now}).marketImpact;
 assert.equal(actual[0].kind,'reported-movement');assert.equal(actual[0].sourceURL,sourceUrl);
 for(const text of ['Stocks could rise if the committee approves the policy change.','Oil prices may fall after the proposed agreement takes effect.','Bond yields were expected to decline after the announcement.'])assert.equal(sections(brief(text),{now}).marketImpact[0].kind,'potential');
 for(const text of ['Stocks never rose after the company published its quarterly report.','The central bank expects to hold a meeting about dollar payments.'])assert.deepEqual(sections(brief(text),{now}).marketImpact,[]);
});
test('a long sentence is not clipped before its qualifier or promoted into financial facts',()=>{
 const long='The central bank reported borrowing costs '+Array(40).fill('alongside').join(' ')+' a 25 basis point figure that was only a hypothetical scenario.';
 const output=Reader.createBrief(item(long),{now});assert.equal(output.coverageLevel,'headline-only');assert.deepEqual(output.numbers,[]);assert.deepEqual(output.intelligence.whyItMatters,[]);assert.equal(output.summary,output.title);
});
test('a short complete sentence can still be selected after overlong source sentences',()=>{
 const long='The central bank reported borrowing costs '+Array(40).fill('alongside').join(' ')+' potential scenarios.';
 const fact='The central bank kept its policy rate unchanged at 5 percent.';
 const output=Reader.createBrief(item([long,long,long,fact].join(' ')),{now});assert.equal(output.summary,fact);assert(!output.summary.includes('…'));
});
