'use strict';
const PRICE='price_1UKSHKKF1DV2t1wM2GFMJvnp',PRODUCT='fynx_api';
function validPrice(p){return !!(p&&p.id===PRICE&&p.livemode===true&&p.type==='recurring'&&p.currency==='usd'&&p.unit_amount===4900&&p.recurring?.interval==='month'&&p.recurring.interval_count===1&&p.recurring.usage_type==='licensed');}
function paidSubscription(s,uid,customer){const item=s?.items?.data?.[0],invoice=s?.latest_invoice;return !!(customer&&s?.customer===customer&&s.livemode===true&&s.status==='active'&&!s.pause_collection&&s.metadata?.product===PRODUCT&&s.metadata.fynx_uid===uid&&s.items.data.length===1&&item.quantity===1&&validPrice(item.price)&&invoice?.livemode===true&&invoice.customer===customer&&invoice.status==='paid'&&invoice.paid===true);}
function defaultCap(profile){return profile.requestCap===1000&&!profile.requestCapExplicit&&!profile.updatedAt;}
module.exports={PRICE,PRODUCT,validPrice,paidSubscription,defaultCap};
