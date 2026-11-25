/* FYNX Web Push configuration.
 * Replace VAPID_PUBLIC_KEY with the public key generated in Firebase Console
 * (Project Settings → Cloud Messaging → Web configuration → Web Push certificates).
 * Do NOT put the private key here or anywhere in the frontend.
 *
 * messagingSenderId must also be added to auth/firebase.js from
 * Project Settings → Cloud Messaging → Sender ID.
 */
export const VAPID_PUBLIC_KEY = 'BESOj8FiBNTTdQHhS3nnn0w3lTpYIz69zYhqoh6qtLKB7ul-VUOzY77kEG9wqBG6usK4PZVXObWlg6ME_xstnYA';

export const FCM_SW_PATH = '/firebase-messaging-sw.js';
