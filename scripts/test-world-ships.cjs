// AISStream ship sampling: bad key and connection failures are reported (not shown as "waiting for the key"), tankers are counted at chokepoints.
const assert=require('assert');const m=require('./refresh-world-data.cjs');
const feeds=[];class FakeWS{constructor(){this.f=feeds.shift();setTimeout(()=>{if(this.f==='refuse'){this.onerror?.({});return;}this.onopen?.();setTimeout(()=>this.f(this),10)},5)}send(){}close(){this.onclose?.()}}
globalThis.WebSocket=FakeWS;
(async()=>{
 feeds.push(ws=>{ws.onmessage({data:JSON.stringify({error:'Api Key Is Not Valid'})});ws.close();});
 await assert.rejects(m.ships('bad',1),/AISStream: Api Key Is Not Valid/);
 feeds.push(ws=>{ws.onmessage({data:JSON.stringify({MessageType:'ShipStaticData',MetaData:{MMSI:1},Message:{ShipStaticData:{Type:82,Destination:'FUJAIRAH'}}})});ws.onmessage({data:JSON.stringify({MessageType:'PositionReport',MetaData:{MMSI:1,ShipName:'TANKER ONE',latitude:26.5,longitude:56.3,time_utc:'2026-11-13 20:00:00'},Message:{PositionReport:{Sog:12,Cog:90,TrueHeading:91}}})});ws.close();});
 const r=await m.ships('good',1);assert.equal(r.total,1);assert.equal(r.vessels[0].kind,'tanker');assert.equal(r.counts.Hormuz.tankers,1);
 feeds.push('refuse');await assert.rejects(m.ships('x',1),/Could not connect/);
 console.log('AIS feed: bad key reported, tanker counted at Hormuz, connection failure reported');
})().catch(e=>{console.error(e);process.exit(1)});
