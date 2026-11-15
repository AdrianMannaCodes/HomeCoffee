// Boot chime for the Aqua desktop. Synthesizes an F# major chord pitched up 3x with a full-length sustain and simple feedback echo.
// Plays once per page load. Browsers block audio until a user gesture, so if it is blocked the chime plays on the first click, tap, or key press.
// There is intentionally no tutorial or pointer-hand overlay in this boot sequence. Browser only.
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ctx = null, played = false;

  // F#3, A#3, C#4, F#4, each tripled (3x speed/pitch, about 19 semitones up).
  var CHORD = [185.0, 233.08, 277.18, 370.0].map(function (f) { return f * 3; });
  var SUSTAIN = 5.5;   // seconds until the tail fades out; full-length like the source chime
  var STAGGER = 0.07;  // seconds between voices, like a strummed arpeggio

  function play() {
    if (played || !ctx) return;
    played = true;
    var t0 = ctx.currentTime + 0.05;

    var master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);

    // Feedback delay gives a soft reverb-like tail that runs for the whole sustain.
    var delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.11;
    var fb = ctx.createGain();
    fb.gain.value = 0.42;
    delay.connect(fb);
    fb.connect(delay);
    var wet = ctx.createGain();
    wet.gain.value = 0.45;
    master.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);

    CHORD.forEach(function (freq, i) {
      var start = t0 + i * STAGGER;
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      var osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2.0; // soft octave shimmer
      var g = ctx.createGain();
      var g2 = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, start + SUSTAIN);
      g2.gain.setValueAtTime(0.0001, start);
      g2.gain.exponentialRampToValueAtTime(0.05, start + 0.03);
      g2.gain.exponentialRampToValueAtTime(0.0001, start + SUSTAIN * 0.6);
      osc.connect(g); g.connect(master);
      osc2.connect(g2); g2.connect(master);
      osc.start(start); osc.stop(start + SUSTAIN + 0.2);
      osc2.start(start); osc2.stop(start + SUSTAIN + 0.2);
    });
  }

  function unlockAndPlay() {
    if (!ctx) return;
    ctx.resume().then(play).catch(function () {});
  }

  function start() {
    try { ctx = new AC(); } catch (e) { return; }
    if (ctx.state === 'running') { play(); return; }
    // Autoplay is blocked: wait for the first user gesture.
    var events = ['pointerdown', 'keydown', 'touchstart'];
    var handler = function () {
      events.forEach(function (ev) { document.removeEventListener(ev, handler, true); });
      unlockAndPlay();
    };
    events.forEach(function (ev) { document.addEventListener(ev, handler, true); });
    unlockAndPlay();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
