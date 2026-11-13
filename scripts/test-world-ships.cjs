// AISStream ship sampling: errors are reported, tankers/waiting/flow are counted per chokepoint, ship identities
// are remembered between runs (registry), and ETA text follows AIS rules.
const assert = require('assert'); const m = require('./refresh-world-data.cjs');
const feeds = []; class FakeWS { constructor() { this.f = feeds.shift(); setTimeout(() => { if (this.f === 'refuse') { this.onerror?.({}); return; } this.onopen?.(); setTimeout(() => this.f(this), 10); }, 5); } send() {} close() { this.onclose?.(); } }
globalThis.WebSocket = FakeWS;
const pos = (mmsi, lat, lon, sog, cog, nav, name = '') => ({data: JSON.stringify({MessageType: 'PositionReport', MetaData: {MMSI: mmsi, ShipName: name, latitude: lat, longitude: lon, time_utc: '2026-11-13 20:00:00'}, Message: {PositionReport: {Sog: sog, Cog: cog, TrueHeading: cog, NavigationalStatus: nav}}})});
const stat = (mmsi, type, dest, extra = {}) => ({data: JSON.stringify({MessageType: 'ShipStaticData', MetaData: {MMSI: mmsi}, Message: {ShipStaticData: {Type: type, Destination: dest, Eta: {Month: 11, Day: 20, Hour: 6, Minute: 30}, MaximumStaticDraught: 14.2, Dimension: {A: 200, B: 50, C: 22, D: 22}, ImoNumber: 9300001, Name: 'NAMED ' + mmsi, ...extra}}})});
(async () => {
  feeds.push(ws => { ws.onmessage({data: JSON.stringify({error: 'Api Key Is Not Valid'})}); ws.close(); });
  await assert.rejects(m.ships('bad', 1), /AISStream: Api Key Is Not Valid/);
  feeds.push('refuse'); await assert.rejects(m.ships('x', 1), /Could not connect/);
  // Hormuz: one tanker moving east, one tanker at anchor; one cargo moving west. Registry already knows ship 3.
  const registry = {3: [72, 'JEBEL ALI', '11-18 04:00', 11, 300, 48, 9100003, 'KNOWN CARGO', '2026-11-01']};
  feeds.push(ws => { ws.onmessage(stat(1, 82, 'FUJAIRAH@@@')); ws.onmessage(stat(2, 84, 'RAS TANURA')); ws.onmessage(pos(1, 26.5, 56.3, 12, 95, 0, 'TANKER ONE')); ws.onmessage(pos(2, 26.2, 56.1, 0.1, 10, 1)); ws.onmessage(pos(3, 26.4, 56.0, 14, 270, 0)); ws.close(); });
  const r = await m.ships('good', 1, registry);
  assert.equal(r.total, 3); const h = r.counts.Hormuz;
  assert.deepEqual({ships: h.ships, tankers: h.tankers, cargo: h.cargo, waiting: h.waiting, waitingTankers: h.waitingTankers, moving: h.moving}, {ships: 3, tankers: 2, cargo: 1, waiting: 1, waitingTankers: 1, moving: 2});
  assert.deepEqual(h.flow, {E: 1, W: 1}); assert.equal(h.avgKnots, 13);
  const v1 = r.vessels.find(v => v.mmsi === 1); assert.equal(v1.dest, 'FUJAIRAH'); assert.equal(v1.eta, '11-20 06:30'); assert.equal(v1.draught, 14.2); assert.equal(v1.len, 250); assert.equal(v1.kind, 'tanker');
  const v3 = r.vessels.find(v => v.mmsi === 3); assert.equal(v3.kind, 'cargo', 'type remembered from earlier runs'); assert.equal(v3.name, 'KNOWN CARGO');
  assert.deepEqual(r.tankerDestinations, [['FUJAIRAH', 1], ['RAS TANURA', 1]]); assert.equal(r.waitingTankers, 1);
  assert.equal(registry[3][8], new Date().toISOString().slice(0, 10), 'last-seen refreshed');
  // Registry pruning: old entries and bad keys dropped.
  const pr = m.pruneRegistry({244000001: [80, null, null, null, null, null, null, null, '2026-11-13'], 244000002: [80, null, null, null, null, null, null, null, '2025-01-01'], x: [1]}, Date.parse('2026-11-13T12:00:00Z'));
  assert.deepEqual(Object.keys(pr), ['244000001']);
  assert.equal(m.etaText({Month: 0, Day: 0, Hour: 24, Minute: 60}), null); assert.equal(m.etaText({Month: 3, Day: 9, Hour: 24, Minute: 60}), '03-09');
  console.log('AIS: errors reported; Hormuz tankers/waiting/flow/speed counted; destinations, ETA, draught, size; registry kept and pruned');
})().catch(e => { console.error(e); process.exit(1); });
