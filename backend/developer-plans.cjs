'use strict';
// FYNX API plans (checklist item 44) and overage metering rules (item 45).
//
// Overage is opt-in: a paid plan stops at its included calls unless the customer explicitly raises
// their monthly request cap (up to MAX_OVERAGE_MULTIPLE x included). Extra calls are billed per
// started block of 1,000, reported to a Stripe Billing Meter once per block with an idempotent identifier.
const BLOCK=1000,MAX_OVERAGE_MULTIPLE=10;
const PLANS=Object.freeze({
 free:{name:'Free',monthlyPrice:0,monthlyCalls:1000,rps:10,overageBlockCents:null},
 developer:{name:'Developer',monthlyPrice:19,monthlyCalls:25000,rps:20,overageBlockCents:50},
 business:{name:'Business',monthlyPrice:99,monthlyCalls:250000,rps:50,overageBlockCents:30},
 // Grandfathered $49 API Pro subscriptions keep exactly what they bought. Not sold once new plans are live.
 pro:{name:'API Pro (legacy)',monthlyPrice:49,monthlyCalls:50000,rps:30,overageBlockCents:null,legacy:true},
 enterprise:{name:'Enterprise',custom:true}
});
// Stripe objects created by the owner in the Stripe dashboard (IDs are not secret).
// A paid tier is purchasable only when both of its price IDs and the meter event name are set.
const STRIPE=Object.freeze({
 meterEventName:'fynx_api_overage_blocks',
 developer:{base:null,overage:null},
 business:{base:null,overage:null}
});
const PAID_TIERS=['developer','business'];
let cfg=STRIPE; // replaced only by tests via _configure()
const configured=tier=>!!(cfg[tier]?.base&&cfg[tier]?.overage&&cfg.meterEventName);
const purchasable=()=>{const live=PAID_TIERS.filter(configured);return live.length?live:['pro'];};

const isPlan=plan=>typeof plan==='string'&&Object.prototype.hasOwnProperty.call(PLANS,plan);
function limitsFor(plan){
 const ok=isPlan(plan)&&!PLANS[plan].custom,p=ok?PLANS[plan]:PLANS.free,key=ok?plan:'free';
 return {plan:key,monthlyCalls:p.monthlyCalls,rps:p.rps,overage:p.overageBlockCents!==null,overageBlockCents:p.overageBlockCents,maxOverageMultiple:MAX_OVERAGE_MULTIPLE,monthlyPrice:p.monthlyPrice};
}
// Highest monthly cap a customer may save for a plan.
const capCeiling=limits=>limits.overage?limits.monthlyCalls*MAX_OVERAGE_MULTIPLE:limits.monthlyCalls;
// Overage block (1-based) that a call falls into, or 0 inside the included allowance.
const overageBlock=(callsAfter,included)=>callsAfter<=included?0:Math.ceil((callsAfter-included)/BLOCK);

// --- Stripe price and subscription validation for the new tiers ---
function validBase(price,tier){const p=PLANS[tier];return !!(price&&price.id===cfg[tier]?.base&&price.livemode===true&&price.active!==false&&price.type==='recurring'&&price.currency==='usd'&&price.unit_amount===p.monthlyPrice*100&&price.recurring?.interval==='month'&&price.recurring.interval_count===1&&price.recurring.usage_type==='licensed');}
function validOverage(price,tier){const p=PLANS[tier];return !!(price&&price.id===cfg[tier]?.overage&&price.livemode===true&&price.active!==false&&price.type==='recurring'&&price.currency==='usd'&&price.billing_scheme==='per_unit'&&price.unit_amount===p.overageBlockCents&&price.recurring?.interval==='month'&&price.recurring.interval_count===1&&price.recurring.usage_type==='metered'&&!!price.recurring.meter);}
function tierSubscription(s,uid,customer,product){
 const tier=s?.metadata?.tier;if(!PAID_TIERS.includes(tier)||!configured(tier))return null;
 const items=s.items?.data||[],invoice=s.latest_invoice;
 if(!(customer&&s.customer===customer&&s.livemode===true&&s.status==='active'&&!s.pause_collection&&s.metadata.product===product&&s.metadata.fynx_uid===uid&&items.length===2))return null;
 const base=items.find(i=>i.price?.id===cfg[tier].base),over=items.find(i=>i.price?.id===cfg[tier].overage);
 if(!base||!over||base.quantity!==1||!validBase(base.price,tier)||!validOverage(over.price,tier))return null;
 if(!(invoice?.livemode===true&&invoice.customer===customer&&invoice.status==='paid'&&invoice.paid===true))return null;
 return tier;
}
function catalog(){return {currency:'USD',block_size:BLOCK,max_overage_multiple:MAX_OVERAGE_MULTIPLE,purchasable:purchasable(),plans:Object.fromEntries(Object.entries(PLANS).map(([k,p])=>[k,p.custom?{name:p.name,custom:true}:{name:p.name,monthly_price:p.monthlyPrice,monthly_calls:p.monthlyCalls,rps:p.rps,overage_per_1000:p.overageBlockCents===null?null:p.overageBlockCents/100,...(p.legacy?{legacy:true}:{})}]))};}
module.exports={isPlan,meterEventName:()=>cfg.meterEventName,stripeIds:tier=>cfg[tier],_configure:c=>{cfg=c||STRIPE;},BLOCK,MAX_OVERAGE_MULTIPLE,PLANS,STRIPE,PAID_TIERS,configured,purchasable,limitsFor,capCeiling,overageBlock,validBase,validOverage,tierSubscription,catalog};
