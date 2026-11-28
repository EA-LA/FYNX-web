'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/sentiment-feed.js'), 'utf8');
const fixedNow = Date.parse('2026-11-15T04:30:00Z');
const stamp = iso => String(Math.floor(Date.parse(iso) / 1000));
const entry = (date, score, label = 'Neutral') => ({timestamp: stamp(date), value: score, value_classification: label});

function setup(responses, options = {}) {
  const elements = {};
  const create = tag => ({
    tag, children: [], textContent: '', attributes: {},
    append(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    removeAttribute(name) { delete this.attributes[name]; if (name === 'value') this.value = undefined; }
  });
  for (const id of ['sentimentStatus','sentimentRefresh','sentimentHistory','sentimentValue','sentimentClass','sentimentMeter'])
    elements[id] = create('div');
  const clicks = [];
  elements.sentimentRefresh.addEventListener = (type, fn) => { if (type === 'click') clicks.push(fn); };
  let calls = 0;
  const feed = async () => {
    const response = responses[calls++];
    if (response instanceof Error) throw response;
    if (typeof response === 'function') return response();
    return {ok: response?.ok ?? true, json: async () => response};
  };
  vm.runInNewContext(source, {
    document: {getElementById: id => elements[id], createElement: create},
    fetch: feed, AbortSignal: {}, AbortController: options.noController ? undefined : AbortController,
    setTimeout: options.setTimeout || setTimeout, clearTimeout: options.clearTimeout || clearTimeout, window: {},
    Date: class extends Date { static now() { return fixedNow; } },
    Number, Array, Set, String, Error
  }, {filename: 'sentiment-feed.js'});
  const settle = () => new Promise(resolve => setImmediate(() => setImmediate(resolve)));
  const rendered = () => elements.sentimentHistory.children.map(row => row.children.map(cell => cell.textContent));
  return {elements, clicks, settle, rendered, calls: () => calls};
}

(async () => {
  let n = 0;
  function check(name, fn) { fn(); n++; console.log('PASS ' + name); }

  const a = setup([{data: [
    entry('2026-11-12T00:00:00Z','30','Fear'),
    entry('2026-11-15T00:00:00Z','70','Greed'),
    entry('2026-11-13T00:00:00Z','45','Fear')
  ]}]);
  await a.settle();
  check('newest timestamp selected despite unsorted feed', () => assert.equal(a.elements.sentimentValue.textContent,'70 / 100'));
  check('classification matches latest observation', () => assert.equal(a.elements.sentimentClass.textContent,'Greed'));
  check('source date stays UTC in US Pacific timezone', () => assert.match(a.elements.sentimentStatus.textContent,/2026-11-15 UTC/));
  check('history sorted newest first', () => assert.deepEqual(a.rendered().map(row => row[0]),['2026-11-15','2026-11-13','2026-11-12']));
  check('refresh enabled after success', () => assert.equal(a.elements.sentimentRefresh.disabled,false));

  const b = setup([{data: [
    entry('2099-01-01T00:00:00Z','100','Extreme Greed'),
    entry('2026-11-14T00:00:00Z','20','Fear'),
    entry('2026-11-13T00:00:00Z',' ','Neutral'),
    entry('2026-11-14T00:00:00Z','20','Fear'),
    entry('2026-11-12T00:00:00Z','101','Extreme Greed'),
    entry('2026-11-11T00:00:00Z','12','')
  ]}]);
  await b.settle();
  check('future observation cannot become latest', () => assert.equal(b.elements.sentimentValue.textContent,'20 / 100'));
  check('duplicate report timestamps removed', () => assert.equal(b.rendered().length,1));
  check('blank, out-of-range and unlabeled records removed', () => assert.deepEqual(b.rendered(),[['2026-11-14','20','Fear']]));

  const c = setup([{data: [entry('2026-10-01T00:00:00Z',8,'Extreme Fear')]}]);
  await c.settle();
  check('old observation clearly marked', () => assert.match(c.elements.sentimentStatus.textContent,/Older observation/));

  const d = setup([{data: [entry('2099-01-01T00:00:00Z',99)]}]);
  await d.settle();
  check('invalid feed shows unavailable rather than a score', () => assert.equal(d.elements.sentimentValue.textContent,'Unavailable'));
  check('invalid feed clears gauge and history', () => {
    assert.equal(d.elements.sentimentMeter.value,undefined);
    assert.equal(d.rendered().length,0);
  });

  const e = setup([new Error('offline'), {data:[entry('2026-11-14T00:00:00Z',52,'Neutral')]}]);
  await e.settle();
  check('network failure has visible error', () => assert.match(e.elements.sentimentStatus.textContent,/unavailable/));
  await e.clicks[0]();
  check('retry restores a valid score', () => assert.equal(e.elements.sentimentValue.textContent,'52 / 100'));
  check('retry re-enables button', () => assert.equal(e.elements.sentimentRefresh.disabled,false));

  const f = setup([{data:[entry('2026-11-14T00:00:00Z',42,'Fear')]}], {noController:true});
  await f.settle();
  check('legacy browser without abort APIs can load verified data', () => assert.equal(f.elements.sentimentValue.textContent,'42 / 100'));

  let expire, finishBody, clears = 0;
  const g = setup([
    () => ({ok:true, json: () => new Promise(resolve => { finishBody = resolve; })}),
    {data:[entry('2026-11-14T00:00:00Z',55)]}
  ], {
    noController:true,
    setTimeout(fn, delay) { assert.equal(delay,15000); expire=fn; return 1; },
    clearTimeout() { clears++; }
  });
  await g.settle();
  check('stalled body leaves refresh disabled only during active request', () => assert.equal(g.elements.sentimentRefresh.disabled,true));
  expire();
  await g.settle();
  check('deadline releases refresh even without AbortController', () => {
    assert.equal(g.elements.sentimentRefresh.disabled,false);
    assert.match(g.elements.sentimentStatus.textContent,/unavailable/);
    assert.equal(clears,1);
  });
  await g.clicks[0]();
  finishBody({data:[entry('2026-11-15T00:00:00Z',99)]});
  await g.settle();
  check('late timed-out body cannot replace recovered observation', () => {
    assert.equal(g.elements.sentimentValue.textContent,'55 / 100');
    assert.equal(clears,2);
  });

  const h = setup([
    {data:[entry('2026-11-15T00:00:00Z',70,'Greed'),entry('2026-11-14T00:00:00Z',50)]},
    {data:[entry('2026-11-14T00:00:00Z',50)]},
    new Error('offline'),
    {data:[entry('2026-11-15T00:00:00Z',71,'Greed')]}
  ]);
  await h.settle();
  await h.clicks[0]();
  check('older refresh retains latest verified score and history with explicit status', () => {
    assert.equal(h.elements.sentimentValue.textContent,'70 / 100');
    assert.equal(h.elements.sentimentClass.textContent,'Greed');
    assert.equal(h.elements.sentimentMeter.value,70);
    assert.equal(h.rendered().length,2);
    assert.match(h.elements.sentimentStatus.textContent,/older report.*2026-11-15 UTC/);
    assert.equal(h.elements.sentimentRefresh.disabled,false);
  });
  await h.clicks[0]();
  check('network failure retains prior verified observation with explicit status', () => {
    assert.equal(h.elements.sentimentValue.textContent,'70 / 100');
    assert.equal(h.rendered().length,2);
    assert.match(h.elements.sentimentStatus.textContent,/refresh failed.*2026-11-15 UTC/);
    assert.equal(h.elements.sentimentRefresh.disabled,false);
  });
  await h.clicks[0]();
  check('same-date corrected score restores normal status', () => {
    assert.equal(h.elements.sentimentValue.textContent,'71 / 100');
    assert.match(h.elements.sentimentStatus.textContent,/^Observation:/);
  });

  console.log('RESULT ' + n + ' checks passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
