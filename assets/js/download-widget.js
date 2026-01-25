/* ========= FYNX DOWNLOAD QR WIDGET =========
   - Generates QR code
   - Close button hides widget (session only)
   - Desktop: always visible
   - Mobile: show on scroll down, hide on scroll up / near top
*/

(function () {
  const APP_URL = "https://apps.apple.com/us/app/fynx-finance-world/id6752357210";

  const widget = document.getElementById("fynxDownload");
  const closeBtn = document.getElementById("fynxClose");
  const qrHost = document.getElementById("fynxQr");

  if (!widget || !closeBtn || !qrHost) return;

  /* ========= CLOSE BUTTON ========= */
  closeBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    widget.classList.add("is-hidden");
  });

  /* ========= QR GENERATION ========= */
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
    qrHost.innerHTML =
      '<div style="font-size:12px;opacity:.75;line-height:1.2;padding:10px;text-align:center;">QR failed to load.<br>Tap to open App Store.</div>';
  }

  /* ========= MOBILE SCROLL BEHAVIOR ========= */
  let lastY = window.scrollY || 0;

  const isMobile = () =>
    window.matchMedia("(max-width: 768px)").matches;

  function applyInitialState() {
    if (!isMobile()) {
      widget.classList.remove("is-hidden");
      return;
    }
    widget.classList.add("is-hidden");
  }

  function onScroll() {
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
