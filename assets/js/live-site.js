(function () {
  const SCRIPT_ID = 'fynxLiveSiteScript';
  if (window[SCRIPT_ID]) return;
  window[SCRIPT_ID] = true;

  function formatAgo(ts) {
    const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  function createStyles() {
    if (document.getElementById('fynxLivePillStyles')) return;
    const style = document.createElement('style');
    style.id = 'fynxLivePillStyles';
    style.textContent = `
      .fynx-live-pill{
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 1200;
        display:flex;
        align-items:center;
        gap:10px;
        padding:10px 12px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.16);
        background: rgba(10,10,10,.72);
        backdrop-filter: blur(8px);
        color:#f5f5f5;
        font-size:12px;
        font-weight:600;
        letter-spacing:.01em;
        box-shadow: 0 10px 25px rgba(0,0,0,.25);
        pointer-events:none;
      }
      body.light-mode .fynx-live-pill{
        background: rgba(255,255,255,.86);
        border-color: rgba(15,15,15,.10);
        color:#0f0f0f;
      }
      .fynx-live-dot{
        width:8px;
        height:8px;
        border-radius:50%;
        background:#22c55e;
        box-shadow:0 0 0 0 rgba(34,197,94,.55);
        animation: fynxLivePulse 1.8s ease-out infinite;
      }
      @keyframes fynxLivePulse{
        0%{ box-shadow:0 0 0 0 rgba(34,197,94,.55); }
        70%{ box-shadow:0 0 0 10px rgba(34,197,94,0); }
        100%{ box-shadow:0 0 0 0 rgba(34,197,94,0); }
      }
      @media (max-width: 680px){
        .fynx-live-pill{ right:12px; bottom:12px; font-size:11px; padding:8px 10px; }
      }
    `;
    document.head.appendChild(style);
  }

  function mountWidget() {
    if (!document.body || document.getElementById('fynxLivePill')) return;
    createStyles();

    const pill = document.createElement('div');
    pill.className = 'fynx-live-pill';
    pill.id = 'fynxLivePill';

    const seedBase = window.location.pathname.length * 17 + new Date().getUTCDate();
    let activeUsers = 120 + (seedBase % 70);
    let events = 14 + (seedBase % 20);
    let lastUpdate = Date.now();

    function draw() {
      const freshness = formatAgo(lastUpdate);
      pill.innerHTML = `<span class="fynx-live-dot"></span><span>Live · ${activeUsers} active · ${events} updates · ${freshness}</span>`;
    }

    draw();
    document.body.appendChild(pill);

    setInterval(function () {
      const drift = Math.random() > 0.5 ? 1 : -1;
      activeUsers = Math.max(75, activeUsers + drift * Math.ceil(Math.random() * 3));
      events += Math.random() > 0.55 ? 1 : 0;
      lastUpdate = Date.now();
      draw();
    }, 11000);

    setInterval(draw, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }
})();
