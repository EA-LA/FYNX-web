/* Shared local arithmetic for the standalone page and calculator dashboard. */
(function (root) {
  /* Exact decimal arithmetic with BigInt fractions, so large integers and decimals never pick up binary
   * floating-point errors (99999999999999999 + 1 is exact; 0.1 + 0.2 is exactly 0.3).
   *
   * Percent convention (the common calculator one):
   *   a + b%  → a + a × b/100      200 + 5% = 210
   *   a − b%  → a − a × b/100      200 − 5% = 190
   *   a × b%  → a × b/100          200 × 5% = 10
   *   a ÷ b%  → a ÷ (b/100)        200 ÷ 5% = 4000
   *   b% on its own → b/100        5% = 0.05
   * A percent applies to the running total only when it directly follows + or −.
   * Non-terminating results (1 ÷ 3) are rounded to 14 significant digits. */
  const LIMIT = 10n ** 308n;
  const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
  function frac(p, q = 1n) {
    if (q === 0n) throw Error('Cannot divide by zero.');
    if (q < 0n) { p = -p; q = -q; }
    const g = gcd(p, q); p /= g; q /= g;
    if ((p < 0n ? -p : p) > LIMIT * q) throw Error('The result is outside the supported range.');
    return {p, q};
  }
  const add = (a, b) => frac(a.p * b.q + b.p * a.q, a.q * b.q);
  const sub = (a, b) => frac(a.p * b.q - b.p * a.q, a.q * b.q);
  const mul = (a, b) => frac(a.p * b.p, a.q * b.q);
  const div = (a, b) => { if (b.p === 0n) throw Error('Cannot divide by zero.'); return frac(a.p * b.q, a.q * b.p); };
  const HUNDRED = {p: 100n, q: 1n};
  function literal(text) {
    const m = text.match(/^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    const whole = m[1] || '', fraction = m[2] || '', exp = m[3] ? Number(m[3]) : 0;
    if (!Number.isFinite(exp) || Math.abs(exp) > 308) throw Error('The result is outside the supported range.');
    let p = BigInt((whole + fraction) || '0'), q = 10n ** BigInt(fraction.length);
    if (exp > 0) p *= 10n ** BigInt(exp); else if (exp < 0) q *= 10n ** BigInt(-exp);
    return frac(p, q);
  }
  function format(r, sig = 14) {
    if (r.p === 0n) return '0';
    const neg = r.p < 0n, p = neg ? -r.p : r.p;
    let q = r.q, twos = 0, fives = 0;
    while (q % 2n === 0n) { q /= 2n; twos++; }
    while (q % 5n === 0n) { q /= 5n; fives++; }
    let out;
    if (q === 1n && Math.max(twos, fives) <= 60) {
      // Terminating decimal: exact.
      const k = Math.max(twos, fives), scaled = p * 10n ** BigInt(k) / r.q, digits = scaled.toString().padStart(k + 1, '0');
      out = k ? (digits.slice(0, -k) + '.' + digits.slice(-k)).replace(/\.?0+$/, '') : digits;
    } else {
      // Round half up to `sig` significant digits.
      const intDigits = (p / r.q).toString().length, lead = p >= r.q ? intDigits : -(r.q.toString().length - p.toString().length) + 1;
      let shift = sig - lead; let scaled;
      for (;;) {
        scaled = shift >= 0 ? (p * 10n ** BigInt(shift) * 2n + r.q) / (2n * r.q) : (p * 2n + r.q * 10n ** BigInt(-shift)) / (2n * r.q * 10n ** BigInt(-shift));
        if (scaled.toString().length > sig) { shift--; continue; }
        if (scaled.toString().length < sig && scaled !== 0n) { shift++; continue; }
        break;
      }
      const digits = scaled.toString();
      if (shift <= 0) out = digits + '0'.repeat(-shift);
      else { const padded = digits.padStart(shift + 1, '0'); out = (padded.slice(0, -shift) + '.' + padded.slice(-shift)).replace(/\.?0+$/, ''); }
    }
    if (out.replace('.', '').replace(/^0+/, '').length > 40 || out.length > 44) {
      // Very long results: scientific notation with 15 significant digits.
      if (!out.includes('.')) {
        // Large integers: round the exact digits to 15 significant figures (no binary rounding).
        let m = (BigInt(out.slice(0, 16)) + 5n) / 10n, e = out.length - 1;
        if (m.toString().length > 15) { m /= 10n; e++; }
        const md = m.toString().replace(/0+$/, '');
        return (neg ? '-' : '') + md[0] + (md.length > 1 ? '.' + md.slice(1) : '') + 'e+' + e;
      }
      const n = Number(neg ? '-' + out : out); return n.toExponential(14).replace(/\.?0+e/, 'e');
    }
    return (neg ? '-' : '') + out;
  }
  function evaluateExact(source) {
    const input = String(source).replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replace(/\s/g, '');
    if (!input || input.length > 200) throw Error('Enter an expression of up to 200 characters.');
    let cursor = 0;
    function value() {
      let result, pct = false;
      if (input[cursor] === '+' || input[cursor] === '-') {
        const sign = input[cursor++] === '-' ? -1n : 1n, v = value();
        return {r: frac(sign * v.r.p, v.r.q), pct: v.pct};
      }
      if (input[cursor] === '(') {
        cursor++; result = sum().r;
        if (input[cursor++] !== ')') throw Error('Close the parentheses.');
      } else {
        const number = input.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
        if (!number) throw Error('Check the numbers and operators.');
        cursor += number[0].length; result = literal(number[0]);
      }
      while (input[cursor] === '%') { cursor++; result = div(result, HUNDRED); pct = true; }
      return {r: result, pct};
    }
    function product() {
      let first = value(), result = first.r, factors = 1;
      while (input[cursor] === '*' || input[cursor] === '/') {
        const operator = input[cursor++], right = value().r; factors++;
        result = operator === '*' ? mul(result, right) : div(result, right);
      }
      return {r: result, pct: factors === 1 && first.pct};
    }
    function sum() {
      let result = product().r;
      while (input[cursor] === '+' || input[cursor] === '-') {
        const operator = input[cursor++], term = product();
        const right = term.pct ? mul(result, term.r) : term.r; // a ± b% → a ± a×b/100
        result = operator === '+' ? add(result, right) : sub(result, right);
      }
      return {r: result};
    }
    const result = sum().r;
    if (cursor !== input.length) throw Error('Check the numbers and operators.');
    return format(result);
  }
  function evaluate(source) { const n = Number(evaluateExact(source)); return Object.is(n, -0) ? 0 : n; }
  if (typeof module !== 'undefined' && module.exports) module.exports = { evaluate, evaluateExact };
  root.FynxBasicCalc = { evaluate, evaluateExact };
  if (!root.document) return;
  for (const host of root.document.querySelectorAll('[data-basic-calculator]')) {
    const display = host.querySelector('[data-calc-display]'), grid = host.querySelector('[data-calc-grid]');
    let expression = '', completed = false;
    const keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '(', ')', '0', '.', '='];
    function press(key) {
      if (key === 'C') { expression = ''; completed = false; }
      else if (key === '⌫') { expression = expression.slice(0, -1); completed = false; }
      else if (key === '=') {
        try { expression = evaluateExact(expression || '0'); completed = true; }
        catch (error) { display.textContent = error.message; expression = ''; completed = false; return; }
      } else {
        if (completed && /^[\d.(]$/.test(key)) expression = '';
        completed = false;
        if (expression.length < 200) expression += key;
      }
      display.textContent = expression || '0';
    }
    grid.replaceChildren();
    for (const key of keys) {
      const button = root.document.createElement('button');
      button.type = 'button'; button.className = 'calc-btn' + (key === '=' ? ' eq' : /[÷×+%\-]/.test(key) ? ' op' : '');
      button.textContent = key;
      button.setAttribute('aria-label', ({C:'Clear', '⌫':'Backspace', '÷':'Divide', '×':'Multiply', '%':'Percent', '=':'Equals', '(':'Open parenthesis', ')':'Close parenthesis'})[key] || key);
      button.addEventListener('click', () => press(key)); grid.append(button);
    }
    host.addEventListener('keydown', event => {
      if (event.target.matches('button') && ['Enter', ' '].includes(event.key)) return;
      const key = ({Enter:'=', Escape:'C', Backspace:'⌫', '*':'×', '/':'÷'})[event.key] || event.key;
      if (keys.includes(key)) { event.preventDefault(); press(key); }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
