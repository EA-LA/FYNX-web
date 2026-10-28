'use strict';
const SCOPES=Object.freeze(['risk:calculate','propfirm:read','propfirm:write','indicators:calculate','markets:read','portfolio:calculate']);
// Route prefix -> required scope. Unknown routes require a scope nobody has, so they fail closed.
const ROUTES=[['/v1/risk/','risk:calculate'],['GET /v1/propfirm/','propfirm:read'],['/v1/propfirm/','propfirm:write'],['/v1/indicators/','indicators:calculate'],['/v1/markets/','markets:read'],['/v1/portfolio/','portfolio:calculate']];
function scopes(input){
 if(input===undefined)return [...SCOPES];
 if(!Array.isArray(input)||!input.length||input.length>SCOPES.length||input.some(s=>!SCOPES.includes(s))||new Set(input).size!==input.length)throw Object.assign(new Error('Choose one or more supported API key scopes.'),{code:'invalid-argument'});
 return [...input].sort();
}
function required(route){const hit=ROUTES.find(([prefix])=>route.startsWith(prefix));return hit?hit[1]:null;}
function permits(key,route){
 const need=required(route);
 // Legacy keys (created before scopes existed) retain access to every product. Present but malformed scopes always fail closed.
 // Keys with an explicit scope list only get what is listed, so they do not silently gain new products.
 const granted=key.scopes===undefined?SCOPES:key.scopes;
 return !!need&&Array.isArray(granted)&&granted.includes(need);
}
module.exports={SCOPES,scopes,permits,required};
