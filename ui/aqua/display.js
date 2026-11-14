// Dynamic resolution and aspect-ratio controller for the Aqua desktop.
// Pure functions (no DOM) so they can be tested. Presets cover iPad 8 landscape and portrait (4:3, 3:4), and Mac mini (16:9, 16:10).
'use strict';
var PRESETS = {
  ipad8:   { label: 'iPad 8 (4:3)',           width: 1024, height: 768,  ratio: '4:3' },
  ipad8p:  { label: 'iPad 8 Portrait (3:4)',  width: 768,  height: 1024, ratio: '3:4' },
  ipad8r:  { label: 'iPad 8 Retina 2x',       width: 2048, height: 1536, ratio: '4:3' },
  mac169:  { label: 'Mac mini (16:9)',        width: 1920, height: 1080, ratio: '16:9' },
  mac1610: { label: 'Mac mini (16:10)',       width: 1680, height: 1050, ratio: '16:10' },
};

// Returns the layout that fits (or fills) the source logical size into the viewport, preserving aspect ratio.
// mode: 'fit' (letterbox) or 'fill' (crop). devicePixelRatio sets the backing store; logical layout is unchanged.
function computeLayout(viewport, preset, opts) {
  opts = opts || {};
  var dpr = opts.devicePixelRatio || 1;
  var mode = opts.mode || 'fit';
  var sx = viewport.width / preset.width, sy = viewport.height / preset.height;
  var scale = mode === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy);
  var drawW = Math.round(preset.width * scale), drawH = Math.round(preset.height * scale);
  return {
    scale: Math.round(scale * 1000) / 1000,
    logicalWidth: preset.width,
    logicalHeight: preset.height,
    cssWidth: drawW,
    cssHeight: drawH,
    offsetX: Math.round((viewport.width - drawW) / 2),
    offsetY: Math.round((viewport.height - drawH) / 2),
    backingWidth: Math.round(preset.width * dpr),
    backingHeight: Math.round(preset.height * dpr),
    dpr: dpr,
  };
}

// Reduce width/height to a ratio string, e.g. 1024x768 -> "4:3".
function ratioOf(w, h) {
  var gcd = function (a, b) { return b ? gcd(b, a % b) : a; };
  var g = gcd(w, h);
  return (w / g) + ':' + (h / g);
}

// Choose the preset whose aspect ratio is closest to the viewport (portrait viewports get the portrait preset).
function bestPreset(viewport) {
  var target = viewport.width / viewport.height;
  var best = null, bestDiff = Infinity;
  Object.keys(PRESETS).forEach(function (key) {
    var p = PRESETS[key];
    var diff = Math.abs(p.width / p.height - target);
    if (diff < bestDiff) { bestDiff = diff; best = key; }
  });
  return best;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PRESETS: PRESETS, computeLayout: computeLayout, ratioOf: ratioOf, bestPreset: bestPreset };
