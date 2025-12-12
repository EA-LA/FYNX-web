(() => {
  // Keys match SwiftUI AppStorage
  const KEY_HAS_SEEN = "hasSeenOnboarding";
  const KEY_ACCEPTED = "acceptedTerms";

  // Elements
  const onboardingScreen = document.getElementById("screenOnboarding");
  if (!onboardingScreen) return;

  const pages = document.getElementById("obPages");
  const dots = Array.from(document.querySelectorAll(".obDot"));
  const termsBlock = document.getElementById("obTerms");
  const accepted = document.getElementById("obAcceptedTerms");
  const continueBtn = document.getElementById("obContinue");

  const auraBottom = document.getElementById("obAuraBottom");

  // State
  let index = 0;
  const total = 3;

  function getBool(key, fallback = false) {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "true";
  }
  function setBool(key, value) {
    localStorage.setItem(key, value ? "true" : "false");
  }

  // init accepted terms
  accepted.checked = getBool(KEY_ACCEPTED, false);

  function setIndex(newIndex, animated = true) {
    index = Math.max(0, Math.min(total - 1, newIndex));
    const x = -index * 100;
    pages.style.transition = animated ? "transform 220ms ease" : "none";
    pages.style.transform = `translateX(${x}%)`;

    // dots
    dots.forEach((d) => {
      const i = parseInt(d.getAttribute("data-dot"), 10);
      d.classList.toggle("is-active", i === index);
    });

    // terms block on last page only
    const isLast = index === total - 1;
    termsBlock.hidden = !isLast;

    // button label
    continueBtn.textContent = isLast ? "Get Started" : "Continue";

    // disable logic: last page requires acceptedTerms
    continueBtn.disabled = isLast && !accepted.checked;

    // background page shift (matches SwiftUI offset per page)
    if (auraBottom) {
      const xShift = index === 0 ? -120 : index === 1 ? 0 : 120;
      auraBottom.style.transform = `translateX(calc(-50% + ${xShift}px))`;
    }
  }

  // Continue logic
  function continueTapped() {
    if (index < total - 1) {
      setIndex(index + 1, true);
    } else {
      // done
      setBool(KEY_HAS_SEEN, true);
      // RootRouter will handle reroute on next tick
      window.dispatchEvent(new StorageEvent("storage", { key: KEY_HAS_SEEN }));
      // also force a reload of router state without reload:
      // root-router.js listens to storage; this event helps in some browsers.
    }
  }

  continueBtn.addEventListener("click", continueTapped);

  // Accept terms toggle
  accepted.addEventListener("change", () => {
    setBool(KEY_ACCEPTED, accepted.checked);
    setIndex(index, false);
  });

  // Dots click
  dots.forEach((d) => {
    d.addEventListener("click", () => {
      const i = parseInt(d.getAttribute("data-dot"), 10);
      setIndex(i, true);
    });
  });

  // Swipe
  let startX = 0, startY = 0, tracking = false;

  pages.addEventListener("pointerdown", (e) => {
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  pages.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // horizontal dominance
    if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;

    if (dx < -40) setIndex(index + 1, true);
    if (dx > 40) setIndex(index - 1, true);
  });

  // First render
  setIndex(0, false);
})();
