/* [site-qa] run 60: shareable calculator scenarios.
   A button with data-scenario-fields="id1,id2" and data-scenario-run="calculateButtonId"
   copies a link that carries the current inputs. Opening that link fills the same inputs
   (numbers and listed select options only) and runs the calculation once. */
(function () {
  'use strict';

  function isValid(el, value) {
    if (el.tagName === 'SELECT') {
      return Array.prototype.some.call(el.options, function (o) { return o.value === value; });
    }
    if (value === '' || value.length > 24) return false;
    return /^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(value) && isFinite(Number(value));
  }

  function init(btn) {
    var fields = (btn.getAttribute('data-scenario-fields') || '')
      .split(',')
      .map(function (id) { return document.getElementById(id.trim()); })
      .filter(Boolean);
    if (!fields.length) return;
    var run = document.getElementById(btn.getAttribute('data-scenario-run') || '');

    var status = document.createElement('p');
    status.className = 'scenario-link-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var host = btn.parentElement;
    host.parentNode.insertBefore(status, host.nextSibling);

    // Fill inputs from the link, if it carries any.
    var params = new URLSearchParams(window.location.search);
    var applied = 0;
    fields.forEach(function (el) {
      if (!params.has(el.id)) return;
      var value = String(params.get(el.id)).trim();
      if (isValid(el, value)) { el.value = value; applied += 1; }
    });
    if (applied && run) {
      run.click();
      status.textContent = 'Opened a shared scenario. Change any number and calculate again.';
    }

    function buildLink() {
      var out = new URLSearchParams();
      fields.forEach(function (el) {
        var value = String(el.value).trim();
        if (isValid(el, value)) out.set(el.id, value);
      });
      return window.location.origin + window.location.pathname + '?' + out.toString();
    }

    function showFallback(link) {
      status.textContent = 'Copy this link: ';
      var box = document.createElement('input');
      box.type = 'text';
      box.readOnly = true;
      box.value = link;
      box.className = 'scenario-link-box';
      box.setAttribute('aria-label', 'Scenario link');
      status.appendChild(box);
      box.focus();
      box.select();
    }

    btn.addEventListener('click', function () {
      var link = buildLink();
      try { window.history.replaceState(null, '', link); } catch (e) { /* ignore */ }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () {
          status.textContent = 'Link copied. Anyone who opens it sees these inputs. Inputs only; nothing is saved to an account.';
        }, function () { showFallback(link); });
      } else {
        showFallback(link);
      }
    });
  }

  function start() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-scenario-fields]'), init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
