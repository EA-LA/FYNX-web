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
 const tier=sub.metadata.tier,item=sub.items?.data?.[0],invoice=sub.latest_invoice;
 if(sub.items?.data?.length!==1||item.quantity!==1||!priceMatches(item.price,tier))return null;
 // Read expanded invoice data from Stripe; browser return URLs never confer access.
 if(!invoice||typeof invoice!=='object'||invoice.livemode!==true||invoice.customer!==customer||invoice.status!=='paid'||invoice.paid!==true)return null;
 return tier;
}
module.exports={PRODUCT,PRICES,priceMatches,planForSubscription};
