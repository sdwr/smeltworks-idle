/* Smeltworks Idle — the fight, drawn from above. Enemies gather in the middle and swing at the air; the weapons
   stand round them on a ring and strike inwards; the cursor's circle follows the mouse.
   The rules work in arena units (the middle is 0,0); this file maps them to pixels and back. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, G = SW.game, SP = SW.sprites;
const A = SW.arena = {};
const TOP = 58;                                 // the enemy's name and life bar lie over the top of the canvas
let cv, ctx, W = 300, H = 200, dpr = 1, t = 0;
let cx = 150, cy = 130, sx = 3, sy = 2;         // where the middle is, and pixels per arena unit each way
const floats = [], fx = [], anim = new Map(), wpn = [], born = [];
let hov = null, wasReady = 1, readyPop = 0, vign = 0, numCool = 0, hurtAcc = 0, hurtCool = 0, hurtSlam = false, spawnT = 0, floor = null, floorKey = '';
const KIND = { splash: '#ffb46a', arc: '#8fd0ff', pierce: '#b9f08a', nova: '#ff9a7a', carry: '#e9dcc0' };

A.init = function (canvas) {
  cv = canvas; ctx = cv.getContext('2d');
  A.resize();
  if (globalThis.ResizeObserver) new ResizeObserver(A.resize).observe(cv.parentElement);
  globalThis.addEventListener('resize', A.resize);
};
A.resize = function () {
  const r = cv.parentElement.getBoundingClientRect();
  dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  W = Math.max(200, r.width); H = Math.max(180, r.height);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ph = H - TOP;
  sy = ph / 104; sx = Math.min(W / 104, sy * 1.6); sy = Math.min(sy, sx * 1.15);       // fill the pane, but never stretch it far out of round
  cx = W / 2; cy = TOP + ph / 2;
  floor = null;
};
const X_ = x => cx + x * sx, Y_ = y => cy + y * sy;
/* a place on the canvas (pixels from its top left) in arena units */
A.toArena = (x, y) => ({ x: (x - cx) / sx, y: (y - cy) / sy });
/* where the mouse is over the arena, in pixels (null when it has left): the cursor's circle is drawn there */
A.hover = function (x, y) { hov = x == null ? null : { x, y }; };
const byId = id => G.F.es.find(e => e.id === id);
const state = id => { let a = anim.get(id); if (!a) anim.set(id, a = { flash: 0, cool: 0, swing: 0, dir: 0, out: 0 }); return a; };
/* effects are kept quiet on purpose: a faint flash when an enemy is hit, a small step when it swings, and red at the
   edges only when a fight is lost */
function eScale(e) { return Math.max(1, Math.round(e.r * 2.5 * (sx + sy) / 2 / SP.size(e.spr).h)); }
function float(x, y, txt, color, size, life) {
  if (floats.length > 70) floats.shift();
  floats.push({ x, y, vx: (Math.random() - 0.5) * 26, vy: -62 - Math.random() * 26, txt, color, size: size || 14, life: life || 0.9, max: life || 0.9 });
}
const add = o => { if (fx.length < 90) { o.max = o.life; fx.push(o); } };
/* Blows take time to arrive, and the rules land them in an instant, so the arena starts early. It knows when each
   weapon will next strike (the rules count it down) and whom it would strike now, and sends the weapon itself, or
   its shot, on ahead to be there at that moment. If the target changes on the way, it turns towards the new one.
   A melee weapon goes out, swings as the blow lands, and walks home; a shot flies, and stops where it hits unless
   the weapon pierces, when it carries on through. */
const TRIP = aps => Math.min(0.6, 0.42 / Math.max(0.1, aps));         // seconds for a melee weapon to reach its target, and again to come home
const FLIGHT = aps => Math.min(0.55, 0.5 / Math.max(0.1, aps));       // seconds a shot is in the air
const NEW = 3.2;                                                      // seconds a newly made weapon's post glows
const SWING = 0.24, THROUGH = 80;                                     // how long the swing lasts; how fast a piercing shot carries on (arena units a second)
const newWeapon = p => ({ ang: Math.atan2(-p.y * sy, -p.x * sx), lunge: 0, st: 'home', t: 0, x: p.x, y: p.y, bx: p.x, by: p.y });
const ease = q => q * q * (3 - 2 * q);
const shots = [];
/* where a melee weapon stands to strike: a little short of the target, on the line from its post */
function standoff(p, tx, ty) { const len = Math.hypot(tx - p.x, ty - p.y) || 1, stop = Math.max(0, len - 7); return { x: p.x + (tx - p.x) / len * stop, y: p.y + (ty - p.y) / len * stop }; }
const holderAt = who => who < 0 ? (hov ? A.toArena(hov.x, hov.y) : { x: 0, y: 0 }) : G.postPos(who);

