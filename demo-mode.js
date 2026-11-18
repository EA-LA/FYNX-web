(function () {
  const MODE_KEY = "mode";
  function isDemoMode() {
    return false;
  }

  function setDemoMode() {
    // Compatibility for older pages. A browser preference cannot enable
    // sample account data or replace the authenticated account.
    return false;
  }

  function requireRealAccount(message) {
    if (window.FynxIdentity?.uid) return false;
    alert(message || "Sign in to use this feature");
    return true;
  }

  window.FynxDemoMode = {
    key: MODE_KEY,
    isDemoMode,
    setDemoMode,
    requireRealAccount,
  };
})();
