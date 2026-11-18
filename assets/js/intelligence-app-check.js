// Loaded only by the Market Intelligence workspace. This public site key is
// bound to the registered Finance World domains; it is not a secret or debug key.
import {app} from '../../auth/firebase.js';
const SITE_KEY = '6LdHpx4uAAAAAJIRmFzqD2XJCvkMPoQoT8rxjkln';
let appCheckTask;
async function instance(){
 if(!SITE_KEY)throw Error('Market workspace verification is not configured yet.');
 if(!appCheckTask)appCheckTask=import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js').then(sdk=>({sdk,appCheck:sdk.initializeAppCheck(app,{provider:new sdk.ReCaptchaEnterpriseProvider(SITE_KEY),isTokenAutoRefreshEnabled:true})})).catch(error=>{appCheckTask=null;throw error;});
 return appCheckTask;
}
export async function verifyMarketWorkspace(forceRefresh=false){
 try{const {sdk,appCheck}=await instance();await sdk.getToken(appCheck,forceRefresh);}
 catch{throw Error('Market workspace verification could not finish. Reload this page on Finance World and try again.');}
}
