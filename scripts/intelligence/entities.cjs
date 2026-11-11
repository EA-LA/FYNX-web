'use strict';
/* FYNX Intelligence: link a story to markets and companies it actually names.
 * Matching is deliberately conservative. A market is linked only when the headline
 * or source brief names it (or its central bank / currency / benchmark); companies
 * only by a curated name list, an explicit exchange ticker, or a distinctive listed
 * company name. Nothing is inferred from vague themes. */

// [pattern, symbols, asset class, label]
const MARKET_RULES = [
  [/\b(Federal Reserve|the Fed\b|Fed's|Fed (?:chair|governor|official|president)|FOMC|Powell|Goolsbee|Waller|Bowman|Jefferson|Logan|Kashkari|Daly|Barkin|Hammack|Musalem|Schmid|Williams)\b/i, ['^TNX', 'DX-Y.NYB', '^GSPC'], 'rates', 'US monetary policy'],
  [/\b(U\.?S\.? (?:inflation|CPI|consumer prices|PCE)|CPI|consumer price index|PCE|core inflation)\b/i, ['^TNX', 'DX-Y.NYB', '^GSPC', 'GC=F'], 'rates', 'US inflation'],
  [/\b(nonfarm|non-farm|payrolls|jobless claims|unemployment rate|jobs report)\b/i, ['^TNX', 'DX-Y.NYB', '^GSPC'], 'rates', 'US labour market'],
  [/\b(Treasur(?:y|ies) yields?|bond yields?|10-year yield|Treasuries)\b/i, ['^TNX', 'TLT'], 'rates', 'US Treasuries'],
  [/\b(ECB|European Central Bank|Lagarde|euro ?zone|eurozone)\b/i, ['EURUSD=X', '^STOXX50E'], 'forex', 'Euro area'],
  [/\b(euro)\b(?! ?stoxx)/i, ['EURUSD=X'], 'forex', 'Euro'],
  [/\b(Bank of England|BoE|Bailey|sterling|British pound|the pound|UK (?:inflation|economy|gilts?)|gilts?)\b/i, ['GBPUSD=X', '^FTSE'], 'forex', 'United Kingdom'],
  [/\b(Bank of Japan|BoJ|Ueda|yen|Japan(?:ese)? (?:economy|inflation|stocks|bonds))\b/i, ['JPY=X', '^N225'], 'forex', 'Japan'],
  [/\b(Nikkei)\b/i, ['^N225'], 'indices', 'Japan equities'],
  [/\b(yuan|renminbi|PBOC|People's Bank of China|China's economy|Chinese (?:economy|exports|imports|stocks))\b/i, ['CNY=X', '000001.SS', '^HSI'], 'forex', 'China'],
  [/\b(Hang Seng|Hong Kong stocks)\b/i, ['^HSI'], 'indices', 'Hong Kong equities'],
  [/\b(Reserve Bank of Australia|RBA|Aussie dollar|Australian dollar)\b/i, ['AUDUSD=X', '^AXJO'], 'forex', 'Australia'],
  [/\b(Bank of Canada|Canadian dollar|loonie)\b/i, ['CAD=X', '^GSPTSE'], 'forex', 'Canada'],
  [/\b(Swiss franc|SNB|Swiss National Bank)\b/i, ['CHF=X'], 'forex', 'Switzerland'],
  [/\b(rupee|Reserve Bank of India|RBI|Nifty|Sensex)\b/i, ['INR=X', '^NSEI'], 'forex', 'India'],
  [/\b(Mexican peso|Banxico)\b/i, ['MXN=X'], 'forex', 'Mexico'],
  [/\b(Brazil(?:ian)? real|Bovespa|Banco Central do Brasil)\b/i, ['BRL=X', '^BVSP'], 'forex', 'Brazil'],
  [/\b(Turkish lira|lira)\b/i, ['TRY=X'], 'forex', 'Turkey'],
  [/\b(rand|South African Reserve Bank)\b/, ['ZAR=X'], 'forex', 'South Africa'],
  [/\b(KOSPI|Korean won|Bank of Korea)\b/i, ['^KS11'], 'indices', 'South Korea'],
  [/\b(DAX|German stocks|Bundesbank)\b/, ['^GDAXI'], 'indices', 'Germany'],
  [/\b(CAC 40|French stocks)\b/i, ['^FCHI'], 'indices', 'France'],
  [/\b(FTSE 100|FTSE)\b/, ['^FTSE'], 'indices', 'UK equities'],
  [/\b(dollar index|DXY|U\.?S\.? dollar|greenback)\b/i, ['DX-Y.NYB'], 'forex', 'US dollar'],
  [/\b(S&P 500|S&P500|Wall Street(?! (?:banks?|firms?|analysts?|Journal|lenders|brokers?|executives?))|U\.?S\.? stocks|stock market|stocks? futures)\b/i, ['^GSPC', 'ES=F'], 'indices', 'US equities'],
  [/\b(Dow Jones|the Dow\b|Dow futures)\b/i, ['^DJI'], 'indices', 'Dow Jones'],
  [/\b(Nasdaq)\b/i, ['^IXIC'], 'indices', 'Nasdaq'],
  [/\b(Russell 2000|small[- ]caps?)\b/i, ['^RUT'], 'indices', 'US small caps'],
  [/\b(VIX|volatility index)\b/i, ['^VIX'], 'indices', 'Equity volatility'],
  [/\b(crude|oil prices?|Brent|WTI|OPEC\+?|oil (?:market|output|supply|demand|futures))\b/i, ['BZ=F', 'CL=F', 'XLE'], 'commodities', 'Crude oil'],
  [/\b(natural gas|LNG)\b/i, ['NG=F'], 'commodities', 'Natural gas'],
  [/\b(gold)\b(?! ?(?:man|en|fields|medal))/i, ['GC=F', 'GLD'], 'commodities', 'Gold'],
  [/\b(silver)\b/i, ['SI=F'], 'commodities', 'Silver'],
  [/\b(copper)\b/i, ['HG=F'], 'commodities', 'Copper'],
  [/\b(wheat)\b/i, ['ZW=F'], 'commodities', 'Wheat'],
  [/\b(corn)\b/i, ['ZC=F'], 'commodities', 'Corn'],
  [/\b(soybeans?)\b/i, ['ZS=F'], 'commodities', 'Soybeans'],
  [/\b(coffee)\b/i, ['KC=F'], 'commodities', 'Coffee'],
  [/\b(cocoa)\b/i, ['CC=F'], 'commodities', 'Cocoa'],
  [/\b(bitcoin|BTC)\b/i, ['BTC-USD', 'IBIT'], 'crypto', 'Bitcoin'],
  [/\b(ether|ethereum|ETH)\b/i, ['ETH-USD'], 'crypto', 'Ethereum'],
  [/\b(solana)\b/i, ['SOL-USD'], 'crypto', 'Solana'],
  [/\b(XRP|Ripple)\b/, ['XRP-USD'], 'crypto', 'XRP'],
  [/\b(dogecoin)\b/i, ['DOGE-USD'], 'crypto', 'Dogecoin'],
  [/\b(crypto(?:currency|currencies)?|stablecoins?|digital assets?)\b/i, ['BTC-USD', 'ETH-USD'], 'crypto', 'Crypto market'],
  [/\b(semiconductors?|chipmakers?|chip stocks|chips?\b(?! ?(?:in|away)))/i, ['SMH'], 'stocks', 'Semiconductors'],
  [/\b(banks? stocks|bank shares|big banks|lenders)\b/i, ['XLF'], 'stocks', 'Banks'],
  [/\b(housing|home sales|mortgage rates?|homebuilders?)\b/i, ['XLRE', '^TNX'], 'stocks', 'Housing'],
];

// Curated companies: name variants → [ticker, sector]. Covers the most-reported US listings.
const COMPANIES = [
  ['Apple', 'AAPL', 'Technology'], ['Microsoft', 'MSFT', 'Technology'], ['Nvidia|NVIDIA', 'NVDA', 'Semiconductors'], ['Amazon', 'AMZN', 'Consumer & cloud'],
  ['Alphabet|Google', 'GOOGL', 'Communication services'], ['Meta Platforms|Meta\\b|Facebook|Instagram', 'META', 'Communication services'], ['Tesla', 'TSLA', 'Autos'],
  ['Broadcom', 'AVGO', 'Semiconductors'], ['Berkshire Hathaway|Berkshire', 'BRK-B', 'Financials'], ['JPMorgan|JP Morgan|JPMorgan Chase', 'JPM', 'Banks'],
  ['Visa\\b(?! (?:rules|policy|applications?|holders?|program|fees?|ban|restrictions|overstay))', 'V', 'Payments'], ['Mastercard', 'MA', 'Payments'], ['Eli Lilly|Lilly', 'LLY', 'Pharmaceuticals'],
  ['UnitedHealth', 'UNH', 'Health insurance'], ['Walmart', 'WMT', 'Retail'], ['Costco', 'COST', 'Retail'], ['Home Depot', 'HD', 'Retail'], ['Procter & Gamble|P&G', 'PG', 'Consumer staples'],
  ['Johnson & Johnson|J&J', 'JNJ', 'Healthcare'], ['Exxon|ExxonMobil|Exxon Mobil', 'XOM', 'Energy'], ['Chevron', 'CVX', 'Energy'], ['Oracle', 'ORCL', 'Software'],
  ['Salesforce', 'CRM', 'Software'], ['Netflix', 'NFLX', 'Media'], ['AMD|Advanced Micro Devices', 'AMD', 'Semiconductors'], ['Intel\\b', 'INTC', 'Semiconductors'],
  ['Palantir', 'PLTR', 'Software'], ['Disney', 'DIS', 'Media'], ['Coca-Cola|Coca Cola', 'KO', 'Beverages'], ['Bank of America|BofA', 'BAC', 'Banks'],
  ['Goldman Sachs|Goldman', 'GS', 'Banks'], ['Morgan Stanley', 'MS', 'Banks'], ['Citigroup|Citi\\b', 'C', 'Banks'], ['Wells Fargo', 'WFC', 'Banks'], ['BlackRock', 'BLK', 'Asset management'],
  ['Boeing', 'BA', 'Aerospace'], ['Lockheed Martin', 'LMT', 'Defense'], ['RTX|Raytheon', 'RTX', 'Defense'], ['General Electric|GE Aerospace', 'GE', 'Industrials'], ['Caterpillar', 'CAT', 'Industrials'],
  ['Pfizer', 'PFE', 'Pharmaceuticals'], ['Merck', 'MRK', 'Pharmaceuticals'], ['AbbVie', 'ABBV', 'Pharmaceuticals'], ['Novo Nordisk', 'NVO', 'Pharmaceuticals'], ['Moderna', 'MRNA', 'Biotech'],
  ['Starbucks', 'SBUX', 'Restaurants'], ["McDonald's|McDonalds", 'MCD', 'Restaurants'], ['Nike', 'NKE', 'Apparel'], ['Target Corp|Target\\b(?= (?:shares|stock|earnings|sales|CEO))', 'TGT', 'Retail'],
  ['PepsiCo|Pepsi', 'PEP', 'Beverages'], ['Uber', 'UBER', 'Mobility'], ['Airbnb', 'ABNB', 'Travel'], ['PayPal', 'PYPL', 'Payments'], ['Coinbase', 'COIN', 'Crypto'],
  ['MicroStrategy|Strategy Inc', 'MSTR', 'Crypto'], ['Micron', 'MU', 'Semiconductors'], ['Qualcomm', 'QCOM', 'Semiconductors'], ['Arm Holdings', 'ARM', 'Semiconductors'],
  ['TSMC|Taiwan Semiconductor', 'TSM', 'Semiconductors'], ['ASML', 'ASML', 'Semiconductors'], ['Super Micro|Supermicro', 'SMCI', 'Hardware'], ['Dell\\b', 'DELL', 'Hardware'],
  ['IBM', 'IBM', 'Technology'], ['Cisco', 'CSCO', 'Networking'], ['Adobe', 'ADBE', 'Software'], ['ServiceNow', 'NOW', 'Software'], ['Snowflake', 'SNOW', 'Software'],
  ['CrowdStrike', 'CRWD', 'Cybersecurity'], ['Palo Alto Networks', 'PANW', 'Cybersecurity'], ['Shopify', 'SHOP', 'E-commerce'], ['Spotify', 'SPOT', 'Media'],
  ['Ford\\b', 'F', 'Autos'], ['General Motors|\\bGM\\b', 'GM', 'Autos'], ['Rivian', 'RIVN', 'Autos'], ['Lucid', 'LCID', 'Autos'], ['Toyota', 'TM', 'Autos'],
  ['Delta Air Lines|Delta\\b(?= (?:Air|shares|stock|earnings|flights))', 'DAL', 'Airlines'], ['United Airlines', 'UAL', 'Airlines'], ['American Airlines', 'AAL', 'Airlines'], ['Southwest Airlines', 'LUV', 'Airlines'],
  ['Verizon', 'VZ', 'Telecom'], ['AT&T', 'T', 'Telecom'], ['T-Mobile', 'TMUS', 'Telecom'], ['Comcast', 'CMCSA', 'Media'], ['Warner Bros', 'WBD', 'Media'], ['Paramount', 'PARA', 'Media'],
  ['CoreWeave', 'CRWV', 'AI infrastructure'], ['OpenAI', null, 'AI (private)'], ['Anthropic', null, 'AI (private)'], ['SpaceX', null, 'Aerospace (private)'],
  ['Robinhood', 'HOOD', 'Brokerage'], ['Charles Schwab|Schwab', 'SCHW', 'Brokerage'], ['American Express|Amex', 'AXP', 'Payments'], ['Block Inc|Square', 'XYZ', 'Payments'],
  ['Alibaba', 'BABA', 'E-commerce'], ['Tencent', 'TCEHY', 'Technology'], ['BYD', 'BYDDY', 'Autos'], ['Samsung', null, 'Technology (Korea-listed)'], ['Sony', 'SONY', 'Technology'],
  ['Shell\\b', 'SHEL', 'Energy'], ['BP\\b', 'BP', 'Energy'], ['ConocoPhillips', 'COP', 'Energy'], ['Occidental', 'OXY', 'Energy'], ['Halliburton', 'HAL', 'Energy'],
  ['UPS\\b|United Parcel Service', 'UPS', 'Logistics'], ['FedEx', 'FDX', 'Logistics'], ['Kalshi', null, 'Prediction markets (private)'], ['Polymarket', null, 'Prediction markets (private)'],
  ['Wynn', 'WYNN', 'Casinos'], ['Las Vegas Sands', 'LVS', 'Casinos'], ['Magnolia Oil', 'MGY', 'Energy'], ['Hims & Hers', 'HIMS', 'Healthcare'], ['Walgreens', 'WBA', 'Retail'], ['CVS', 'CVS', 'Healthcare'],
].map(([names, ticker, sector]) => ({re: new RegExp('\\b(?:' + names + ')', ''), ticker, sector, name: names.split('|')[0].replace(/\\b.*$/, '').replace(/\\\\b/g, '')}));

const SUFFIX = /\s*(?:,|\s)\s*(?:Inc\.?|Incorporated|Corp\.?|Corporation|Holdings?|Ltd\.?|Limited|plc|PLC|Group|Co\.?|Company|N\.V\.|S\.A\.|SE|AG|Technologies|Technology|Class [A-Z].*|Common Stock.*|Ordinary Shares?.*|American Depositary.*)$/;
function shortName(full) {
  let n = String(full).split(' - ')[0].trim();
  for (let i = 0; i < 4; i++) n = n.replace(SUFFIX, '').trim();
  return n.replace(/[,.]$/, '');
}
/* Listed names that can be matched safely by exact phrase: two or more words (≥ 9 chars),
 * or a single word with an internal capital (CoreWeave, PayPal). Plain dictionary words
 * ("Target", "Global") never match on their own. */
function buildListingIndex(rows = []) {
  const map = new Map();
  for (const [ticker, full, type] of rows) {
    if (type !== 'EQUITY' || !/^[A-Z]{1,5}$/.test(ticker)) continue;
    const name = shortName(full);
    const multi = /\s/.test(name) && name.length >= 9 && !/^(?:The|First|United|American|National|Global|International|General|New|Great)\s\w+$/i.test(name);
    const camel = /^[A-Z][a-z]+[A-Z][A-Za-z]+$/.test(name) && name.length >= 6;
    if ((multi || camel) && !map.has(name.toLowerCase())) map.set(name.toLowerCase(), {name, ticker});
  }
  return map;
}
function findListings(text, index) {
  const found = [], lower = ' ' + text.toLowerCase().replace(/[^a-z0-9&.' -]/g, ' ') + ' ';
  for (const [key, row] of index) if (lower.includes(' ' + key + ' ') || lower.includes(' ' + key + "'s ")) found.push(row);
  return found;
}

function classOf(symbol, q) {
  const g = String(q?.group || '');
  if (/^\^(TNX|FVX|TYX|IRX)$/.test(symbol) || /T-Note|T-Bond|Treasur/i.test(q?.name || '') || /bond/i.test(g)) return 'rates';
  if (/=X$|^DX-Y|^6[EJB]=F/.test(symbol)) return 'forex';
  if (/-USD$|^BTC=F|^IBIT$/.test(symbol)) return 'crypto';
  if (/=F$|^(GLD|SLV|GDX|USO|UNG|DBA)$/.test(symbol)) return 'commodities';
  if (/^\^/.test(symbol) || /^(SPY|VOO|QQQ|IWM|DIA|VTI)$/.test(symbol)) return 'indices';
  return 'stocks';
}
function linkStory(text, {listings, quotes}) {
  const markets = new Map(), themes = [], companies = new Map();
  // Earliest mention first: the market the headline is about leads.
  const hits = MARKET_RULES.map(([re, symbols, assetClass, label]) => { const m = re.exec(text); return m && {at: m.index, symbols, assetClass, label}; }).filter(Boolean).sort((a, b) => a.at - b.at);
  for (const {symbols, assetClass, label} of hits) {
    themes.push({label, assetClass});
    for (const s of symbols) if (quotes[s] && !markets.has(s)) markets.set(s, {symbol: s, assetClass: classOf(s, quotes[s]), theme: label});
  }
  for (const c of COMPANIES) if (c.re.test(text)) companies.set(c.ticker || c.name, {name: c.name.replace(/\\/g, ''), ticker: c.ticker, sector: c.sector});
  // Explicit tickers: "(NASDAQ: CRWV)", "NYSE:XYZ", "$TSLA".
  for (const m of text.matchAll(/\((?:NASDAQ|NYSE|NYSE American|AMEX|Nasdaq)\s*:\s*([A-Z]{1,5})\)|\$([A-Z]{2,5})\b/g)) {
    const t = m[1] || m[2]; if (![...companies.values()].some(c => c.ticker === t)) companies.set(t, {name: t, ticker: t, sector: null});
  }
  if (listings) for (const row of findListings(text, listings)) if (![...companies.values()].some(c => c.ticker === row.ticker)) companies.set(row.ticker, {name: row.name, ticker: row.ticker, sector: null});
  return {markets: [...markets.values()], themes: [...new Map(themes.map(t => [t.label, t])).values()], companies: [...companies.values()]};
}
module.exports = {linkStory, buildListingIndex, shortName, MARKET_RULES, COMPANIES};
