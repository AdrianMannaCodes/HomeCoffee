// Bin: the living Trash pet for the Aqua desktop. Has a happiness meter (starts at 75%), mood faces, chatter, feeding, and drag-to-eat. Browser only.
(function () {
  'use strict';
  var stage = document.getElementById('stage');
  var WM = window.RedStarWM;
  if (!stage || !WM) return;
  var DEFAULT_HAPPY = 75;
  var KEY = 'hc.bin.state';
  var DECAY_EVERY_MS = 10 * 60 * 1000;
  var CHATTER_EVERY_MS = 45 * 1000;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var state = load();
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s.happy !== 'number') s = { happy: DEFAULT_HAPPY, fed: 0, eaten: 0, petted: 0, stamp: Date.now() };
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }

  // Idle decay: happiness slowly drifts down one point per interval while nobody interacts. Never below 0.
  function applyDecay() {
    var now = Date.now();
    var steps = Math.floor((now - state.stamp) / DECAY_EVERY_MS);
    if (steps > 0) { state.happy = clamp(state.happy - steps, 0, 100); state.stamp += steps * DECAY_EVERY_MS; save(); }
  }

  function mood() {
    if (state.happy >= 70) return 'happy';
    if (state.happy >= 40) return 'content';
    return 'grumpy';
  }

  var LINES = {
    happy: ['Hi! Feed me your junk, I love it.', 'Thanks for stopping by!', 'Everything is tidy today.', 'I feel great!'],
    content: ['Hmm. Got anything for me?', 'Fine. I am fine.', 'Maybe pet me a little?'],
    grumpy: ['You never throw anything away anymore...', 'I am hungry. Feed me.', 'Nobody cares about the Bin.'],
    eat: ['Mmm, crunchy!', 'Nom nom. Tasty file.', 'Gulp. Got it.'],
    pet: ['Hee hee, that tickles.', 'Aww, more please.', 'Purr... I mean rattle.']
  };
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function faceSVG(m, open) {
    var mouth = open ? '<ellipse cx="32" cy="44" rx="7" ry="6" fill="#3a0d0d"/>'
      : m === 'happy' ? '<path d="M24 42 Q32 52 40 42" stroke="#3a0d0d" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : m === 'content' ? '<path d="M25 44 L39 44" stroke="#3a0d0d" stroke-width="3" stroke-linecap="round"/>'
      : '<path d="M24 48 Q32 40 40 48" stroke="#3a0d0d" stroke-width="3" fill="none" stroke-linecap="round"/>';
    var brows = m === 'grumpy' ? '<path d="M20 24 L28 28 M44 24 L36 28" stroke="#222" stroke-width="2.5" stroke-linecap="round"/>' : '';
    var eyes = m === 'happy' ? '<path d="M21 30 Q25 25 29 30 M35 30 Q39 25 43 30" stroke="#111" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
      : '<circle cx="25" cy="30" r="3" fill="#111"/><circle cx="39" cy="30" r="3" fill="#111"/>';
    return eyes + brows + mouth;
  }

  function binSVG(m, open, blink) {
    var lid = '<rect x="12" y="14" width="40" height="7" rx="3" fill="#8e99a6" stroke="#52606f"/>' +
      '<rect x="27" y="10" width="10" height="5" rx="2" fill="#6d7a88"/>';
    var body = '<path d="M15 21 L19 56 Q20 60 25 60 L39 60 Q44 60 45 56 L49 21 Z" fill="url(#binBody)" stroke="#4a5562" stroke-width="1.5"/>' +
      '<path d="M22 26 L25 54 M32 26 L32 54 M42 26 L39 54" stroke="#4a5562" stroke-opacity="0.45" stroke-width="1.2"/>';
    var face = '<g class="bin-face">' + (blink ? '<path d="M21 30 L29 30 M35 30 L43 30" stroke="#111" stroke-width="2.5"/>' : faceSVG(m, open)) + '</g>';
    var gloss = '<ellipse cx="25" cy="36" rx="2" ry="8" fill="#ffffff" opacity="0.5"/>';
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="binBody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9d2dc"/><stop offset="0.5" stop-color="#f4f7fb"/><stop offset="1" stop-color="#a9b5c3"/></linearGradient></defs>' + body + gloss + face + lid + '</svg>';
  }

  var bubbleTimer = null;
  var ui = {};

  function render(open, blink) {
    var m = mood();
    var svg = binSVG(m, !!open, !!blink);
    ui.dockIcon.innerHTML = svg;
    ui.winArt.innerHTML = svg;
    ui.meter.style.width = state.happy + '%';
    ui.meterLabel.textContent = 'Happiness: ' + state.happy + '% (' + m + ')';
    ui.stats.textContent = 'Fed ' + state.fed + ' time(s). Ate ' + state.eaten + ' file(s). Petted ' + state.petted + ' time(s).';
  }

  function say(text, ms) {
    ui.bubble.textContent = text;
    ui.bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { ui.bubble.classList.remove('show'); }, ms || 3200);
  }

  function setHappy(delta) {
    state.happy = clamp(state.happy + delta, 0, 100);
    state.stamp = Date.now();
    save();
    render(false, false);
  }

  function chew(kind) {
    var seq = [true, false, true, false, false];
    seq.forEach(function (open, i) {
      setTimeout(function () { render(open, false); }, i * 180);
    });
    ui.dockIcon.classList.add('bounce');
    setTimeout(function () { ui.dockIcon.classList.remove('bounce'); }, 700);
    say(pick(LINES[kind]));
  }

  function feed(source) {
    state.fed += 1;
    if (source === 'file') state.eaten += 1;
    setHappy(source === 'file' ? 5 : 8);
    chew('eat');
  }
  function pet() {
    state.petted += 1;
    setHappy(4);
    ui.dockIcon.classList.add('wiggle');
    setTimeout(function () { ui.dockIcon.classList.remove('wiggle'); }, 600);
    say(pick(LINES.pet));
  }

  // Idle behaviour: blink now and then, chatter by mood, and tiny happiness decay while nobody interacts.
  function startLife() {
    setInterval(function () {
      render(false, true);
      setTimeout(function () { render(false, false); }, 160);
    }, 3800);
    setInterval(function () {
      applyDecay();
      render(false, false);
      if (Math.random() < 0.6) say(pick(LINES[mood()]));
    }, CHATTER_EVERY_MS);
  }

  function buildDock() {
    var dock = document.getElementById('dock');
    if (!dock) return;
    var item = mk('div', 'dock-item dock-bin');
    item.id = 'dock-bin';
    item.title = 'Bin';
    item.innerHTML = '<div class="bin-dock-icon"></div><span>Bin</span>';
    dock.insertBefore(item, dock.querySelector('.dock-collab'));
    ui.dockItem = item;
    ui.dockIcon = item.querySelector('.bin-dock-icon');
    ui.bubble = mk('div', 'bin-bubble');
    item.appendChild(ui.bubble);

    item.addEventListener('click', function () {
      if (win.style.display === 'none') WM.show(win); else WM.focus(win);
    });
    item.addEventListener('mouseenter', function () { say(pick(LINES[mood()]), 2200); });

    // Drag files from Finder onto the Bin to feed it.
    item.addEventListener('dragover', function (e) {
      var types = e.dataTransfer ? Array.prototype.slice.call(e.dataTransfer.types || []) : [];
      if (types.indexOf('application/x-hc-path') >= 0) { e.preventDefault(); item.classList.add('drop-over'); }
    });
    item.addEventListener('dragleave', function () { item.classList.remove('drop-over'); });
    item.addEventListener('drop', function (e) {
      e.preventDefault();
      item.classList.remove('drop-over');
      var p = e.dataTransfer.getData('application/x-hc-path');
      if (p) feed('file');
    });

    // Right-click context menu on the dock Bin.
    item.addEventListener('contextmenu', function (e) { e.preventDefault(); showMenu(e.clientX, e.clientY); });
  }

  var menu = null;
  function showMenu(x, y) {
    if (!menu) {
      menu = mk('div', 'bin-menu');
      stage.appendChild(menu);
      document.addEventListener('pointerdown', function (e) { if (menu && !menu.contains(e.target)) menu.style.display = 'none'; });
    }
    menu.innerHTML = '';
    var items = [['Feed Bin', function () { feed('snack'); }], ['Pet Bin', pet], ['Say hello', function () { say(pick(LINES[mood()])); }], ['Open Bin', function () { WM.show(win); }]];
    items.forEach(function (it) {
      var b = mk('button', '', it[0]);
      b.addEventListener('click', function () { menu.style.display = 'none'; it[1](); });
      menu.appendChild(b);
    });
    var r = stage.getBoundingClientRect();
    menu.style.left = clamp(x - r.left, 0, 180) + 'px';
    menu.style.top = clamp(y - r.top - 120, 22, 400) + 'px';
    menu.style.display = 'block';
  }

  var win = null;
  function buildWindow() {
    win = mk('section', 'window bin-window');
    win.id = 'bin-window';
    win.style.cssText = 'left:520px;top:110px;width:300px;height:360px;display:none;';
    win.innerHTML =
      '<div class="titlebar"><div class="lights"><span class="light close"></span><span class="light minimize"></span><span class="light zoom"></span></div><div class="title">Bin</div></div>' +
      '<div class="bin-body">' +
        '<div class="bin-stage"><div class="bin-art" id="bin-art"></div><div class="bin-bubble" id="bin-bubble-win"></div></div>' +
        '<div class="bin-meter-label" id="bin-meter-label"></div>' +
        '<div class="bin-meter"><div class="bin-meter-fill" id="bin-meter-fill"></div></div>' +
        '<div class="bin-btns"><button class="pill" id="bin-feed">Feed</button><button class="pill" id="bin-pet">Pet</button></div>' +
        '<div class="bin-stats" id="bin-stats"></div>' +
        '<div class="bin-tip">Drag files from Finder onto the Bin in the Dock to feed it.</div>' +
      '</div>';
    stage.appendChild(win);
    win.addEventListener('pointerdown', function () { WM.focus(win); }, true);
    var hideBtn = function (e) { e.stopPropagation(); WM.hide(win); };
    win.querySelector('.light.close').addEventListener('click', hideBtn);
    win.querySelector('.light.minimize').addEventListener('click', hideBtn);
    ui.winArt = win.querySelector('#bin-art');
    ui.meter = win.querySelector('#bin-meter-fill');
    ui.meterLabel = win.querySelector('#bin-meter-label');
    ui.stats = win.querySelector('#bin-stats');
    win.querySelector('#bin-feed').addEventListener('click', function () { feed('snack'); });
    win.querySelector('#bin-pet').addEventListener('click', pet);
    ui.winArt.addEventListener('click', pet);
    ui.winBubble = win.querySelector('#bin-bubble-win');
    ui.winArt.addEventListener('mouseenter', function () { say(pick(LINES[mood()]), 2200); });
  }

  function boot() {
    var link = mk('link'); link.rel = 'stylesheet'; link.href = 'bin.css';
    document.head.appendChild(link);
    buildWindow();
    buildDock();
    applyDecay();
    render(false, false);
    startLife();
    say(state.happy >= 70 ? 'Hi! Happy to see you.' : 'Hello.', 4000);
    WM.hide(win);
  }
  boot();
})();
