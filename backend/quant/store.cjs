'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const util = require('node:util');
const crypto = require('node:crypto');
const { dataDir, fail, hash } = require('./common.cjs');
const gzip = util.promisify(zlib.gzip), gunzip = util.promisify(zlib.gunzip);
class Store {
  constructor(root = dataDir()) { this.root = root; this.locks = new Map(); }
  file(key) { if (!/^[a-zA-Z0-9/_-]+$/.test(key) || key.includes('..')) throw fail('Invalid storage key.'); return path.join(this.root, key + '.json.gz'); }
  async read(key) { try { return JSON.parse((await gunzip(await fs.readFile(this.file(key)))).toString()); } catch (e) { if (e.code === 'ENOENT') return null; throw fail('Stored data could not be read; refresh the affected partition.', 503, 'STORAGE_CORRUPT'); } }
  async write(key, value) { const file = this.file(key); await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); const temp = file + '.' + crypto.randomUUID() + '.tmp'; const bytes = await gzip(JSON.stringify(value)); await fs.writeFile(temp, bytes, { mode: 0o600 }); await fs.rename(temp, file); return bytes.length; }
  async update(key, change) { const previous = this.locks.get(key) || Promise.resolve(); const task = previous.catch(() => {}).then(async () => { const value = await change(await this.read(key)); await this.write(key, value); return value; }); this.locks.set(key, task); try { return await task; } finally { if (this.locks.get(key) === task) this.locks.delete(key); } }
  async diskGuard(minFree = Number(process.env.QUANT_MIN_FREE_BYTES || 3 * 1024 ** 3)) { await fs.mkdir(this.root, { recursive: true, mode: 0o700 }); const stat = await fs.statfs(this.root); if (stat.bavail * stat.bsize < minFree) throw fail('Historical download paused: the configured free-disk reserve would be exceeded.', 507, 'DISK_RESERVE'); }
  async list(prefix) { const base = path.dirname(this.file(prefix + '/placeholder')); const result = []; async function visit(dir) { let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; } for (const entry of entries) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await visit(file); else if (file.endsWith('.json.gz')) result.push(file); } } await visit(base); return result.map(file => path.relative(this.root, file).slice(0, -8)); }
  async userRead(uid, type) { return (await this.read(`users/${hash(uid)}/${type}`)) || { items: [], updatedAt: null }; }
  async userSave(uid, type, item) { return this.update(`users/${hash(uid)}/${type}`, old => { const items = old?.items || []; const index = items.findIndex(x => x.id === item.id); if (index < 0 && items.length >= 100) throw fail('Save limit reached (100 items).', 409); if (index < 0) items.push(item); else items[index] = item; return { items, updatedAt: new Date().toISOString() }; }); }
  async userDelete(uid, type, id) { return this.update(`users/${hash(uid)}/${type}`, old => ({ items: (old?.items || []).filter(x => x.id !== id), updatedAt: new Date().toISOString() })); }
}
module.exports = { Store };
