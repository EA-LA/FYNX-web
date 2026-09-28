'use strict';
// Offline intake validation only. A valid document is not proof of broker authority.
const {createHash}=require('node:crypto');
const Decimal=require('decimal.js');
const {canonical}=require('./developer-core.cjs');
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const isText=v=>typeof v==='string'&&!!v.trim()&&!/^(?:TODO|TBD|unknown|placeholder)$/i.test(v.trim());
const timestamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19);
function validate(c){
 const errors=[],need=(ok,path)=>{if(!ok)errors.push(path);};
 need(c?.schema_version===1,'schema_version must be 1');
 for(const k of ['version','broker','platform','server','account_type','account_currency'])need(isText(c?.[k]),k+' is required');
 need(/^[A-Z]{3}$/.test(c?.account_currency||''),'account_currency must be a currency code');
 need(timestamp(c?.effective_from),'effective_from must be an exact UTC timestamp');
 need(timestamp(c?.effective_until)&&Date.parse(c.effective_until)>Date.parse(c.effective_from),'effective_until must be after effective_from');
 const sources=Array.isArray(c?.sources)?c.sources:[];need(sources.length>0,'broker source evidence is required');const ids=new Set();
 for(const [i,s] of sources.entries()){
  const p='sources['+i+']';for(const k of ['id','issuer','reference'])need(isText(s?.[k]),p+'.'+k+' is required');
  need(!ids.has(s?.id),p+' duplicate id');ids.add(s?.id);
  need(/^[a-f0-9]{64}$/.test(s?.sha256||''),p+'.sha256 must identify preserved source bytes');need(timestamp(s?.retrieved_at),p+'.retrieved_at is required');
 }
 const symbols=Array.isArray(c?.symbols)?c.symbols:[];need(symbols.length>0,'symbols must contain broker records');const names=new Set();
 for(const [i,s] of symbols.entries()){
  const p='symbols['+i+']';for(const k of ['symbol','base_currency','quote_currency'])need(isText(s?.[k]),p+'.'+k+' is required');
  need(!names.has(s?.symbol),p+' duplicate exact symbol');names.add(s?.symbol);
  const nums={};for(const k of ['contract_size','tick_size','pip_size','minimum_lot','maximum_lot','lot_step']){
   const v=s?.[k];const valid=typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)&&v.length<80&&new Decimal(v).gt(0);need(valid,p+'.'+k+' must be a positive decimal string');if(valid)nums[k]=new Decimal(v);
  }
  if(nums.minimum_lot&&nums.maximum_lot)need(nums.minimum_lot.lte(nums.maximum_lot),p+' minimum_lot exceeds maximum_lot');
  if(nums.minimum_lot&&nums.lot_step)need(nums.minimum_lot.mod(nums.lot_step).isZero(),p+' minimum_lot is not aligned to lot_step');
  need(Number.isInteger(s?.price_digits)&&s.price_digits>=0&&s.price_digits<=12,p+'.price_digits must be 0–12');
  if(nums.tick_size&&Number.isInteger(s?.price_digits))need(nums.tick_size.decimalPlaces()<=s.price_digits,p+' tick size exceeds price precision');
  // Preserve full broker schedules; do not flatten tiered or time-varying costs into guessed constants.
  for(const k of ['tick_value_and_conversion','margin_and_leverage','commission','swaps','other_fees','trading_sessions','holidays_and_dst','execution_restrictions']){
   const detail=s?.[k];need(isText(detail?.description),p+'.'+k+'.description is required (explicit none/zero if broker states it)');
   need(Array.isArray(detail?.source_ids)&&detail.source_ids.length>0&&detail.source_ids.every(id=>ids.has(id)),p+'.'+k+' must reference known source evidence');
  }
  need(Array.isArray(s?.source_ids)&&s.source_ids.length>0&&s.source_ids.every(id=>ids.has(id)),p+' contract fields must reference source evidence');
 }
 return {valid:errors.length===0,errors,content_sha256:c?digest(c):null,symbol_count:symbols.length,broker_authority_verified:false,scope:'offline_intake_only'};
}
module.exports={validate,digest};
