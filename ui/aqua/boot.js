// Boot chime for the Aqua desktop. Synthesizes a soft, friendly F# major chord pitched up 3x, with a warm sine/triangle body, a gentle attack, and a full-length sustain tail.
// Plays once per page load. Browsers block audio until a user gesture, so if it is blocked the chime plays on the first click, tap, or key press.
// There is intentionally no tutorial or pointer-hand overlay in this boot sequence. Browser only.
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ctx = null, played = false;

  // F#3, A#3, C#4, F#4 (F# major triad with octave doubling), each tripled (3x pitch).
  var CHORD = [185.0, 233.08, 277.18, 370.0].map(function (f) { return f * 3; });
  var SUSTAIN = 5.5;   // full decay tail, in seconds
  var STAGGER = 0.07;  // gentle strum between voices
  var ATTACK = 0.09;   // soft, warm attack (no brassy punch)

  function play() {
    if (played || !ctx) return;
    played = true;
    var t0 = ctx.currentTime + 0.05;

    var master = ctx.createGain();
    master.gain.value = 0.3;

    // Gentle low-pass rounds off the top end so it sounds friendly, not metallic.
    var tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4800;
    tone.Q.value = 0.5;
    master.connect(tone);
    tone.connect(ctx.destination);

    // Soft feedback delay gives an airy, sustained tail for the whole decay.
    var delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.19;
    var fb = ctx.createGain();
    fb.gain.value = 0.38;
    delay.connect(fb);
    fb.connect(delay);
    var wet = ctx.createGain();
    wet.gain.value = 0.35;
    tone.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);

    CHORD.forEach(function (freq, i) {
      var start = t0 + i * STAGGER;
      // Sine body for warmth.
      var body = ctx.createOscillator();
      body.type = 'sine';
      body.frequency.value = freq;
      var bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.0001, start);
      bodyGain.gain.exponentialRampToValueAtTime(0.2, start + ATTACK);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + SUSTAIN);
      // Soft triangle an octave up adds a bell-like sparkle without harshness.
      var bell = ctx.createOscillator();
      bell.type = 'triangle';
      bell.frequency.value = freq * 2;
      var bellGain = ctx.createGain();
      bellGain.gain.setValueAtTime(0.0001, start);
      bellGain.gain.exponentialRampToValueAtTime(0.06, start + ATTACK);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, start + SUSTAIN * 0.6);
      body.connect(bodyGain); bodyGain.connect(master);
      bell.connect(bellGain); bellGain.connect(master);
      body.start(start); body.stop(start + SUSTAIN + 0.2);
      bell.start(start); bell.stop(start + SUSTAIN + 0.2);
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
