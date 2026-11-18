// Only anonymously published market research may be reused across identities.
const releasePath = '/assets/data/research/edge.json';
const scheduledURL = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data' + releasePath;
let cached = null;
let cachedAt = 0;
let pending = null;

function validate(data) {
  if (data?.publicResearch !== true || data.guest !== true ||
      !Number.isFinite(Date.parse(data.asOf)) || !Number.isFinite(Date.parse(data.generatedAt)) ||
      !Array.isArray(data.markets) || !data.markets.length || !Array.isArray(data.strategies) ||
      !Array.isArray(data.regimeMap) || data.guard?.connected || data.doubleRisk?.length) {
    throw new Error('Published market research is unavailable.');
  }
  for (const market of data.markets) {
    if (typeof market.symbol !== 'string' || !market.state?.regime || !market.price ||
        !market.events || !market.positioning?.net || !Array.isArray(market.fits) ||
        !market.tradePlans || Object.values(market.tradePlans).some(plan =>
          plan.available || plan.executionQuote || plan.lots != null || plan.entry != null || plan.riskAmount != null)) {
      throw new Error('Published market evidence is incomplete.');
    }
  }
  return data;
}

async function readPublished() {
  const sources = window.FynxResearchService.production ? [scheduledURL, releasePath] : [releasePath];
  for (const url of sources) {
    try {
      const response = await fetch(url, {
        credentials: 'omit',
        cache: 'no-cache',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(6500)
      });
      if (!response.ok) continue;
      // raw.githubusercontent.com may serve JSON files as text/plain.
      return validate(await response.json());
    } catch { /* The release includes a second, independently hosted snapshot. */ }
  }
  if (cached) return cached;
  throw new Error('The published market snapshot could not be retrieved.');
}

export async function publishedResearch(symbol) {
  if (!cached || Date.now() - cachedAt >= 300000) {
    pending ??= readPublished().then(data => {
      cached = data;
      cachedAt = Date.now();
      return data;
    }).finally(() => { pending = null; });
    await pending;
  }
  const market = symbol ? cached.markets.find(item => item.symbol === symbol) : null;
  if (symbol && !market) throw new Error('This market is missing from the published snapshot.');
  // Rendering may update a displayed quote. Keep each view separate from the published copy.
  const result = structuredClone(cached);
  if (symbol) result.market = result.markets.find(item => item.symbol === symbol);
  return result;
}
