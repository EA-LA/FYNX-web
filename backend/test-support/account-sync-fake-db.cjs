"use strict";
const clone = value => value === undefined ? undefined : structuredClone(value);
class FakeDB {
  constructor() { this.data = new Map(); this.queue = Promise.resolve(); this.queryLog = []; }
  collection(path) { return new Query(this, path); }
  seed(path, value) { this.data.set(path, clone(value)); return this; }
  read(path) { return clone(this.data.get(path)); }
  async recursiveDelete(ref) { for (const key of this.data.keys()) if (key === ref.path || key.startsWith(ref.path + "/")) this.data.delete(key); }
  async runTransaction(fn) {
    const prior = this.queue; let unlock; this.queue = new Promise(resolve => { unlock = resolve; }); await prior;
    const writes = [];
    const tx = {
      get: async ref => { if (writes.length) throw new Error("Firestore transaction read after write"); return ref.get(); },
      set: (ref, value, options = {}) => writes.push(() => this.data.set(ref.path, clone(options.merge ? { ...this.data.get(ref.path), ...value } : value))),
      delete: ref => writes.push(() => this.data.delete(ref.path))
    };
    try { const result = await fn(tx); for (const write of writes) write(); return result; } finally { unlock(); }
  }
}
class Ref {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split("/").at(-1); }
  collection(path) { return new Query(this.db, `${this.path}/${path}`); }
  async get() { const value = this.db.read(this.path); return { id: this.id, exists: value !== undefined, data: () => clone(value), ref: this }; }
  async set(value, options = {}) { this.db.seed(this.path, options.merge ? { ...this.db.read(this.path), ...value } : value); }
  async delete() { this.db.data.delete(this.path); }
}
const fieldValue = (object, field) => field.split(".").reduce((value, key) => value?.[key], object);
class Query {
  constructor(db, path, filters = [], count = Infinity, after = null, orders = [], onlyIDs = false) { Object.assign(this, { db, path, filters, count, after, orders, onlyIDs }); }
  doc(id) { return new Ref(this.db, `${this.path}/${id}`); }
  where(field, operator, value) { return new Query(this.db, this.path, [...this.filters, { field, operator, value }], this.count, this.after, this.orders, this.onlyIDs); }
  limit(count) { return new Query(this.db, this.path, this.filters, count, this.after, this.orders, this.onlyIDs); }
  orderBy(field, direction = "asc") { return new Query(this.db, this.path, this.filters, this.count, this.after, [...this.orders, { field, direction }], this.onlyIDs); }
  startAfter(after) { return new Query(this.db, this.path, this.filters, this.count, typeof after === 'string' ? after : after.id, this.orders, this.onlyIDs); }
  select() { return new Query(this.db, this.path, this.filters, this.count, this.after, this.orders, true); }
  async get() {
    const paths = [...this.db.data.keys()].filter(path => path.startsWith(this.path + "/") && path.split("/").length === this.path.split("/").length + 1).sort();
    const filtered = paths.filter(path => (!this.after || path.split("/").at(-1) > this.after) && this.filters.every(({ field, operator, value }) => {
      const current = fieldValue(this.db.read(path), field);
      switch (operator) { case "==": return current === value; case ">": return current > value; case ">=": return current >= value; case "<": return current < value; case "<=": return current <= value; default: throw new Error(`Unsupported query operator ${operator}`); }
    })).sort((a, b) => {
      for (const { field, direction } of this.orders) {
        const av = field === '__name__' ? a.split('/').at(-1) : fieldValue(this.db.read(a), field), bv = field === '__name__' ? b.split('/').at(-1) : fieldValue(this.db.read(b), field);
        if (av < bv) return direction === "desc" ? 1 : -1;
        if (av > bv) return direction === "desc" ? -1 : 1;
      }
      return a.localeCompare(b);
    }).slice(0, this.count);
    const docs = await Promise.all(filtered.map(path => this.onlyIDs ? {id:path.split('/').at(-1),exists:true,data:()=>({}),ref:new Ref(this.db,path)} : new Ref(this.db, path).get())); this.db.queryLog.push({path:this.path,limit:this.count,after:this.after,onlyIDs:this.onlyIDs,returned:docs.length});return { docs, size: docs.length };
  }
}
module.exports = { FakeDB };
