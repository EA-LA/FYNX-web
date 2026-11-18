'use strict';
const {planForSubscription}=require('./consumer-live-policy.cjs');
const {hash,fail}=require('./account-sync-core.cjs');
const CACHE_MS=5*60*1000,APPLE_PRODUCT='com.fynx.financeworld.monthly';
function appleValid(value,now){return value?.source==='app-store-server'&&value.productId===APPLE_PRODUCT&&value.environment==='Production'&&value.revoked!==true&&Number.isFinite(value.expiresAt)&&value.expiresAt>now&&Number.isFinite(value.verifiedAt)&&value.verifiedAt<=now&&now-value.verifiedAt<24*3600000;}
function capabilities({stripeTier,apple,bridgeEnabled}){
 const tier=bridgeEnabled&&apple?'pro':stripeTier;
 return {accountSync:true,savedNews:true,watchlists:true,journal:true,manualPortfolios:true,webAnalytics:!!tier,webRiskTools:!!tier,webResearchSaves:!!tier,webPortfolioTools:['plus','pro'].includes(tier),webSimulation:tier==='pro',nativePro:apple||(bridgeEnabled&&stripeTier==='pro'),nativeAI:apple||(bridgeEnabled&&stripeTier==='pro')};
}
function createMembership({db,stripe,now=Date.now,bridgeEnabled=()=>false}){
 return async function membership(uid,{force=false}={}){
  const ref=db.collection('fynxAccountMemberships').doc(uid),cached=(await ref.get()).data(),at=now(),enabled=bridgeEnabled()===true;
  if(!force&&cached?.source==='account-membership-server-v1'&&cached.bridgeEnabled===enabled&&cached.expiresAt>at&&cached.verifiedAt<=at&&at-cached.verifiedAt<CACHE_MS)return cached;
  const [appleDoc,webDoc]=await Promise.all([db.collection('intelligenceEntitlements').doc(uid).get(),db.collection('fynxConsumerLive').doc(uid).get()]);
  const apple=appleValid(appleDoc.data(),at),web=webDoc.data()||{};let stripeTier=null,stripeStatus='verified',stripeSubscription=null;
  if(web.customer){try{const s=await stripe(),list=await s.subscriptions.list({customer:web.customer,status:'all',limit:100,expand:['data.latest_invoice']});const sub=list.data.find(value=>planForSubscription(value,uid,web.customer));if(sub){stripeTier=planForSubscription(sub,uid,web.customer);stripeSubscription={status:sub.status,cancelAtPeriodEnd:sub.cancel_at_period_end===true,currentPeriodEnd:sub.items.data[0]?.current_period_end||sub.current_period_end||null};}}catch{stripeStatus='unavailable';}}
  const caps=capabilities({stripeTier,apple,bridgeEnabled:enabled}),webTier=enabled&&apple?'pro':stripeTier;
  const result={schemaVersion:1,source:'account-membership-server-v1',status:stripeStatus==='unavailable'?'partial':'verified',bridgeEnabled:enabled,verifiedAt:at,expiresAt:Math.min(at+CACHE_MS,apple?Math.min(appleDoc.data().expiresAt,appleDoc.data().verifiedAt+24*3600000):Infinity),webTier,nativeTier:caps.nativePro?'pro':'free',capabilities:caps,sources:[{provider:'apple',active:apple,verification:apple?'verified':'inactive',...(apple?{expiresAt:appleDoc.data().expiresAt}:{})},{provider:'stripe',active:!!stripeTier,verification:stripeStatus,tier:stripeTier,subscription:stripeSubscription}],management:{apple:'https://apps.apple.com/account/subscriptions',stripe:web.customer?'consumerLiveWorkspace:portal':null}};
  // This namespace has no client write rule. No profile tier or client boolean
  // participates in capability decisions; only verified provider evidence does.
  await db.runTransaction(async tx=>{if((await tx.get(db.collection('fynxAccountSyncDeleted').doc(hash(uid)))).exists)fail('unauthenticated','This account was deleted.');tx.set(ref,result);});return result;
 };
}
function sharedNativePro(value,now=Date.now()){return value?.source==='account-membership-server-v1'&&value.bridgeEnabled===true&&value.expiresAt>now&&value.verifiedAt<=now&&now-value.verifiedAt<CACHE_MS&&value.capabilities?.nativePro===true;}
module.exports={CACHE_MS,appleValid,capabilities,createMembership,sharedNativePro};
