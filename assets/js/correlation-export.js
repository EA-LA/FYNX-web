(function exposeFynxCorrelationCSV(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FynxCorrelationCSV = api;
})(typeof window === "undefined" ? null : window, function createFynxCorrelationCSV() {
  "use strict";

  // Labels come from user input: quoted CSV alone does not prevent spreadsheet formulas.
  function labelCell(value, fallback) {
    let label = String(value == null ? "" : value).trim() || fallback;
    if (/^[\s\uFEFF]*[=+\-@]/u.test(label)) label = "'" + label;
    return '"' + label.replace(/"/g, '""') + '"';
  }

  function makeCsv(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.seriesA) || !Array.isArray(snapshot.seriesB) ||
        snapshot.seriesA.length < 2 || snapshot.seriesA.length !== snapshot.seriesB.length ||
        !snapshot.seriesA.every(Number.isFinite) || !snapshot.seriesB.every(Number.isFinite) ||
        !Number.isFinite(snapshot.corr)) {
      throw new Error("Calculate a valid correlation before exporting.");
    }

    const rows = [
      "Observation," + labelCell(snapshot.labelA, "Series A") + "," +
        labelCell(snapshot.labelB, "Series B") + ",Pearson r"
    ];
    snapshot.seriesA.forEach((value, index) => {
      // The observations are verified numbers, not user-defined spreadsheet formulas.
      rows.push([String(index + 1), String(value), String(snapshot.seriesB[index]),
        index === 0 ? snapshot.corr.toFixed(4) : ""].join(","));
    });
    // UTF-8 BOM improves Excel import of non-ASCII asset labels.
    return "\uFEFF" + rows.join("\r\n") + "\r\n";
  }

  return { makeCsv };
});
