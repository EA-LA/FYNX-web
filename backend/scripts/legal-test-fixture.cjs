'use strict';
// Synthetic legal records for automated tests only. Never publish this fixture.
const {digest,contentHash}=require('../developer-legal.cjs');
function release(){
 const r={version:'test-v1',identity:{legal_name:'TEST ONLY',address:'TEST ONLY',jurisdiction:'TEST ONLY',support_email:'test@example.invalid',privacy_email:'privacy@example.invalid'},billing:{amount_cents:4900,currency:'USD',interval:'month',cancel_at:'period_end',overages:false,tax_behavior:'exclusive',tax_configuration_verified:true,refund_policy:'TEST refund policy',recurring_statement:'TEST authorization: USD 49 monthly plus tax until canceled.'},documents:Object.fromEntries(['terms','privacy','billing'].map(n=>[n,{body:'TEST ONLY '+n,sha256:digest('TEST ONLY '+n)}]))};
 const hash=contentHash(r);r.approval={bundle_sha256:hash,owner_reference:'TEST',legal_review_reference:'TEST',reviewed_by:'TEST',reviewed_at:'2026-09-01T00:00:00Z'};r.publication={bundle_sha256:hash,verified_at:'2026-09-01T00:00:00Z'};return r;
}
module.exports={release};
