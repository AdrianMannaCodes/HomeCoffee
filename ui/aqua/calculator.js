// Calculator: Aqua desk calculator (basic arithmetic, sign, percent, keyboard input). Browser only.
(function () {
  'use strict';
  var win = document.getElementById('calc-window');
  var disp = document.getElementById('calc-display');
  var keys = document.getElementById('calc-keys');
  if (!win || !disp || !keys) return;

  var ROWS = [
    ['C', '\u00b1', '%', '\u00f7'],
    ['7', '8', '9', '\u00d7'],
    ['4', '5', '6', '\u2212'],
    ['1', '2', '3', '+'],
    ['0', '.', '=']
  ];
  var OPS = { '\u00f7': 1, '\u00d7': 1, '\u2212': 1, '+': 1 };
  var acc = null, op = null, cur = '0', fresh = true;

  function show() { disp.textContent = cur; }
  function clearAll() { acc = null; op = null; cur = '0'; fresh = true; show(); }
  function fmt(n) {
    if (!isFinite(n)) return 'Error';
    return String(parseFloat(n.toPrecision(12)));
  }
  function compute(a, b, o) {
    if (o === '+') return a + b;
    if (o === '\u2212') return a - b;
    if (o === '\u00d7') return a * b;
    if (o === '\u00f7') return b === 0 ? NaN : a / b;
    return b;
  }
  function digit(d) {
    if (fresh) { cur = d === '.' ? '0.' : d; fresh = false; }
    else if (d === '.') { if (cur.indexOf('.') < 0) cur += '.'; }
    else cur = (cur === '0') ? d : cur + d;
    show();
  }
  function operate(next) {
    var v = parseFloat(cur);
    if (acc === null) acc = v;
    else if (op && !fresh) { acc = compute(acc, v, op); cur = fmt(acc); show(); }
    op = next; fresh = true;
  }
  function equals() {
    if (op === null || acc === null) return;
    var r = compute(acc, parseFloat(cur), op);
    cur = fmt(r); show();
    acc = null; op = null; fresh = true;
  }
  function percent() { cur = fmt(parseFloat(cur) / 100); fresh = false; show(); }
  function sign() {
    if (cur === '0' || cur === 'Error') return;
    cur = cur.charAt(0) === '\u2212' || cur.charAt(0) === '-' ? cur.slice(1) : '\u2212' + cur;
    show();
  }

  function press(label) {
    if (cur === 'Error' && label !== 'C') clearAll();
    if (label === 'C') return clearAll();
    if (label === '\u00b1') return sign();
    if (label === '%') return percent();
    if (label === '=') return equals();
    if (OPS[label]) return operate(label);
    digit(label);
  }

  // Build the keypad. The 0 key spans two columns.
  ROWS.forEach(function (row) {
    row.forEach(function (label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = 'calc-key';
      if (OPS[label] || label === '=') b.classList.add('calc-op');
      else if (label === 'C' || label === '\u00b1' || label === '%') b.classList.add('calc-fn');
      if (label === '0') b.classList.add('calc-zero');
      b.setAttribute('aria-label', label);
      b.addEventListener('click', function () { press(label); });
      keys.appendChild(b);
    });
  });

  // Keyboard: digits, . + - * / Enter = Backspace Escape. Ignored while typing in a field or when hidden.
  var KEYMAP = { '+': '+', '-': '\u2212', '*': '\u00d7', '/': '\u00f7', 'Enter': '=', '=': '=', 'Escape': 'C', '%': '%' };
  document.addEventListener('keydown', function (e) {
    if (win.style.display === 'none') return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); return; }
    if (e.key === '.' || e.key === ',') { e.preventDefault(); press('.'); return; }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (!fresh && cur !== 'Error') {
        cur = cur.length > 1 ? cur.slice(0, -1) : '0';
        if (cur === '\u2212' || cur === '') cur = '0';
        show();
      }
      return;
    }
    if (KEYMAP[e.key]) { e.preventDefault(); press(KEYMAP[e.key]); }
  });

  show();
  window.RedStarCalc = { press: press, clear: clearAll };
})();
