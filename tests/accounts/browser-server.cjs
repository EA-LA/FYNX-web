'use strict';
// Loopback-only browser QA harness. No production auth switch, paid providers or seed data.
// The browser imports an explicitly labelled fixture through the actual app/API/worker flow.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
if (process.env.NODE_ENV === 'production') throw new Error('The Accounts QA server cannot run in production.');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fynx-accounts-browser-'));
fs.chmodSync(directory, 0o700);
const port = 4175;
const env = { ...process.env, NODE_ENV: 'test', ACCOUNTS_DB_PATH: path.join(directory, 'accounts.sqlite'), QUANT_DATA_DIR: path.join(directory, 'quant'), EDGE_DATA_DIR: path.join(directory, 'edge'), ACCOUNTS_ALLOW_LOCAL_KEY: 'true', ACCOUNTS_LOCAL_KEK: crypto.randomBytes(32).toString('base64'), ACCOUNTS_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`, ACCOUNTS_MT4_ENABLED: 'false', ACCOUNTS_MT5_ENABLED: 'false', ACCOUNTS_BINANCE_ENABLED: 'false', ACCOUNTS_BYBIT_ENABLED: 'false', ACCOUNTS_EMAIL_SEND_ENABLED: 'false', EDGE_EMAIL_SEND_ENABLED: 'false', ACCOUNTS_APPROVED_PROP_FIRMS: '', ACCOUNTS_PROP_TERMS_PROOFS_JSON: '{}' };
const { AccountsDB } = require('../../backend/accounts/db.cjs');
const { AccountsRepository } = require('../../backend/accounts/repository.cjs');
const { AccountsService } = require('../../backend/accounts/service.cjs');
const { createAccountsAPI } = require('../../backend/accounts/api.cjs');
const { createAccountsPages } = require('../../backend/accounts/pages.cjs');
const { Store } = require('../../backend/quant/store.cjs');
const { EdgeStore } = require('../../backend/edge/store.cjs');
const service = new AccountsService({ repository: new AccountsRepository({ db: new AccountsDB({ filename: env.ACCOUNTS_DB_PATH }) }), quantStore: new Store(env.QUANT_DATA_DIR), edgeStore: new EdgeStore(env.EDGE_DATA_DIR), env });
const api = createAccountsAPI({ service, env, verifyIdentity: async req => { if (req.headers.authorization !== 'Bearer local-accounts-qa') throw Object.assign(new Error('Local test identity required.'), { status: 401, code: 'SIGN_IN_REQUIRED' }); return { uid: 'accounts-browser-qa', email: 'accounts-qa@example.invalid', emailVerified: true, authTime: Math.floor(Date.now() / 1000) }; }, validateSession: async () => true });
const pages = createAccountsPages(api);
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end(); return; }
    if (url.pathname === '/assets/js/accounts/identity.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end('export async function watchIdentity(callback){ await callback({uid:"accounts-browser-qa",getIdToken:async()=>"local-accounts-qa"}); return ()=>{}; }'); return; }
    if (await api(req, res)) return;
    const end = res.end.bind(res);
    res.end = function (data, ...args) { if (typeof data === 'string' && data.startsWith('<!doctype html>')) data = data.replace('<a href="#accounts-main"', '<aside class="ac-notice" role="note">LOCAL TEST · disposable test identity · imported fixture data only · no live broker account</aside><a href="#accounts-main"'); return end(data, ...args); };
    if (await pages(req, res)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const decoded = decodeURIComponent(url.pathname), file = path.resolve(root, '.' + decoded), extension = path.extname(file);
    if (!(decoded.startsWith('/assets/') || /^\/favicon[^/]*$/.test(decoded)) || decoded.split('/').some(part => part.startsWith('.')) || !types[extension] || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.realpathSync(file).startsWith(root + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('QA route not found.'); return; }
    res.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Local QA request failed.' })); }
});
server.listen(port, '127.0.0.1', () => console.log(`Accounts QA: http://127.0.0.1:${port}/profile/accounts/connect (test fixture imports only)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await api.close(); fs.rmSync(directory, { recursive: true, force: true }); process.exit(0); });
