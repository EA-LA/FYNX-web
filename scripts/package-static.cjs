// Publish browser assets only. The Firebase backend is deployed separately.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const directories = ['api', 'assets', 'auth', 'home', 'learn', 'markets', 'news', 'resources', 'tools'];
for (const dir of directories) fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
for (const file of fs.readdirSync(root, { withFileTypes: true })) {
  if (file.isFile() && (/\.(html|css|js|png|ico|svg|xml)$/.test(file.name) || file.name === 'robots.txt')) {
    fs.copyFileSync(path.join(root, file.name), path.join(out, file.name));
  }
}
for (const file of ['index.html', 'api/index.html', 'api/api.js', 'api/api.css', 'api/workspace.js', 'api/examples/quickstart.mjs']) {
  if (!fs.existsSync(path.join(out, file))) throw new Error(`Missing published asset: ${file}`);
}
for (const privatePath of ['backend', 'docs', 'ops', 'scripts', 'node_modules', '.git']) {
  if (fs.existsSync(path.join(out, privatePath))) throw new Error(`Non-public directory in output: ${privatePath}`);
}
console.log('Packaged static website in dist; Firebase server source is excluded.');
