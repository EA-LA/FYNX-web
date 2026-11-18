/* Stock calculators (tools/stock.html, tools/profit-loss.html):
   "Targets and cash check" card under the result.
   - 1R/2R/3R target prices (entry +/- k x risk per share) and the profit at the sized share count
   - cash check: when the shares cost more than the account, how many shares the cash covers
   Before commissions, slippage and gaps. No margin assumed for the cash check. */
(function (root) {
  "use strict";

  function decimalsOf(value) {
    var s = String(value);
    var i = s.indexOf(".");
    return i < 0 ? 0 : s.length - i - 1;
  }

  function plan(input) {
    var account = Number(input.accountSize);
    var entry = Number(input.entryPrice);
    var stop = Number(input.stopLoss);
    var shares = Math.floor(Number(input.shares));
    if (!(account > 0) || !(entry > 0) || !(stop > 0) || entry === stop || !(shares >= 0)) return null;
    var risk = Math.abs(entry - stop);
    var long = entry > stop;
    var dp = Math.min(4, Math.max(2, decimalsOf(entry), decimalsOf(stop)));
    var targets = [1, 2, 3].map(function (k) {
      var price = long ? entry + k * risk : entry - k * risk;
      return { r: k, price: price > 0 ? Number(price.toFixed(dp)) : null, profit: shares * k * risk };
    });
    var cost = shares * entry;
    var cash = null;
    if (cost > account) {
      var fit = Math.floor(account / entry);
      cash = { shares: fit, cost: fit * entry, loss: fit * risk, lossPct: (fit * risk) / account * 100 };
    }
    return { long: long, shares: shares, dp: dp, targets: targets, cash: cash };
  }

  function money(n) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  function price(n, dp) {
    return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  function el(doc, tag, text, cls) {
    var e = doc.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function render(input, doc) {
    doc = doc || root.document;
    var box = doc && doc.getElementById("stockPlan");
    if (!box) return null;
    var p = plan(input);
    var body = doc.getElementById("stockPlanBody");
    body.textContent = "";
    if (!p) { box.hidden = true; return null; }

    if (p.shares > 0) {
      var table = el(doc, "table", null, "stock-plan-table");
      var head = el(doc, "tr");
      ["Target", "Price", "Profit at " + p.shares + (p.shares === 1 ? " share" : " shares")].forEach(function (h) {
        var th = el(doc, "th", h); th.scope = "col"; head.appendChild(th);
      });
      var thead = el(doc, "thead"); thead.appendChild(head); table.appendChild(thead);
      var tbody = el(doc, "tbody");
      p.targets.forEach(function (t) {
        var tr = el(doc, "tr");
        tr.appendChild(el(doc, "td", t.r + "R"));
        tr.appendChild(el(doc, "td", t.price == null ? "below 0" : price(t.price, p.dp)));
        tr.appendChild(el(doc, "td", t.price == null ? "—" : "+" + money(t.profit)));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      body.appendChild(table);
      body.appendChild(el(doc, "div", (p.long ? "Long: targets above entry" : "Short: targets below entry") +
        ", each one risk-distance further (1R = your risk per share). Before costs.", "stock-plan-note"));
    }

    if (p.cash) {
      body.appendChild(el(doc, "div", p.cash.shares > 0
        ? "Cash check: your account covers " + p.cash.shares + (p.cash.shares === 1 ? " share" : " shares") +
          " (" + money(p.cash.cost) + ") without margin. At that size the loss at your stop is " +
          money(p.cash.loss) + " (" + p.cash.lossPct.toFixed(2) + "% of the account)."
        : "Cash check: your account cannot buy one share at this price without margin.", "stock-plan-cash"));
    }
    box.hidden = !body.firstChild;
    return p;
  }

  function clear(doc) {
    doc = doc || root.document;
    var box = doc && doc.getElementById("stockPlan");
    if (box) { box.hidden = true; doc.getElementById("stockPlanBody").textContent = ""; }
  }

  var api = { plan: plan, render: render, clear: clear };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FynxStockPlan = api;
})(typeof window !== "undefined" ? window : globalThis);
