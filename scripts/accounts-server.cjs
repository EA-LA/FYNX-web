'use strict';
// FYNX My Accounts production service (accounts.fynxfinanceworld.com).
// Serves only /api/accounts/* plus /healthz. Listens on loopback; Caddy on the same VM terminates HTTPS.
// All configuration comes from the environment (see ops/accounts-vm/README.md); secrets are loaded by
// ops/accounts-vm/run.sh from Secret Manager and never written to disk.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const env = process.env;
if (env.NODE_ENV !== 'production') console.warn('accounts-server: NODE_ENV is not production.');
for (const key of ['ACCOUNTS_FIREBASE_PROJECT_ID', 'ACCOUNTS_DB_PATH', 'ACCOUNTS_KMS_KEY_NAME', 'ACCOUNTS_ALLOWED_ORIGINS']) {
  if (!env[key]) { console.error(`accounts-server: missing ${key}`); process.exit(1); }
}
const dir = path.dirname(env.ACCOUNTS_DB_PATH);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.chmodSync(dir, 0o700);

const { createAccountsAPI } = require('../backend/accounts/api.cjs');
const accountsAPI = createAccountsAPI();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      return res.end('ok');
    }
    if (await accountsAPI(req, res)) return;
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Not found.', code: 'NOT_FOUND' }));
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'The account service had a problem.', code: 'INTERNAL' }));
  }
});
server.requestTimeout = 60_000;
server.headersTimeout = 20_000;

const port = Number(env.ACCOUNTS_PORT || 8080);
server.listen(port, '127.0.0.1', () => console.log(`FYNX accounts service on 127.0.0.1:${port}`));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (closing) return; closing = true;
  server.close();
  try { await accountsAPI.service?.close?.(); } catch {}
  process.exit(0);
});
module.exports = { server };
