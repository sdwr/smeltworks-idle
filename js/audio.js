/* Smeltworks — sound. Everything is synthesised; there are no audio files to load. */
(function () {
'use strict';
const SW = globalThis.SW;
const A = SW.audio = { on: true, vol: 0.6, speed: 1 };
let ctx = null, master = null, noiseBuf = null;
const last = {};

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 6;
  master = ctx.createGain(); master.gain.value = A.vol;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}
A.unlock = function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); };
A.setVol = function (v) { A.vol = v; if (master) master.gain.value = v; };

/* one oscillator with a pitch slide and a decay envelope */
function tone(o) {
  const t = ctx.currentTime + (o.at || 0), osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.atk || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g); g.connect(master);
  osc.start(t); osc.stop(t + o.dur + 0.02);
}
function noise(o) {
  const t = ctx.currentTime + (o.at || 0), src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  src.buffer = noiseBuf; src.playbackRate.value = o.rate || 1;
  f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t); f.Q.value = o.q || 1;
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  g.gain.setValueAtTime(o.vol || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.02);
}
const SND = {
  hit()      { noise({ f: 900, to: 300, dur: 0.07, vol: 0.16, q: 0.8 }); tone({ f: 160, to: 70, dur: 0.07, type: 'triangle', vol: 0.14 }); },
  fire()     { noise({ f: 500, to: 1800, dur: 0.14, vol: 0.14, q: 0.6 }); },
  light()    { noise({ f: 3200, to: 900, dur: 0.08, vol: 0.12, q: 2 }); tone({ f: 1400, to: 300, dur: 0.07, type: 'sawtooth', vol: 0.05 }); },
  crit()     { noise({ f: 1800, to: 400, dur: 0.12, vol: 0.2, q: 0.7 }); tone({ f: 320, to: 60, dur: 0.16, type: 'square', vol: 0.12 }); tone({ f: 1250, to: 900, dur: 0.1, type: 'triangle', vol: 0.07 }); },
  big()      { noise({ f: 300, to: 60, dur: 0.4, vol: 0.32, q: 0.5, ft: 'lowpass' }); tone({ f: 110, to: 32, dur: 0.45, type: 'sine', vol: 0.35 }); },
  hurt()     { tone({ f: 190, to: 90, dur: 0.1, type: 'sawtooth', vol: 0.1 }); noise({ f: 400, dur: 0.06, vol: 0.1 }); },
  hurtBig()  { tone({ f: 150, to: 45, dur: 0.3, type: 'sawtooth', vol: 0.2 }); noise({ f: 250, to: 80, dur: 0.3, vol: 0.25, ft: 'lowpass' }); },
  die()      { noise({ f: 700, to: 120, dur: 0.18, vol: 0.13, q: 0.6 }); tone({ f: 240, to: 60, dur: 0.18, type: 'triangle', vol: 0.1 }); },
  dodge()    { noise({ f: 2400, to: 5000, dur: 0.09, vol: 0.06, q: 3 }); },
  coin()     { tone({ f: 1320, dur: 0.05, type: 'square', vol: 0.04 }); tone({ f: 1760, dur: 0.08, type: 'square', vol: 0.04, at: 0.05 }); },
  drop0()    { tone({ f: 520, to: 440, dur: 0.07, type: 'triangle', vol: 0.07 }); },
  drop1()    { tone({ f: 660, dur: 0.08, type: 'triangle', vol: 0.09 }); tone({ f: 880, dur: 0.1, type: 'triangle', vol: 0.07, at: 0.06 }); },
  drop2()    { [660, 880, 1100].forEach((f, i) => tone({ f, dur: 0.14, type: 'triangle', vol: 0.1, at: i * 0.06 })); },
  drop3()    { [330, 494, 659, 988, 1319].forEach((f, i) => tone({ f, dur: 0.8, type: 'sine', vol: 0.16, at: i * 0.09 })); tone({ f: 82, dur: 1.3, type: 'sine', vol: 0.34 }); noise({ f: 7000, to: 2000, dur: 0.9, vol: 0.06, q: 5, at: 0.2 }); },
  level()    { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, dur: 0.35, type: 'triangle', vol: 0.14, at: i * 0.08 })); tone({ f: 131, dur: 0.8, type: 'sine', vol: 0.25 }); },
  // a node of the prestige tree taken: a bead is a small bright set; a hub, an unlock or a notable rings out
  node()     { tone({ f: 784, dur: 0.14, type: 'triangle', vol: 0.12 }); tone({ f: 1175, dur: 0.2, type: 'sine', vol: 0.08, at: 0.05 }); noise({ f: 3200, dur: 0.03, vol: 0.1, q: 1.5 }); tone({ f: 160, to: 90, dur: 0.08, type: 'sine', vol: 0.14 }); },
  nodeBig()  { [523, 784, 1047, 1568].forEach((f, i) => tone({ f, dur: 0.45, type: 'triangle', vol: 0.11, at: i * 0.05 })); noise({ f: 2600, dur: 0.04, vol: 0.14, q: 1.2 }); tone({ f: 110, to: 55, dur: 0.3, type: 'sine', vol: 0.26 }); },
  /* the weapon lands on the line: a heavy thud, a ring of steel over it */
  seat()     { tone({ f: 150, to: 48, dur: 0.32, type: 'sine', vol: 0.34 }); noise({ f: 700, to: 200, dur: 0.12, vol: 0.2, q: 0.8 }); tone({ f: 1320, to: 1250, dur: 0.6, type: 'triangle', vol: 0.1, at: 0.02 }); tone({ f: 1980, dur: 0.35, type: 'sine', vol: 0.05, at: 0.02 }); },
  /* a weapon scrapped: a hammer blow, the steel giving, and the pieces settling */
  scrap()    { tone({ f: 130, to: 36, dur: 0.45, type: 'sine', vol: 0.36 }); noise({ f: 500, to: 120, dur: 0.22, vol: 0.26, q: 0.7 });
               [[980, 610], [1470, 880], [2210, 1300]].forEach(([f, to], i) => tone({ f, to, dur: 0.38, type: 'sawtooth', vol: 0.045, at: 0.03 + i * 0.015 }));
               [0.2, 0.29, 0.36, 0.46].forEach((at, i) => noise({ f: 2600 - i * 400, dur: 0.05, vol: 0.12 - i * 0.02, q: 2.5, at })); tone({ f: 70, to: 45, dur: 0.25, type: 'sine', vol: 0.16, at: 0.34 }); },
  equip()    { noise({ f: 2600, to: 900, dur: 0.07, vol: 0.12, q: 2 }); tone({ f: 420, to: 300, dur: 0.08, type: 'triangle', vol: 0.1 }); },
  salvage()  { noise({ f: 1500, to: 300, dur: 0.22, vol: 0.14, q: 1.2 }); tone({ f: 220, to: 110, dur: 0.2, type: 'sawtooth', vol: 0.06 }); },
  forge()    { tone({ f: 1480, to: 1400, dur: 0.5, type: 'triangle', vol: 0.16 }); tone({ f: 2220, dur: 0.3, type: 'sine', vol: 0.07 }); noise({ f: 3000, dur: 0.05, vol: 0.2 }); tone({ f: 120, to: 60, dur: 0.15, type: 'sine', vol: 0.25 }); },
  /* the whole tree opens: a low swell under two rising waves of notes, one for each ripple */
  unlock()   { tone({ f: 55, to: 82, dur: 2.2, type: 'sine', vol: 0.28 }); noise({ f: 900, dur: 1.4, vol: 0.05, q: 0.6 });
               [[196, 294, 392, 587], [262, 392, 523, 784, 1047]].forEach((w, k) => w.forEach((f, i) => tone({ f, dur: 0.9, type: 'triangle', vol: 0.09, at: 0.1 + k * 0.62 + i * 0.11 }))); },
  master()   { SND.forge(); [880, 1175, 1760].forEach((f, i) => tone({ f, dur: 0.5, type: 'triangle', vol: 0.1, at: 0.12 + i * 0.07 })); },
  tink()     { tone({ f: 2350, to: 2180, dur: 0.17, type: 'triangle', vol: 0.14 }); tone({ f: 3530, dur: 0.1, type: 'sine', vol: 0.06 }); noise({ f: 5200, dur: 0.03, vol: 0.16, q: 1.4 }); tone({ f: 190, to: 90, dur: 0.06, type: 'sine', vol: 0.12 }); },      // a hammer on the anvil
  // the fight: it goes on all day, so these are short and dull rather than bright, and sit under everything else
  soft()     { noise({ f: 600, to: 250, dur: 0.05, vol: 0.072, q: 0.8 }); tone({ f: 130, to: 70, dur: 0.05, type: 'sine', vol: 0.081 }); },                 // a troop's blow
  softCrit() { noise({ f: 1100, to: 380, dur: 0.07, vol: 0.108, q: 0.8 }); tone({ f: 210, to: 80, dur: 0.09, type: 'triangle', vol: 0.099 }); },          // and its critical
  tap()      { noise({ f: 800, to: 300, dur: 0.05, vol: 0.128, q: 0.8 }); tone({ f: 150, to: 70, dur: 0.06, type: 'triangle', vol: 0.128 }); },            // your own blow
  tapCrit()  { noise({ f: 1500, to: 400, dur: 0.09, vol: 0.16, q: 0.7 }); tone({ f: 280, to: 70, dur: 0.12, type: 'triangle', vol: 0.136 }); },
  // (it was a faint low hum, lost under a line of weapons and below what small speakers play: now a dull knock that can be heard)
  ouch()     { tone({ f: 250, to: 120, dur: 0.11, type: 'triangle', vol: 0.16 }); noise({ f: 520, dur: 0.05, vol: 0.09 }); },                                                                           // an enemy's swing
  ouchBig()  { tone({ f: 200, to: 60, dur: 0.3, type: 'triangle', vol: 0.26 }); noise({ f: 320, to: 90, dur: 0.24, vol: 0.18, ft: 'lowpass' }); },
  fall()     { noise({ f: 500, to: 120, dur: 0.12, vol: 0.072, q: 0.6 }); },                                                                               // a kill
  chink()    { tone({ f: 1320, dur: 0.04, type: 'sine', vol: 0.016 }); },                                                                                  // its gold
  zap()      { noise({ f: 2600, to: 900, dur: 0.06, vol: 0.053, q: 2 }); },                                                                                // a staff's arc
  boom()     { noise({ f: 260, to: 70, dur: 0.3, vol: 0.143, q: 0.5, ft: 'lowpass' }); tone({ f: 100, to: 40, dur: 0.3, type: 'sine', vol: 0.143 }); },     // a Shockwave
  daze()     { tone({ f: 700, to: 900, dur: 0.08, type: 'sine', vol: 0.02 }); },                                                                           // a Stun landing
  click()    { tone({ f: 700, to: 500, dur: 0.035, type: 'triangle', vol: 0.06 }); },
  deny()     { tone({ f: 160, to: 110, dur: 0.14, type: 'square', vol: 0.07 }); },
  learn()    { tone({ f: 587, dur: 0.1, type: 'triangle', vol: 0.11 }); tone({ f: 880, dur: 0.18, type: 'triangle', vol: 0.1, at: 0.07 }); },
  cast()     { noise({ f: 800, to: 2400, dur: 0.16, vol: 0.09, q: 1 }); },
  ult()      { tone({ f: 70, to: 220, dur: 0.4, type: 'sawtooth', vol: 0.16 }); noise({ f: 400, to: 4000, dur: 0.4, vol: 0.14, q: 0.8 }); },
  barrier()  { tone({ f: 440, to: 880, dur: 0.22, type: 'sine', vol: 0.1 }); tone({ f: 660, to: 1320, dur: 0.22, type: 'sine', vol: 0.06 }); },
  potion()   { [500, 620, 760].forEach((f, i) => tone({ f, to: f * 1.2, dur: 0.09, type: 'sine', vol: 0.1, at: i * 0.07 })); },
  windup()   { tone({ f: 90, to: 180, dur: 0.5, type: 'sawtooth', vol: 0.09 }); },
  boss()     { tone({ f: 55, dur: 1.6, type: 'sawtooth', vol: 0.22 }); tone({ f: 82, dur: 1.6, type: 'sawtooth', vol: 0.14, at: 0.1 }); noise({ f: 120, dur: 1.2, vol: 0.25, ft: 'lowpass' }); },
  death()    { [294, 262, 220, 147].forEach((f, i) => tone({ f, dur: 0.5, type: 'triangle', vol: 0.16, at: i * 0.18 })); },
  win()      { [392, 523, 659, 784].forEach((f, i) => tone({ f, dur: 0.3, type: 'triangle', vol: 0.12, at: i * 0.09 })); },
  clear()    { [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.6, type: 'triangle', vol: 0.13, at: i * 0.1 })); tone({ f: 65, dur: 1.4, type: 'sine', vol: 0.3 }); },
  shrine()   { [784, 988, 1175, 1568].forEach((f, i) => tone({ f, dur: 0.6, type: 'sine', vol: 0.09, at: i * 0.05 })); },
  chest()    { noise({ f: 300, to: 900, dur: 0.15, vol: 0.14 }); [523, 784].forEach((f, i) => tone({ f, dur: 0.2, type: 'triangle', vol: 0.1, at: 0.1 + i * 0.07 })); },
  step()     { noise({ f: 300, dur: 0.04, vol: 0.05, ft: 'lowpass' }); },
  stun()     { tone({ f: 900, to: 1300, dur: 0.1, type: 'square', vol: 0.04 }); },
};
/* play a named sound. Repeats of the same sound are throttled so 4× speed doesn't turn to noise. */
A.play = function (name, gap) {
  if (!A.on || !SND[name]) return;
  if (!ensure() || ctx.state !== 'running') return;
  const now = ctx.currentTime, min = gap != null ? gap : 0.045;
  if (last[name] && now - last[name] < min) return;
  last[name] = now;
  try { SND[name](); } catch (e) { /* audio hiccup: ignore */ }
};
})();
