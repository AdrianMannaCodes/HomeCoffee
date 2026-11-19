// HomeCoffee Setup Assistant: six-step first-run wizard in classic Aqua style. Browser only.
// Steps: Welcome & Region, Keyboard & Input, Network & Proxy, User Account, Environment / Target, Default Package (ChessBox focus).
// Choices are stored in localStorage under hc.setup.* and never sent anywhere.
(function () {
  'use strict';
  var KEY = 'hc.setup.v1';
  var DONE_KEY = 'hc.setup.done';
  var REGIONS = [
    { id: 'en', label: 'English', tz: 'Asia/Kolkata' },
    { id: 'ru', label: 'Русский', tz: 'Asia/Kolkata' },
    { id: 'eo', label: 'Esperanto', tz: 'Asia/Kolkata' },
    { id: 'yz', label: 'Yezik', tz: 'Asia/Kolkata' }
  ];
  var KEYBOARDS = ['US English', 'Russian (ЙЦУКЕН)', 'Esperanto (Ux)', 'Yezik (custom)'];
  var TARGETS = [
    { id: 'ipad8', label: 'iPad 8 (4:3, 1024 x 768)', note: 'Browser on the iPad, Aqua at 4:3.' },
    { id: 'utm', label: 'UTM (virtual machine)', note: 'Runs in UTM on a Mac, 16:9 or 16:10.' },
    { id: 'g4', label: 'Infinite Mac PowerPC G4', note: 'Mac OS X 10.1 to 10.4 in Infinite Mac. The Aqua page needs a modern browser.' }
  ];
  var PACKAGES = [
    { id: 'chessbox', label: 'ChessBox (inspect and customize packages)' },
    { id: 'pabari', label: 'Pabari (web browser)' },
    { id: 'konsol', label: 'Konsol (terminal)' },
    { id: 'none', label: 'Nothing for now' }
  ];
  var STEPS = ['Welcome & Region', 'Keyboard & Input', 'Network & Proxy', 'User Account', 'Environment / Target', 'Default Package'];

  function store() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ } }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var state = Object.assign({
    step: 0, region: 'en', tz: 'Asia/Kolkata', keyboard: 'US English',
    proxy: false, proxyHost: '', proxyPort: '', proxyNote: '',
    account: '', fullName: '', avatar: 0, password: '',
    target: 'ipad8', pkg: 'chessbox'
  }, store());
  state.step = 0;

  var AVATARS = ['#3d8bfd', '#f5c518', '#ff7a1a', '#7bc96f', '#b07cf0', '#e0605a'];
  var root, body, nextBtn, backBtn, stepLabel, bar;

  function validate(step) {
    if (step === 2 && state.proxy) {
      if (!state.proxyHost.trim()) return 'Enter the proxy host.';
      var p = parseInt(state.proxyPort, 10);
      if (!(p > 0 && p < 65536)) return 'Enter a port between 1 and 65535.';
    }
    if (step === 3) {
      if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(state.account)) return 'Account name: lowercase letters, digits, - or _, starting with a letter.';
      if (state.password.length < 4) return 'Password must be at least 4 characters.';
    }
    return '';
  }

  function radio(name, value, label, checked, onPick) {
    var lab = mk('label', 'sa-opt');
    var inp = mk('input'); inp.type = 'radio'; inp.name = name; inp.value = value; inp.checked = checked;
    inp.addEventListener('change', onPick);
    lab.appendChild(inp); lab.appendChild(document.createTextNode(' ' + label));
    return lab;
  }

  var pages = [
    function welcome(el) {
      el.appendChild(mk('p', 'sa-lead', 'Welcome to HomeCoffee 1.0. This assistant sets up your language, keyboard, network, account, and target.'));
      el.appendChild(mk('p', 'sa-h', 'Language'));
      REGIONS.forEach(function (r) {
        el.appendChild(radio('region', r.id, r.label, state.region === r.id, function () { state.region = r.id; state.tz = r.tz; }));
      });
      el.appendChild(mk('p', 'sa-note', 'Time zone: ' + state.tz + ' (IST, UTC+05:30). Changing the language does not change the time zone.'));
    },
    function keyboard(el) {
      el.appendChild(mk('p', 'sa-lead', 'Choose the keyboard layout for typing in Aqua apps and Terminal.'));
      var sel = mk('select', 'aqua-field sa-select'); sel.setAttribute('aria-label', 'Keyboard layout');
      KEYBOARDS.forEach(function (k) { var o = mk('option', '', k); o.value = k; if (k === state.keyboard) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () { state.keyboard = sel.value; });
      el.appendChild(sel);
      el.appendChild(mk('p', 'sa-note', 'Layouts are recorded now. Applying them to the desktop is not implemented yet.'));
    },
    function network(el) {
      el.appendChild(mk('p', 'sa-lead', 'Connect through an edge proxy, for example an Indian edge proxy, or connect directly.'));
      var tog = mk('label', 'sa-opt'); var cb = mk('input'); cb.type = 'checkbox'; cb.checked = state.proxy;
      cb.addEventListener('change', function () { state.proxy = cb.checked; render(); });
      tog.appendChild(cb); tog.appendChild(document.createTextNode(' Use an edge proxy (Indian edge proxy toggle)'));
      el.appendChild(tog);
      if (state.proxy) {
        el.appendChild(field('Proxy host', 'proxyHost', 'text'));
        el.appendChild(field('Port', 'proxyPort', 'text'));
        el.appendChild(field('Note (optional, for example India edge)', 'proxyNote', 'text'));
      }
      el.appendChild(mk('p', 'sa-note', 'The proxy is saved as a setting only. It is not applied to the network yet.'));
    },
    function account(el) {
      el.appendChild(mk('p', 'sa-lead', 'Create the first user account.'));
      el.appendChild(field('Full name', 'fullName', 'text'));
      el.appendChild(field('Account name', 'account', 'text'));
      el.appendChild(field('Password', 'password', 'password'));
      el.appendChild(mk('p', 'sa-h', 'Picture'));
      var row = mk('div', 'sa-badges');
      AVATARS.forEach(function (c, i) {
        var b = mk('button', 'sa-badge' + (state.avatar === i ? ' sel' : ''));
        b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Picture ' + (i + 1));
        b.addEventListener('click', function () { state.avatar = i; render(); });
        row.appendChild(b);
      });
      el.appendChild(row);
      el.appendChild(mk('p', 'sa-note', 'The password is stored only in this browser. It is not a system password.'));
    },
    function target(el) {
      el.appendChild(mk('p', 'sa-lead', 'Pick where HomeCoffee will run.'));
      TARGETS.forEach(function (t) {
        el.appendChild(radio('target', t.id, t.label, state.target === t.id, function () { state.target = t.id; }));
        el.appendChild(mk('div', 'sa-sub', t.note));
      });
    },
    function pkg(el) {
      el.appendChild(mk('p', 'sa-lead', 'Choose the package to focus on first.'));
      PACKAGES.forEach(function (p) {
        el.appendChild(radio('pkg', p.id, p.label, state.pkg === p.id, function () { state.pkg = p.id; }));
      });
    }
  ];

  function field(label, key, type) {
    var wrap = mk('label', 'sa-field');
    wrap.appendChild(document.createTextNode(label));
    var inp = mk('input', 'aqua-field'); inp.type = type; inp.value = state[key] || ''; inp.autocomplete = 'off';
    inp.addEventListener('input', function () { state[key] = inp.value; save(state); });
    wrap.appendChild(inp);
    return wrap;
  }

  function render() {
    save(state);
    stepLabel.textContent = 'Step ' + (state.step + 1) + ' of ' + STEPS.length + ': ' + STEPS[state.step];
    body.innerHTML = '';
    pages[state.step](body);
    backBtn.disabled = state.step === 0;
    nextBtn.textContent = state.step === STEPS.length - 1 ? 'Finish' : 'Continue';
    bar.textContent = '';
    for (var i = 0; i < STEPS.length; i++) {
      var d = mk('span', 'sa-dot' + (i === state.step ? ' on' : (i < state.step ? ' done' : '')));
      bar.appendChild(d);
    }
    bar.setAttribute('aria-label', 'Progress');
  }

  function next() {
    var err = validate(state.step);
    var msg = root.querySelector('.sa-err');
    if (err) { msg.textContent = err; return; }
    msg.textContent = '';
    if (state.step === STEPS.length - 1) { finish(); return; }
    state.step++;
    render();
  }

  function finish() {
    save(state);
    try { localStorage.setItem(DONE_KEY, new Date().toISOString()); } catch (e) { /* storage unavailable */ }
    root.innerHTML = '';
    root.appendChild(mk('div', 'sa-done'));
    root.firstChild.appendChild(mk('p', 'sa-h', 'Setup is complete.'));
    root.firstChild.appendChild(mk('p', 'sa-lead', 'Account: ' + (state.account || 'not set') + '. Target: ' + state.target + '. Package focus: ' + state.pkg + '.'));
    if (window.RedStarApps && window.RedStarApps.applyLang) window.RedStarApps.applyLang(state.region);
  }

  function build() {
    var win = mk('section', 'window sa-window');
    win.id = 'setup-window';
    win.style.cssText = 'left:120px;top:60px;width:560px;height:420px;display:none;';
    win.innerHTML =
      '<div class="titlebar"><div class="lights"><span class="light close"></span><span class="light minimize"></span><span class="light zoom"></span></div><div class="title">Setup Assistant</div></div>' +
      '<div class="sa-head"><div class="sa-step"></div><div class="sa-bar"></div></div>' +
      '<div class="sa-body"></div>' +
      '<div class="sa-foot"><span class="sa-err"></span><button class="aqua-btn sa-back">Go Back</button><button class="aqua-btn sa-next">Continue</button></div>';
    document.getElementById('stage').appendChild(win);
    root = win;
    body = win.querySelector('.sa-body'); stepLabel = win.querySelector('.sa-step'); bar = win.querySelector('.sa-bar');
    nextBtn = win.querySelector('.sa-next'); backBtn = win.querySelector('.sa-back');
    nextBtn.addEventListener('click', next);
    backBtn.addEventListener('click', function () { if (state.step > 0) { state.step--; root.querySelector('.sa-err').textContent = ''; render(); } });
    win.querySelector('.light.close').addEventListener('click', function (e) { e.stopPropagation(); win.style.display = 'none'; });
    win.querySelector('.light.minimize').addEventListener('click', function (e) { e.stopPropagation(); win.style.display = 'none'; });
    if (window.RedStarWM && window.RedStarWM.hide) window.RedStarWM.hide(win);
    render();
    return win;
  }

  function openFromDock() {
    var win = document.getElementById('setup-window');
    if (!win) return;
    if (window.RedStarWM) window.RedStarWM.show(win); else win.style.display = '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('stage')) return;
    build();
    var dock = document.getElementById('dock');
    if (dock) {
      var item = mk('div', 'dock-item dock-setup'); item.setAttribute('data-app', 'setup-window'); item.title = 'Setup Assistant';
      item.appendChild(mk('span', '', 'Setup'));
      dock.insertBefore(item, dock.querySelector('.dock-collab'));
      item.addEventListener('click', openFromDock);
    }
  });

  window.HomeSetup = { state: state, open: openFromDock, reset: function () { try { localStorage.removeItem(KEY); localStorage.removeItem(DONE_KEY); } catch (e) {} } };
})();
