/* FYNX research fallback (Vercel serverless). Same read-only service as the Cloud Function
 * (backend/research-data.cjs): ?action=directory | financials&cik= | history | quotes.
 * Used by the Research desk when the primary endpoint is rate-limited by SEC EDGAR, so company
 * financials still load. SEC is called with a declared User-Agent and paced below its fair-access limit. */
'use strict';
const {createResearchService} = require('../backend/research-data.cjs');
const service = createResearchService();
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); return res.status(204).end(); }
  if (req.method !== 'GET') return res.status(405).json({error: 'Use GET.'});
  try {
    const q = req.query || {}, body = await service.query({action: String(q.action || ''), cik: q.cik, symbol: q.symbol, symbols: q.symbols});
    res.setHeader('Cache-Control', q.action === 'quotes' ? 'public, s-maxage=60, stale-while-revalidate=300' : 'public, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json(body);
  } catch (e) {
    return res.status(e.status === 400 ? 400 : 502).json({error: e.message || 'Research data is unavailable. Please retry.'});
  }
};
