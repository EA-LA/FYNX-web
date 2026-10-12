/* Shared local arithmetic for the standalone page and calculator dashboard. */
(function (root) {
  function evaluate(source) {
    const input = String(source).replaceAll('×', '*').replaceAll('÷', '/').replace(/\s/g, '');
    if (!input || input.length > 200) throw Error('Enter an expression of up to 200 characters.');
    let cursor = 0;
    const finite = value => { if (!Number.isFinite(value)) throw Error('The result is outside the supported range.'); return value; };
    function value() {
      let result;
      if (input[cursor] === '+' || input[cursor] === '-') {
        const sign = input[cursor++] === '-' ? -1 : 1;
        return finite(sign * value());
      }
      if (input[cursor] === '(') {
        cursor++; result = sum();
        if (input[cursor++] !== ')') throw Error('Close the parentheses.');
      } else {
        const number = input.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
        if (!number) throw Error('Check the numbers and operators.');
        cursor += number[0].length; result = finite(Number(number[0]));
      }
      while (input[cursor] === '%') { cursor++; result /= 100; }
      return finite(result);
    }
    function product() {
      let result = value();
      while (input[cursor] === '*' || input[cursor] === '/') {
        const operator = input[cursor++], right = value();
        if (operator === '/' && right === 0) throw Error('Cannot divide by zero.');
        result = finite(operator === '*' ? result * right : result / right);
      }
      return result;
    }
    function sum() {
      let result = product();
      while (input[cursor] === '+' || input[cursor] === '-') {
        const operator = input[cursor++], right = product();
        result = finite(operator === '+' ? result + right : result - right);
      }
      return result;
    }
    const result = sum();
    if (cursor !== input.length) throw Error('Check the numbers and operators.');
    return Object.is(result, -0) ? 0 : Number(result.toPrecision(14));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { evaluate };
  if (!root.document) return;
  for (const host of root.document.querySelectorAll('[data-basic-calculator]')) {
    const display = host.querySelector('[data-calc-display]'), grid = host.querySelector('[data-calc-grid]');
    let expression = '', completed = false;
    const keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '(', ')', '0', '.', '='];
    function press(key) {
      if (key === 'C') { expression = ''; completed = false; }
      else if (key === '⌫') { expression = expression.slice(0, -1); completed = false; }
      else if (key === '=') {
        try { expression = String(evaluate(expression || '0')); completed = true; }
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
