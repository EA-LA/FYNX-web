'use strict';

// Protect the production GitHub Pages source from accidental partial-tree merges.
// The main branch briefly contained only four tracked files on 2026-11-18.
// This guard checks the repository *inventory*, not just the five build assets.
// Threshold changes should receive explicit review when the site is restructured.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED = Object.freeze([
  'CNAME',
  'index.html', 'home.html', 'news.html', 'calendar.html',
  'calculator.html', 'trader-journal.html', 'market-analysis.html',
  'trading-glossary.html', 'terminal.html', 'profile.html',
  'account-settings.html', 'security.html',
  'assets/js/account-system.js', 'assets/js/home-movers.js',
  'assets/js/glossary-search.js', 'assets/js/market-analytics.js',
  'assets/js/news-reader.js',
  'backend/README.md', 'backend/research-core.cjs',
  'scripts/build-static.js', 'scripts/build-release-assets.cjs',
  'scripts/package-static.cjs', 'scripts/verify-repository-tree.cjs',
  '.github/workflows/repository-tree-safety.yml',
]);

// Nov 18 baseline: 1,437 files, 40 root HTML pages, 128 public JS
// modules, 123 regression scripts, 64 workflows. Lower bounds provide
// room for intentional cleanup while detecting catastrophic omissions.
const MINIMUMS = Object.freeze({
  trackedFiles: 1000,
  rootPages: 30,
  publicModules: 100,
  regressionScripts: 90,
  workflows: 50,
});

function inspectTrackedPaths(paths, { required = REQUIRED, minimums = MINIMUMS } = {}) {
  const tracked = new Set(paths.filter(p => typeof p === 'string' && p.length > 0));
  const files = [...tracked];
  const counts = {
    trackedFiles: files.length,
    rootPages: files.filter(p => !p.includes('/') && p.endsWith('.html')).length,
    publicModules: files.filter(p => p.startsWith('assets/js/') && p.endsWith('.js')).length,
    regressionScripts: files.filter(p => p.startsWith('scripts/test-') && /\.(?:js|cjs|mjs)$/.test(p)).length,
    workflows: files.filter(p => p.startsWith('.github/workflows/') && /\.ya?ml$/.test(p)).length,
  };
  const missing = required.filter(p => !tracked.has(p));
  const belowMinimum = Object.entries(minimums).filter(([key, threshold]) => counts[key] < threshold)
    .map(([key, threshold]) => ({ category: key, actual: counts[key], minimum: threshold }));
  return { ok: missing.length === 0 && belowMinimum.length === 0, counts, missing, belowMinimum };
}

function selfTest() {
  const fixture = [
    'CNAME', 'index.html', 'home.html', 'assets/js/a.js',
    'scripts/test-a.cjs', '.github/workflows/example.yml', 'docs/note.md',
  ];
  const policy = {
    required: ['CNAME', 'index.html'],
    minimums: { trackedFiles: 7, rootPages: 2, publicModules: 1, regressionScripts: 1, workflows: 1 },
  };
  assert.equal(inspectTrackedPaths(fixture, policy).ok, true, 'complete tree should pass');
  assert.equal(inspectTrackedPaths([...fixture, ...fixture], policy).counts.trackedFiles, 7, 'duplicates must not inflate counts');
  const deletedRoute = inspectTrackedPaths(fixture.filter(p => p !== 'index.html'), policy);
  assert.equal(deletedRoute.ok, false, 'critical route removal must fail');
  assert.deepEqual(deletedRoute.missing, ['index.html']);
  const partialTree = inspectTrackedPaths(['CNAME', 'index.html', 'home.html', 'docs/note.md'], policy);
  assert.equal(partialTree.ok, false, 'partial source tree must fail');
  assert(partialTree.belowMinimum.some(row => row.category === 'publicModules'));
  assert(partialTree.belowMinimum.some(row => row.category === 'workflows'));
  const misplacedModule = inspectTrackedPaths(fixture.map(p => p === 'assets/js/a.js' ? 'docs/a.js' : p), policy);
  assert.equal(misplacedModule.ok, false, 'module removal must fail despite unchanged total file count');
  console.log('FYNX repository tree guard self-tests passed (complete, duplicate, missing, partial, misplaced).');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  const result = inspectTrackedPaths(files);
  const cname = fs.existsSync(path.join(ROOT, 'CNAME'))
    ? fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim()
    : null;
  if (cname !== 'www.fynxfinanceworld.com') {
    result.ok = false;
    result.domainError = 'CNAME must point to www.fynxfinanceworld.com';
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error('FYNX production source appears incomplete. Do not merge or deploy until reviewed.');
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { inspectTrackedPaths };
