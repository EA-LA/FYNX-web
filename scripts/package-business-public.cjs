// Creates an isolated Firebase source bundle so deployment touches only these services.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'output', 'business-public');
const functions = path.join(out, 'functions');
fs.mkdirSync(functions, { recursive: true });
for (const name of ['business-public.cjs', 'package-lock.json']) {
  fs.copyFileSync(path.join(root, 'backend', name), path.join(functions, name));
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'package.json')));
pkg.main = 'index.js';
delete pkg.scripts;
fs.writeFileSync(path.join(functions, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(functions, 'index.js'), "'use strict';\nrequire('firebase-admin').initializeApp();\nconst services = require('./business-public.cjs');\nfor (const name of ['webWaitlist', 'webProfileSharing', 'webSharedProfile']) exports[name] = services[name];\n");
fs.writeFileSync(path.join(out, 'firebase.json'), JSON.stringify({ functions: { source: 'functions', runtime: 'nodejs22' } }, null, 2) + '\n');
console.log(`Prepared ${out}`);
console.log('Install with npm ci in its functions directory, then deploy from the bundle directory:');
console.log('firebase deploy --project fynx-c7a28 --only functions:webWaitlist,functions:webProfileSharing,functions:webSharedProfile');
