'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createAccountsAPI } = require('../backend/accounts/api.cjs');
const { createAccountsPages } = require('../backend/accounts/pages.cjs');
const { createEdgeAPI } = require('../backend/edge/api.cjs');
const { createQuantAPI } = require('../backend/quant/api.cjs');
const { fetchJSON } = require('../backend/quant/common.cjs');
const root = path.resolve(__dirname, '..'); const api = createQuantAPI(); const accountsAPI = createAccountsAPI(); const edgeAPI = createEdgeAPI({onHeartbeat:report=>accountsAPI.service.ingestHeartbeat(report),guardResolver:(uid,events)=>accountsAPI.service.guard(uid,null,events)}); const accountsPages = createAccountsPages(accountsAPI);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };
function publicFile(urlPath) { let decoded; try { decoded = decodeURIComponent(urlPath); } catch { return null; } if (decoded === '/quant-analyst' || decoded === '/quant-analyst/') decoded = '/quant-analyst.html'; if (/^\/edge-radar(?:\/[a-z0-9]+)?\/?$/.test(decoded)) decoded = decoded.replace(/\/$/,'') + '/index.html'; if (decoded === '/') decoded = '/index.html'; const segments = decoded.split('/'); if (segments.some(s => s.startsWith('.') || s === 'backend' || s === 'node_modules' || s === 'lib' || s === 'tests' || s === 'scripts' || s === 'docs' || s === 'content' || s === 'config')) return null; const extension = path.extname(decoded); if (!types[extension] || /(?:package(?:-lock)?|hosting|firebase|credential|secret)/i.test(path.basename(decoded))) return null; const file = path.resolve(root, '.' + decoded); if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null; const real = fs.realpathSync(file); if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) return null; return file; }
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (await accountsAPI(req, res)) return;
    if (await accountsPages(req, res)) return;
    if (await edgeAPI(req, res)) return;
    if (await api(req, res)) return;
    const url = new URL(req.url, 'http://localhost');
    // Reuse the site's existing verified feed/research providers for the shared header and ticker.
    if (req.method === 'GET' && ['/api/market-feed', '/api/research'].includes(url.pathname)) { const remote = new URL('https://us-central1-fynx-c7a28.cloudfunctions.net/' + (url.pathname === '/api/research' ? 'webResearchData' : 'webMarketFeed')); for (const [key, value] of url.searchParams) if (value.length <= 500) remote.searchParams.set(key, value); const body = await fetchJSON(remote, { provider: 'FYNX market feed', limit: 15000000 }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const file = publicFile(url.pathname); if (!file) { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Content-Type', types[path.extname(file)] + (/html|javascript|css|json|plain|xml/.test(types[path.extname(file)]) ? '; charset=utf-8' : '')); res.setHeader('Cache-Control', 'no-cache'); if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  } catch (error) { if (!res.headersSent) res.writeHead(error.status || 503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.code ? error.message : 'Service unavailable.' })); }
});
const port = Number(process.env.QUANT_PORT || 4174); const host = process.env.QUANT_HOST || '127.0.0.1';
if (require.main === module) { server.listen(port, host, () => console.log(`Quant Analyst: http://${host}:${port}/quant-analyst`)); for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await accountsAPI.close(); await edgeAPI.close(); await api.close(); server.close(); }); }
module.exports = { server, publicFile, api, edgeAPI, accountsAPI };
