'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const crypto = require('node:crypto');
const { fail, hash } = require('./common.cjs');
const OPERATIONS = new Set(['backtest', 'optimize', 'portfolio', 'montecarlo', 'ftmo', 'event-study', 'backtest-history', 'optimize-history']);
class JobQueue {
  constructor({ concurrency = 2, maxQueued = 12, ttl = 15 * 60000, timeout = 120000, workerPath = path.join(__dirname, 'worker.cjs'), now = () => Date.now() } = {}) { this.concurrency = concurrency; this.maxQueued = maxQueued; this.ttl = ttl; this.timeout = timeout; this.workerPath = workerPath; this.now = now; this.jobs = new Map(); this.cache = new Map(); this.waiting = []; this.active = new Set(); this.resultBytes = 0; this.maxResultBytes = 64 * 1024 ** 2; this.maxCacheBytes = 128 * 1024 ** 2; }
  submit(operation, payload) {
    this.cleanup(); if (!OPERATIONS.has(operation)) throw fail('Unknown calculation.');
    const serialized = JSON.stringify(payload); if (Buffer.byteLength(serialized) > 12000000) throw fail('Calculation payload exceeds 12 MB.', 413);
    const key = hash([operation, payload]); const cached = this.cache.get(key); if (cached && this.jobs.has(cached)) return this.public(this.jobs.get(cached));
    if (this.waiting.length >= this.maxQueued || this.jobs.size >= 80) throw fail('Calculation queue is full. Retry shortly.', 429, 'QUEUE_FULL');
    const jobId = crypto.randomBytes(24).toString('base64url'); const job = { jobId, operation, payload, key, status: 'queued', progress: 0, createdAt: this.now() }; this.jobs.set(jobId, job); this.waiting.push(job); this.pump(); return this.public(job);
  }
  public(job) { return { jobId: job.jobId, status: job.status, progress: job.progress, ...(job.status === 'complete' ? { result: job.result } : {}), ...(job.error ? { error: job.error } : {}), createdAt: new Date(job.createdAt).toISOString() }; }
  get(id) { this.cleanup(); const job = this.jobs.get(id); if (!job) throw fail('Calculation job expired or does not exist.', 404, 'JOB_NOT_FOUND'); return this.public(job); }
  cleanup() { const now = this.now(); for (const [id, job] of this.jobs) if (['complete', 'failed'].includes(job.status) && now - (job.finishedAt || job.createdAt) > this.ttl) { this.jobs.delete(id); this.resultBytes -= job.resultBytes || 0; if (this.cache.get(job.key) === id) this.cache.delete(job.key); } }
  pump() {
    while (this.active.size < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift(); job.status = 'running';
      const worker = new Worker(this.workerPath, { workerData: { operation: job.operation, payload: job.payload }, resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 8 } }); this.active.add(worker); job.worker = worker;
      const timer = setTimeout(() => { job.error = 'Calculation exceeded its time limit; reduce the history or simulation size.'; worker.terminate(); }, job.operation.endsWith('-history') ? Math.max(this.timeout, Number(process.env.QUANT_HISTORY_JOB_TIMEOUT_MS || 3600000)) : this.timeout);
      worker.on('message', message => { if (job.status === 'failed') return; if (message.type === 'progress') job.progress = Math.max(job.progress, Math.min(99, Number(message.progress) || 0)); if (message.type === 'result') { const bytes = Buffer.byteLength(JSON.stringify(message.result)); if (bytes > this.maxResultBytes) { job.error = 'Calculation result exceeds the 64 MB response limit. Narrow the date range.'; return; } for (const [id, old] of this.jobs) { if (this.resultBytes + bytes <= this.maxCacheBytes) break; if (id !== job.jobId && old.status === 'complete') { this.resultBytes -= old.resultBytes || 0; this.jobs.delete(id); if (this.cache.get(old.key) === id) this.cache.delete(old.key); } } job.resultBytes = bytes; this.resultBytes += bytes; job.result = message.result; job.progress = 100; job.status = 'complete'; job.finishedAt = this.now(); this.cache.set(job.key, job.jobId); } if (message.type === 'error') job.error = message.message; });
      worker.on('error', () => { job.error = 'Calculation worker failed. Reduce the input size or retry.'; });
      worker.on('exit', () => { clearTimeout(timer); this.active.delete(worker); delete job.payload; delete job.worker; if (job.status !== 'complete') { job.status = 'failed'; job.finishedAt = this.now(); job.error ||= 'Calculation did not finish.'; } this.pump(); });
    }
  }
  cancel(id) { const job = this.jobs.get(id); if (!job) throw fail('Calculation job expired or does not exist.', 404); if (job.status === 'complete' || job.status === 'failed') return this.public(job); job.status = 'failed'; job.error = 'Calculation cancelled.'; job.finishedAt = this.now(); this.waiting = this.waiting.filter(j => j.jobId !== id); if (job.worker) job.worker.terminate(); else delete job.payload; return this.public(job); }
  async close() { this.waiting.length = 0; await Promise.all([...this.active].map(w => w.terminate())); }
}
module.exports = { JobQueue, OPERATIONS };
