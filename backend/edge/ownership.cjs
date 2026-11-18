'use strict';
// A prefix alone is not ownership: Firebase custom UIDs may themselves contain ':'.
function ownsPrivateKey(table,key,uid){
 if(typeof key!=='string'||typeof uid!=='string'||!uid)return false;
 const prefix='user:'+uid+':';if(!key.startsWith(prefix))return false;
 const parts=key.slice(prefix.length).split(':');let zone=parts.shift();
 // Older Intl-only validation accepted numeric offsets. Recognize only that
 // exact legacy form so deletion still removes those records without UID-prefix matching.
 if(/^[+-]\d{2}$/.test(zone||'')&&/^\d{2}$/.test(parts[0]||''))zone+=':'+parts.shift();
 if(!zone||zone.length>100)return false;
 try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{return false;}
 const symbol=value=>/^[A-Z0-9]{3,12}$/.test(value||'');
 const period=value=>value==='latest'||/^\d{4}-\d{2}-\d{2}$/.test(value||'');
 if(table==='edge_snapshots')return parts.length===1&&period(parts[0])||parts.length===3&&parts[0]==='market'&&symbol(parts[1])&&period(parts[2]);
 if(table==='plan_inputs')return parts.length===1&&symbol(parts[0])||parts.length===3&&parts[0]==='market'&&symbol(parts[1])&&parts[1]===parts[2];
 return false;
}
module.exports={ownsPrivateKey};
