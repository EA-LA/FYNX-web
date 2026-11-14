import { safeNotificationUrl } from './safe-content.js?v=20260928-audit2';
import {
  auth,
  bootstrapAccount,
  listenNotifications,
  countUnread,
  markNotificationRead
} from "./account-system.js?v=20261114-heatmaps-1";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let unsubscribeNotifications = null;

function formatTime(value) {
  if (!value) return "Now";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Now";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ensureBellStyles() {
  if (document.getElementById("fynxBellStyles")) return;
  const style = document.createElement("style");
  style.id = "fynxBellStyles";
  style.textContent = `
    .bell-wrap{ position:relative; display:inline-flex; }
    .bell-badge{ position:absolute; top:-6px; right:-6px; min-width:18px; height:18px; border-radius:999px; background:#d92d20; color:#fff; font:800 10px/18px Inter,Arial,sans-serif; display:none; align-items:center; justify-content:center; padding:0 5px; border:2px solid #0b0f0d; pointer-events:none; z-index:2; }
    .bell-dropdown{ position:fixed; right:12px; top:64px; z-index:5000 !important; width:min(380px, calc(100vw - 20px)); border-radius:14px; border:1px solid #dfe4e1; background:#fff; color:#0f1512; box-shadow:0 18px 50px rgba(8,14,11,.22); display:none; z-index:1200; overflow:hidden; text-align:left; font-family:Inter,Arial,sans-serif; }
    .bell-dropdown.open{ display:block; }
    .bell-head{ padding:14px 16px; border-bottom:1px solid #edf0ee; display:flex; justify-content:space-between; align-items:center; font-size:14px; font-weight:800; }
    .bell-head span:last-child{ font:600 11px "IBM Plex Mono",ui-monospace,monospace; color:#6a756f; }
    .bell-list{ max-height:min(60vh,380px); overflow:auto; }
    .bell-sub{ padding:10px 16px 6px; font:700 10.5px "IBM Plex Mono",ui-monospace,monospace; letter-spacing:.12em; color:#7a857f; text-transform:uppercase; }
    .bell-item{ position:relative; padding:11px 16px 11px 28px; border-bottom:1px solid #f1f3f2; cursor:pointer; }
    .bell-item:hover{ background:#f6f8f7; }
    .bell-item strong{ display:block; font-size:13px; margin-bottom:3px; }
    .bell-item small{ color:#6a756f; font-size:11.5px; }
    .bell-item.unread::before{ content:""; position:absolute; left:12px; top:16px; width:7px; height:7px; border-radius:50%; background:#1f8a5a; }
    .bell-item.unread strong{ color:#0b0f0d; }
    .bell-foot{ padding:12px 16px; background:#f6f8f7; }
    .bell-link{ font-size:13px; font-weight:800; text-decoration:none; color:#1f5a3f; }
    @media (max-width:600px){ .bell-dropdown{ left:10px !important; right:10px !important; width:auto; } }
  `;
  document.head.appendChild(style);
}

function ensureBellDom(button) {
  if (!button) return null;
  // Own wrapper, so the badge and menu sit on the bell itself (not on the whole header group).
  let wrapper = button.parentElement;
  if (!wrapper.classList.contains("bell-wrap")) {
    wrapper = document.createElement("span");
    wrapper.className = "bell-wrap";
    button.replaceWith(wrapper);
    wrapper.appendChild(button);
  }

  let badge = wrapper.querySelector(".bell-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "bell-badge";
    wrapper.appendChild(badge);
  }

  let drop = wrapper.querySelector(".bell-dropdown");
  if (!drop) {
    drop = document.createElement("div");
    drop.className = "bell-dropdown";
    drop.innerHTML = `
      <div class="bell-head"><span>Notifications</span><span id="bellUnreadLabel">0 unread</span></div>
      <div class="bell-list" id="bellList"></div>
      <div class="bell-foot"><a class="bell-link" href="notifications.html">Open Notification Center →</a></div>
    `;
    wrapper.appendChild(drop);
  }

  return { badge, drop };
}

