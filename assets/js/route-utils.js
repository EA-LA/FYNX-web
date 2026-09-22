/* Same-origin return destinations keep sign-in attached to the user's task. */
export function safeReturnTo(value, origin = window.location.origin) {
 const fallback='/home.html';
 if(!value)return fallback;
 try{const url=new URL(value,origin);if(url.origin!==origin||!['http:','https:'].includes(url.protocol)||/^\/(?:auth\/|app-return\.html|open-app\.html|waitlist\.html)/i.test(url.pathname))return fallback;return url.pathname+url.search+url.hash;}catch{return fallback;}
}
