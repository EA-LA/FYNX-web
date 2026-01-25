/* ================= HEADER SCROLL EFFECT ================= */
const header = document.getElementById('header');

window.addEventListener('scroll', () => {
  if (window.scrollY > 50) header.classList.add('scrolled');
  else header.classList.remove('scrolled');
});

/* ================= PARTICLES ================= */
const bg = document.querySelector('.animated-bg');

if (bg) {
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDelay = (Math.random() * 15) + 's';
    p.style.animationDuration = (10 + Math.random() * 10) + 's';
    bg.appendChild(p);
  }
}

/* ================= HEADER HEIGHT VARIABLE ================= */
function setHeaderHeightVar() {
  if (!header) return;
  const h = header.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--header-h', h + 'px');
}
window.addEventListener('resize', setHeaderHeightVar);
setHeaderHeightVar();

/* ================= DESKTOP SUB-NAV ELEMENTS ================= */
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

/* ================= TOPIC LABELS ================= */
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

/* ================= CLOSE ALL BARS ================= */
function closeAllBars() {
  document.body.classList.remove(
    'tools-open',
    'news-open',
    'learn-open',
    'learn-detail-open',
    'home-open',
    'home-detail-open'
  );

  toolsSubnav?.setAttribute('aria-hidden', 'true');
  newsSubnav?.setAttribute('aria-hidden', 'true');
  learnSubnav?.setAttribute('aria-hidden', 'true');
  learnDetailSubnav?.setAttribute('aria-hidden', 'true');
  homeSubnav?.setAttribute('aria-hidden', 'true');
  homeMarketsSubnav?.setAttribute('aria-hidden', 'true');
}

/* ================= KEEP PAGE AT TOP ================= */
function keepAtTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================= TOOLS ================= */
toolsToggle?.addEventListener('click', e => {
  e.preventDefault();
  keepAtTop();

  document.body.classList.remove('news-open','learn-open','learn-detail-open','home-open','home-detail-open');
  newsSubnav?.setAttribute('aria-hidden', 'true');
  learnSubnav?.setAttribute('aria-hidden', 'true');
  learnDetailSubnav?.setAttribute('aria-hidden', 'true');
  homeSubnav?.setAttribute('aria-hidden', 'true');
  homeMarketsSubnav?.setAttribute('aria-hidden', 'true');

  document.body.classList.toggle('tools-open');
  toolsSubnav?.setAttribute('aria-hidden',
    document.body.classList.contains('tools-open') ? 'false' : 'true'
  );
});

/* ================= NEWS ================= */
newsToggle?.addEventListener('click', e => {
  e.preventDefault();
  keepAtTop();

  document.body.classList.remove('tools-open','learn-open','learn-detail-open','home-open','home-detail-open');
  toolsSubnav?.setAttribute('aria-hidden', 'true');
  learnSubnav?.setAttribute('aria-hidden', 'true');
  learnDetailSubnav?.setAttribute('aria-hidden', 'true');
  homeSubnav?.setAttribute('aria-hidden', 'true');
  homeMarketsSubnav?.setAttribute('aria-hidden', 'true');

  document.body.classList.toggle('news-open');
  newsSubnav?.setAttribute('aria-hidden',
    document.body.classList.contains('news-open') ? 'false' : 'true'
  );
});

/* ================= LEARN ================= */
learnToggle?.addEventListener('click', e => {
  e.preventDefault();
  keepAtTop();

  document.body.classList.remove('tools-open','news-open','home-open','home-detail-open');
  toolsSubnav?.setAttribute('aria-hidden', 'true');
  newsSubnav?.setAttribute('aria-hidden', 'true');
  homeSubnav?.setAttribute('aria-hidden', 'true');
  homeMarketsSubnav?.setAttribute('aria-hidden', 'true');

  document.body.classList.toggle('learn-open');
  learnSubnav?.setAttribute('aria-hidden',
    document.body.classList.contains('learn-open') ? 'false' : 'true'
  );

  if (!document.body.classList.contains('learn-open')) {
    document.body.classList.remove('learn-detail-open');
    learnDetailSubnav?.setAttribute('aria-hidden', 'true');
  }
});

/* ================= HOME ================= */
homeToggle?.addEventListener('click', e => {
  e.preventDefault();
  keepAtTop();

  document.body.classList.remove('tools-open','news-open','learn-open','learn-detail-open');
  toolsSubnav?.setAttribute('aria-hidden', 'true');
  newsSubnav?.setAttribute('aria-hidden', 'true');
  learnSubnav?.setAttribute('aria-hidden', 'true');
  learnDetailSubnav?.setAttribute('aria-hidden', 'true');

  document.body.classList.toggle('home-open');
  homeSubnav?.setAttribute('aria-hidden',
    document.body.classList.contains('home-open') ? 'false' : 'true'
  );

  if (!document.body.classList.contains('home-open')) {
    document.body.classList.remove('home-detail-open');
    homeMarketsSubnav?.setAttribute('aria-hidden', 'true');
  }
});

/* ================= HOME MARKETS ================= */
marketsToggle?.addEventListener('click', () => {
  keepAtTop();

  if (!document.body.classList.contains('home-open')) {
    document.body.classList.add('home-open');
    homeSubnav?.setAttribute('aria-hidden', 'false');
  }

  document.body.classList.toggle('home-detail-open');
  homeMarketsSubnav?.setAttribute('aria-hidden',
    document.body.classList.contains('home-detail-open') ? 'false' : 'true'
  );
});

/* ================= LEARN TOPIC BUTTONS ================= */
const learnTopicButtons = document.querySelectorAll('.learn-pill[data-topic]');

function setActiveTopic(topic) {
  learnTopicButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.topic === topic);
  });

  document.body.classList.add('learn-detail-open');
  learnDetailSubnav?.setAttribute('aria-hidden', 'false');

  if (learnDetailCaption)
    learnDetailCaption.innerHTML = `<i class="fas fa-layer-group"></i> ${topicLabel[topic] || 'Topic'}`;

  if (learnHowTo) learnHowTo.href = `learn/topic.html?topic=${topic}&section=howto`;
  if (learnQuizzes) learnQuizzes.href = `learn/topic.html?topic=${topic}&section=quizzes`;
  if (learnGlossary) learnGlossary.href = `learn/topic.html?topic=${topic}&section=glossary`;
}

learnTopicButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveTopic(btn.dataset.topic);
  });
});

/* ================= CLICK OUTSIDE CLOSE ================= */
document.addEventListener('click', e => {
  const inside = (
    header?.contains(e.target) ||
    toolsSubnav?.contains(e.target) ||
    newsSubnav?.contains(e.target) ||
    learnSubnav?.contains(e.target) ||
    learnDetailSubnav?.contains(e.target) ||
    homeSubnav?.contains(e.target) ||
    homeMarketsSubnav?.contains(e.target)
  );

  if (!inside) closeAllBars();
});

/* ================= ESC KEY ================= */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllBars();
});
