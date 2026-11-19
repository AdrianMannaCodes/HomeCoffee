// Infinite Mac: Aqua window that embeds the Macintosh G4 (PowerPC) emulator from https://infinitemac.org/. Loads on first open. Browser only.
(function () {
  'use strict';
  var stage = document.getElementById('stage');
  var WM = window.RedStarWM;
  if (!stage || !WM) return;
  var root = document.documentElement;
  var ORIGIN = 'https://infinitemac.org/embed';
  // Disk image mounted via disk_url. Hosted on archive.org (an Infinite Mac supported disk site); uploaded by the nightly workflow (item homecoffee-infinitemac).
  var DISK_URL = 'https://archive.org/download/homecoffee-infinitemac/HomeCoffee-InfiniteMac.img';
  var MACHINE = 'Power Macintosh G4 (PCI Graphics)';
  var TITLE = 'Macintosh G4';
  var LOAD_TIMEOUT = 15000;
  var SANDBOX = 'allow-scripts allow-forms allow-popups allow-pointer-lock allow-downloads';
  var DOCK_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="imcase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#b8bcc4"/></linearGradient></defs><rect x="8" y="8" width="48" height="38" rx="5" fill="url(#imcase)" stroke="#6b7180"/><rect x="13" y="13" width="38" height="27" rx="2" fill="#3b6fb6"/><rect x="13" y="13" width="38" height="27" rx="2" fill="#ffffff" opacity="0.12"/><rect x="26" y="46" width="12" height="5" fill="#9aa1ad"/><rect x="18" y="51" width="28" height="4" rx="2" fill="#6b7180"/></svg>';

  var st = { loaded: false, timer: null };
  var ui = {};

  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function scale() { return parseFloat(getComputedStyle(root).getPropertyValue('--display-scale')) || 1; }

  // Builds the embed URL with search params.
  function buildEmbedUrl() {
    var params = new URLSearchParams();
    params.set('machine', MACHINE);
    params.set('disk_url', DISK_URL);
    return ORIGIN + '?' + params.toString();
  }

  function setStatus(t) { ui.status.textContent = t; }
  function showFallback(show) {
    ui.fallback.hidden = !show;
    if (show) { ui.fbLink.href = ORIGIN; ui.fbLink.textContent = 'Open ' + ORIGIN + ' in a new tab'; }
  }

  // Lazy load: the emulator starts the first time the window is opened.
  function loadEmulator() {
    if (st.loaded) return;
    st.loaded = true;
    showFallback(false);
    ui.frame.setAttribute('sandbox', SANDBOX);
    ui.frame.setAttribute('allow', 'fullscreen; cross-origin-isolated');
    ui.frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    ui.frame.src = buildEmbedUrl();
    setStatus('Starting ' + TITLE + '...');
    clearTimeout(st.timer);
    st.timer = setTimeout(function () {
      setStatus('No response from ' + ORIGIN + '.');
      showFallback(true);
    }, LOAD_TIMEOUT);
  }

  function onFrameLoad() {
    clearTimeout(st.timer);
    showFallback(false);
    setStatus('Running. Click inside the window to use the keyboard and mouse.');
  }

  function openWindow() {
    loadEmulator();
    WM.show(ui.win);
  }

  function buildWindow() {
    var win = mk('section', 'window infinitemac-window');
    win.id = 'infinitemac-window';
    win.style.cssText = 'left:120px;top:60px;width:720px;height:540px;display:none;';
    win.innerHTML =
      '<div class="titlebar infinitemac-titlebar"><div class="lights"><span class="light close"></span><span class="light minimize"></span><span class="light zoom"></span></div><div class="title">' + TITLE + '</div></div>' +
      '<div class="infinitemac-view">' +
        '<iframe id="im-frame" class="infinitemac-frame" title="' + TITLE + ' emulator" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
        '<div class="infinitemac-fallback" id="im-fallback" hidden><div class="infinitemac-fb-box">' +
          '<div class="infinitemac-fb-h">This emulator cannot be shown here</div>' +
          '<p>The site may refuse to open inside another window, or the network may block it. Open it in a new tab instead.</p>' +
          '<a id="im-fb-link" class="infinitemac-pill" target="_blank" rel="noopener noreferrer"></a>' +
        '</div></div>' +
      '</div>' +
      '<div class="fs-status infinitemac-status" id="im-status"></div>';
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
      win: win,
      frame: win.querySelector('#im-frame'),
      status: win.querySelector('#im-status'),
      fallback: win.querySelector('#im-fallback'),
      fbLink: win.querySelector('#im-fb-link')
    };
    ui.frame.addEventListener('load', function () { if (st.loaded && ui.frame.getAttribute('src')) onFrameLoad(); });

    var dock = document.getElementById('dock');
    if (dock) {
      var item = mk('div', 'dock-item dock-infinitemac');
      item.setAttribute('data-app', 'infinitemac-window');
      item.title = TITLE;
      item.innerHTML = DOCK_ICON + '<span>' + TITLE + '</span>';
      dock.insertBefore(item, dock.querySelector('.dock-collab'));
      item.addEventListener('click', function () {
        if (win.style.display === 'none') openWindow(); else WM.focus(win);
      });
    }

    var panel = document.getElementById('app-menu');
    if (panel) {
      var b = mk('button', '', TITLE);
      b.addEventListener('click', function () {
        panel.style.display = 'none';
        var t = document.getElementById('menu-apps');
        if (t) t.classList.remove('open');
        openWindow();
      });
      panel.appendChild(b);
    }

    WM.hide(win);
  }
  boot();
})();
