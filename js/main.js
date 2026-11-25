/* Smeltworks Idle — boot and the frame loop. */
(function () {
'use strict';
const SW = globalThis.SW, G = SW.game, UI = SW.ui, AR = SW.arena;

/* advance the game by dt seconds in small steps, handing what happened to the page (or dropping it, in the background) */
function advance(dt, draw) {
  if (SW.ui.waiting) return;      // the first box is up: the game has not begun
  let left = dt, guard = 0;
  while (left > 1e-6 && guard++ < 4000) {
    const s = Math.min(0.05, left); left -= s;
    G.update(s);
    if (G.ev.length) { for (const ev of G.ev) SW.telemetry.onGame(ev);      // the play data hears everything, drawn or not
      if (draw) for (const ev of G.ev) UI.onEvent(ev); else if (G.ev.some(ev => ev.t !== 'hit' && ev.t !== 'hurt')) UI.dirty = true; G.ev.length = 0; }
  }
}

function boot() {
  const saved = G.load();
  G.init(saved);
  const away = saved ? G.claimOffline() : null;
  AR.init(document.getElementById('cv'));
  UI.bind();
  UI.render();
  SW.telemetry.init();
  // (a returning player is told what has changed, once: with the gold from their time away if there is any, or in a box of its own)
  try {
  if (/[?&]notes\b/.test(location.search)) UI.whatsNew(true); else
  if (!saved) UI.welcome(); else if (away) UI.offline(away); else if (!UI.whatsNew()) UI.playDataNotice();      // (each of them carries the play-data switch, until it has been seen)
  } catch (e) { SW.telemetry.error(e && e.message, e && e.stack); }      // a notice that fails is a notice not shown: the game still starts
  const ico = document.createElement('link'); ico.rel = 'icon'; ico.href = SW.sprites.url('hammer', 'ember', 2); document.head.appendChild(ico);

  let last = performance.now(), saveT = 0, hiddenAt = 0;
  function frame(now) {
    const real = Math.min(0.1, (now - last) / 1000); last = now;
    advance(real, true);
    if (!G.S.alloc) AR.draw(real);        // between runs the tree has the whole screen: no battle is drawn behind it
    UI.frame();
    UI.render();
    saveT += real; if (saveT > 10) { saveT = 0; G.save(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // keep fighting while the tab is in the background: no drawing, same rules
  document.addEventListener('visibilitychange', () => { if (document.hidden) { hiddenAt = performance.now(); UI.stopHold(); G.save(); } else { last = performance.now(); UI.redraw(); } });
  setInterval(() => {
    if (!document.hidden) return;
    const now = performance.now(), el = Math.min(60, (now - hiddenAt) / 1000); hiddenAt = now;
    advance(el, false);
  }, 1000);
  window.addEventListener('beforeunload', () => G.save());
  SW.debug = { G, advance };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
