// Pabari: Aqua web browser window. Browser only. Pages load in an iframe; external sites that refuse framing get a fallback message.
(function () {
  'use strict';
  var stage = document.getElementById('stage');
  var WM = window.RedStarWM;
  if (!stage || !WM) return;
  var root = document.documentElement;
  var HOME = 'about:home';
  var LOAD_TIMEOUT = 10000;
  var SB_LOCAL = 'allow-scripts allow-same-origin allow-forms allow-popups';
  var SB_EXT = 'allow-scripts allow-forms allow-popups';
  var BOOKMARKS = [
    ['HomeCoffee', '/'],
    ['Collab Room', '../home/index.html'],
    ['Wikipedia', 'https://en.wikipedia.org/'],
    ['Example', 'https://example.com/']
  ];
  var DOCK_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="pbg" cx="50%" cy="35%" r="65%"><stop offset="0" stop-color="#9fd3ff"/><stop offset="0.6" stop-color="#2f74d0"/><stop offset="1" stop-color="#0b2d66"/></radialGradient><linearGradient id="pbn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b5a"/><stop offset="1" stop-color="#b3201a"/></linearGradient></defs><circle cx="32" cy="32" r="29" fill="url(#pbg)" stroke="#ffffff" stroke-opacity="0.6" stroke-width="2"/><circle cx="32" cy="32" r="23" fill="none" stroke="#ffffff" stroke-opacity="0.35"/><polygon points="32,10 37,32 32,54 27,32" fill="url(#pbn)" transform="rotate(35 32 32)"/><polygon points="32,10 37,32 32,54 27,32" fill="#f4f7fb" transform="rotate(215 32 32)" opacity="0.9"/><circle cx="32" cy="32" r="3" fill="#0b2d66"/><ellipse cx="32" cy="16" rx="20" ry="11" fill="#ffffff" opacity="0.28"/></svg>';

  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function scale() { return parseFloat(getComputedStyle(root).getPropertyValue('--display-scale')) || 1; }
  function isExternal(u) { return /^https?:\/\//i.test(u); }
  function normalize(raw) {
    var u = String(raw || '').trim();
    if (!u) return null;
    if (u === HOME || /^(about:|\/|\.\/|\.\.\/)/i.test(u) || isExternal(u)) return u;
    return 'https://' + u;
  }
  function homeHTML() {
    var links = BOOKMARKS.map(function (b) { return '<a href="' + b[1] + '">' + b[0] + '</a>'; }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:14px "Lucida Grande",system-ui,sans-serif;background:linear-gradient(#1b3b6b,#0b1a33);color:#e8f1ff}' +
      'h1{font-weight:normal;font-size:28px;margin:0 0 14px}.l{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}' +
      'a{color:#fff;background:linear-gradient(#8fc1ff,#2f6fd0);padding:6px 16px;border-radius:999px;text-decoration:none;border:1px solid #1d4c99}' +
      '</style></head><body><div style="text-align:center"><h1>Pabari</h1><div class="l">' + links + '</div></div></body></html>';
  }

  var st = { stack: [], idx: -1, url: HOME, timer: null };
  var ui = {};

  function setStatus(t) { ui.status.textContent = t; }
  function showFallback(url, show) {
    ui.fallback.hidden = !show;
    if (show) { ui.fbLink.href = url; ui.fbLink.textContent = 'Open ' + url + ' in a new tab'; }
  }
  function syncNav() {
    ui.back.disabled = st.idx <= 0;
    ui.fwd.disabled = st.idx >= st.stack.length - 1;
  }

  function load(raw, record) {
    var u = normalize(raw);
    if (!u) return;
    st.url = u;
    if (record !== false) {
      st.stack = st.stack.slice(0, st.idx + 1);
      st.stack.push(u);
      st.idx = st.stack.length - 1;
    }
    syncNav();
    ui.url.value = u === HOME ? '' : u;
    clearTimeout(st.timer);
    showFallback(u, false);
    if (u === HOME) {
      ui.frame.removeAttribute('src');
      ui.frame.setAttribute('sandbox', 'allow-forms');
      ui.frame.srcdoc = homeHTML();
      setStatus('Home');
      return;
    }
    var external = isExternal(u);
    ui.frame.removeAttribute('srcdoc');
    ui.frame.setAttribute('sandbox', external ? SB_EXT : SB_LOCAL);
    ui.frame.src = u;
    setStatus(external ? 'Loading ' + u + '...' : 'Opening ' + u + '...');
    st.timer = setTimeout(function () {
      setStatus('No response from ' + u + '.');
      if (external) showFallback(u, true);
    }, LOAD_TIMEOUT);
  }

  function onFrameLoad() {
    clearTimeout(st.timer);
    if (st.url === HOME) { setStatus('Home'); return; }
    if (isExternal(st.url)) {
      setStatus('Loaded. If the page is blank, the site does not allow display inside another window. Use the address link to open it in a new tab.');
      return;
    }
    try {
      var loc = ui.frame.contentWindow.location.href;
      if (loc && loc !== 'about:blank') { st.url = loc; ui.url.value = loc; }
    } catch (e) { /* cross-origin: keep the typed address */ }
    setStatus('Done');
  }

  function buildWindow() {
    var win = mk('section', 'window pabari-window');
    win.id = 'pabari-window';
    win.style.cssText = 'left:90px;top:70px;width:760px;height:520px;display:none;';
    win.innerHTML =
      '<div class="titlebar pabari-titlebar"><div class="lights"><span class="light close"></span><span class="light minimize"></span><span class="light zoom"></span></div><div class="title">Pabari</div></div>' +
      '<div class="pabari-nav">' +
        '<div class="pabari-group"><button class="pabari-pill" id="pb-back" aria-label="Back" disabled>Back</button><button class="pabari-pill" id="pb-fwd" aria-label="Forward" disabled>Forward</button></div>' +
        '<button class="pabari-pill" id="pb-refresh" aria-label="Refresh">Refresh</button>' +
        '<button class="pabari-pill" id="pb-home" aria-label="Home">Home</button>' +
        '<div class="pabari-field"><input id="pb-url" class="pabari-url" spellcheck="false" autocomplete="off" placeholder="Enter an address or a page on this device" aria-label="Address"></div>' +
        '<button class="pabari-pill" id="pb-go" aria-label="Go">Go</button>' +
      '</div>' +
      '<div class="pabari-bookmarks" id="pb-bm"><span class="pabari-bm-label">Bookmarks</span></div>' +
      '<div class="pabari-view">' +
        '<iframe id="pb-frame" class="pabari-frame" title="Web page"></iframe>' +
        '<div class="pabari-fallback" id="pb-fallback" hidden><div class="pabari-fb-box">' +
          '<div class="pabari-fb-h">This page cannot be shown here</div>' +
          '<p>Many websites refuse to open inside another window, because their security settings block framing. Open the page in a new tab instead.</p>' +
          '<a id="pb-fb-link" class="pabari-pill pabari-fb-link" target="_blank" rel="noopener noreferrer"></a>' +
        '</div></div>' +
      '</div>' +
      '<div class="fs-status pabari-status" id="pb-status"></div>';
    stage.appendChild(win);
    return win;
  }

  function wireWindow(win) {
    win.addEventListener('pointerdown', function () { WM.focus(win); }, true);
    var hideBtn = function (e) { e.stopPropagation(); WM.hide(win); };
    win.querySelector('.light.close').addEventListener('click', hideBtn);
    win.querySelector('.light.minimize').addEventListener('click', hideBtn);
    var bar = win.querySelector('.titlebar');
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.light')) return;
      var s = scale(), sx = e.clientX, sy = e.clientY, ol = win.offsetLeft, ot = win.offsetTop;
      function mv(ev) { win.style.left = Math.max(0, ol + (ev.clientX - sx) / s) + 'px'; win.style.top = Math.max(22, ot + (ev.clientY - sy) / s) + 'px'; }
      function up() { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); }
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
  }

  function boot() {
    var win = buildWindow();
    wireWindow(win);
    ui = {
      back: win.querySelector('#pb-back'), fwd: win.querySelector('#pb-fwd'),
      url: win.querySelector('#pb-url'), frame: win.querySelector('#pb-frame'),
      status: win.querySelector('#pb-status'), fallback: win.querySelector('#pb-fallback'),
      fbLink: win.querySelector('#pb-fb-link'), bm: win.querySelector('#pb-bm')
    };
    ui.frame.addEventListener('load', onFrameLoad);
    ui.back.addEventListener('click', function () { if (st.idx > 0) { st.idx--; load(st.stack[st.idx], false); } });
    ui.fwd.addEventListener('click', function () { if (st.idx < st.stack.length - 1) { st.idx++; load(st.stack[st.idx], false); } });
    win.querySelector('#pb-refresh').addEventListener('click', function () { load(st.url, false); });
    win.querySelector('#pb-home').addEventListener('click', function () { load(HOME); });
    win.querySelector('#pb-go').addEventListener('click', function () { load(ui.url.value); });
    ui.url.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(ui.url.value); });

    BOOKMARKS.forEach(function (b) {
      var btn = mk('button', 'pabari-pill pabari-bm', b[0]);
      btn.addEventListener('click', function () { load(b[1]); });
      ui.bm.appendChild(btn);
    });

    var dock = document.getElementById('dock');
    if (dock) {
      var item = mk('div', 'dock-item dock-pabari');
      item.setAttribute('data-app', 'pabari-window');
      item.title = 'Pabari';
      item.innerHTML = DOCK_ICON + '<span>Pabari</span>';
      dock.insertBefore(item, dock.querySelector('.dock-collab'));
      item.addEventListener('click', function () {
        if (win.style.display === 'none') WM.show(win); else WM.focus(win);
      });
    }

    var panel = document.getElementById('app-menu');
    if (panel) {
      var b = mk('button', '', 'Pabari');
      b.addEventListener('click', function () {
        panel.style.display = 'none';
        var t = document.getElementById('menu-apps');
        if (t) t.classList.remove('open');
        WM.show(win);
      });
      panel.appendChild(b);
    }

    load(HOME);
    WM.hide(win);
  }
  boot();
})();
