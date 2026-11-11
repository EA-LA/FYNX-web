const h = require('../../fn/market.js');
function call(query) {
  return new Promise(resolve => {
    const res = {headers: {}, code: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({code: this.code, body: b}); return this; }, end() { resolve({code: this.code}); }};
    h({method: 'GET', query}, res);
  });
}
(async () => {
  for (const q of [{op: 'search', q: 'nvidia'}, {op: 'search', q: 'toyota'}, {op: 'chart', symbol: 'SAP.DE', range: '1y'}, {op: 'chart', symbol: '7203.T', range: '1mo'}, {op: 'chart', symbol: 'BTC-USD', range: '5d'}, {op: 'quotes', symbols: 'NVDA,RELIANCE.NS,SHOP.TO'}]) {
    const r = await call(q), b = r.body || {};
    console.log('FN', JSON.stringify(q), r.code, JSON.stringify(b.quotes ? (Array.isArray(b.quotes) ? b.quotes.slice(0, 4) : b.quotes) : {name: b.name, price: b.price, chg: b.changePercent, rows: b.rows?.length, exch: b.exchange, err: b.error}).slice(0, 500), b.news ? 'news=' + b.news.length : '');
  }
})();
