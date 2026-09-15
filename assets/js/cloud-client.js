import { app, auth } from '../../auth/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
const functions = getFunctions(app, 'us-central1');
export async function cloudCall(name, data) {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Sign in to use cloud sync.');
  return (await httpsCallable(functions, name, {timeout:30000})(data)).data;
}
export { auth };