function bindItemClicks(list) {
  list.querySelectorAll(".bell-item[data-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const id = node.dataset.id;
      const link = node.dataset.link;
      if (!auth.currentUser) return;
      try {
        if (id) await markNotificationRead(auth.currentUser.uid, id, true);
        const destination = safeNotificationUrl(link);
        if (destination) window.location.href = destination;
      } catch {
        node.querySelector('small').textContent = 'Could not update this alert. Check your connection and try again.';
      }
    });
  });
}

function renderBell(drop, badge, notifications) {
  const active = notifications.filter((item) => !item.archived);
  const list = drop.querySelector("#bellList");
  const unread = countUnread(active);
  const unreadLabel = drop.querySelector("#bellUnreadLabel");
  unreadLabel.textContent = `${unread} unread`;

  badge.style.display = unread > 0 ? "inline-flex" : "none";
  badge.textContent = unread > 99 ? "99+" : String(unread);

  if (!active.length) {
    list.innerHTML = `<div class="bell-item"><strong>No alerts yet</strong><small>Market and account alerts appear here.</small></div>`;
    return;
  }

  const unreadItems = active.filter((i) => !i.read).slice(0, 5);
  const readItems = active.filter((i) => i.read).slice(0, 3);

  list.replaceChildren();
  for (const [label, items] of [['UNREAD', unreadItems], ['RECENT READ', readItems]]) {
    if (!items.length) continue;
    const heading = document.createElement('div');
    heading.className = 'bell-sub'; heading.textContent = label; list.append(heading);
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'bell-item' + (item.read ? '' : ' unread');
      row.dataset.id = String(item.id);
      row.dataset.link = safeNotificationUrl(item.sourceUrl) || new URL('notifications.html', location.href).href;
      const title = document.createElement('strong'), detail = document.createElement('small');
      title.textContent = String(item.title || 'Notification');
      detail.textContent = `${item.source || 'FYNX'} • ${formatTime(item.timestamp)}`;
      row.append(title, detail); list.append(row);
    }
  }

  bindItemClicks(list);
}

function findBellButton() {
  return document.querySelector('.top-bar-right .icon-btn[title="Notifications"], .top-bar .icon-btn[title="Notifications"]');
}

export async function mountNotificationBell() {
  const bellButton = findBellButton();
  if (!bellButton || bellButton.dataset.notificationsMounted) return;
  bellButton.dataset.notificationsMounted = 'true';

  ensureBellStyles();
  const dom = ensureBellDom(bellButton);
  if (!dom) return;

  bellButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    // The menu lives on <body> with fixed positioning so header bars can never cover it.
    if (dom.drop.parentElement !== document.body) document.body.appendChild(dom.drop);
    const rect = bellButton.getBoundingClientRect();
    dom.drop.style.top = Math.round(rect.bottom + 10) + "px";
    dom.drop.style.right = Math.max(10, Math.round(window.innerWidth - rect.right)) + "px";
    dom.drop.classList.toggle("open");
  });

  document.addEventListener("click", (event) => {
    if (!dom.drop.contains(event.target) && !bellButton.contains(event.target)) {
      dom.drop.classList.remove("open");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (unsubscribeNotifications) { unsubscribeNotifications(); unsubscribeNotifications = null; }
    renderBell(dom.drop, dom.badge, []);
    if (!user) return;
    try { await bootstrapAccount(user); }
    catch { if (auth.currentUser?.uid === user.uid) dom.drop.querySelector('#bellList').textContent = 'Notifications unavailable. Check your connection and reload.'; return; }
    if (auth.currentUser?.uid !== user.uid) return;
    unsubscribeNotifications = listenNotifications(user.uid, (items) => {
      if (auth.currentUser?.uid === user.uid) renderBell(dom.drop, dom.badge, items);
    }, 20, () => { dom.drop.querySelector('#bellList').textContent = 'Notifications unavailable. Check your connection and reload.'; });
  });
}
