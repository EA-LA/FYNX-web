"""Render the homepage card artwork in studio.html to AVIF + WebP in assets/img/landing/.

Usage (from the repo root):
  npm i --prefix /tmp/fynx-fonts @fontsource/inter @fontsource/ibm-plex-mono
  python3 scripts/landing-art/render.py /tmp/fynx-fonts/node_modules/@fontsource

Every artboard (<section class="ab" id=...>) becomes assets/img/landing/<id>.avif and .webp.
Process scenes and calculator thumbnails render at 2x; ecosystem thumbnails at 3x.
"""
import os, shutil, sys, tempfile
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'scripts', 'landing-art', 'studio.html')
OUT = os.path.join(ROOT, 'assets', 'img', 'landing')
FONTS = ['inter/files/inter-latin-%s-normal.woff2' % w for w in (400, 500, 600, 700, 800)] + ['ibm-plex-mono/files/ibm-plex-mono-latin-%s-normal.woff2' % w for w in (400, 500, 600)]


def main(fontsource):
    os.makedirs(OUT, exist_ok=True)
    work = tempfile.mkdtemp()
    os.makedirs(os.path.join(work, 'fonts'))
    for f in FONTS:
        shutil.copy(os.path.join(fontsource, f), os.path.join(work, 'fonts', os.path.basename(f)))
    shutil.copy(SRC, os.path.join(work, 'studio.html'))
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        for scale, sel in ((2, '.ab.big, .ab.calc'), (3, '.ab.eco')):
            page = browser.new_page(viewport={'width': 1400, 'height': 900}, device_scale_factor=scale)
            page.goto('file://' + os.path.join(work, 'studio.html'))
            page.evaluate('document.fonts.ready')
            page.wait_for_timeout(400)
            for el in page.query_selector_all(sel):
                name = el.get_attribute('id')
                png = os.path.join(work, name + '.png')
                el.screenshot(path=png)
                im = Image.open(png).convert('RGB')
                im.save(os.path.join(OUT, name + '.avif'), quality=62, speed=4)
                im.save(os.path.join(OUT, name + '.webp'), quality=84, method=6)
                print(name, im.size, os.path.getsize(os.path.join(OUT, name + '.avif')) // 1024, 'KB avif', os.path.getsize(os.path.join(OUT, name + '.webp')) // 1024, 'KB webp')
            page.close()
        browser.close()
    shutil.rmtree(work)


if __name__ == '__main__':
    main(sys.argv[1])
