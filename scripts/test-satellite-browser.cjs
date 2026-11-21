const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  let stage = 'launch';
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    stage = 'initial document';
    await page.setContent(`<!doctype html><html><head></head><body>
      <div class="fx-gstage" style="position:relative;width:850px;height:450px">
        <svg class="fx-gsvg"></svg><canvas class="fx-gships"></canvas>
        <div class="fx-gtools"><button class="fx-gbtn" id="original-toggle">Flat map</button>
          <button class="fx-gbtn" id="map-zoom-in">+</button><button class="fx-gbtn" id="map-zoom-out">−</button>
          <button class="fx-gbtn" id="map-reset">Reset</button></div>
        <div class="fx-glayers"><input type="checkbox" data-layer="quakes" checked></div>
      </div>
    </body></html>`);
    await page.evaluate(() => {
      const W = { flat:false, scale:1, layers:{quakes:true}, intelData:{haz:{quakes:[{lon:1,lat:2,place:'<img src=x onerror=alert(1)>',mag:4}]},ref:{layers:{}},events:[]}, ships:{vessels:[]} };
      W.feats=[{type:'Feature',properties:{name:'Testland',iso2:'TL'},geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,0]]]}}];
      W.centroidOf=()=>[1,1]; W.statusOf=()=>({level:'green'});
      W.mainSeaRoutes=[[[0,0],[2,2]]];
      W.intelData.ref.layers.pipelines=[{n:'test gas pipeline',k:'gas',paths:[[[0,0],[2,2]]]}];
      W.intel={isOn:key=>key==='pipelines'?true:key==='lights'?true:key==='lanes'?true:key==='quakes'};
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
        zoomIn(){this.zoomedIn=(this.zoomedIn||0)+1;}
        zoomOut(){this.zoomedOut=(this.zoomedOut||0)+1;}
        resize(){this.resized=true;}
      }
      class MockPopup {
        setLngLat(ll){this.ll=ll;return this;}
        setHTML(html){this.html=html;window.__popupHTML=html;return this;}
        addTo(){return this;}
      }
      window.maplibregl={Map:MockMap,NavigationControl:class{},FullscreenControl:class{},Popup:MockPopup};
      window.__T={S:{world:W}};
    });
    stage = 'plugin registration';
    await page.addScriptTag({path:path.join(__dirname,'..','assets/js/terminal/satellite-map.js')});
    await page.evaluate(()=>window.FynxTerminalPlugins[0](window.__T));
    stage = 'switcher injection';
    await page.waitForSelector('.fx-sat-modes button', {timeout:6000});
    const names=await page.locator('.fx-sat-modes button').allTextContents();
    assert.deepEqual(names,['FLAT','GLOBE','SATELLITE']);
    stage = 'first satellite activation';
    await page.getByRole('button',{name:'SATELLITE'}).click();
    stage = 'first map load';
    await page.waitForFunction(()=>window.__maps.length===1 && !!window.__maps[0].getSource('intel'), null, {timeout:6000});
    let state=await page.evaluate(()=>({count:window.__maps[0].sources.intel.data.features.length,hidden:document.querySelector('.fx-gsvg').style.visibility}));
    assert.equal(state.count,1);
    assert.equal(state.hidden,'hidden');
    stage = 'satellite layers';
    const sources=await page.evaluate(()=>Object.keys(window.__maps[0].sources));
    for (const key of ['intel','shipping','lights','lanes','pipelines','countries','country-labels']) assert.ok(sources.includes(key), 'missing map source '+key);
    assert.equal(await page.evaluate(()=>window.__maps[0].sources.lights.data.features.length),1);
    assert.equal(await page.evaluate(()=>window.__maps[0].sources.lanes.data.features.length),1);
    assert.equal(await page.evaluate(()=>window.__maps[0].sources.pipelines.data.features.length),1);
    stage = 'satellite native zoom buttons';
    await page.locator('#map-zoom-in').click();
    await page.locator('#map-zoom-out').click();
    await page.locator('#map-reset').click();
    assert.deepEqual(await page.evaluate(()=>[window.__maps[0].zoomedIn,window.__maps[0].zoomedOut,window.__maps[0].lastFly?.zoom]),[1,1,1.5]);
    stage = 'country name lookup';
    await page.locator('.fx-sat-search').fill('Testland');
    await page.locator('.fx-sat-search').press('Enter');
    assert.deepEqual(await page.evaluate(()=>window.__maps[0].lastFly?.center),[1,1]);
    assert.equal(await page.locator('.fx-sat-fullscreen').count(),1);
    stage = 'flat mode';
    await page.getByRole('button',{name:'FLAT',exact:true}).click();
    state=await page.evaluate(()=>({flat:window.__W.flat,draws:window.__originalDraws,removed:window.__maps[0].removed,visible:document.querySelector('.fx-gsvg').style.visibility}));
    assert.equal(state.flat,true);
    assert.equal(state.draws,1);
    assert.equal(state.removed,true);
    assert.equal(state.visible,'');
    stage = 'globe mode';
    await page.getByRole('button',{name:'GLOBE',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__W.flat),false);
    assert.equal(await page.evaluate(()=>window.__originalDraws),2);
    await page.getByRole('button',{name:'SATELLITE'}).click();
    stage = 'second map load';
    await page.waitForFunction(()=>window.__maps.length===2 && !!window.__maps[1].getSource('intel'), {timeout:6000});
    await page.evaluate(()=>{
      window.__maps[1].handlers['click:intel-circles']({
        features:[{properties:{name:'<img src=x onerror=alert(1)>',layer:'quakes',url:'javascript:alert(1)'}}],
        lngLat:{lng:1,lat:2}
      });
    });
    stage = 'popup validation';
    const html=await page.evaluate(()=>window.__popupHTML);
    assert.ok(html.includes('&lt;img'));
    assert.ok(!html.includes('href="javascript:'));
    assert.deepEqual(failures,[]);
    console.log('Satellite browser smoke test passed: modes, layer parity, country labels, zoom controls, marker, popup safety');
  } catch (error) {
    console.error('::error title=Satellite browser smoke test failed::' + stage + ': ' + error.message.replace(/\n/g, ' '));
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
