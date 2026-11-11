import json, asyncio, base64
from playwright.async_api import async_playwright
async def shot(pg,name):
  b=base64.b64encode(await pg.screenshot()).decode()
  for i in range(0,len(b),60000): print(f'SHOT {name} {i//60000} {b[i:i+60000]}')
async def preview(route):
  u=route.request.url.replace('https://fynxfinanceworld.vercel.app','http://127.0.0.1:9001')
  try: r=await route.fetch(url=u,timeout=40000); await route.fulfill(response=r)
  except Exception as e: print('PVFAIL',e); await route.abort()
FIG="[...document.querySelectorAll('figure')].map(f=>(f.dataset.storyImage?'STORY ':'CONTEXT ')+(f.querySelector('figcaption')?.innerText||'').slice(0,110))"
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--host-resolver-rules=MAP fynx.test 127.0.0.1'])
    for ed in ['global','us']:
      pg=await br.new_page(viewport={'width':1440,'height':1000}); await pg.route('**/fn/preview.js**',preview)
      pg.on('pageerror',lambda e:print('PAGEERR',str(e)[:200]))
      await pg.add_init_script(f"localStorage.setItem('fynx_news_edition_v1','{ed}')")
      await pg.goto('http://fynx.test:8080/home.html'); await asyncio.sleep(30)
      print('PHOTOS',ed,json.dumps(await pg.evaluate(FIG)))
      print('CHECKING',ed,await pg.evaluate("document.body.innerText.includes('Checking recent reporting')"))
      await pg.evaluate("document.querySelector('.nr-topic-coverage').scrollIntoView()"); await asyncio.sleep(2); await shot(pg,'home-'+ed)
      await pg.evaluate("window.scrollTo(0,0)"); await asyncio.sleep(1); await shot(pg,'top-'+ed)
    for path in ['/news/energy.html','/news.html','/']:
      pg=await br.new_page(viewport={'width':1440,'height':1000}); await pg.route('**/fn/preview.js**',preview); await pg.goto('http://fynx.test:8080'+path); await asyncio.sleep(25)
      print('PAGE',path,json.dumps(await pg.evaluate(FIG)))
    await br.close()
asyncio.run(main())
