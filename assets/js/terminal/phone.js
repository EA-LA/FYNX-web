/* FYNX Terminal · iPhone layout helper.
 * On phones (≤760px) the header keeps only the essentials: brand, market status, bell and a menu button.
 * Plan, feeds, Tour, Build, Edit and Exit move into a menu sheet (the same buttons, so every handler still works),
 * and move back to their original places when the screen gets wider. Desktop is untouched. */
(() => {
  'use strict';
  const top = document.querySelector('header.fx-top'); if (!top) return;
  const mq = matchMedia('(max-width:760px)');
  const MOVE = ['fx-plan', 'fx-live', 'fx-tour-btn', 'fx-build', 'fx-edit', 'fx-classic'];
  const homes = new Map();            // element → placeholder comment where it lives on desktop
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  const right = el('div', 'fx-mright');
  const menu = el('button', 'fx-mbtn'); menu.type = 'button'; menu.id = 'fx-mmenu';
  menu.setAttribute('aria-label', 'Menu'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-controls', 'fx-msheet');
  menu.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const sheet = el('div', 'fx-msheet'); sheet.id = 'fx-msheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Terminal menu');
  const head = el('div', 'fx-mhead'); head.append(el('b', '', 'MENU'));
  const close = el('button', 'fx-mclose', '✕'); close.type = 'button'; close.setAttribute('aria-label', 'Close menu'); head.append(close);
  const grid = el('div', 'fx-mgrid'); sheet.append(head, grid);
  const scrim = el('div', 'fx-mscrim'); scrim.hidden = true;
  right.append(menu); top.append(right, sheet); document.body.append(scrim);

  const isOpen = () => !sheet.hidden;
  function open() { sheet.hidden = false; scrim.hidden = false; menu.setAttribute('aria-expanded', 'true'); document.body.classList.add('fx-mopen'); grid.querySelector('button, a')?.focus({preventScroll: true}); }
  function shut(focusBack) { if (!isOpen()) return; sheet.hidden = true; scrim.hidden = true; menu.setAttribute('aria-expanded', 'false'); document.body.classList.remove('fx-mopen'); if (focusBack) menu.focus({preventScroll: true}); }
  menu.addEventListener('click', () => isOpen() ? shut(true) : open());
  close.addEventListener('click', () => shut(true));
  scrim.addEventListener('click', () => shut(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) shut(true); });
  // Any action inside the sheet closes it after the button's own handler has run.
  grid.addEventListener('click', e => { if (e.target.closest('button, a')) setTimeout(() => shut(false), 0); });

  function park(n) { if (!homes.has(n)) { const ph = document.createComment('fx-home:' + (n.id || n.className)); n.before(ph); homes.set(n, ph); } }
  function toPhone() {
    for (const id of MOVE) { const n = document.getElementById(id); if (n && n.parentElement !== grid) { park(n); grid.append(n); } }
    // Keep the sheet in a fixed, predictable order whatever order the buttons appeared in.
    for (const id of MOVE) { const n = document.getElementById(id); if (n) grid.append(n); }
    // Other scripts insert things next to these buttons (the market-mood pill goes before Feeds); keep those in the header.
    const stat = top.querySelector('.fx-mstat');
    for (const n of [...grid.children]) if (!MOVE.includes(n.id)) top.insertBefore(n, stat || right);
    const bell = top.querySelector('.fx-bellwrap'); if (bell && bell.parentElement !== right) { park(bell); right.prepend(bell); }
  }
  function toDesktop() {
    shut(false);
    for (const [n, ph] of homes) if (ph.isConnected) ph.replaceWith(n);
    homes.clear();
  }
  const apply = () => mq.matches ? toPhone() : toDesktop();

  // Plan and bell buttons are added by other scripts after start-up; place them as they arrive.
  let queued = false;
  new MutationObserver(() => { if (!mq.matches || queued) return; queued = true; requestAnimationFrame(() => { queued = false; if (mq.matches) toPhone(); }); }).observe(top, {childList: true, subtree: true});
  mq.addEventListener('change', apply);
  // Some browsers (and rotated iPads) report the width change only as a resize; both paths are idempotent.
  let wasPhone = mq.matches;
  addEventListener('resize', () => { if (mq.matches !== wasPhone) { wasPhone = mq.matches; apply(); tip(); } });

  // Short placeholder that fits a phone; the full one comes back on wider screens.
  const input = document.getElementById('fx-command'), longTip = input?.getAttribute('placeholder') || '';
  const tip = () => { if (input) input.setAttribute('placeholder', mq.matches ? 'Search a market or command' : longTip); };
  mq.addEventListener('change', tip); tip();

  // Command feedback shows as a short toast under the search bar instead of taking a permanent row.
  const msg = document.getElementById('fx-cmd-msg');
  if (msg) {
    let t = 0, last = msg.textContent;
    new MutationObserver(() => {
      if (!mq.matches || msg.textContent === last) return; last = msg.textContent;
      if (!last.trim()) return;
      // A full page that just opened already says what it is; no toast on top of it.
      if (document.body.classList.contains('fx-paging')) { msg.classList.remove('fx-show'); return; }
      msg.classList.add('fx-show'); clearTimeout(t); t = setTimeout(() => msg.classList.remove('fx-show'), 3200);
    }).observe(msg, {childList: true, characterData: true, subtree: true});
  }

  // Keep the selected desk tab in view in the scrolling tab row.
  const list = document.getElementById('fx-deskbar-list');
  if (list) {
    const center = () => { if (!mq.matches) return; const on = list.querySelector('.fx-desk.on'); if (on) list.scrollTo({left: Math.max(0, on.offsetLeft - (list.clientWidth - on.offsetWidth) / 2), behavior: 'smooth'}); };
    new MutationObserver(center).observe(list, {attributes: true, attributeFilter: ['class'], subtree: true, childList: true});
    setTimeout(center, 400);
  }

  apply();
})();
