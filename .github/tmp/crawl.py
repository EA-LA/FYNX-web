import json, re, time, sys, concurrent.futures as cf
from playwright.sync_api import sync_playwright
urls = re.findall(r'<loc>([^<]+)</loc>', open('sitemap.xml').read())
urls = [u.replace('https://www.fynxfinanceworld.com', 'https://www.fynxfinanceworld.com') for u in urls]
PAT = re.compile(r"[^.\n]{0,80}\b(unavailable|not available|missing|checking|loading|could not|couldn[’']t|failed|error|try again|no data|no recent|temporarily|waiting for)\b[^.\n]{0,80}", re.I)
def run(chunk, idx):
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        for u in chunk:
            pg = ctx.new_page(); errs = []; bad = []
            pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:160]))
            pg.on('console', lambda m: errs.append(m.text[:160]) if m.type == 'error' else None)
            pg.on('response', lambda r: bad.append(f'{r.status} {r.url[:120]}') if r.status >= 400 and 'google' not in r.url and 'doubleclick' not in r.url else None)
            try:
                pg.goto(u, wait_until='load', timeout=45000); time.sleep(12)
                text = pg.evaluate("document.body.innerText")
                hits = sorted(set(m.group(0).strip()[:170] for m in PAT.finditer(text)))
                imgs = pg.evaluate("[...document.images].filter(i=>i.complete&&i.naturalWidth===0&&i.src).map(i=>i.src.slice(0,120))")
                out.append({'url': u, 'hits': hits[:12], 'broken_images': imgs[:5], 'errors': errs[:6], 'http': bad[:8]})
            except Exception as e:
                out.append({'url': u, 'fail': str(e)[:200]})
            pg.close()
        b.close()
    return out
chunks = [urls[i::6] for i in range(6)]
with cf.ThreadPoolExecutor(6) as ex:
    res = [r for part in ex.map(run, chunks, range(6)) for r in part]
for r in res: print('PAGE ' + json.dumps(r))
