'use strict';
const {PLANS}=require('./consumer-core.cjs');
const PRODUCT='fynx_consumer_live';
const PRICES=Object.freeze({starter:'price_1UKRLQKF1DV2t1wM2UGmB0Y6',plus:'price_1UKRMFKF1DV2t1wMgCkO7SlM',pro:'price_1UKRN0KF1DV2t1wM1yPmZJ6L'});
function priceMatches(price,tier){
 const plan=Object.hasOwn(PLANS,tier)?PLANS[tier]:null;
 return !!(plan&&price?.id===PRICES[tier]&&price.livemode===true&&price.currency==='usd'&&price.unit_amount===plan.cents&&price.type==='recurring'&&price.recurring?.interval==='month'&&price.recurring.interval_count===1&&price.recurring.usage_type==='licensed');
}
function planForSubscription(sub,uid,customer){
 if(!sub||!customer||sub.customer!==customer||sub.status!=='active'||sub.livemode!==true||sub.metadata?.product!==PRODUCT||sub.metadata.fynx_uid!==uid||sub.pause_collection)return null;
 const tier=sub.metadata.tier,items=sub.items,invoice=sub.latest_invoice;
 // An incomplete or malformed item list cannot prove that this is exactly one paid plan.
 if(!Array.isArray(items?.data)||items.data.length!==1||items.has_more===true)return null;
 const item=items.data[0];
 if(item?.quantity!==1||!priceMatches(item.price,tier))return null;
 // Read expanded invoice data from Stripe; browser return URLs never confer access.
 // Basil removed the legacy paid boolean; paid status remains authoritative.
 if(!invoice||typeof invoice!=='object'||invoice.livemode!==true||invoice.customer!==customer||invoice.status!=='paid'||(invoice.paid!==undefined&&invoice.paid!==true))return null;
 return tier;
}
module.exports={PRODUCT,PRICES,priceMatches,planForSubscription};
