'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Match package-static.cjs: only these top-level directories belong to the
// website. New source, cache or fixture directories must never opt in by default.
const PUBLIC_DIRECTORIES = Object.freeze(['api', 'assets', 'edge-radar', 'profile', 'auth', 'home', 'learn', 'markets', 'news', 'resources', 'tools', 'intelligence']);
const PRIVATE_DIRECTORIES = new Set(['node_modules', 'output', 'dist', 'backend', 'docs', 'ops', 'scripts', 'functions', 'tests', '__tests__', 'fixtures', 'coverage', 'src', 'lib', 'content', 'config']);

function isPublicSitePath(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || path.posix.isAbsolute(file)) return false;
  const parts = file.split('/');
  if (parts.some(part => !part || part.startsWith('.'))) return false;
  if (parts.slice(0, -1).some(part => PRIVATE_DIRECTORIES.has(part))) return false;
  return parts.length === 1 || PUBLIC_DIRECTORIES.includes(parts[0]);
}

function publicSiteFiles(root, {extensions = ['.html'], exclude = []} = {}) {
  const suffixes = new Set(extensions), omitted = new Set(exclude);
  function walk(directory) {
    return fs.readdirSync(path.join(root, directory), {withFileTypes:true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
      const file = path.posix.join(directory, entry.name);
      if (!isPublicSitePath(file) || omitted.has(file)) return [];
      if (entry.isDirectory()) {
        if ((!directory && !PUBLIC_DIRECTORIES.includes(entry.name)) || PRIVATE_DIRECTORIES.has(entry.name)) return [];
        return walk(file);
      }
      // Never follow symlinks into private source or outside the repository.
      return entry.isFile() && suffixes.has(path.extname(entry.name)) ? [file] : [];
    });
  }
  return walk('');
}

module.exports = {PUBLIC_DIRECTORIES, isPublicSitePath, publicSiteFiles};