A.onEvent = function (ev) {
  const X = G.X;
  switch (ev.t) {
    case 'spawn': anim.clear(); spawnT = 1; break;
    case 'goto': anim.clear(); fx.length = 0; shots.length = 0; break;
    case 'strike': {
      if (ev.who >= 0) {
        const p = G.postPos(ev.who), w = wpn[ev.who] || (wpn[ev.who] = newWeapon(p)), u = G.S.posts[ev.who].unit, Wd = X.units[ev.who];
        w.ang = Math.atan2((ev.y - p.y) * sy, (ev.x - p.x) * sx);
        if (u && D.WEAPONS[u.type].melee) {
          const d = standoff(p, ev.x, ev.y); w.x = d.x; w.y = d.y;       // it should be there already; if the blow came with no warning, it is now
          w.st = 'swing'; w.t = 0;
        } else {
          const shot = shots.find(q => q.who === ev.who && q.st === 'fly');
          if (!shot) add({ k: 'streak', x0: p.x, y0: p.y, x1: ev.x, y1: ev.y, c: '#f1ede4', life: 0.14 });      // a blow with no warning (a twin strike): there was no time for a shot
          else if (Wd && Wd.pierce > 0) { const len = Math.hypot(ev.x - p.x, ev.y - p.y) || 1; shot.st = 'through'; shot.x = ev.x; shot.y = ev.y; shot.ux = (ev.x - p.x) / len; shot.uy = (ev.y - p.y) / len; shot.life = 0.7; }
          else { shot.st = 'gone'; add({ k: 'puff', x: ev.x, y: ev.y, c: shot.kind === 'orb' ? '#8fd0ff' : '#f1ede4', life: 0.2 }); }      // it stops where it hits
        }
        if (Wd && Wd.splash > 0) add({ k: 'ring', x: ev.x, y: ev.y, r: Wd.splashR, c: KIND.splash, life: 0.3 });
      } else {
        add({ k: 'burst', x: ev.x, y: ev.y, r: X.cursor.radius, life: 0.22 });
        if (X.cursor.splash > 0) add({ k: 'ring', x: ev.x, y: ev.y, r: X.cursor.splashR, c: KIND.splash, life: 0.3 });
      }
      break;
    }
    case 'buy': case 'sell': if (ev.post != null) { born[ev.post] = ev.t === 'buy' ? t : -99; wpn[ev.post] = null; for (const q of shots) if (q.who === ev.post) q.st = 'gone'; } break;
    case 'arc': { const e = byId(ev.id); if (e) add({ k: 'bolt', x0: ev.fx, y0: ev.fy, x1: e.x, y1: e.y, seed: Math.random() * 99, life: 0.2 }); break; }
    case 'nova': { const p = holderAt(ev.who); add({ k: 'nova', x: p.x, y: p.y, life: 0.55 }); break; }
    case 'cull': { const e = byId(ev.id); if (e) { const s = eScale(e) * SP.size(e.spr).h; float(X_(e.x), Y_(e.y) - s * 0.55, 'culled', '#ff8a7a', 12, 0.8); } break; }
    case 'hit': {
      const e = byId(ev.id); if (!e) break;
      const a = state(e.id); if (a.cool <= 0) { a.flash = 0.05; a.cool = 0.35; }
      const main = ev.kind === 'main';
      // a full line lands dozens of blows a second: every critical is shown, the rest only as fast as they can be read
      if (ev.crit ? floats.length < 45 : numCool <= 0) {
        if (!ev.crit) numCool = 0.06;
        const s = eScale(e) * SP.size(e.spr).h;
        float(X_(e.x) + (Math.random() - 0.5) * s * 0.6, Y_(e.y) - s * (0.2 + Math.random() * 0.35), U.fmt1(ev.d),
          ev.crit ? '#ffe07a' : main ? (ev.who < 0 ? '#ffb46a' : '#f1ede4') : KIND[ev.kind], ev.crit ? (ev.who < 0 ? 22 : 18) : main ? (ev.who < 0 ? 17 : 13) : 11, ev.crit ? 1.0 : 0.7);
      }
      break;
    }
    case 'hurt': {
      const a = state(ev.id); a.swing = 1; a.dir = Math.random() * Math.PI * 2; a.slam = ev.slam;
      hurtAcc += ev.d; hurtSlam = hurtSlam || ev.slam;
      break;
    }
    case 'kill': {
      const e = byId(ev.id); if (!e) break;
      state(e.id).out = 0.001;
      float(X_(e.x), Y_(e.y) - eScale(e) * 9, '+' + U.fmt(ev.gold), '#ffd27a', ev.boss ? 22 : 14, 1.2);
      break;
    }
    case 'fail': vign = 1; break;
  }
};

