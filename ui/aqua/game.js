// Progressbar: BarOS mini-game. Catch falling segments with the bar to fill it to 100% on three levels. Vanilla JS on a canvas. Browser only.
(function () {
  'use strict';
  var win = document.getElementById('game-window');
  var canvas = document.getElementById('game-canvas');
  var newBtn = document.getElementById('game-new');
  if (!win || !canvas || !newBtn) return;

  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var BAR_W = 110, BAR_H = 14, BAR_Y = H - 34;
  var SEG_W = 48, SEG_H = 18;
  var LEVELS = 3;
  var HI_KEY = 'hc.game.hi';

  // Segment kinds. weight sets how often each one falls.
  var TYPES = {
    blue:   { fill: '#3d8bfd', edge: '#1f5fb5', weight: 45, label: '+5%' },
    yellow: { fill: '#f5c518', edge: '#a8760c', weight: 20, label: '+2%' },
    orange: { fill: '#ff7a1a', edge: '#a84a0c', weight: 25, label: '-8% HAZARD' },
    pink:   { fill: '#ff6fb5', edge: '#a0245f', weight: 10, label: '+100' }
  };
  var PROGRESS = { blue: 5, yellow: 2, orange: -8, pink: 0 };
  var SCORE = { blue: 10, yellow: 25, orange: 0, pink: 100 };
  var TONE = { blue: [660, 0.08], yellow: [880, 0.06], pink: [990, 0.1] };

  var state = newState();
  var running = false, raf = 0, lastT = 0;
  var keyLeft = false, keyRight = false;
  var segs = [], popups = [];
  var audioCtx = null;
  var hi = readHi();

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi2) { return Math.max(lo, Math.min(hi2, v)); }
  function newState() {
    return { progress: 0, lives: 3, score: 0, level: 1, bar: (W - BAR_W) / 2, spawnT: 0, over: false, won: false };
  }
  function speed() { return 90 + state.level * 24; }                 // falling speed in px per second
  function spawnEvery() { return Math.max(380, 900 - state.level * 90); } // milliseconds between spawns

  function readHi() {
    try { return parseInt(localStorage.getItem(HI_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function saveHi() {
    if (state.score > hi) {
      hi = state.score;
      try { localStorage.setItem(HI_KEY, String(hi)); } catch (e) { /* storage unavailable */ }
    }
  }

  // Sound: Web Audio, created on the first user gesture so browsers allow it.
  function ensureAudio() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { audioCtx = new AC(); } catch (e) { audioCtx = null; }
  }
  function tone(freq, dur) {
    if (!audioCtx) return;
    var now = audioCtx.currentTime;
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + dur);
  }
  function buzz() { tone(90, 0.25); }

  function setMsg(text) { var m = $('game-msg'); if (m) m.textContent = text || ''; }

  function start() {
    ensureAudio();
    state = newState();
    segs = []; popups = [];
    running = true;
    lastT = 0;
    setMsg('Level 1 of ' + LEVELS + ': catch blue, avoid orange.');
    hud();
  }

  function spawn() {
    var total = 0, k, r, pick = 'blue';
    for (k in TYPES) total += TYPES[k].weight;
    r = Math.random() * total;
    for (k in TYPES) { r -= TYPES[k].weight; if (r < 0) { pick = k; break; } }
    segs.push({ type: pick, x: Math.random() * (W - SEG_W), y: -SEG_H });
  }

  function popup(x, y, label, color) { popups.push({ x: x, y: y, label: label, color: color, t: 0 }); }

  function collect(type, x, y) {
    var s = state, T = TYPES[type];
    s.score += SCORE[type];
    s.progress = clamp(s.progress + PROGRESS[type], 0, 100);
    popup(x, y, T.label, T.fill);
    if (type === 'orange') { s.lives -= 1; buzz(); }
    else if (TONE[type]) tone(TONE[type][0], TONE[type][1]);
    if (s.lives <= 0) return endGame(false);
    if (s.progress >= 100) return levelUp();
  }

  function levelUp() {
    if (state.level >= LEVELS) return endGame(true);
    state.level += 1;
    state.progress = 0;
    segs = [];
    setMsg('Level ' + state.level + ' of ' + LEVELS + ': faster now.');
  }

  function endGame(won) {
    running = false;
    state.over = true;
    state.won = won;
    saveHi();
    setMsg(won ? 'You filled the last bar. Score ' + state.score + '.' : 'Game over. Score ' + state.score + '. Press New Game to try again.');
    hud();
  }

  function update(dt) {
    var s = state;
    var move = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    if (move) s.bar = clamp(s.bar + move * 420 * dt, 0, W - BAR_W);
    s.spawnT += dt * 1000;
    if (s.spawnT >= spawnEvery()) { s.spawnT = 0; spawn(); }
    for (var i = segs.length - 1; i >= 0; i--) {
      var g = segs[i];
      g.y += speed() * dt;
      if (g.y + SEG_H >= BAR_Y && g.y <= BAR_Y + BAR_H && g.x + SEG_W >= s.bar && g.x <= s.bar + BAR_W) {
        segs.splice(i, 1);
        collect(g.type, g.x, g.y);
        if (!running) return;
        continue;
      }
      if (g.y > H) segs.splice(i, 1);
    }
    for (var j = popups.length - 1; j >= 0; j--) {
      popups[j].t += dt;
      if (popups[j].t > 0.9) popups.splice(j, 1);
    }
  }

  // Canvas drawing helpers.
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawMeter() {
    rr(20, 14, W - 40, 22, 8);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#5c6578'; ctx.lineWidth = 1; ctx.stroke();
    var w = (W - 44) * (state.progress / 100);
    if (w > 0) {
      rr(22, 16, Math.max(w, 8), 18, 6);
      var g = ctx.createLinearGradient(0, 16, 0, 34);
      g.addColorStop(0, '#b9dcff'); g.addColorStop(0.5, '#5aa6fb'); g.addColorStop(0.52, '#2f7be0'); g.addColorStop(1, '#5ea9f7');
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.fillStyle = '#1d2430';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.floor(state.progress) + '%', W / 2, 30);
  }

  function drawSeg(g) {
    var T = TYPES[g.type];
    rr(g.x, g.y, SEG_W, SEG_H, 5);
    ctx.fillStyle = T.fill; ctx.fill();
    ctx.strokeStyle = T.edge; ctx.lineWidth = 1; ctx.stroke();
    rr(g.x + 2, g.y + 2, SEG_W - 4, SEG_H / 2 - 1, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
  }

  function drawPaddle() {
    rr(state.bar, BAR_Y, BAR_W, BAR_H, 7);
    var g = ctx.createLinearGradient(0, BAR_Y, 0, BAR_Y + BAR_H);
    g.addColorStop(0, '#b9dcff'); g.addColorStop(0.5, '#5aa6fb'); g.addColorStop(0.52, '#2f7be0'); g.addColorStop(1, '#5ea9f7');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#1f5fb5'; ctx.stroke();
  }

  function drawPopup(p) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / 0.9);
    ctx.fillStyle = p.color;
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x + SEG_W / 2, p.y - p.t * 40);
    ctx.globalAlpha = 1;
  }

  function drawOverlay(text) {
    ctx.fillStyle = 'rgba(19,41,74,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, H / 2);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#eef2f8'); bg.addColorStop(1, '#c9d2e0');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (var y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    drawMeter();
    segs.forEach(drawSeg);
    drawPaddle();
    popups.forEach(drawPopup);
    if (!running && state.over) drawOverlay(state.won ? 'Complete!' : 'Game over');
    else if (!running) drawOverlay('Press New Game');
  }

  function hud() {
    var s = state;
    if ($('game-level')) $('game-level').textContent = 'Level ' + s.level + '/' + LEVELS;
    if ($('game-score')) $('game-score').textContent = 'Score ' + s.score;
    if ($('game-lives')) $('game-lives').textContent = 'Lives ' + Math.max(0, s.lives);
    if ($('game-hi')) $('game-hi').textContent = 'Best ' + hi;
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    var visible = win.style.display !== 'none';
    if (!visible) { lastT = 0; return; }
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    if (running) { update(dt); hud(); }
    draw();
  }

  // Pointer control: the bar follows the pointer x position (mouse drag, touch, or hover).
  function pointerMove(e) {
    if (!running) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * W;
    state.bar = clamp(x - BAR_W / 2, 0, W - BAR_W);
  }
  canvas.addEventListener('pointerdown', function (e) { ensureAudio(); pointerMove(e); });
  canvas.addEventListener('pointermove', pointerMove);

  // Keyboard: arrow keys or A and D. Ignored while typing in a field.
  function typing(e) {
    var t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  document.addEventListener('keydown', function (e) {
    if (!running || typing(e) || win.style.display === 'none') return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keyLeft = true; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keyRight = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keyLeft = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keyRight = false;
  });

  newBtn.addEventListener('click', function () { start(); });

  state = newState();
  hud();
  setMsg('Press New Game to start.');
  raf = requestAnimationFrame(frame);

  window.RedStarGame = { start: start, state: function () { return state; } };
})();
