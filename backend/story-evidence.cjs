'use strict';
// These are attributed selections from a bounded source brief, not new analysis.
// No title, topic template or model knowledge becomes an additional claim.
const complete=text=>typeof text==='string'&&text.length>=25&&/[.!]["”’')]*$/.test(text.trim())&&!/…|\.\.\./.test(text);
const uncertain=text=>/\b(?:could|might|would|expected|expects?|forecast|forecasts?|if|unless|proposed|aims?|plans? to)\b/i.test(text)||/\bmay\b/.test(text);
function futureDate(text,now) {
  // Require an explicit year and calendar date; a weekday or time alone does
  // not establish which occurrence the publisher intended.
  const matches=[...text.matchAll(/\b(20\d\d)-(\d{2})-(\d{2})\b/g)].map(m=>`${m[1]}-${m[2]}-${m[3]}`);
  const months='January February March April May June July August September October November December'.split(' ');
  const monthPattern=months.join('|');
  for(const m of text.matchAll(new RegExp(`\\b(${monthPattern}) (\\d{1,2})(?:st|nd|rd|th)?,? (20\\d\\d)\\b`,'g')))matches.push(`${m[3]}-${String(months.indexOf(m[1])+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`);
  for(const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (${monthPattern}) (20\\d\\d)\\b`,'g')))matches.push(`${m[3]}-${String(months.indexOf(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  const today=new Date(now).toISOString().slice(0,10);
  // Dates without timezones are day-precision source statements, not an exact
  // release instant. Today's event is not assumed to remain in the future.
  return matches.some(date=>{const stamp=Date.parse(date+'T00:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===date&&date>today;});
}
function sections(brief,{now=Date.now()}={}) {
  const empty={version:1,whyItMatters:[],context:[],nextEvents:[],marketImpact:[]};
  if(!brief||brief.coverageLevel==='headline-only'||!['source-text','publisher-excerpt'].includes(brief.coverageLevel)||!Number.isFinite(now))return empty;
  try{const u=new URL(brief.sourceUrl);if(u.protocol!=='https:'||u.username||u.password)return empty;}catch{return empty;}
  const rows=[brief.summary,...(Array.isArray(brief.keyPoints)?brief.keyPoints:[]).map(x=>x?.text)];
  const evidence=[...new Set(rows.filter(complete).map(x=>x.trim()))];
  const claim=text=>({text,sourceURL:brief.sourceUrl,kind:'source-reported'});
  const take=predicate=>evidence.filter(predicate).slice(0,2).map(claim);
  const assets=/\b(?:shares?|stocks?|bonds?|yields?|currencies|dollar|yen|euro|gold|oil|bitcoin|ethereum)\b/i;
  const move=/\b(?:rose|fell|rallied|declined|gained|lost|rise|fall|rally|decline|gain|lose|increase|decrease|higher|lower)\b/i;
  return {...empty,
    whyItMatters:take(x=>/\b(?:because|affect|impact|means|costs?|benefits?|eligible|eligibility|payments?|borrowing|financing)\b/i.test(x)),
    context:take(x=>/\b(?:historically|historical|previously|previous|earlier|last (?:year|month|quarter)|since|compared with|compared to|revised|revision)\b/i.test(x)),
    nextEvents:take(x=>/\b(?:scheduled|deadline|effective|takes? effect|will (?:meet|release|publish|begin|start|vote))\b/i.test(x)&&!uncertain(x)&&!(/\b(?:not|never|cancelled|canceled|postponed|previously|was|had)\b/i.test(x))&&futureDate(x,now)),
    // Reported movements remain attributed. No causal connection to this story
    // or independent price verification is claimed.
    marketImpact:take(x=>assets.test(x)&&move.test(x)&&!(/\b(?:not|never|denied|unconfirmed|alleged)\b/i.test(x))&&(uncertain(x)||/\b(?:rose|fell|rallied|declined|gained|lost)\b/i.test(x)))
      .map(x=>({...x,kind:uncertain(x.text)?'potential':'reported-movement'}))
  };
}
module.exports={sections};
