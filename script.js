// Header scroll effect
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) header.classList.add('scrolled');
  else header.classList.remove('scrolled');
});

// Create particles
const bg = document.querySelector('.animated-bg');
for (let i = 0; i < 40; i++) {
  const p = document.createElement('div');
  p.className = 'particle';
  p.style.left = Math.random() * 100 + '%';
  p.style.animationDelay = (Math.random() * 15) + 's';
  p.style.animationDuration = (10 + Math.random() * 10) + 's';
  bg.appendChild(p);
}

// Make subnav sit exactly under header (dynamic height)
function setHeaderHeightVar() {
  const h = header.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--header-h', h + 'px');
}
window.addEventListener('resize', setHeaderHeightVar);
setHeaderHeightVar();

// ===== Desktop subnav toggles =====
const toolsToggle = document.getElementById('toolsToggle');
const toolsSubnav = document.getElementById('toolsSubnav');
const newsToggle = document.getElementById('newsToggle');
const newsSubnav = document.getElementById('newsSubnav');
const learnToggle = document.getElementById('learnToggle');
const learnSubnav = document.getElementById('learnSubnav');
const learnDetailSubnav = document.getElementById('learnDetailSubnav');
const homeToggle = document.getElementById('homeToggle');
const homeSubnav = document.getElementById('homeSubnav');
const marketsToggle = document.getElementById('marketsToggle');
const homeMarketsSubnav = document.getElementById('homeMarketsSubnav');
const learnDetailCaption = document.getElementById('learnDetailCaption');
const learnHowTo = document.getElementById('learnHowTo');
const learnQuizzes = document.getElementById('learnQuizzes');
const learnGlossary = document.getElementById('learnGlossary');
const topicLabel = {
  stocks: "Stocks",
  funds: "Funds",
  futures: "Futures",
  forex: "Forex",
  crypto: "Crypto",
  indices: "Indices",
  bonds: "Bonds",
  economy: "Economy",
  options: "Options"
};

function closeAllBars() {
  document.body.classList.remove(
    'tools-open','news-open','learn-open','learn-detail-open','home-open','home-detail-open'
  );
  toolsSubnav.setAttribute('aria-hidden', 'true');
  newsSubnav.setAttribute('aria-hidden', 'true');
  learnSubnav.setAttribute('aria-hidden', 'true');
  learnDetailSubnav.setAttribute('aria-hidden', 'true');
  homeSubnav.setAttribute('aria-hidden', 'true');
  homeMarketsSubnav.setAttribute('aria-hidden', 'true');
}

// keep page at top when opening any top menu bar
function keepAtTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (toolsToggle) toolsToggle.addEventListener('click', (e) => {
  e.preventDefault();
  keepAtTop();
  document.body.classList.remove('news-open','learn-open','learn-detail-open','home-open','home-detail-open');
  newsSubnav.setAttribute('aria-hidden', 'true');
  learnSubnav.setAttribute('aria-hidden', 'true');
  learnDetailSubnav.setAttribute('aria-hidden', 'true');
  homeSubnav.setAttribute('aria-hidden', 'true');
  homeMarketsSubnav.setAttribute('aria-hidden', 'true');
  document.body.classList.toggle('tools-open');
  toolsSubnav.setAttribute('aria-hidden', document.body.classList.contains('tools-open') ? 'false' : 'true');
});

if (newsToggle) newsToggle.addEventListener('click', (e) => {
  e.preventDefault();
  keepAtTop();
  document.body.classList.remove('tools-open','learn-open','learn-detail-open','home-open','home-detail-open');
  toolsSubnav.setAttribute('aria-hidden', 'true');
  learnSubnav.setAttribute('aria-hidden', 'true');
  learnDetailSubnav.setAttribute('aria-hidden', 'true');
  homeSubnav.setAttribute('aria-hidden', 'true');
  homeMarketsSubnav.setAttribute('aria-hidden', 'true');
  document.body.classList.toggle('news-open');
  newsSubnav.setAttribute('aria-hidden', document.body.classList.contains('news-open') ? 'false' : 'true');
});

if (learnToggle) learnToggle.addEventListener('click', (e) => {
  e.preventDefault();
  keepAtTop();
  document.body.classList.remove('tools-open','news-open','home-open','home-detail-open');
  toolsSubnav.setAttribute('aria-hidden', 'true');
  newsSubnav.setAttribute('aria-hidden', 'true');
  homeSubnav.setAttribute('aria-hidden', 'true');
  homeMarketsSubnav.setAttribute('aria-hidden', 'true');
  document.body.classList.toggle('learn-open');
  learnSubnav.setAttribute('aria-hidden', document.body.classList.contains('learn-open') ? 'false' : 'true');
  if (!document.body.classList.contains('learn-open')) {
    document.body.classList.remove('learn-detail-open');
    learnDetailSubnav.setAttribute('aria-hidden', 'true');
  }
});

if (homeToggle) homeToggle.addEventListener('click', (e) => {
  e.preventDefault();
  keepAtTop();
  document.body.classList.remove('tools-open','news-open','learn-open','learn-detail-open');
  toolsSubnav.setAttribute('aria-hidden', 'true');
  newsSubnav.setAttribute('aria-hidden', 'true');
  learnSubnav.setAttribute('aria-hidden', 'true');
  learnDetailSubnav.setAttribute('aria-hidden', 'true');
  document.body.classList.toggle('home-open');
  homeSubnav.setAttribute('aria-hidden', document.body.classList.contains('home-open') ? 'false' : 'true');
  if (!document.body.classList.contains('home-open')) {
    document.body.classList.remove('home-detail-open');
    homeMarketsSubnav.setAttribute('aria-hidden', 'true');
  }
});

