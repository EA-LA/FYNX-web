(function () {
  const MODE_KEY = "mode";
  const DEMO_VALUE = "demo";

  function isDemoMode() {
    return localStorage.getItem(MODE_KEY) === DEMO_VALUE;
  }

  function setDemoMode(enabled) {
    localStorage.setItem(MODE_KEY, enabled ? DEMO_VALUE : "live");
  }

  function requireRealAccount(message) {
    if (!isDemoMode()) return false;
    alert(message || "Create an account to use this feature");
    return true;
  }

  window.FynxDemoMode = {
    key: MODE_KEY,
    isDemoMode,
    setDemoMode,
    requireRealAccount,
  };
})();
