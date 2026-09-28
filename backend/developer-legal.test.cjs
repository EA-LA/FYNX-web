'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {service,blockers}=require('./developer-legal.cjs'),{release}=require('./scripts/legal-test-fixture.cjs'),{harness}=require('./scripts/billing-harness.cjs');
const submission=h=>({version:h.legal.describe().version,bundle_sha256:h.legal.describe().bundle_sha256,terms_accepted:true,privacy_acknowledged:true,recurring_consent:false});
test('real release is blocked by missing identity, approvals and publication',()=>{const r=require('./legal-release.json');assert(blockers(r).some(x=>x.includes('identity')));assert.equal(service(r).describe().available,false);});
test('modifying reviewed document or price invalidates release approval',()=>{for(const mutate of [r=>r.documents.terms.body+='edited',r=>r.billing.amount_cents=4901,r=>r.identity.legal_name='Changed seller',r=>r.publication=null]){const r=release();mutate(r);assert.equal(service(r).describe().available,false);}});
test('server records authenticated UID and timestamp, retry preserves original acceptance',async()=>{
 const h=harness({accepted:false}),input=submission(h);await h.call('acceptTerms',undefined,{...input,accepted_at:1,uid:'attacker'});const target='fynxDevelopers/qa/legalAcceptances/'+h.legal.acceptanceId,first=h.records.get(target);assert.equal(first.uid,'qa');assert(first.accepted_at>1);await h.call('acceptTerms',undefined,input);assert.equal(h.records.get(target).accepted_at,first.accepted_at);await h.legal.requireAccepted(h.db,'qa');await assert.rejects(h.legal.requireAccepted(h.db,'qa',true));
});
test('recurring consent is separate and never rewrites the original terms record',async()=>{
 const h=harness({accepted:false}),input=submission(h);await h.call('acceptTerms',undefined,input);await h.call('acceptTerms',undefined,{...input,recurring_consent:true});const key='fynxDevelopers/qa/legalAcceptances/'+h.legal.acceptanceId;assert.equal(h.records.get(key).recurring_consent,false);assert.equal(h.records.get(key+'/consents/recurring').recurring_consent,true);await h.legal.requireAccepted(h.db,'qa',true);
});
test('unchecked, stale, unreviewed and cross-user acceptances are rejected',async()=>{
 for(const change of [x=>x.terms_accepted=false,x=>x.privacy_acknowledged=false,x=>x.bundle_sha256='old',x=>x.version='old']){const h=harness({accepted:false}),input=submission(h);change(input);await assert.rejects(h.call('acceptTerms',undefined,input));assert(![...h.records.keys()].some(k=>k.includes('legalAcceptances')));}
 const h=harness({live:true});await assert.rejects(h.legal.requireAccepted(h.db,'other-user'));
});
