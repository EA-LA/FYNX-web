import {
  auth,
  bootstrapAccount,
  listenNotifications,
  countUnread,
  markNotificationRead
} from "./account-system.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let unsubscribeNotifications = null;
let latestNotifications = [];

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
    .bell-wrap{ position:relative; }
    .bell-badge{ position:absolute; top:4px; right:4px; min-width:16px; height:16px; border-radius:999px; background:#cc1f1f; color:#fff; font-size:10px; font-weight:800; display:none; align-items:center; justify-content:center; padding:0 4px; }
    .bell-dropdown{ position:absolute; right:0; top:42px; width:min(360px, 82vw); border-radius:12px; border:1px solid var(--line, rgba(255,255,255,.12)); background:var(--surface, #fff); box-shadow:0 20px 45px rgba(0,0,0,.22); display:none; z-index:80; overflow:hidden; }
    .bell-dropdown.open{ display:block; }
    .bell-head{ padding:12px; border-bottom:1px solid var(--line, rgba(255,255,255,.12)); display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:800; }
    .bell-list{ max-height:340px; overflow:auto; }
    .bell-item{ padding:10px 12px; border-bottom:1px solid var(--line, rgba(255,255,255,.08)); cursor:pointer; }
    .bell-item strong{ display:block; font-size:12px; margin-bottom:2px; }
    .bell-item small{ opacity:.7; font-size:11px; }
    .bell-item.unread{ background: color-mix(in oklab, var(--surface-2, #f3f3f3) 55%, transparent); }
    .bell-foot{ padding:10px 12px; }
    .bell-link{ font-size:12px; font-weight:800; text-decoration:none; color:inherit; }
  `;
  document.head.appendChild(style);
}

function ensureBellDom(button) {
  if (!button) return null;
  const wrapper = button.parentElement;
  wrapper.classList.add("bell-wrap");

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

function renderBell(drop, badge, notifications) {
  const list = drop.querySelector("#bellList");
  const unread = countUnread(notifications);
  const unreadLabel = drop.querySelector("#bellUnreadLabel");
  unreadLabel.textContent = `${unread} unread`;

  badge.style.display = unread > 0 ? "inline-flex" : "none";
  badge.textContent = unread > 99 ? "99+" : String(unread);

  if (!notifications.length) {
    list.innerHTML = `<div class="bell-item"><strong>No alerts yet</strong><small>Market and account alerts appear here.</small></div>`;
    return;
  }

  list.innerHTML = notifications.slice(0, 8).map((item) => `
    <div class="bell-item ${item.read ? "" : "unread"}" data-id="${item.id}" data-link="${item.link || "notifications.html"}">
      <strong>${item.title}</strong>
      <small>${item.source} • ${formatTime(item.createdAt)}</small>
    </div>
  `).join("");

  list.querySelectorAll(".bell-item[data-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const id = node.dataset.id;
      const link = node.dataset.link;
      if (!auth.currentUser) return;
      if (id) {
        await markNotificationRead(auth.currentUser.uid, id, true);
      }
      if (link) {
        window.location.href = link;
      }
    });
  });
}

export async function mountNotificationBell() {
  const bellButton = document.querySelector('.top-bar-right .icon-btn[title="Notifications"]');
  if (!bellButton) return;

  ensureBellStyles();
  const dom = ensureBellDom(bellButton);
  if (!dom) return;

  bellButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dom.drop.classList.toggle("open");
  });

  document.addEventListener("click", (event) => {
    if (!dom.drop.contains(event.target) && !bellButton.contains(event.target)) {
      dom.drop.classList.remove("open");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    await bootstrapAccount(user);
    if (unsubscribeNotifications) unsubscribeNotifications();
    unsubscribeNotifications = listenNotifications(user.uid, (items) => {
      latestNotifications = items;
      renderBell(dom.drop, dom.badge, latestNotifications);
    }, 20);
  });
}
