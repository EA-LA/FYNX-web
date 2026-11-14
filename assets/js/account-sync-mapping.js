(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FynxAccountSyncMapping=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
 'use strict';
 // Match Foundation URLComponents, including literal '+', valueless query items,
 // explicit default ports and an absent path. URLSearchParams uses form encoding
 // and would give an iPhone bookmark a different identity for these URLs.
 function canonicalStoryURL(value){
  const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Unsupported story link.');
  const parts=String(value).match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i);if(!parts)throw Error('Unsupported story link.');
  const omitted=new Set(['fbclid','gclid','mc_cid','mc_eid','__source']);
  const encode=value=>encodeURIComponent(value).replace(/%(?:24|2B|2C|2F|3A|3B|3F|40)/gi,code=>String.fromCharCode(parseInt(code.slice(1),16)));
  const pairs=(parts[4]?parts[4].split('&'):[]).map((raw,i)=>{const at=raw.indexOf('=');return {name:decodeURIComponent(at<0?raw:raw.slice(0,at)),value:at<0?null:decodeURIComponent(raw.slice(at+1)),i};}).filter(({name})=>!name.toLowerCase().startsWith('utm_')&&!omitted.has(name.toLowerCase())).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.i-b.i);
  const query=pairs.map(({name,value})=>encode(name)+(value===null?'':'='+encode(value))).join('&');
  return parts[1].toLowerCase()+'://'+parts[2].toLowerCase()+parts[3]+(pairs.length?'?'+query:'');
 }
 return {canonicalStoryURL};
});
