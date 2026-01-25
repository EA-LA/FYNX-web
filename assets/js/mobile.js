/* ========= MOBILE DRAWER MENU =========
   Handles:
   - Open/close drawer
   - Overlay click close
   - Close button close
   - Accordion open/close
   - Close on link click
   - Close on ESC (also closes desktop bars if they exist)
*/

const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileOverlay = document.getElementById('mobileOverlay');
const mobileCloseBtn = document.getElementById('mobileCloseBtn');
const mobileDrawer = document.getElementById('mobileDrawer');

function closeMobileMenu() {
  document.body.classList.remove('mobile-menu-open');
  mobileMenuBtn?.setAttribute('aria-expanded', 'false');
  mobileOverlay?.setAttribute('aria-hidden', 'true');
  mobileDrawer?.setAttribute('aria-hidden', 'true');

  // close all accordions inside drawer
  document.querySelectorAll('.m-accordion.open').forEach(el => el.classList.remove('open'));
}

function openMobileMenu() {
  // close desktop bars so they don't conflict (if navigation.js is loaded)
  if (typeof closeAllBars === "function") closeAllBars();

  document.body.classList.add('mobile-menu-open');
  mobileMenuBtn?.setAttribute('aria-expanded', 'true');
  mobileOverlay?.setAttribute('aria-hidden', 'false');
  mobileDrawer?.setAttribute('aria-hidden', 'false');
}

mobileMenuBtn?.addEventListener('click', () => {
  const isOpen = document.body.classList.contains('mobile-menu-open');
  if (isOpen) closeMobileMenu();
  else openMobileMenu();
});

mobileCloseBtn?.addEventListener('click', closeMobileMenu);
mobileOverlay?.addEventListener('click', closeMobileMenu);

/* ========= ACCORDION BEHAVIOR ========= */
document.querySelectorAll('.m-accordion > .m-acc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const acc = btn.parentElement;

    // Optional: close other top-level accordions (keep nested independent)
    const isNested = acc.closest('.m-acc-panel') !== null;
    if (!isNested) {
      document.querySelectorAll('.mobile-drawer .m-accordion').forEach(other => {
        if (other !== acc && other.getAttribute('data-acc') && !other.closest('.m-acc-panel')) {
          other.classList.remove('open');
        }
      });
    }

    acc.classList.toggle('open');
  });
});

/* ========= CLOSE DRAWER WHEN USER CLICKS ANY LINK ========= */
document.querySelectorAll('.mobile-drawer a').forEach(a => {
  a.addEventListener('click', () => closeMobileMenu());
});

/* ========= ESC CLOSE ========= */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileMenu();
});