/* the floor is painted once per act and size, then blitted */
function paintFloor(act) {
  floor = document.createElement('canvas'); floor.width = cv.width; floor.height = cv.height;
  const c = floor.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.72);
  g.addColorStop(0, act.sky[1]); g.addColorStop(0.55, act.ground); g.addColorStop(1, '#08070b');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // flagstones: a grid in arena units, every other course offset
  c.strokeStyle = 'rgba(255,255,255,.045)'; c.lineWidth = 1; c.beginPath();
  for (let y = -60, row = 0; y <= 60; y += 9, row++) {
    c.moveTo(0, Math.round(Y_(y)) + 0.5); c.lineTo(W, Math.round(Y_(y)) + 0.5);
    for (let x = -120 + (row % 2) * 7; x <= 120; x += 14) { c.moveTo(Math.round(X_(x)) + 0.5, Y_(y)); c.lineTo(Math.round(X_(x)) + 0.5, Y_(y + 9)); }
  }
  c.stroke();
  // the pit in the middle where the enemies gather, and the ring the weapons stand on
  const pit = c.createRadialGradient(cx, cy, 0, cx, cy, 26 * sx);
  pit.addColorStop(0, 'rgba(0,0,0,.5)'); pit.addColorStop(0.7, 'rgba(0,0,0,.3)'); pit.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = pit; c.beginPath(); c.ellipse(cx, cy, 26 * sx, 26 * sy, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(255,138,42,.16)'; c.lineWidth = 2; c.setLineDash([2, 7]);
  c.beginPath(); c.ellipse(cx, cy, D.RING * sx, D.RING * sy, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.beginPath(); c.ellipse(cx, cy, 24 * sx, 24 * sy, 0, 0, Math.PI * 2); c.stroke();
}
function text(f) {
  ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.4));
  ctx.font = `700 ${f.size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,7,11,.9)';
  ctx.strokeText(f.txt, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x, f.y);
  ctx.globalAlpha = 1;
}
/* Afflictions. Each one shows twice: as something happening to the enemy itself (a ring, a tint, cracks, flames,
   stars), and as a badge in a row over its head, in the affliction's own colour with its own mark. */
const AFFL = [
  ['chill', '#9be3ff', e => e.chill > 0],
  ['burn',  '#ff8a3a', e => G.burning(e)],
  ['stun',  '#ffe07a', e => e.stun > 0],
  ['brit',  '#e0d2a8', e => e.brit > 0],
];
/* the sprite's outline filled with one colour, to lay over it as a tint */
const tints = new Map();
function tint(spr, col) {
  const key = spr + '|' + col; let c = tints.get(key); if (c) return c;
  const src = SP.canvas(spr, 'ash', 'flash'); c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  tints.set(key, c); return c;
}
function wash(e, x, y, w, h, col, alpha) {
  ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false; ctx.drawImage(tint(e.spr, col), x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
}
function star(x, y, r, col) {
  ctx.fillStyle = col; ctx.strokeStyle = '#0b0a0f'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, q = i % 2 ? r * 0.42 : r; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
/* what an affliction does to the look of the enemy itself; under is drawn before the sprite, the rest over it */
function afflictUnder(e, x, y, w, h) {
  const fy = y + h * 0.46;
  if (e.chill > 0) {                // Chilled: a patch of ice under it
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#9be3ff'; ctx.beginPath(); ctx.ellipse(x, fy, w * 0.44, h * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#e4f9ff'; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
  }
}
function afflictOver(e, x, y, w, h) {
  const burning = G.burning(e);
  if (e.chill > 0) wash(e, x, y, w, h, '#6cc8ff', 0.42);                                   // frozen blue
  if (burning) wash(e, x, y, w, h, '#ff6a1a', 0.2 + 0.12 * Math.sin(t * 13 + e.id));       // and a flicker of fire
  if (e.brit > 0) {                 // Brittle: cracks across it, one more for every two stacks
    const n = Math.ceil(e.brit / 2); ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [['#0b0a0f', 3.2], ['#fff6dc', 1.4]]) {
      ctx.strokeStyle = pass[0]; ctx.lineWidth = pass[1]; ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = e.id * 3.7 + i * 2.4, cx = x + Math.sin(s) * w * 0.2, cy = y + Math.cos(s * 1.3) * h * 0.2, a = s * 1.9, len = Math.min(w, h) * 0.2;
        ctx.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len); ctx.lineTo(cx + Math.cos(a + 0.9) * len * 0.35, cy + Math.sin(a + 0.9) * len * 0.35);
        ctx.lineTo(cx + Math.cos(a - 0.5) * len * 0.75, cy + Math.sin(a - 0.5) * len * 0.75); ctx.lineTo(cx + Math.cos(a + 0.3) * len * 1.25, cy + Math.sin(a + 0.3) * len * 1.25);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (e.chill > 0) for (let i = 0; i < 4; i++) {          // snow drifting down past it
    const p = (t * 0.55 + i * 0.25) % 1; ctx.globalAlpha = 0.95 * (1 - p * p); ctx.fillStyle = '#e4f9ff';
    ctx.fillRect(Math.round(x + Math.sin(i * 7.3 + e.id) * w * 0.38), Math.round(y - h * 0.45 + p * h * 0.8), 4, 4);
  }
  if (burning) for (let i = 0; i < 6; i++) {              // flames climbing off it
    const p = (t * 1.5 + i / 6) % 1, sz = 6 - p * 4; ctx.globalAlpha = 1 - p * p; ctx.fillStyle = p < 0.35 ? '#ffe9a0' : i % 2 ? '#ff8a3a' : '#ffb84a';
    ctx.fillRect(Math.round(x + Math.sin(i * 9.1 + e.id) * w * 0.34 + Math.sin(t * 6 + i) * 2 - sz / 2), Math.round(y + h * 0.3 - p * h * 0.85), sz, sz);
  }
  ctx.globalAlpha = 1;
  if (e.stun > 0) for (let i = 0; i < 3; i++) {           // Stunned: stars wheeling over its head
    const g = t * 5 + i * 2.094; star(x + Math.cos(g) * w * 0.34, y - h * 0.5 - 4 + Math.sin(g) * 4, 5.5, '#ffe07a');
  }
}
/* one badge: a square in the affliction's colour with its mark cut in dark. Brittle carries its stacks. */
function badge(key, col, x, y, s, e) {
  ctx.fillStyle = '#0b0a0f'; ctx.fillRect(x - 1.5, y - 1.5, s + 3, s + 3);
  ctx.fillStyle = col; ctx.fillRect(x, y, s, s);
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.34;
  ctx.fillStyle = ctx.strokeStyle = '#0b0a0f'; ctx.lineWidth = Math.max(1.4, s * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  if (key === 'chill') {     // a snowflake
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + Math.PI / 2; ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.stroke();
  } else if (key === 'burn') {      // a flame
    ctx.moveTo(cx, cy - r * 1.2); ctx.quadraticCurveTo(cx + r * 1.5, cy + r * 0.2, cx, cy + r * 1.1); ctx.quadraticCurveTo(cx - r * 1.5, cy + r * 0.2, cx, cy - r * 1.2); ctx.fill();
  } else if (key === 'stun') {      // a star
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, q = i % 2 ? r * 0.45 : r * 1.15; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
  } else {                          // Brittle: how many stacks
    ctx.font = `800 ${Math.round(s * 0.82)}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(e.brit), cx, cy + 0.5); ctx.textBaseline = 'alphabetic';
  }
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}

