/* =========================================================
   FYNX User Card (Avatar Dropdown)
   File: fynx-usercard.js
   - Works on Home/Journal/Calculator/News/Calendar/Profile
   - Theme-aware (dark/light) using existing CSS variables/classes
   - Data comes from localStorage (profile page should save it)
   ========================================================= */

(function () {
  const STORAGE_KEYS = {
    profile: "fynx_profile",         // JSON string
    theme: "fynx_theme",             // "dark" or "light"
    memberSince: "fynx_member_since" // ISO date string
  };

  const DEFAULT_PROFILE = {
    name: "FYNX User",
    email: "",
    totalTrades: 0,
    winRate: "—",
    memberSince: "—",
    bio: "Add a short description in Profile."
  };

  // ---------- Helpers ----------
  function safeJSONParse(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function formatDateNice(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  }

  function getMemberSince() {
    const saved = localStorage.getItem(STORAGE_KEYS.memberSince);
    if (saved) return formatDateNice(saved);

    // If not set yet, set it once (first time module runs)
    const nowIso = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.memberSince, nowIso);
    return formatDateNice(nowIso);
  }

  function getProfileData() {
    const raw = localStorage.getItem(STORAGE_KEYS.profile);
    const obj = safeJSONParse(raw) || {};
    const memberSince = obj.memberSince ? formatDateNice(obj.memberSince) : getMemberSince();

    return {
      name: (obj.name || DEFAULT_PROFILE.name).trim(),
      email: (obj.email || DEFAULT_PROFILE.email).trim(),
      totalTrades: Number.isFinite(Number(obj.totalTrades)) ? Number(obj.totalTrades) : DEFAULT_PROFILE.totalTrades,
      winRate: (obj.winRate ?? DEFAULT_PROFILE.winRate),
      memberSince: memberSince,
      bio: (obj.bio || DEFAULT_PROFILE.bio).trim()
    };
  }

  // Theme detection:
  // - prefers body.dark-mode / body.light-mode if you use that
  // - otherwise uses localStorage "fynx_theme"
  // - otherwise uses prefers-color-scheme
  function getTheme() {
    const b = document.body;
    if (b.classList.contains("dark-mode") || b.classList.contains("dark")) return "dark";
    if (b.classList.contains("light-mode") || b.classList.contains("light")) return "light";

    const stored = (localStorage.getItem(STORAGE_KEYS.theme) || "").toLowerCase();
    if (stored === "dark" || stored === "light") return stored;

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function createStyles() {
    if (document.getElementById("fynx-usercard-styles")) return;

    const style = document.createElement("style");
    style.id = "fynx-usercard-styles";
    style.textContent = `
/* FYNX User Card Styles (theme uses your existing CSS variables) */
.fynx-usercard-popover{
  position: fixed;
  z-index: 9999;
  width: 320px;
  max-width: calc(100vw - 24px);
  border-radius: 14px;
  overflow: hidden;
  transform-origin: top right;
  transform: translateY(6px) scale(.98);
  opacity: 0;
  pointer-events: none;
  transition: opacity .14s ease, transform .14s ease;
  box-shadow: 0 18px 60px rgba(0,0,0,.18);
  border: 1px solid var(--border, rgba(0,0,0,.12));
  background: var(--panel, rgba(255,255,255,.92));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: var(--text, #111);
  font-family: inherit;
}
body.dark-mode .fynx-usercard-popover,
body.dark .fynx-usercard-popover{
  border: 1px solid var(--border, rgba(255,255,255,.14));
  background: var(--panel, rgba(18,18,18,.72));
  color: var(--text, #fff);
  box-shadow: 0 18px 70px rgba(0,0,0,.45);
}

.fynx-usercard-popover.is-open{
  opacity: 1;
  pointer-events: auto;
  transform: translateY(10px) scale(1);
}

.fynx-usercard-header{
  display:flex;
  align-items:center;
  gap: 12px;
  padding: 14px 14px 10px 14px;
  border-bottom: 1px solid var(--border2, rgba(0,0,0,.08));
}
body.dark-mode .fynx-usercard-header,
body.dark .fynx-usercard-header{
  border-bottom: 1px solid var(--border2, rgba(255,255,255,.10));
}
.fynx-usercard-avatar{
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight: 800;
  letter-spacing: .4px;
  border: 1px solid var(--border, rgba(0,0,0,.12));
  background: rgba(0,0,0,.04);
}
body.dark-mode .fynx-usercard-avatar,
body.dark .fynx-usercard-avatar{
  background: rgba(255,255,255,.06);
  border: 1px solid var(--border, rgba(255,255,255,.14));
}
.fynx-usercard-titlewrap{ flex:1; min-width:0; }
.fynx-usercard-name{
  font-size: 14px;
  font-weight: 800;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fynx-usercard-email{
  margin-top: 4px;
  font-size: 12px;
  opacity: .72;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fynx-usercard-body{
  padding: 12px 14px 14px 14px;
}
.fynx-usercard-grid{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}
.fynx-usercard-metric{
  border: 1px solid var(--border2, rgba(0,0,0,.08));
  border-radius: 12px;
  padding: 10px 10px;
  background: rgba(0,0,0,.02);
}
body.dark-mode .fynx-usercard-metric,
body.dark .fynx-usercard-metric{
  border: 1px solid var(--border2, rgba(255,255,255,.10));
  background: rgba(255,255,255,.04);
}
.fynx-usercard-label{
  font-size: 11px;
  opacity: .70;
  margin-bottom: 6px;
}
.fynx-usercard-value{
  font-size: 14px;
  font-weight: 800;
}

.fynx-usercard-bio{
  border: 1px solid var(--border2, rgba(0,0,0,.08));
  border-radius: 12px;
  padding: 10px 10px;
  background: rgba(0,0,0,.02);
  font-size: 12px;
  line-height: 1.35;
  opacity: .92;
}
body.dark-mode .fynx-usercard-bio,
body.dark .fynx-usercard-bio{
  border: 1px solid var(--border2, rgba(255,255,255,.10));
  background: rgba(255,255,255,.04);
}

.fynx-usercard-actions{
  display:flex;
  gap: 10px;
  margin-top: 10px;
}
.fynx-usercard-btn{
  flex:1;
  border: 1px solid var(--border, rgba(0,0,0,.12));
  background: transparent;
  color: inherit;
  border-radius: 12px;
  padding: 10px 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
body.dark-mode .fynx-usercard-btn,
body.dark .fynx-usercard-btn{
  border: 1px solid var(--border, rgba(255,255,255,.14));
}
.fynx-usercard-btn:hover{
  background: rgba(0,0,0,.04);
}
body.dark-mode .fynx-usercard-btn:hover,
body.dark .fynx-usercard-btn:hover{
  background: rgba(255,255,255,.06);
}
`;
    document.head.appendChild(style);
  }

  function buildPopover() {
    let el = document.getElementById("fynx-usercard-popover");
    if (el) return el;

    el = document.createElement("div");
    el.id = "fynx-usercard-popover";
    el.className = "fynx-usercard-popover";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-hidden", "true");

    // Stop clicks inside from closing
    el.addEventListener("click", (e) => e.stopPropagation());

    document.body.appendChild(el);
    return el;
  }

  function setPopoverContent(popover, data, initials) {
    popover.innerHTML = `
      <div class="fynx-usercard-header">
        <div class="fynx-usercard-avatar">${initials}</div>
        <div class="fynx-usercard-titlewrap">
          <div class="fynx-usercard-name">${escapeHTML(data.name)}</div>
          <div class="fynx-usercard-email">${escapeHTML(data.email || "")}</div>
        </div>
      </div>

      <div class="fynx-usercard-body">
        <div class="fynx-usercard-grid">
          <div class="fynx-usercard-metric">
            <div class="fynx-usercard-label">TOTAL TRADES</div>
            <div class="fynx-usercard-value">${escapeHTML(String(data.totalTrades))}</div>
          </div>
          <div class="fynx-usercard-metric">
            <div class="fynx-usercard-label">WIN RATE</div>
            <div class="fynx-usercard-value">${escapeHTML(String(data.winRate))}</div>
          </div>
          <div class="fynx-usercard-metric" style="grid-column: 1 / -1;">
            <div class="fynx-usercard-label">MEMBER SINCE</div>
            <div class="fynx-usercard-value">${escapeHTML(String(data.memberSince))}</div>
          </div>
        </div>

        <div class="fynx-usercard-bio">${escapeHTML(data.bio || "")}</div>

        <div class="fynx-usercard-actions">
          <button class="fynx-usercard-btn" type="button" data-fynx-go-profile>Profile</button>
          <button class="fynx-usercard-btn" type="button" data-fynx-close>Close</button>
        </div>
      </div>
    `;

    // Buttons
    popover.querySelector("[data-fynx-close]")?.addEventListener("click", () => closePopover(popover));
    popover.querySelector("[data-fynx-go-profile]")?.addEventListener("click", () => {
      // Adjust if your profile file name differs
      window.location.href = "profile.html";
    });
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function computeInitials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "FX";
    const a = parts[0][0] || "F";
    const b = parts.length > 1 ? (parts[parts.length - 1][0] || "") : "";
    const out = (a + b).toUpperCase();
    return out || "FX";
  }

  function positionPopover(popover, anchorEl) {
    const r = anchorEl.getBoundingClientRect();

    // Default: align right edge of popup to right edge of anchor (like Gmail)
    const margin = 10;
    let left = r.right - 320; // 320 = width
    let top = r.bottom + 10;

    // Clamp to viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - margin - popover.offsetWidth));
    top = Math.max(margin, Math.min(top, window.innerHeight - margin - popover.offsetHeight));

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function openPopover(popover, anchorEl) {
    const data = getProfileData();
    const initials = computeInitials(data.name);

    setPopoverContent(popover, data, initials);

    // Need a paint to calculate offsetHeight correctly
    popover.classList.add("is-open");
    popover.setAttribute("aria-hidden", "false");

    // Position after content renders
    requestAnimationFrame(() => {
      positionPopover(popover, anchorEl);
    });

    // Close on ESC
    window.addEventListener("keydown", onEsc, { once: true });

    // Close on click outside
    setTimeout(() => {
      document.addEventListener("click", onOutsideClick, { once: true });
    }, 0);

    function onEsc(e) {
      if (e.key === "Escape") closePopover(popover);
      else window.addEventListener("keydown", onEsc, { once: true });
    }

    function onOutsideClick() {
      closePopover(popover);
    }
  }

  function closePopover(popover) {
    popover.classList.remove("is-open");
    popover.setAttribute("aria-hidden", "true");
  }

  function togglePopover(popover, anchorEl) {
    const isOpen = popover.classList.contains("is-open");
    if (isOpen) closePopover(popover);
    else openPopover(popover, anchorEl);
  }

  // Finds the "FX" avatar element on any page.
  // You can support different layouts without changing your HTML:
  // - id="fynxUserMenuBtn"
  // - data-fynx-user-menu
  // - class "user-menu-btn"
  // - element that literally contains "FX" (last fallback)
  function findAnchor() {
    return (
      document.getElementById("fynxUserMenuBtn") ||
      document.querySelector("[data-fynx-user-menu]") ||
      document.querySelector(".user-menu-btn") ||
      document.querySelector(".user-avatar") ||
      document.querySelector(".avatar") ||
      findFxTextButton()
    );
  }

  function findFxTextButton() {
    // last fallback: try to find a small circular button with text FX
    const candidates = Array.from(document.querySelectorAll("button, a, div, span"));
    const hit = candidates.find(el => {
      const t = (el.textContent || "").trim();
      if (t !== "FX") return false;
      const r = el.getBoundingClientRect();
      // likely small
      return r.width <= 60 && r.height <= 60;
    });
    return hit || null;
  }

  function attach() {
    createStyles();
    const popover = buildPopover();
    const anchor = findAnchor();
    if (!anchor) return;

    // Make sure anchor behaves like clickable
    anchor.style.cursor = anchor.style.cursor || "pointer";

    // Click toggle
    anchor.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePopover(popover, anchor);
    });

    // Reposition on resize
    window.addEventListener("resize", () => {
      if (popover.classList.contains("is-open")) positionPopover(popover, anchor);
    });

    // If theme changes via body class, the CSS already reacts.
    // If your theme is stored & applied later, we keep it updated too.
    const obs = new MutationObserver(() => {
      // Just force reflow if open so it doesn’t look weird
      if (popover.classList.contains("is-open")) positionPopover(popover, anchor);
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  // Expose small API (optional)
  window.FYNXUserCard = {
    init: attach,
    setProfile: function (profileObj) {
      const current = safeJSONParse(localStorage.getItem(STORAGE_KEYS.profile)) || {};
      const merged = { ...current, ...profileObj };
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(merged));
      if (merged.memberSince) localStorage.setItem(STORAGE_KEYS.memberSince, merged.memberSince);
    }
  };

  // Auto-init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})();
