import json, time, base64, sys
from playwright.sync_api import sync_playwright
BASE = 'http://fynx.test:8080'
def shot(pg, name):
    data = base64.b64encode(pg.screenshot(type='jpeg', quality=70)).decode()
    for i in range(0, len(data), 3000): print(f'SHOT {name} {i//3000} {data[i:i+3000]}')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--host-resolver-rules=MAP fynx.test 127.0.0.1'])
    ctx = b.new_context(viewport={'width': 1920, 'height': 1080}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(BASE + '/terminal.html?desk=all', wait_until='load'); time.sleep(18)
    for d in ['all', 'stocks', 'forex', 'bonds', 'crypto', 'funds', 'futures', 'indices', 'economy', 'options', 'commodities']:
        if d != 'all':
            pg.evaluate(f"document.querySelectorAll('.fx-desk').forEach(b=>{{if(b.textContent.toLowerCase()==='{d}')b.click()}})"); time.sleep(7)
        info = pg.evaluate("""()=>{const out={};document.querySelectorAll('.tp').forEach(t=>{const b=t.querySelector('.tp-b');out[t.id.slice(3)]=(b.innerText||'').replace(/\\s+/g,' ').slice(0,70)});out.live=document.getElementById('fx-live').textContent;out.feeds=document.getElementById('fx-live').title;return out}""")
        print('DESK', d, json.dumps(info))
        if d in ('all', 'stocks', 'crypto', 'options', 'commodities'): shot(pg, 'desk-' + d)
    for cmd, name in [('NEWS', 'news'), ('DES NVDA', 'des'), ('GO MACRO', 'macro')]:
        pg.fill('#fx-command', cmd); pg.press('#fx-command', 'Enter'); time.sleep(8)
        print('PAGE', name, json.dumps(pg.evaluate("({code:document.getElementById('fx-page-code').textContent,title:document.getElementById('fx-page-name').textContent,text:document.getElementById('fx-page-body').innerText.replace(/\\s+/g,' ').slice(0,400)})")))
        if name == 'news':
            pg.evaluate("document.querySelector('#fx-page-body .fx-hrow')?.click()"); time.sleep(8)
            print('PAGE article', json.dumps(pg.evaluate("({path:location.pathname,hash:location.hash,code:document.getElementById('fx-page-code').textContent,title:document.getElementById('fx-page-name').textContent,text:document.getElementById('fx-page-body').innerText.replace(/\\s+/g,' ').slice(0,600)})")))
            shot(pg, 'page-article')
        if name == 'des': shot(pg, 'page-des')
        pg.click('#fx-page-close'); time.sleep(1)
    print('ERRORS', json.dumps([e for e in errs if 'favicon' not in e][:20]))
    b.close()