function drawEnemy(e, enc, many, lit, dt) {
  const a = state(e.id), sc = eScale(e), sz = SP.size(e.spr), w = sz.w * sc, h = sz.h * sc;
  a.flash = Math.max(0, a.flash - dt); a.cool -= dt; a.swing = Math.max(0, a.swing - dt * 3.6);
  if (a.out > 0) a.out = Math.min(1, a.out + dt * 3.4);
  const alpha = e.dead && !enc.lost ? 1 - a.out : 1;
  if (alpha <= 0.01) return;
  // they burst out of the middle to their places
  const k = 1 - spawnT * spawnT, hop = Math.sin(a.swing * Math.PI) * (a.slam ? 4 : 2) * (e.stun > 0 ? 0 : 1);
  const x = X_(e.x * k) + Math.cos(a.dir) * hop, y = Y_(e.y * k) + Math.sin(a.dir) * hop + (e.mv && !e.dead ? -Math.abs(Math.sin(t * 9 + e.id)) * 2.5 : Math.sin(t * 2.4 + e.id) * 1.5);       // a step when it walks, a sway when it stands
  ctx.globalAlpha = 0.4 * alpha; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(X_(e.x * k), Y_(e.y * k) + h * 0.46, w * 0.34, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  if (lit && !e.dead) {            // the cursor's circle touches this one
    ctx.strokeStyle = lit > 1 ? '#ffd27a' : 'rgba(255,210,122,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(X_(e.x), Y_(e.y) + h * 0.46, w * 0.42, h * 0.15, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (!e.dead) afflictUnder(e, x, y, w, h);
  SP.draw(ctx, e.spr, e.pal, x, y + (e.dead && !enc.lost ? a.out * 8 : 0), sc, { ay: 0.5, alpha });
  if (e.dead) return;
  if (a.flash > 0) SP.draw(ctx, e.spr, e.pal, x, y, sc, { ay: 0.5, alpha: 0.22, mode: 'flash' });
  // its swing: an arc cut into the air beside it, at nothing
  if (a.swing > 0) {
    const r = Math.max(22, Math.max(w, h) * (a.slam ? 0.8 : 0.6)), p = 1 - a.swing, ox = X_(e.x) + Math.cos(a.dir) * r * 0.55, oy = Y_(e.y) + Math.sin(a.dir) * r * 0.55;
    ctx.strokeStyle = a.slam ? '#ffd0b8' : '#efe8dc'; ctx.lineWidth = (a.slam ? 4 : 2.5) * a.swing + 1; ctx.globalAlpha = Math.min(0.8, a.swing * 1.4); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(ox, oy, r * 0.75, a.dir - 1.3 + p * 1.2, a.dir - 0.1 + p * 1.6); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
  afflictOver(e, x, y, w, h);
  // in a group each has its own life bar; its afflictions are a row of badges above that, centred
  const bw = Math.max(18, w * 0.7), by = y - h * 0.5 - 7;
  if (many) {
    ctx.fillStyle = 'rgba(8,7,11,.85)'; ctx.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = e.boss ? '#ffb03a' : '#e0483a'; ctx.fillRect(x - bw / 2, by, bw * U.clamp(e.hp / e.max, 0, 1), 3);
  }
  const on = AFFL.filter(f => f[2](e)); if (!on.length) return;
  const bs = G.F.es.length > 7 ? 10 : 14, gap = 3, tw = on.length * bs + (on.length - 1) * gap, top = by - bs - 5 - (e.stun > 0 ? 6 : 0);
  on.forEach((f, i) => badge(f[0], f[1], Math.round(x - tw / 2 + i * (bs + gap)), Math.round(top), bs, e));
}

A.draw = function (dt) {
  if (!ctx) return;
  t += dt;
  const S = G.S, F = G.F, X = G.X, enc = F.enc, act = D.act(S.level);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const key = S.level + ':' + W + ':' + H;
  if (!floor || key !== floorKey) { floorKey = key; paintFloor(act); }
  ctx.drawImage(floor, 0, 0, W, H);
  spawnT = Math.max(0, spawnT - dt * 3.2); vign = Math.max(0, vign - dt * 1.6); numCool -= dt; hurtCool -= dt;

  // the cursor's circle: where a click would land and what it would touch
  const ready = G.ready(), aim = hov ? A.toArena(hov.x, hov.y) : null, R = X.cursor.radius;
  const lit = new Set();
  if (aim) for (const e of F.es) if (!e.dead && Math.hypot(e.x - aim.x, e.y - aim.y) <= R + e.r) lit.add(e.id);

  // the weapons, on their ring. One that is away striking is drawn after the enemies, so it shows over them.
  const usc = Math.min(sx, sy) > 3.6 ? 3 : 2, away = [];
  const fighting = F.wait <= 0 && enc && !enc.lost && F.es.some(e => !e.dead);
  for (let i = 0; i < S.posts.length; i++) {
    const u = S.posts[i].unit, p = G.postPos(i), x = X_(p.x), y = Y_(p.y), w = wpn[i] || (wpn[i] = newWeapon(p));
    ctx.fillStyle = 'rgba(8,7,11,.55)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 9 * usc, 6.5 * usc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = u ? 'rgba(255,138,42,.35)' : 'rgba(163,154,136,.3)'; ctx.lineWidth = 1.5; if (!u) ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.ellipse(x, y + 2, 9 * usc, 6.5 * usc, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const Wd = X.units[i]; if (!u || !Wd) continue;
    // just made: its post glows and rings spread from it for a few seconds, so you can see where it went
    const age = born[i] != null ? t - born[i] : 99;
    if (age < NEW) {
      const fade = 1 - age / NEW, pulse = 0.55 + 0.45 * Math.sin(age * 9);
      const g = ctx.createRadialGradient(x, y, 2, x, y, 30 * usc);
      g.addColorStop(0, `rgba(255,224,150,${0.75 * fade * pulse})`); g.addColorStop(1, 'rgba(255,210,122,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30 * usc, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 3; k++) { const q = (age * 0.9 + k / 3) % 1; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2.5 * (1 - q) + 0.5; ctx.globalAlpha = fade * (1 - q); ctx.beginPath(); ctx.ellipse(x, y + 2, (9 + 34 * q) * usc, (6.5 + 24 * q) * usc, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    const wd = D.WEAPONS[u.type], pal = D.PALS[U.clamp(u.sockets.length, 1, D.PALS.length) - 1], bob = Math.sin(t * 2 + i * 1.3) * 1.2, tilt = u.type === 'bow' ? 0 : Math.PI / 4;
    const due = fighting && Wd.aps > 0 ? Math.max(0, 1 - (F.cd[i] || 0)) / Wd.aps : Infinity;      // seconds until its next blow
    if (wd.melee) {
      const trip = TRIP(Wd.aps);
      let turn = 0;
      if (w.st === 'swing') { w.t += dt; turn = U.lerp(-1.1, 1.1, Math.min(1, w.t / SWING)); if (w.t >= SWING) { w.st = 'back'; w.t = 0; w.bx = w.x; w.by = w.y; } }
      if ((w.st === 'home' || w.st === 'back') && due <= trip && G.target(i)) { w.st = 'out'; w.t = 0; }
      if (w.st === 'out') {
        const tg = fighting ? G.target(i) : null;
        if (!tg) { w.st = 'back'; w.t = 0; w.bx = w.x; w.by = w.y; }
        else {
          const d = standoff(p, tg.x, tg.y), k = Math.min(1, dt / Math.max(dt, due));      // close the rest of the way in the time that is left
          w.x += (d.x - w.x) * k; w.y += (d.y - w.y) * k; w.t += dt;
          w.ang = Math.atan2((tg.y - p.y) * sy, (tg.x - p.x) * sx); turn = -1.1 * Math.min(1, w.t / (trip * 0.6));      // drawing back as it goes
        }
      }
      if (w.st === 'back') { w.t += dt; const q = ease(Math.min(1, w.t / trip)); w.x = U.lerp(w.bx, p.x, q); w.y = U.lerp(w.by, p.y, q); turn = 1.1 * (1 - q); if (q >= 1) w.st = 'home'; }
      if (w.st !== 'home') { away.push({ w, spr: wd.spr, pal, turn, tilt, cut: w.st === 'swing' ? w.t / SWING : -1 }); continue; }
      w.x = p.x; w.y = p.y;                          // at home (the ring is redrawn when a post is added)
    } else if (due <= FLIGHT(Wd.aps) && !shots.some(q => q.who === i && q.st === 'fly') && G.target(i)) {
      shots.push({ who: i, st: 'fly', kind: u.type === 'bow' ? 'arrow' : 'orb', x: p.x, y: p.y, ang: w.ang }); w.lunge = 1;      // loosed, to land as the blow does
    }
    w.lunge = Math.max(0, w.lunge - dt * 5);
    const reach = Math.sin(w.lunge * Math.PI) * -5;                           // a shooter kicks back as it looses
    SP.draw(ctx, wd.spr, pal, x + Math.cos(w.ang) * reach, y + Math.sin(w.ang) * reach + bob, usc, { ay: 0.5, rot: w.ang + tilt });
  }
  // shots in the air: each steers for whoever its weapon would strike now, and is there when the blow lands
  for (let i = shots.length - 1; i >= 0; i--) {
    const q = shots[i], Wd = X.units[q.who];
    if (q.st === 'fly') {
      const tg = fighting && Wd ? G.target(q.who) : null;
      if (!tg) q.st = 'gone';
      else {
        const due = Math.max(0, 1 - (F.cd[q.who] || 0)) / Wd.aps, k = Math.min(1, dt / Math.max(dt, due)), nx = q.x + (tg.x - q.x) * k, ny = q.y + (tg.y - q.y) * k;
        if (nx !== q.x || ny !== q.y) q.ang = Math.atan2((ny - q.y) * sy, (nx - q.x) * sx);
        q.x = nx; q.y = ny;
      }
    } else if (q.st === 'through') { q.x += q.ux * THROUGH * dt; q.y += q.uy * THROUGH * dt; q.life -= dt; if (q.life <= 0) q.st = 'gone'; }
    if (q.st === 'gone') shots.splice(i, 1);
  }

  // the enemies, nearest the bottom drawn last
  if (enc) {
    const many = F.es.length > 1;
    for (const e of F.es.slice().sort((a, b) => a.y - b.y)) drawEnemy(e, enc, many, lit.has(e.id) ? (ready >= 1 ? 2 : 1) : 0, dt);
  }
  for (const a of away) {
    const x = X_(a.w.x), y = Y_(a.w.y);
    SP.draw(ctx, a.spr, a.pal, x, y, usc, { ay: 0.5, rot: a.w.ang + a.tilt + a.turn });
    if (a.cut >= 0) {                              // the cut it makes, in front of it
      const r = 11 * usc;
      ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 3 * (1 - a.cut) + 1; ctx.globalAlpha = 0.75 * (1 - a.cut * 0.6); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, r, a.w.ang - 1.1, a.w.ang - 1.1 + 2.2 * a.cut); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    }
  }
  for (const q of shots) {
    const x = X_(q.x), y = Y_(q.y), fade = q.st === 'through' ? Math.min(1, q.life / 0.25) : 1;
    ctx.globalAlpha = fade;
    if (q.kind === 'arrow') {
      const c = Math.cos(q.ang), n = Math.sin(q.ang);
      ctx.strokeStyle = '#0b0a0f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - c * 9, y - n * 9); ctx.lineTo(x + c * 7, y + n * 7); ctx.stroke();
      ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - c * 9, y - n * 9); ctx.lineTo(x + c * 7, y + n * 7); ctx.stroke();
      ctx.fillStyle = '#c9ccd6'; ctx.beginPath(); ctx.moveTo(x + c * 10, y + n * 10); ctx.lineTo(x + c * 4 - n * 3.5, y + n * 4 + c * 3.5); ctx.lineTo(x + c * 4 + n * 3.5, y + n * 4 - c * 3.5); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(90,168,255,.35)'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (!S.posts.some(P => P.unit) && S.stats.kills < 12) { ctx.font = '600 14px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(233,223,205,.8)'; ctx.fillText('Click or hold on an enemy', cx, cy + 35 * sy); }

  // blows in flight
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; if (f.delay > 0) { f.delay -= dt; continue; }
    f.life -= dt; if (f.life <= 0) { fx.splice(i, 1); continue; }
    const p = 1 - f.life / f.max;
    if (f.k === 'streak') {
      const a = Math.max(0, p - 0.4), b = Math.min(1, p + 0.15);
      ctx.strokeStyle = f.c; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(X_(U.lerp(f.x0, f.x1, a)), Y_(U.lerp(f.y0, f.y1, a))); ctx.lineTo(X_(U.lerp(f.x0, f.x1, b)), Y_(U.lerp(f.y0, f.y1, b))); ctx.stroke();
    } else if (f.k === 'ring') {
      ctx.strokeStyle = f.c; ctx.lineWidth = 3 * (1 - p) + 1; ctx.globalAlpha = 0.8 * (1 - p);
      ctx.beginPath(); ctx.ellipse(X_(f.x), Y_(f.y), f.r * sx * (0.35 + 0.65 * p), f.r * sy * (0.35 + 0.65 * p), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = f.c; ctx.globalAlpha = 0.12 * (1 - p); ctx.fill();
    } else if (f.k === 'puff') {
      ctx.strokeStyle = f.c; ctx.lineWidth = 2; ctx.globalAlpha = 0.8 * (1 - p);
      ctx.beginPath(); ctx.arc(X_(f.x), Y_(f.y), 4 + 9 * p, 0, Math.PI * 2); ctx.stroke();
    } else if (f.k === 'burst') {
      ctx.fillStyle = '#ffd27a'; ctx.globalAlpha = 0.4 * (1 - p);
      ctx.beginPath(); ctx.ellipse(X_(f.x), Y_(f.y), Math.max(9, f.r * sx) * (0.6 + 0.6 * p), Math.max(9, f.r * sy) * (0.6 + 0.6 * p), 0, 0, Math.PI * 2); ctx.fill();
    } else if (f.k === 'bolt') {
      ctx.strokeStyle = '#bfe6ff'; ctx.lineWidth = 2.5; ctx.globalAlpha = 1 - p; ctx.shadowColor = '#5aa8ff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(X_(f.x0), Y_(f.y0));
      for (let s = 1; s < 5; s++) { const q = s / 5, j = Math.sin(f.seed + s * 12.9) * 7; ctx.lineTo(X_(U.lerp(f.x0, f.x1, q)) + j, Y_(U.lerp(f.y0, f.y1, q)) - j); }
      ctx.lineTo(X_(f.x1), Y_(f.y1)); ctx.stroke(); ctx.shadowBlur = 0;
    } else if (f.k === 'nova') {
      ctx.strokeStyle = KIND.nova; ctx.lineWidth = 5 * (1 - p) + 1; ctx.globalAlpha = 0.85 * (1 - p);
      ctx.beginPath(); ctx.ellipse(X_(f.x), Y_(f.y), 95 * sx * p, 95 * sy * p, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // the cursor's circle, filling as the next blow comes ready
  if (ready >= 1 && wasReady < 1) readyPop = 1;
  wasReady = ready; readyPop = Math.max(0, readyPop - dt * 5);
  if (hov) {
    const rx = Math.max(10, R * sx) + readyPop * 4, ry = Math.max(10, R * sy) + readyPop * 4;
    ctx.fillStyle = lit.size ? 'rgba(255,210,122,.10)' : 'rgba(255,255,255,.04)'; ctx.beginPath(); ctx.ellipse(hov.x, hov.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,7,11,.6)'; ctx.stroke();
    ctx.strokeStyle = ready >= 1 ? '#ffd27a' : '#ff8a2a'; ctx.globalAlpha = ready >= 1 ? 0.95 : 0.8;
    ctx.beginPath(); ctx.ellipse(hov.x, hov.y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ready); ctx.stroke();
    ctx.globalAlpha = 1;
    // the circle is the pointer (the arena hides the system's own, so there is nothing for it to trail behind): a mark at its centre
    ctx.fillStyle = 'rgba(8,7,11,.75)'; ctx.fillRect(Math.round(hov.x) - 3, Math.round(hov.y) - 3, 6, 6);
    ctx.fillStyle = ready >= 1 ? '#ffe9b0' : '#ffb070'; ctx.fillRect(Math.round(hov.x) - 2, Math.round(hov.y) - 2, 4, 4);
  }

  // what their swings took, summed so a swarm does not bury the screen in numbers
  if (hurtAcc > 0 && hurtCool <= 0) { float(cx, TOP + 50, '−' + U.fmt1(hurtAcc) + ' Life' + (hurtSlam ? '!' : ''), '#ff6a5a', hurtSlam ? 22 : 15, 1.0); hurtAcc = 0; hurtSlam = false; hurtCool = 0.6; }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.life -= dt; if (f.life <= 0) { floats.splice(i, 1); continue; }
    f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 60 * dt;
    text(f);
  }
  if (vign > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(1, `rgba(255,40,30,${Math.min(0.22, vign * 0.22)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
};
})();
