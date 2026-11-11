'use strict';
const crypto = require('node:crypto');
const { fail, symbol } = require('./common.cjs');
async function verifyUser(req) {
  const token = String(req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if (!token) throw fail('Sign in to save strategies to your profile.', 401, 'SIGN_IN_REQUIRED');
  if (!process.env.QUANT_FIREBASE_PROJECT_ID) throw fail('Profile sync requires QUANT_FIREBASE_PROJECT_ID and server Firebase credentials.', 503, 'AUTH_NOT_CONFIGURED');
  try { const { getApps, initializeApp, applicationDefault } = require('firebase-admin/app'); const { getAuth } = require('firebase-admin/auth'); const name = 'fynx-quant'; const app = getApps().find(a => a.name === name) || initializeApp({ projectId: process.env.QUANT_FIREBASE_PROJECT_ID, credential: applicationDefault() }, name); const decoded = await getAuth(app).verifyIdToken(token, true); if (!decoded.uid) throw new Error('No identity'); return { uid: decoded.uid }; }
  catch { throw fail('Your session could not be verified. Sign in again.', 401, 'INVALID_SESSION'); }
}
function validateSaved(input, type) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('A strategy or portfolio object is required.');
  if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 100) throw fail('Choose a name of 1–100 characters.');
  if (Buffer.byteLength(JSON.stringify(input)) > 1000000) throw fail('Saved item is too large (maximum 1 MB).', 413);
  const id = input.id || crypto.randomUUID(); if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw fail('Invalid saved item ID.');
  const allowed = type === 'strategies' ? ['symbol', 'timeframe', 'params', 'returns', 'provenance'] : ['sleeves', 'options', 'method', 'provenance'];
  const item = { id, name: input.name.trim(), updatedAt: new Date().toISOString(), schemaVersion: 1 }; for (const key of allowed) if (input[key] !== undefined) item[key] = input[key];
  if (type === 'strategies') {
    symbol(item.symbol); if (!['M1','M5','H1','H4','D1','tick','TICK'].includes(item.timeframe)) throw fail('Choose a valid saved timeframe.');
    if (!item.params && !item.returns) throw fail('A strategy needs parameters or imported returns.');
    if (item.returns !== undefined) { if (!Array.isArray(item.returns) || !item.returns.length || item.returns.length > 100000) throw fail('Imported returns need 1–100,000 rows.'); const seen = new Set(); for (const point of item.returns) { if (!point || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(Date.parse(point.date)) || new Date(point.date).toISOString().slice(0,10) !== point.date || seen.has(point.date) || !Number.isFinite(point.return) || point.return < -1) throw fail('Invalid or duplicate saved return row.'); seen.add(point.date); } }
    if (item.params !== undefined && (!item.params || typeof item.params !== 'object' || Array.isArray(item.params))) throw fail('Saved strategy parameters must be an object.');
  }
  if (type === 'portfolios') {
    if (!Array.isArray(item.sleeves) || !item.sleeves.length || item.sleeves.length > 50) throw fail('A portfolio needs 1–50 strategy sleeves.');
    if (item.method !== undefined && !['equal-risk','equal-weight','inverse-volatility'].includes(item.method)) throw fail('Choose a supported weighting method.');
    for (const sleeve of item.sleeves) { if (!sleeve || typeof sleeve.name !== 'string' || !sleeve.name.trim() || sleeve.name.length > 100 || !Array.isArray(sleeve.returns) || !sleeve.returns.length || sleeve.returns.length > 100000) throw fail('Each saved sleeve needs a name and validated daily returns.'); const seen = new Set(); for (const point of sleeve.returns) { if (!point || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(Date.parse(point.date)) || new Date(point.date).toISOString().slice(0,10) !== point.date || seen.has(point.date) || !Number.isFinite(point.return) || point.return < -1) throw fail('Invalid or duplicate portfolio return row.'); seen.add(point.date); } }
  }
  return item;
}
module.exports = { verifyUser, validateSaved };
