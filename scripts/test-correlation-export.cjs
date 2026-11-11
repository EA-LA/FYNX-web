"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { makeCsv } = require("../assets/js/correlation-export.js");
const page = fs.readFileSync(path.join(__dirname, "../tools/correlation.html"), "utf8");

function snapshot(overrides = {}) {
  return {
    labelA: "EURUSD", labelB: "GBPUSD",
    seriesA: [0.2, -0.1, 0.4],
    seriesB: [0.3, -0.2, 0.7],
    corr: 0.998765,
    ...overrides
  };
}

test("CSV exports every paired numeric observation and a reproducible Pearson snapshot", () => {
  const csv = makeCsv(snapshot());
  assert.ok(csv.startsWith("\uFEFFObservation,"));
  assert.match(csv, /Observation,"EURUSD","GBPUSD",Pearson r\r\n/);
  assert.match(csv, /1,0.2,0.3,0.9988\r\n/);
  assert.match(csv, /2,-0.1,-0.2,\r\n/);
  assert.match(csv, /3,0.4,0.7,\r\n$/);
  assert.equal(csv.split("\r\n").length, 5);
});

test("CSV quotes multi-line, comma and quote characters in labels", () => {
  const csv = makeCsv(snapshot({ labelA: 'Gold, "USD"\nspot', labelB: "DXY" }));
  assert.match(csv, /"Gold, ""USD""\nspot"/);
});

test("spreadsheet formula prefixes in user-supplied asset labels are neutralized", () => {
  const csv = makeCsv(snapshot({ labelA: "=HYPERLINK(\"http://invalid\")", labelB: "\t+SUM(1,2)" }));
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/invalid""\)"/);
  assert.match(csv, /"'\+SUM\(1,2\)"/);
  assert.match(csv, /2,-0.1,-0.2,/);
});

test("bad, missing and nonfinite observations cannot be exported", () => {
  assert.throws(() => makeCsv(snapshot({ seriesB: [0.3] })), /valid correlation/);
  assert.throws(() => makeCsv(snapshot({ seriesA: [1, NaN, 3] })), /valid correlation/);
  assert.throws(() => makeCsv(snapshot({ corr: Infinity })), /valid correlation/);
  assert.throws(() => makeCsv(snapshot({ seriesA: [1] ,seriesB: [2] })), /valid correlation/);
});

function loadRealCalculator() {
  // Execute the actual inline calculator controller against a real DOM, with no network calls.
  const dom = new JSDOM(page, { url: "https://www.fynxfinanceworld.com/tools/correlation.html", runScripts: "outside-only" });
  const win = dom.window;
  const downloads = [];
  win.FynxPreferences = { getItem: () => null, setItem: () => {} };
  win.FynxCorrelationCSV = { makeCsv };
  win.setInterval = () => 0;
  win.setTimeout = () => 0;
  win.URL.createObjectURL = blob => { downloads.push(blob); return "blob:local-csv"; };
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function() { downloads.push({ name: this.download, href: this.href }); };
  const scripts = [...win.document.querySelectorAll("script")].filter(node => !node.src);
  assert.ok(scripts.length > 0);
  win.eval(scripts[scripts.length - 1].textContent);
  const get = id => win.document.getElementById(id);
  function type(id, value) {
    get(id).value = value;
    get(id).dispatchEvent(new win.Event("input", { bubbles: true }));
  }
  return { win, dom, downloads, get, type };
}

test("real calculator enables a local download only after a valid calculation", () => {
  const { dom, get, type, downloads } = loadRealCalculator();
  assert.equal(get("exportCsvBtn").disabled, true);
  type("seriesALabel", "Gold");
  type("seriesBLabel", "DXY");
  type("seriesA", "1, 2, 3, 4");
  type("seriesB", "4, 3, 2, 1");
  get("calculateBtn").click();
  assert.equal(get("corrValue").textContent, "-1.0000");
  assert.equal(get("exportCsvBtn").disabled, false);
  get("exportCsvBtn").click();
  assert.equal(downloads.length, 2);
  assert.equal(downloads[1].name, "fynx-correlation-paired-observations.csv");
  assert.match(get("exportStatus").textContent, /Nothing was sent/);
  dom.window.close();
});

test("edited inputs invalidate old correlation and block downloading stale values", () => {
  const { dom, get, type, downloads } = loadRealCalculator();
  type("seriesA", "1,2,3");
  type("seriesB", "3,2,1");
  get("calculateBtn").click();
  assert.equal(get("exportCsvBtn").disabled, false);
  type("seriesA", "1, 2, 4");
  assert.equal(get("corrValue").textContent, "—");
  assert.equal(get("exportCsvBtn").disabled, true);
  get("exportCsvBtn").click();
  assert.equal(downloads.length, 0);
  get("calculateBtn").click();
  assert.equal(get("exportCsvBtn").disabled, false);
  get("clearBtn").click();
  assert.equal(get("exportCsvBtn").disabled, true);
  assert.equal(get("sampleSize").textContent, "0");
  dom.window.close();
});

test("invalid or constant series never enables export, swapping valid inputs recovers", () => {
  const { dom, get, type } = loadRealCalculator();
  type("seriesA", "1 1 1");
  type("seriesB", "1 2 3");
  get("calculateBtn").click();
  assert.equal(get("corrValue").textContent, "Error");
  assert.equal(get("exportCsvBtn").disabled, true);
  type("seriesA", "1 2 3");
  get("calculateBtn").click();
  assert.equal(get("exportCsvBtn").disabled, false);
  get("swapBtn").click();
  assert.equal(get("exportCsvBtn").disabled, false);
  assert.equal(get("corrValue").textContent, "1.0000");
  dom.window.close();
});
