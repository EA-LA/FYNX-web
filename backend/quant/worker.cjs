'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { historyBacktest, historyOptimize } = require('./worker-history.cjs');
async function run() {
  try {
    const engine = require('./engine.cjs'); const p = workerData.payload || {}; let result;
    let lastProgressAt = 0; const progress = (value, total) => { const fraction = typeof value === 'object' ? (value.progress ?? value.completed / value.total * 100) : total ? value / total * 100 : value <= 1 ? value * 100 : value; if (Date.now() - lastProgressAt < 100 && fraction < 100) return; lastProgressAt = Date.now(); parentPort.postMessage({ type: 'progress', progress: fraction }); };
    switch (workerData.operation) {
      case 'backtest': result = engine.backtest(p.bars, p.params); break;
      case 'backtest-history': result = await historyBacktest(engine, p, progress); break;
      case 'optimize-history': result = await historyOptimize(engine, p, progress); break;
      case 'optimize': result = engine.optimize(p.bars, p.params, p.options, progress); break;
      case 'portfolio': result = engine.portfolio(p.sleeves, p.options); break;
      case 'montecarlo': result = engine.monteCarlo(p.returns, p.options, progress); break;
      case 'ftmo': result = engine.ftmo(p.returns, p.options, progress); break;
      case 'event-study': result = engine.eventStudy(p.bars, p.events, p.options); break;
      default: throw new Error('Unknown calculation.');
    }
    parentPort.postMessage({ type: 'result', result });
  } catch (error) { parentPort.postMessage({ type: 'error', message: error.code === 'MODULE_NOT_FOUND' ? 'Build the Quant engine before starting this service.' : String(error.message || 'Calculation failed.').slice(0, 500) }); }
}
run();
