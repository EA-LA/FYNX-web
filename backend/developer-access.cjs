'use strict';
const SCOPES=Object.freeze(['risk:calculate','propfirm:read','propfirm:write']);
function scopes(input){
 if(input===undefined)return [...SCOPES];
 if(!Array.isArray(input)||!input.length||input.length>SCOPES.length||input.some(s=>!SCOPES.includes(s))||new Set(input).size!==input.length)throw Object.assign(new Error('Choose one or more supported API key scopes.'),{code:'invalid-argument'});
 return [...input].sort();
}
function permits(key,route){
 const required=route.startsWith('/v1/risk/')?'risk:calculate':route.startsWith('GET /v1/propfirm/')?'propfirm:read':route.startsWith('/v1/propfirm/')?'propfirm:write':null;
 // Legacy keys retain existing access. Present but malformed scopes always fail closed.
 const granted=key.scopes===undefined?SCOPES:key.scopes;
 return !!required&&Array.isArray(granted)&&granted.includes(required);
}
module.exports={SCOPES,scopes,permits};
