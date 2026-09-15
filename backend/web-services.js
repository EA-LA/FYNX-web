'use strict';
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { randomUUID } = require('node:crypto');
const db = () => admin.firestore();
const fail = (code, message) => { throw new functions.https.HttpsError(code, message); };
function actor(context) {
  if (!context.auth) fail('unauthenticated', 'Sign in to sync your account.');
  return context.auth.uid;
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('invalid-argument', `Invalid ${label}.`);
  return value.trim();
}
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail('invalid-argument', 'Invalid identifier.');
  return value;
}
const root = uid => db().collection('fynxWebUsers').doc(uid);
async function throttle(uid) {
  const ref = root(uid).collection('internal').doc('rate');
  await db().runTransaction(async tx => {
    const snap = await tx.get(ref), old = snap.data() || {}, now = Date.now();
    const count = now - (old.start || 0) < 60000 ? (old.count || 0) + 1 : 1;
    if (count > 60) fail('resource-exhausted', 'Please wait a minute and try again.');
    tx.set(ref, { start: count === 1 ? now : old.start, count });
  });
}
const runtime = functions.runWith({ timeoutSeconds: 30, memory: '256MB', maxInstances: 5 });
exports.webLearning = runtime.https.onCall(async (data, context) => {
  const uid = actor(context); await throttle(uid);
  const topic = id(data?.topic || 'general');
  const ref = root(uid).collection('learning').doc(topic);
  if (data?.action === 'read') {
    const [progress, attempts] = await Promise.all([ref.get(), ref.collection('attempts').orderBy('completedAt', 'desc').limit(20).get()]);
    return { ...(progress.data() || {lessons:{}}), attempts:attempts.docs.map(s=>({id:s.id,...s.data()})) };
  }
  if (data?.action === 'lesson') {
    const lesson = id(data.lesson);
    if (typeof data.completed !== 'boolean') fail('invalid-argument', 'Completion must be true or false.');
    await ref.set({ lessons: { [lesson]: { completed: data.completed, updatedAt: Date.now() } }, updatedAt: Date.now() }, { merge: true });
  } else if (data?.action === 'quiz') {
    const attempt = id(data.attempt);
    const correct = data.correct, total = data.total;
    if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 1 || total > 100 || correct < 0 || correct > total) fail('invalid-argument', 'Invalid quiz score.');
    // Study history is self-reported; never use it to award a verified certificate.
    await ref.collection('attempts').doc(attempt).set({ correct, total, completedAt: Date.now(), source: 'self-reported' });
    await ref.set({ lastQuiz: { correct, total, completedAt: Date.now() }, updatedAt: Date.now() }, { merge: true });
  } else fail('invalid-argument', 'Unknown learning action.');
  return { saved: true };
});
function validateReminder(data, now = Date.now()) {
  const name = text(data.name, 120, 'event name'), note = typeof data.note === 'string' ? data.note.slice(0, 500) : '';
  const eventAt = Number(data.eventAt), reminderAt = Number(data.reminderAt);
  if (!Number.isFinite(eventAt) || !Number.isFinite(reminderAt) || reminderAt <= now || eventAt < reminderAt || eventAt > now + 366 * 86400000) fail('invalid-argument', 'Choose a future reminder within the next year.');
  if (data.emailConsent !== true) fail('failed-precondition', 'Enable email delivery for this reminder.');
  return { name, note, eventAt, reminderAt };
}
exports.webReminders = runtime.https.onCall(async (data, context) => {
  const uid = actor(context); await throttle(uid);
  const queue = db().collection('fynxWebReminders');
  if (data?.action === 'list') {
    const snaps = await queue.where('uid', '==', uid).get();
    return { reminders: snaps.docs.map(s => { const d=s.data(); return { id:s.id, name:d.name, note:d.note, eventAt:d.eventAt, reminderAt:d.reminderAt, status:d.status }; }).sort((a,b)=>b.eventAt-a.eventAt) };
  }
  if (data?.action === 'cancel') {
    const ref = queue.doc(id(data.id));
    await db().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().uid !== uid) fail('not-found', 'Reminder not found.');
      if (snap.data().status !== 'pending') fail('failed-precondition', 'This reminder has already been processed.');
      tx.update(ref, { status:'cancelled', pendingAt:admin.firestore.FieldValue.delete() });
    });
    return { cancelled:true };
  }
  if (data?.action !== 'create') fail('invalid-argument','Unknown reminder action.');
  const user = await admin.auth().getUser(uid);
  if (!user.emailVerified || !user.email || user.disabled) fail('failed-precondition', 'Verify your account email before enabling email reminders.');
  const reminder = validateReminder(data);
  const requestId = id(data.id), ref = queue.doc(uid + '_' + requestId);
  await db().runTransaction(async tx => {
    // A per-user lock serializes concurrent create requests as well as quota checks.
    const lock = root(uid).collection('internal').doc('reminderQuota');
    await tx.get(lock);
    const existing = await tx.get(ref);
    if (existing.exists) return;
    const own = await tx.get(queue.where('uid','==',uid));
    if (own.docs.filter(s=>['pending','sending'].includes(s.data().status)).length >= 50) fail('resource-exhausted','You can have up to 50 pending reminders.');
    tx.set(lock,{updatedAt:Date.now()});
    tx.create(ref,{ ...reminder, uid, status:'pending', emailConsent:true, pendingAt:reminder.reminderAt, createdAt:Date.now() });
  });
  return { saved:true, id:ref.id };
});
async function sendEmail(user, reminder, testMode = false) {
  const body = new URLSearchParams({
    from:'FYNX Finance World <notifications@mail.fynxfunded.com>', to:user.email,
    subject:`Reminder: ${reminder.name}`,
    text:`${reminder.name}\n\nEvent time: ${new Date(reminder.eventAt).toUTCString()}\n${reminder.note || ''}\n\nYou requested this reminder in FYNX Finance World. Manage reminders: https://www.fynxfinanceworld.com/tools/calendar-alerts.html`,
    'o:tag':'fynx-web-reminder'
  });
  if (testMode) body.set('o:testmode','yes');
  const response = await fetch('https://api.mailgun.net/v3/mail.fynxfunded.com/messages', {
    method:'POST', headers:{ Authorization:'Basic '+Buffer.from('api:'+process.env.MAILGUN_API_KEY).toString('base64') }, body, signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Mailgun HTTP '+response.status);
  const result = await response.json();
  return result.id || 'accepted';
}
exports.webReminderDelivery = functions.runWith({ secrets:['MAILGUN_API_KEY'], timeoutSeconds:120, memory:'256MB', maxInstances:1 }).pubsub.schedule('every 1 minutes').onRun(async () => {
  const now = Date.now();
  const snaps = await db().collection('fynxWebReminders').where('pendingAt','<=',now).limit(30).get();
  for (const snap of snaps.docs) {
    const token = randomUUID();
    const reminder = await db().runTransaction(async tx => {
      const fresh = await tx.get(snap.ref), d = fresh.data();
      if (!d) return null;
      if(d.status==='sending'){tx.update(snap.ref,{status:'delivery_unconfirmed',pendingAt:admin.firestore.FieldValue.delete(),lastError:'Previous delivery attempt did not complete'});return null;}
      if(d.status!=='pending')return null;
      tx.update(snap.ref,{status:'sending',claim:token,pendingAt:Date.now()+300000,attemptAt:Date.now()});
      return d;
    });
    if (!reminder) continue;
    try {
      const user = await admin.auth().getUser(reminder.uid);
      if (!user.emailVerified || user.disabled || !user.email || reminder.emailConsent !== true || reminder.eventAt < Date.now()) {
        await snap.ref.update({status:'skipped',pendingAt:admin.firestore.FieldValue.delete()}); continue;
      }
      const providerId = await sendEmail(user,reminder);
      await snap.ref.update({status:'sent',providerId,sentAt:Date.now(),pendingAt:admin.firestore.FieldValue.delete()});
    } catch (error) {
      // A timeout may mean the provider accepted the message. Do not automatically resend.
      console.error('Reminder delivery needs review',snap.id,error.message);
      await snap.ref.update({status:'delivery_unconfirmed',pendingAt:admin.firestore.FieldValue.delete(),lastError:'Delivery could not be confirmed',finishedAt:Date.now()});
    }
  }
});
exports._test = { validateReminder, actor, id, sendEmail };
