import json, time, subprocess, base64, urllib.request, urllib.parse, os
from playwright.sync_api import sync_playwright
def shot(pg,name):
  b=base64.b64encode(pg.screenshot(full_page=False)).decode()
  for i in range(0,len(b),60000): print(f'SHOT {name} {i//60000} {b[i:i+60000]}')
with sync_playwright() as p:
  br=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--host-resolver-rules=MAP fynx.test 127.0.0.1'])
  def preview(route):
    u=route.request.url.replace('https://fynxfinanceworld.vercel.app','http://127.0.0.1:9001')
    print('PVREQ',u[:120])
    try: r=route.fetch(url=u,timeout=40000); print('PVRES',r.status,r.text()[:300]); route.fulfill(response=r)
    except Exception as e: print('PVFAIL',e); route.abort()
  for ed in ['global','us']:
    pg=br.new_page(viewport={'width':1440,'height':1000}); pg.route('**/fn/preview.js**',preview)
    pg.on('pageerror',lambda e:print('PAGEERR',str(e)[:200])); pg.on('console',lambda m:print('CONSOLE',m.text[:150]) if m.type=='error' else None)
    pg.add_init_script(f"localStorage.setItem('fynx_news_edition_v1','{ed}')")
    pg.goto('http://fynx.test:8080/home.html'); time.sleep(40)
    print('PHOTOS',ed,json.dumps(pg.evaluate("[...document.querySelectorAll('figure')].map(f=>(f.dataset.storyImage?'STORY ':'CONTEXT ')+f.querySelector('figcaption')?.innerText.slice(0,90))")))
    print('CHECKING',ed,pg.evaluate("document.body.innerText.includes('Checking recent reporting')"))
    pg.evaluate("document.querySelector('.nr-topic-coverage').scrollIntoView()"); time.sleep(2); shot(pg,'home-'+ed)
  pg=br.new_page(viewport={'width':1440,'height':1000}); pg.route('**/fn/preview.js**',preview); pg.goto('http://fynx.test:8080/news/energy.html'); time.sleep(20)
  print('DESK',json.dumps(pg.evaluate("[...document.querySelectorAll('figure')].map(f=>(f.dataset.storyImage?'STORY ':'CONTEXT ')+f.querySelector('figcaption')?.innerText.slice(0,90))")))
  br.close()
