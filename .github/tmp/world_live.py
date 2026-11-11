import json, time, base64
from playwright.sync_api import sync_playwright
def shot(pg, name):
    data = base64.b64encode(pg.screenshot(type='jpeg', quality=70)).decode()
    for i in range(0, len(data), 3000): print(f'SHOT {name} {i//3000} {data[i:i+3000]}')
PANELS = """()=>{const out={};document.querySelectorAll('.tp').forEach(t=>{const b=t.querySelector('.tp-b');if(b)out[t.id.slice(3)]=(b.innerText||'').replace(/\\s+/g,' ').slice(0,140)});out.live=document.getElementById('fx-live').textContent+' '+document.getElementById('fx-live').title;return out}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--host-resolver-rules=MAP fynx.test 127.0.0.1'])
    pg = b.new_page(viewport={'width': 1920, 'height': 1080}); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto('http://fynx.test:8080/terminal.html?desk=world', wait_until='load'); time.sleep(20)
    print('WORLD', json.dumps(pg.evaluate(PANELS))); shot(pg, 'world')
    pg.fill('#fx-command', 'CTRY JP'); pg.press('#fx-command', 'Enter'); time.sleep(8)
    print('CTRY', pg.evaluate("document.getElementById('fx-page-body').innerText.replace(/\\s+/g,' ').slice(0,700)")); shot(pg, 'ctry')
    pg.evaluate("document.getElementById('fx-page-close').click()"); time.sleep(1)
    pg.fill('#fx-command', 'AAPL'); pg.press('#fx-command', 'Enter'); time.sleep(10)
    print('SYM', json.dumps(pg.evaluate(PANELS))); shot(pg, 'sym')
    print('ERRORS', json.dumps([e for e in errs if 'favicon' not in e][:15]))
    b.close()
