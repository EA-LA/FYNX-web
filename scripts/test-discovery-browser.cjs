// End-to-end checks of public discovery with external requests unavailable.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.FYNX_TEST_URL||'http://127.0.0.1:8767';
const expectedResources=JSON.parse(fs.readFileSync(path.join(root,'assets/resource-index.json'),'utf8')).length;
const output=path.join(root,'output/playwright');fs.mkdirSync(output,{recursive:true});
(async()=>{
 console.log('Launching browser');
 const browser=await chromium.launch({headless:true,timeout:45000});
 console.log('Browser ready');
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage(), errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push(r.url());});
 async function go(route){console.log('Checking '+route);await page.goto(base+route,{waitUntil:'load'});await page.waitForTimeout(350);}
 const checks=[];
 try{
  await go('/explore.html');assert.equal(await page.locator('.discovery-card').count(),expectedResources);
  await page.screenshot({path:path.join(output,'library-desktop.png'),fullPage:false});
  await page.locator('#resource-query').fill('margin');assert(await page.locator('.discovery-card:visible').count()>1);assert(await page.locator('a[href="/tools/margin.html"]').last().isVisible());
  assert(new URL(page.url()).searchParams.get('q')==='margin');
  await page.locator('[data-filter="Tools"]').click();assert(await page.locator('.discovery-card:visible').count()>0);
  assert.equal(await page.locator('.discovery-card:visible:not([data-category="Tools"])').count(),0);
  const save=page.locator('.discovery-card[data-resource-url="/tools/margin.html"] [data-save-resource]');await save.click();await page.waitForFunction(()=>document.querySelector('.discovery-card[data-resource-url="/tools/margin.html"] button').getAttribute('aria-pressed')==='true');
  await page.locator('[data-filter="Saved"]').click();assert.equal(await page.locator('.discovery-card:visible').count(),1);checks.push('Search, category, URL state and saved filter');
  await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('.discovery-card:visible').count(),1);
  await page.locator('#resource-query').fill('zzzz-unmatched');assert(await page.locator('#discovery-empty').isVisible());await page.locator('[data-discovery-reset]').click();assert.equal(await page.locator('.discovery-card:visible').count(),expectedResources);checks.push('Saved persistence, empty state and reset');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'library-mobile.png'),fullPage:false});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await go('/tools/margin.html');await page.locator('#accountBalance').fill('2000');await page.locator('#lotSize').fill('0.1');await page.locator('#contractSize').fill('100000');await page.locator('#entryPrice').fill('1');await page.locator('#leverage').fill('20');await page.locator('#usedMarginExisting').fill('0');await page.locator('#calculateBtn').click();
  const marginText=await page.locator('main').innerText();assert(marginText.includes('500.00'));assert(marginText.includes('1,500.00'));assert(marginText.includes('400.00%')||marginText.includes('400.0%')||marginText.includes('400%'));checks.push('Margin arithmetic works with every external request blocked');
  await page.screenshot({path:path.join(output,'margin-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await go('/home.html');await page.waitForFunction(()=>document.querySelector('[data-workspace-saved] a'));assert.equal(await page.locator('[data-workspace-saved] a').first().getAttribute('href'),'/tools/margin.html');assert.equal(await page.locator('[data-workspace-recent] a').first().getAttribute('href'),'/tools/margin.html');checks.push('Dashboard saved and recent resources');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(output,'dashboard-desktop.png'),fullPage:false});
  const index=JSON.parse(fs.readFileSync(path.join(root,'assets/resource-index.json'),'utf8'));const lesson=index.find(r=>r.url.startsWith('/learn/lessons/forex/'));
  await go(lesson.url);assert.equal(await page.locator('article.lesson-article h1').count(),1);assert(await page.locator('#example').isVisible());await page.screenshot({path:path.join(output,'lesson-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('Lesson layout and worked example');
  await go('/');await page.screenshot({path:path.join(output,'home-mobile.png'),fullPage:false});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('form[action="/explore.html"]').count(),1);
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(output,'home-desktop.png'),fullPage:false});await page.waitForFunction(()=>typeof closeAllBars==='function');await page.locator('#toolsToggle').click();await page.waitForFunction(()=>document.body.classList.contains('tools-open'));await page.screenshot({path:path.join(output,'tools-menu.png'),fullPage:false});assert(await page.locator('.discovery-menu').isVisible());await page.keyboard.press('Escape');checks.push('Homepage search and grouped menu');
  await go('/tools/fibonacci.html');await page.locator('#swingHigh').fill('120');await page.locator('#swingLow').fill('100');await page.locator('#entryPrice').fill('');await page.locator('#calculateBtn').click();assert.equal(await page.locator('#fibLevels tr').count(),8);assert((await page.locator('#fibLevels').innerText()).includes('132.3600'));await page.locator('#trendDirection').selectOption('down');assert((await page.locator('#fibLevels').innerText()).includes('87.6400'));await page.locator('#swingHigh').fill('90');await page.locator('#calculateBtn').click();assert(await page.locator('#fibError').isVisible());assert.equal(await page.locator('#fibLevels tr').count(),0);await page.locator('#resetBtn').click();assert.equal(await page.locator('#fibLevels tr').count(),8);await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'fibonacci-mobile.png'),fullPage:true});checks.push('Repaired Fibonacci: uptrend, downtrend, blank entry, validation, reset and mobile');
  await go('/tools/market-hours.html');assert.equal(await page.locator('.tool-explainer').count(),1);assert.equal(await page.locator('.resource-wayfinding').count(),1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('Legacy market-hours page includes guide and resource navigation');
  const staticContext=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const staticPage=await staticContext.newPage();await staticPage.goto(base+lesson.url);assert((await staticPage.locator('article').innerText()).length>1000);await staticPage.goto(base+'/directory.html');assert((await staticPage.locator('main a').count())===expectedResources);checks.push('Lesson content and complete directory without JavaScript');await staticContext.close();
  const restricted=await browser.newContext({viewport:{width:390,height:844}});await restricted.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await restricted.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage is disabled','SecurityError');}});});const rp=await restricted.newPage();await rp.goto(base+'/tools/margin.html',{waitUntil:'domcontentloaded'});await rp.locator('#calculateBtn').click();assert((await rp.locator('main').innerText()).includes('3,666.67'));await rp.goto(base+'/explore.html');await rp.locator('#resource-query').fill('margin');assert((await rp.locator('.discovery-card:visible').count())>0);checks.push('Search and local margin calculation with browser storage disabled');await restricted.close();
  assert.equal(errors.length,0,'Browser errors: '+errors.join(','));
  assert.equal(missing.length,0,'Missing local assets: '+missing.join(','));
  fs.writeFileSync(path.join(output,'discovery-results.json'),JSON.stringify({checks,errors,missing},null,2));console.log(JSON.stringify({checks,errors,missing},null,2));
 }catch(e){console.error('Browser check failed:', e);console.error(JSON.stringify({errors,missing,state:await page.evaluate(()=>({url:location.href,ready:document.readyState,navigation:typeof closeAllBars,particles:document.querySelectorAll('.particle').length})).catch(()=>null)}));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
