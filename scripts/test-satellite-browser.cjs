const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.setContent(`<!doctype html><html><head></head><body>
      <div class="fx-gstage" style="position:relative;width:850px;height:450px">
        <svg class="fx-gsvg"></svg><canvas class="fx-gships"></canvas>
        <div class="fx-gtools"><button class="fx-gbtn" id="original-toggle">Flat map</button></div>
        <div class="fx-glayers"><input type="checkbox" data-layer="quakes" checked></div>
      </div>
    </body></html>`);
    await page.evaluate(() => {
      const W = { flat:false, scale:1, layers:{quakes:true}, intelData:{haz:{quakes:[{lon:1,lat:2,place:'<img src=x onerror=alert(1)>',mag:4}]},ref:{layers:{}},events:[]}, ships:{vessels:[]} };
      window.__W=W; window.__maps=[];
      window.FYNX_SATELLITE_STYLE={version:8,sources:{},layers:[]};
      window.FynxTerminalPlugins=[];
      document.getElementById('original-toggle').addEventListener('click',()=>{W.flat=!W.flat; window.__originalDraws=(window.__originalDraws||0)+1;});
      class MockMap {
        constructor(opts){ this.opts=opts; this.handlers={}; this.sources={};this.canvas={style:{}};window.__maps.push(this); queueMicrotask(()=>this.handlers.load?.());}
        addControl(){}
        on(event,layer,fn){this.handlers[typeof layer==='string'?event+':'+layer:event]=typeof layer==='function'?layer:fn;}
        addSource(name,source){this.sources[name]={...source,setData:(data)=>{this.sources[name].data=data;}};}
        getSource(name){return this.sources[name];}
        addLayer(){}
        getCanvas(){return this.canvas;}
        remove(){this.removed=true;}
        flyTo(opts){this.lastFly=opts;}
        easeTo(opts){this.lastEase=opts;}
      }
      class MockPopup {
        setLngLat(ll){this.ll=ll;return this;}
        setHTML(html){this.html=html;window.__popupHTML=html;return this;}
        addTo(){return this;}
      }
      window.maplibregl={Map:MockMap,NavigationControl:class{},FullscreenControl:class{},Popup:MockPopup};
      window.__T={S:{world:W}};
    });
    await page.addScriptTag({path:path.join(__dirname,'..','assets/js/terminal/satellite-map.js')});
    await page.evaluate(()=>window.FynxTerminalPlugins[0](window.__T));
    await page.waitForSelector('.fx-sat-modes button');
    const names=await page.locator('.fx-sat-modes button').allTextContents();
    assert.deepEqual(names,['FLAT','GLOBE','SATELLITE']);
    await page.getByRole('button',{name:'SATELLITE'}).click();
    await page.waitForFunction(()=>window.__maps.length===1 && !!window.__maps[0].getSource('intel'));
    let state=await page.evaluate(()=>({count:window.__maps[0].sources.intel.data.features.length,hidden:document.querySelector('.fx-gsvg').style.visibility}));
    assert.equal(state.count,1);
    assert.equal(state.hidden,'hidden');
    await page.getByRole('button',{name:'FLAT',exact:true}).click();
    state=await page.evaluate(()=>({flat:window.__W.flat,draws:window.__originalDraws,removed:window.__maps[0].removed,visible:document.querySelector('.fx-gsvg').style.visibility}));
    assert.equal(state.flat,true);
    assert.equal(state.draws,1);
    assert.equal(state.removed,true);
    assert.equal(state.visible,'');
    await page.getByRole('button',{name:'GLOBE',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__W.flat),false);
    assert.equal(await page.evaluate(()=>window.__originalDraws),2);
    await page.getByRole('button',{name:'SATELLITE'}).click();
    await page.waitForFunction(()=>window.__maps.length===2 && !!window.__maps[1].getSource('intel'));
    await page.evaluate(()=>{
      window.__maps[1].handlers['click:intel-circles']({
        features:[{properties:{name:'<img src=x onerror=alert(1)>',layer:'quakes',url:'javascript:alert(1)'}}],
        lngLat:{lng:1,lat:2}
      });
    });
    const html=await page.evaluate(()=>window.__popupHTML);
    assert.ok(html.includes('&lt;img'));
    assert.ok(!html.includes('href="javascript:'));
    assert.deepEqual(failures,[]);
    console.log('Satellite browser smoke test passed: modes, mount, marker, popup safety');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
