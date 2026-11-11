// Revoke the Accounts cookie before the existing Firebase logout completes.
export async function endAccountsSession(){
 // This marker is only a network hint, never authentication or authorization.
 // The Accounts server mints it alongside every HttpOnly Accounts session.
 let cookies;
 try{cookies=document.cookie;}catch{throw new Error('We could not check your Accounts session. Refresh this page before signing out.');}
 if(!/(?:^|;)\s*fynx_accounts_present=1(?:;|$)/.test(cookies))return;
 let response;
 try{response=await fetch('/api/accounts/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});}
 catch{throw new Error('We could not confirm your Accounts sign-out. Reconnect and try again before leaving this device.');}
 // An authoritative 401 means the session is no longer usable. A 404 while the
 // marker exists can mean a routing outage and must not be labeled revoked.
 if(response.status===401)return;
 if(!response.ok)throw new Error('Your Accounts session could not be checked. Try again before leaving this device.');
 let session;try{session=await response.json();}catch{throw new Error('The Accounts service could not confirm your session. Try again before leaving this device.');}
 if(typeof session?.csrfToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(session.csrfToken))throw new Error('Refresh this page before signing out.');
 let closed;
 try{closed=await fetch('/api/accounts/session',{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:'{}',signal:AbortSignal.timeout(5000)});}
 catch{throw new Error('We could not confirm your Accounts sign-out. Reconnect and try again before leaving this device.');}
 if(!closed.ok)throw new Error('Your Accounts session could not be closed. Try again before leaving this device.');
 let result;try{result=await closed.json();}catch{throw new Error('The Accounts service did not confirm sign-out. Try again before leaving this device.');}
 if(result?.revoked!==true)throw new Error('The Accounts service did not confirm sign-out. Try again before leaving this device.');
}
