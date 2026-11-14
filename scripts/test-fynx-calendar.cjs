// FYNX economic calendar data: the public list keeps every country and importance level exactly as published,
// scoring events stay limited, and malformed rows are dropped.
const assert = require('assert');
const {parseCalendar, publicRows} = require('./refresh-public-research.cjs');
const now = new Date(), sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay(), 12));
const at = h => new Date(sunday.getTime() + h * 3600000).toISOString();
const rows = [
  {title: 'CPI m/m', country: 'USD', date: at(30), impact: 'High', forecast: '0.3%', previous: '0.2%'},
  {title: 'Retail Sales m/m', country: 'AUD', date: at(20), impact: 'Medium', forecast: '0.4%', previous: ''},
  {title: 'Bank Holiday', country: 'JPY', date: at(10), impact: 'Holiday'},
  {title: 'Trade Balance', country: 'NZD', date: at(40), impact: 'Low', forecast: '-1.1B', previous: '-0.9B'},
  {title: '', country: 'USD', date: at(41), impact: 'Low'},
  {title: 'Bad date', country: 'USD', date: 'soon', impact: 'Low'},
];
const all = publicRows(rows);
assert.deepEqual(all.map(r => [r.currency, r.impact]), [['JPY', 'holiday'], ['AUD', 'medium'], ['USD', 'high'], ['NZD', 'low']]);
assert.equal(all.find(r => r.currency === 'USD').forecast, '0.3%'); assert.equal(all.find(r => r.currency === 'AUD').previous, null);
assert.ok(all.every(r => /^[0-9a-f]{64}$/.test(r.id)));
const cal = parseCalendar(rows.filter(r => r.title && r.date !== 'soon'), now.toISOString());
assert.equal(cal.all.length, 4, 'public list has every country and importance');
assert.ok(cal.events.every(e => ['high', 'medium'].includes(e.impact)), 'scoring list stays high/medium');
console.log('FYNX calendar: public rows keep every country and importance; scoring events unchanged; bad rows dropped.');
