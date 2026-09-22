/* Codes only: never transmit messages, form values, identities or query strings. */
(()=>{
 const CODES=new Set(['unknown','network','timeout','permission-denied','unauthenticated','unavailable','resource-exhausted','invalid-argument','auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/too-many-requests','auth/network-request-failed','auth/popup-blocked','auth/popup-closed-by-user','auth/operation-not-allowed','auth/invalid-verification-code','storage/unauthorized','storage/retry-limit-exceeded','storage/quota-exceeded','storage/unknown','storage/canceled']);
 const seen=new Map();let count=0;
 function report(category,operation,error){
  if(!['www.fynxfinanceworld.com','fynxfinanceworld.com'].includes(location.hostname))return;
  const raw=typeof error?.code==='string'?error.code.replace(/^functions\//,''):error?.name==='TimeoutError'?'timeout':error instanceof TypeError?'network':'unknown';
  const code=CODES.has(raw)?raw:'unknown',key=`${category}:${operation}:${code}`;
  if(count>=12||Date.now()-(seen.get(key)||0)<60000)return;seen.set(key,Date.now());count++;
  fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webOperationalEvent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category,operation,code,page:location.pathname}),keepalive:true,credentials:'omit'}).catch(()=>{});
 }
 async function track(category,operation,action){try{return await action();}catch(error){report(category,operation,error);throw error;}}
 window.FynxMonitor={report,track};
 (window.__fynxMonitorQueue||[]).splice(0).forEach(args=>report(...args));
 window.addEventListener('unhandledrejection',e=>report('runtime','runtime',e.reason));
 window.addEventListener('error',e=>{if(e.error)report('runtime','runtime',e.error);});
})();
