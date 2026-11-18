// Plain (non-module) fallback for the developer workspace. workspace.js loads Firebase from gstatic.com;
// if that is blocked (network filters, content blockers, offline), the module never runs and the page
// would say "Connecting to your workspace…" forever. This script explains what happened and offers a retry.
(function () {
  'use strict';
  var WAIT_MS = 12000;
  function stuck() {
    var n = document.getElementById('notice');
    var auth = document.getElementById('auth-panel');
    var app = document.getElementById('app');
    return n && /^Connecting/.test(n.textContent) && auth && auth.hidden && app && app.hidden;
  }
  function explain(reason) {
    if (!stuck()) return;
    var n = document.getElementById('notice');
    n.className = 'error';
    n.textContent = (reason === 'failed'
      ? 'The sign-in service could not be loaded.'
      : 'The sign-in service is taking too long to respond.') +
      ' Check your connection, or allow www.gstatic.com and cloudfunctions.net if a content blocker or network filter is on, then retry. ';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'text-button';
    retry.id = 'workspace-retry';
    retry.textContent = 'Retry';
    retry.onclick = function () { location.reload(); };
    n.appendChild(retry);
  }
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t.tagName === 'SCRIPT' && /\/api\/workspace\.js/.test(t.src || '')) explain('failed');
  }, true);
  setTimeout(function () { explain('timeout'); }, WAIT_MS);
  window.__fynxWorkspaceBoot = { explain: explain, stuck: stuck };
})();
