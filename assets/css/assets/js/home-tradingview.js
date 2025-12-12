(() => {
  // HomeView equivalents
  const symbol = "OANDA:XAUUSD"; // same as your SwiftUI
  const interval = "15";
  const theme = "dark";

  const mount = document.getElementById("tvFrame");
  if (!mount) return;

  // Load TradingView embed script once
  function loadTVScript() {
    return new Promise((resolve) => {
      if (window.__tvScriptLoaded) return resolve();
      const s = document.createElement("script");
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true;
      s.onload = () => {
        window.__tvScriptLoaded = true;
        resolve();
      };
      document.head.appendChild(s);
    });
  }

  async function initWidget() {
    await loadTVScript();

    // Clear previous if re-rendered
    mount.innerHTML = "";

    // Create container
    const container = document.createElement("div");
    container.id = "tradingview_widget";
    container.style.width = "100%";
    container.style.height = "100%";
    mount.appendChild(container);

    // Create widget
    // This is the closest match to TradingViewFullScreen
    new TradingView.widget({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme,
      style: "1",
      locale: "en",
      toolbar_bg: "#000000",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      container_id: "tradingview_widget"
    });
  }

  initWidget();
})();