if (marketsToggle) marketsToggle.addEventListener('click', () => {
  keepAtTop();
  if (!document.body.classList.contains('home-open')) {
    document.body.classList.add('home-open');
    homeSubnav.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.toggle('home-detail-open');
  homeMarketsSubnav.setAttribute('aria-hidden', document.body.classList.contains('home-detail-open') ? 'false' : 'true');
});

// Learn topic buttons (desktop bar)
const learnTopicButtons = document.querySelectorAll('.learn-pill[data-topic]');
function setActiveTopic(topic) {
  learnTopicButtons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-topic') === topic);
  });
  document.body.classList.add('learn-detail-open');
  learnDetailSubnav.setAttribute('aria-hidden', 'false');
  learnDetailCaption.innerHTML = '<i class="fas fa-layer-group"></i> ' + (topicLabel[topic] || 'Topic');
  learnHowTo.href = 'learn/topic.html?topic=' + encodeURIComponent(topic) + '&section=howto';
  learnQuizzes.href = 'learn/topic.html?topic=' + encodeURIComponent(topic) + '&section=quizzes';
  learnGlossary.href = 'learn/topic.html?topic=' + encodeURIComponent(topic) + '&section=glossary';
}
learnTopicButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const topic = btn.getAttribute('data-topic');
    setActiveTopic(topic);
  });
});

// Close desktop bars when clicking outside
document.addEventListener('click', (e) => {
  const clickedInsideHeader = header.contains(e.target);
  const clickedInsideTools = toolsSubnav.contains(e.target);
  const clickedInsideNews = newsSubnav.contains(e.target);
  const clickedInsideLearn = learnSubnav.contains(e.target);
  const clickedInsideLearnDetail = learnDetailSubnav.contains(e.target);
  const clickedInsideHome = homeSubnav.contains(e.target);
  const clickedInsideHomeDetail = homeMarketsSubnav.contains(e.target);
  const clickedInsideDrawer = document.getElementById('mobileDrawer').contains(e.target);
  const clickedInsideOverlay = document.getElementById('mobileOverlay').contains(e.target);
  if (!clickedInsideDrawer && !clickedInsideOverlay) {
    if (!clickedInsideHeader && !clickedInsideTools && !clickedInsideNews && !clickedInsideLearn && !clickedInsideLearnDetail && !clickedInsideHome && !clickedInsideHomeDetail) {
      closeAllBars();
    }
  }
});

// Close on ESC (desktop bars + mobile drawer)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllBars();
    closeMobileMenu();
  }
});

// ===== MOBILE MENU (NEW FIX) =====
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileOverlay = document.getElementById('mobileOverlay');
const mobileCloseBtn = document.getElementById('mobileCloseBtn');
const mobileDrawer = document.getElementById('mobileDrawer');

function openMobileMenu() {
  closeAllBars();
  document.body.classList.add('mobile-menu-open');
  mobileMenuBtn.setAttribute('aria-expanded', 'true');
  mobileOverlay.setAttribute('aria-hidden', 'false');
  mobileDrawer.setAttribute('aria-hidden', 'false');
}

function closeMobileMenu() {
  document.body.classList.remove('mobile-menu-open');
  mobileMenuBtn.setAttribute('aria-expanded', 'false');
  mobileOverlay.setAttribute('aria-hidden', 'true');
  mobileDrawer.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.m-accordion.open').forEach(el => el.classList.remove('open'));
}

mobileMenuBtn.addEventListener('click', () => {
  const isOpen = document.body.classList.contains('mobile-menu-open');
  if (isOpen) closeMobileMenu();
  else openMobileMenu();
});

mobileCloseBtn.addEventListener('click', closeMobileMenu);
mobileOverlay.addEventListener('click', closeMobileMenu);

// Accordion behavior in drawer
document.querySelectorAll('.m-accordion > .m-acc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const acc = btn.parentElement;
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

// Close drawer when user clicks any link
document.querySelectorAll('.mobile-drawer a').forEach(a => {
  a.addEventListener('click', () => closeMobileMenu());
});

/* ========= FYNX DOWNLOAD QR (NEW) ========= */
(function(){
  const APP_URL = "https://apps.apple.com/us/app/fynx-finance-world/id6752357210";
  const widget = document.getElementById("fynxDownload");
  const closeBtn = document.getElementById("fynxClose");
  const qrHost = document.getElementById("fynxQr");
  if (!widget || !closeBtn || !qrHost) return;

  closeBtn.addEventListener("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    widget.classList.add("is-hidden");
  });

  qrHost.innerHTML = "";
  if (window.QRCode) {
    new QRCode(qrHost, {
      text: APP_URL,
      width: 74,
      height: 74,
      correctLevel: QRCode.CorrectLevel.M
    });
    const qrEl = qrHost.querySelector("img, canvas");
    if (qrEl) {
      qrEl.style.borderRadius = "10px";
      qrEl.style.background = "white";
      qrEl.style.padding = "6px";
    }
  } else {
    qrHost.innerHTML = '<div style="font-size:12px;opacity:.75;line-height:1.2;padding:10px;text-align:center;">QR failed to load.<br>Tap to open App Store.</div>';
  }

  let lastY = window.scrollY || 0;
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

  function applyInitialState(){
    if (!isMobile()) {
      widget.classList.remove("is-hidden");
      return;
    }
    widget.classList.add("is-hidden");
  }

  function onScroll(){
    if (!isMobile()) return;
    const y = window.scrollY || 0;
    const goingDown = y > lastY;
    if (y < 80) {
      widget.classList.add("is-hidden");
      lastY = y;
      return;
    }
    if (goingDown) widget.classList.remove("is-hidden");
    else widget.classList.add("is-hidden");
    lastY = y;
  }

  applyInitialState();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", applyInitialState);
})();
