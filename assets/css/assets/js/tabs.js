(() => {
  // Storage keys matching your AppStorage usage
  const KEY_START = "settings.startScreen";     // "home" | "calculators" | "news" | "calendar" | "profile"
  const KEY_NEWS_SUB = "news.subtabIndex";      // 0..3

  // Swipe behavior (from your Swift)
  const SWIPE_THRESHOLD = 44;
  const EDGE_ZONE = 28; // edge-only swipe

  // Tab model (same mapping as your Swift)
  const tabs = ["home", "calculators", "news", "calendar", "profile"];
  const totalTabs = tabs.length;

  const pages = Array.from(document.querySelectorAll(".page[data-tab]"));
  const tabButtons = Array.from(document.querySelectorAll(".tab[data-tab-btn]"));
  const navTitle = document.getElementById("navTitle");

  const newsTitle = document.getElementById("newsTitle");
  const newsChips = Array.from(document.querySelectorAll(".chip[data-news-subtab]"));
  const newsPanels = Array.from(document.querySelectorAll(".newsPanel[data-news-panel]"));

  const aiFab = document.getElementById("aiFab");
  const aiModal = document.getElementById("aiModal");

  // "Haptic" substitute on web
  function haptic() {
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function getStartRaw() {
    return (localStorage.getItem(KEY_START) || "home").toLowerCase();
  }
  function setStartRaw(raw) {
    localStorage.setItem(KEY_START, raw);
  }

  function getNewsSubtab() {
    const v = parseInt(localStorage.getItem(KEY_NEWS_SUB) || "0", 10);
    return Number.isFinite(v) ? clamp(v, 0, 3) : 0;
  }
  function setNewsSubtab(v) {
    localStorage.setItem(KEY_NEWS_SUB, String(clamp(v, 0, 3)));
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function indexFromRaw(raw) {
    switch (raw) {
      case "home": return 0;
      case "calculators":
      case "markets": return 1;
      case "news": return 2;
      case "calendar": return 3;
      case "profile": return 4;
      default: return 0;
    }
  }
  function rawFromIndex(i) {
    switch (i) {
      case 0: return "home";
      case 1: return "calculators";
      case 2: return "news";
      case 3: return "calendar";
      case 4: return "profile";
      default: return "home";
    }
  }

  let selected = indexFromRaw(getStartRaw());
  let newsSubtabIndex = getNewsSubtab();

  function render() {
    const raw = rawFromIndex(selected);

    // Show only the selected page
    pages.forEach(p => {
      p.hidden = (p.getAttribute("data-tab") !== raw);
    });

    // Active state on tab bar
    tabButtons.forEach(btn => {
      const isActive = btn.getAttribute("data-tab-btn") === raw;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-current", isActive ? "page" : "false");
    });

    // "Navigation title"
    if (navTitle) {
      navTitle.textContent =
        raw === "home" ? "Home" :
        raw === "calculators" ? "Calculators" :
        raw === "news" ? "News" :
        raw === "calendar" ? "Calendar" :
        "Profile";
    }

    // Persist start screen (your onChange)
    setStartRaw(raw);

    // News subpages only matter when in News
    if (raw === "news") {
      renderNewsSubtab();
    }
  }

  function renderNewsSubtab() {
    newsSubtabIndex = getNewsSubtab();

    // Title changes like subpages
    if (newsTitle) {
      newsTitle.textContent =
        newsSubtabIndex === 0 ? "News" :
        newsSubtabIndex === 1 ? "HeatMap" :
        newsSubtabIndex === 2 ? "Sentiment" :
        "Challenges";
    }

    // Chips active
    newsChips.forEach(ch => {
      const idx = parseInt(ch.getAttribute("data-news-subtab"), 10);
      ch.classList.toggle("is-active", idx === newsSubtabIndex);
    });

    // Panels
    newsPanels.forEach(p => {
      const idx = parseInt(p.getAttribute("data-news-panel"), 10);
      p.hidden = (idx !== newsSubtabIndex);
    });
  }

  // MARK: - Swipe logic (same as Swift)
  function handleSwipeRightFromCurrentTab() {
    if (selected === 2) { // News tab
      if (newsSubtabIndex < 3) {
        newsSubtabIndex += 1;  // News → HeatMap → Sentiment → Challenges
        setNewsSubtab(newsSubtabIndex);
        haptic();
        render();
        return;
      } else {
        // leaving News after Challenges → Calendar
        select((selected + 1) % totalTabs);
        return;
      }
    }
    select((selected + 1) % totalTabs);
  }

  function handleSwipeLeftFromCurrentTab() {
    if (selected === 3) { // Coming from Calendar back into News' last subtab
      // Calendar ← Challenges
      setNewsSubtab(3);
      newsSubtabIndex = 3;
      haptic();
      selected = 2;
      render();
      return;
    }

    if (selected === 2) { // News tab
      if (newsSubtabIndex > 0) {
        newsSubtabIndex -= 1;  // Challenges → Sentiment → HeatMap → News
        setNewsSubtab(newsSubtabIndex);
        haptic();
        render();
        return;
      } else {
        // Going back to Calculators
        select((selected - 1 + totalTabs) % totalTabs);
        return;
      }
    }

    select((selected - 1 + totalTabs) % totalTabs);
  }

  function select(idx) {
    selected = idx;
    haptic();
    render();
  }

  // Tab button click
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-tab-btn");
      const idx = indexFromRaw(raw);
      selected = idx;
      render();
    });
  });

  // News chip click
  newsChips.forEach(ch => {
    ch.addEventListener("click", () => {
      const idx = parseInt(ch.getAttribute("data-news-subtab"), 10);
      setNewsSubtab(idx);
      newsSubtabIndex = idx;
      haptic();
      render();
    });
  });

  // Edge-only swipe (matches your DragGesture logic)
  let startX = 0;
  let startY = 0;
  let tracking = false;

  window.addEventListener("pointerdown", (e) => {
    // Only begin if started within edge zones
    const x = e.clientX;
    const w = window.innerWidth;
    if (!(x <= EDGE_ZONE || x >= (w - EDGE_ZONE))) return;

    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  }, { passive: true });

  window.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Very horizontal: abs(dx) > abs(dy) * 1.4
    if (Math.abs(dx) <= Math.abs(dy) * 1.4) return;

    if (dx < -SWIPE_THRESHOLD) {
      handleSwipeRightFromCurrentTab();
    } else if (dx > SWIPE_THRESHOLD) {
      handleSwipeLeftFromCurrentTab();
    }
  }, { passive: true });

  // AI Modal (.sheet)
  function openModal() {
    aiModal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    aiModal.setAttribute("aria-hidden", "true");
  }

  aiFab?.addEventListener("click", openModal);
  aiModal?.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.getAttribute && target.getAttribute("data-close-modal") === "true") {
      closeModal();
    }
  });

  // Initial load behavior (your onAppear)
  selected = indexFromRaw(getStartRaw());
  newsSubtabIndex = getNewsSubtab();
  render();
})();
