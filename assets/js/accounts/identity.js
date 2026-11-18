// Existing Firebase sign-in is the identity source; broker credentials never enter it.
export async function watchIdentity(callback){
 const [{auth},{onIdTokenChanged}]=await Promise.all([import('/auth/firebase.js'),import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')]);
 await auth.authStateReady();
 return onIdTokenChanged(auth,callback);
}
