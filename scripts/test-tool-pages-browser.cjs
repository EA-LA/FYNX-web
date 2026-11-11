const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const catalog=require('../assets/js/pro-catalog.js'),resources=require('../assets/resource-index.json');
const base=process.env.FYNX_TEST_URL||'http://127.0.0.1:8767',output='output/tool-pages';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],missing=[];
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push(r.url());});
 const checks=[];
 try{
  for(const [key,[name,,,url]] of Object.entries(catalog)){
   await page.goto(base+url,{waitUntil:'load'});assert(await page.locator('[data-product-launch]').isVisible());assert.equal(await page.locator('.tool-explainer').count(),1);
   for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow: '+url);}
   if(key==='portfolio')await page.screenshot({path:output+'/portfolio-mobile.png',fullPage:true});
   await page.locator('[data-product-launch]').click();await page.waitForURL(url=>url.pathname==='/pro.html'&&url.searchParams.get('tool')===key);await page.waitForFunction(name=>document.getElementById('toolTitle')?.textContent===name,name);
   assert.equal(new URL(page.url()).searchParams.get('tool'),key);
   const returnTo=new URL(await page.locator('#signIn').getAttribute('href'),base).searchParams.get('returnTo');assert.equal(returnTo,'/pro.html?tool='+key+'#workbench');
   assert.equal(await page.locator('#toolGuide').getAttribute('href'),url);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Workspace overflow: '+key);
  }
  checks.push('All eight public Pro pages open the matching tool and preserve sign-in destination with SDKs blocked');
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+catalog.portfolio[3]);await page.screenshot({path:output+'/portfolio-desktop.png',fullPage:false});
  await page.goto(base+'/tools/basic-calculator.html');await page.locator('[data-basic-calculator]').focus();await page.keyboard.type('200*5%');await page.keyboard.press('Enter');assert.equal(await page.locator('[data-calc-display]').innerText(),'10');
  await page.keyboard.press('Escape');await page.keyboard.type('10/0');await page.keyboard.press('Enter');assert.match(await page.locator('[data-calc-display]').innerText(),/divide by zero/);checks.push('Standalone basic calculator keyboard, percent and division-by-zero handling');
  await page.goto(base+'/calculator.html');assert.equal(await page.locator('#toolsGrid .tool-card').count(),resources.filter(r=>r.url.startsWith('/tools/')).length);await page.locator('#searchInput').fill('drawdown');assert(await page.locator('#toolsGrid a[href="/tools/drawdown-simulator.html"]').isVisible());
  await page.locator('[data-basic-calculator]').focus();await page.keyboard.type('2+3*4');await page.keyboard.press('Enter');assert.equal(await page.locator('[data-calc-display]').innerText(),'14');checks.push('Complete calculator directory, search and shared arithmetic');
  await page.goto(base+'/tools/options-payoff.html');await page.waitForURL('**/tools/debt-payoff.html');await page.locator('#loanAmount').fill('1000');await page.locator('#interestRate').fill('0');await page.locator('#monthlyPayment').fill('100');await page.locator('#calculateBtn').click();assert.equal(await page.locator('#monthsValue').innerText(),'10 months');checks.push('Legacy debt link reaches the working renamed calculator');
  await page.evaluate(()=>localStorage.setItem('fynx.saved-resources.v1',JSON.stringify(['/tools/options-payoff.html'])));await page.goto(base+'/explore.html?category=Saved');await page.locator('.discovery-card[data-resource-url="/tools/debt-payoff.html"]').waitFor({state:'visible'});checks.push('Existing saved debt shortcut survives the URL change');
  const noJS=await browser.newContext({javaScriptEnabled:false});const staticPage=await noJS.newPage();await staticPage.goto(base+'/pro.html');assert.equal(await staticPage.locator('#productCards a').count(),8);await staticPage.goto(base+'/calculator.html');assert.equal(await staticPage.locator('#toolsGrid a').count(),resources.filter(r=>r.url.startsWith('/tools/')).length);await staticPage.goto(base+'/tools/trading-journal.html');assert((await staticPage.locator('.tool-profile-article').innerText()).length>1000);await noJS.close();checks.push('All tool links and Journal explanation work without JavaScript');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);fs.writeFileSync(output+'/results.json',JSON.stringify({checks,errors,missing},null,2));console.log(JSON.stringify({checks,errors,missing},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
