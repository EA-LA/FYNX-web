import time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome')
  for u in ['https://www.fynxfinanceworld.com/tools/compound.html','https://www.fynxfinanceworld.com/edge-radar/eurusd/']:
    pg=b.new_page(); pg.on('response',lambda r: print('R404',r.status,r.url[:160]) if r.status>=400 else None); pg.goto(u,wait_until='load'); time.sleep(8)
    if 'eurusd' in u: print('EDGE',pg.evaluate("document.querySelector('#edge-summary')?.innerText.slice(0,800)"))
  pg=b.new_page(viewport={'width':1440,'height':900}); pg.add_init_script("localStorage.setItem('fynx_news_edition_v1','global')")
  pg.goto('https://www.fynxfinanceworld.com/home.html'); 
  for s in (3,8,15): time.sleep(s); print('TOPICS',s,pg.evaluate("(document.getElementById('homeTopicSections')||{}).innerText?.slice(0,600)"))
  print('KEYS',pg.evaluate("Object.keys(localStorage)"))
