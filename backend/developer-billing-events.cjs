'use strict';
const functions=require('firebase-functions/v1');
const logger=require('firebase-functions/logger');
const {stripe,root,refresh}=require('./developer-billing.cjs');
const EVENTS=new Set(['checkout.session.completed','invoice.paid','invoice.payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted']);
async function processEvent(event,s){
 if(event.livemode!==true||!EVENTS.has(event.type))return 'ignored';
 const object=event.data?.object,customerId=typeof object?.customer==='string'?object.customer:object?.customer?.id;
 if(!customerId)return 'ignored';
 const customer=await s.customers.retrieve(customerId);
 if(customer.deleted||customer.livemode!==true||customer.metadata?.product!=='fynx_api')return 'ignored';
 const uid=customer.metadata.fynx_uid;
 if(typeof uid!=='string'||!uid||uid.includes('/'))return 'ignored';
 const ref=root(uid),profile=(await ref.get()).data();
 if(profile?.stripeLiveCustomer!==customerId)return 'ignored';
 const eventRef=ref.collection('billingEvents').doc(event.id);
 if((await eventRef.get()).exists)return 'duplicate';
 const state=await refresh(uid,true);
 await ref.set({billingObservedAt:Date.now()},{merge:true});
 await eventRef.set({type:event.type,stripeCreated:event.created,processedAt:Date.now()});
 return 'processed';
}
async function webhook(req,res){
 if(req.method!=='POST')return res.status(405).send('Method not allowed');
 let event,s;
 try{s=stripe();event=s.webhooks.constructEvent(req.rawBody,req.get('stripe-signature'),process.env.FYNX_API_STRIPE_WEBHOOK_SECRET);}catch{return res.status(400).send('Invalid signature');}
 try{const result=await processEvent(event,s);logger.info('API billing event',{service:'fynx_api',kind:'billing_webhook',status:200,eventId:event.id,type:event.type,result});return res.status(200).json({received:true});}
 catch{logger.error('API billing event processing failed',{service:'fynx_api',kind:'billing_webhook',status:500,eventId:event.id,type:event.type});return res.status(500).send('Retry later');}
}
exports.developerBillingWebhook=functions.runWith({secrets:['FYNX_API_STRIPE_SECRET_KEY','FYNX_API_STRIPE_WEBHOOK_SECRET'],timeoutSeconds:60,memory:'256MB',maxInstances:3}).https.onRequest(webhook);
exports._test={processEvent,webhook};
