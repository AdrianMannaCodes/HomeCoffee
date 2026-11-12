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
