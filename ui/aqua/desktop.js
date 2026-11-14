// Desktop bootstrap: applies display.js layout to #stage and handles preset selection. Browser only.
(function () {
  var stage = document.getElementById('stage');
  var root = document.documentElement;
  function viewport() { return { width: window.innerWidth, height: window.innerHeight }; }
  function apply(presetKey, mode) {
    var preset = PRESETS[presetKey] || PRESETS[bestPreset(viewport())];
    var layout = computeLayout(viewport(), preset, { devicePixelRatio: window.devicePixelRatio || 1, mode: mode || 'fit' });
    stage.style.width = preset.width + 'px';
    stage.style.height = preset.height + 'px';
    root.style.setProperty('--display-scale', String(layout.scale));
    stage.style.left = layout.offsetX + 'px';
    stage.style.top = layout.offsetY + 'px';
    root.setAttribute('data-preset', presetKey);
    root.setAttribute('data-ratio', preset.ratio);
  }
  var q = new URLSearchParams(location.search);
  apply(q.get('display') || bestPreset(viewport()), q.get('fit') || 'fit');
  window.addEventListener('resize', function () { apply(root.getAttribute('data-preset'), q.get('fit') || 'fit'); });
  window.RedStarDisplay = { apply: apply, presets: PRESETS };
})();

// Window manager: drag by titlebar, focus stacking, close and minimize via the traffic lights, and dock toggling.
// Works on every .window in the stage (Finder, Konsol, Notes, Settings, and the Home app windows).
(function () {
  var stage = document.getElementById('stage');
  if (!stage) return;
  var root = document.documentElement;
  var topZ = 100;

  // Stage is CSS-scaled, so pointer deltas are divided by the current display scale.
  function scale() { return parseFloat(getComputedStyle(root).getPropertyValue('--display-scale')) || 1; }

  function windows() { return Array.prototype.slice.call(document.querySelectorAll('.window')); }

  function focusWin(win) {
    topZ += 1;
    win.style.zIndex = String(topZ);
    windows().forEach(function (w) { w.classList.toggle('inactive', w !== win); });
    document.querySelectorAll('[data-app]').forEach(function (d) {
      d.classList.toggle('active', d.getAttribute('data-app') === win.id && win.style.display !== 'none');
    });
  }

  function hide(win) {
    win.style.display = 'none';
    syncDock();
  }

  function show(win) {
    win.style.display = '';
    focusWin(win);
    syncDock();
  }

  function syncDock() {
    document.querySelectorAll('[data-app]').forEach(function (d) {
      var w = document.getElementById(d.getAttribute('data-app'));
      d.classList.toggle('running', !!w && w.style.display !== 'none');
    });
  }

  windows().forEach(function (win) {
    var bar = win.querySelector('.titlebar');
    win.addEventListener('pointerdown', function () { focusWin(win); }, true);
    var closeBtn = win.querySelector('.light.close');
    var minBtn = win.querySelector('.light.minimize');
    if (closeBtn) closeBtn.addEventListener('click', function (e) { e.stopPropagation(); hide(win); });
    if (minBtn) minBtn.addEventListener('click', function (e) { e.stopPropagation(); hide(win); });
    if (!bar) return;
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.light')) return;
      var s = scale();
      var startX = e.clientX, startY = e.clientY;
      var origL = win.offsetLeft, origT = win.offsetTop;
      function move(ev) {
        win.style.left = Math.max(0, origL + (ev.clientX - startX) / s) + 'px';
        win.style.top = Math.max(22, origT + (ev.clientY - startY) / s) + 'px';
      }
      function up() {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
      }
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
  });

  // Dock items with data-app toggle their window: hidden or minimized windows reappear, visible ones take focus.
  document.querySelectorAll('[data-app]').forEach(function (d) {
    d.addEventListener('click', function () {
      var win = document.getElementById(d.getAttribute('data-app'));
      if (!win) return;
      if (win.style.display === 'none') show(win); else focusWin(win);
    });
  });

  // Initial focus: the last window in the DOM that is visible.
  var visible = windows().filter(function (w) { return w.style.display !== 'none'; });
  if (visible.length) focusWin(visible[visible.length - 1]);
  syncDock();
  window.RedStarWM = { show: show, hide: hide, focus: focusWin };
})();
