/* Smeltworks Idle — play data.

   Anonymous notes on how runs go, sent to a small collector (the smeltworks-idle-logging worker) so the game can be
   balanced from what really happens: how long runs are, how deep they go, which nodes of the prestige tree are
   bought, what is forged, scrapped, rerolled and crafted, and errors.

   Nothing is sent unless the game is running at its hosted address (D.TELEMETRY.hosts) and the player has been shown
   the switch: it is in the box that opens on a first visit (or, for a save from before this, in a notice of its own),
   and in Settings afterwards. It starts switched on, and switching it off also throws away anything not yet sent.

   One event is one JSON object on one line:
     { type, game, version, install, session, run, time, host, os, data }
       install   a random id kept in this browser (not in the save, so starting over keeps it)
       session   a random id for this page load
       run       a random id for the run, kept in the save so a run played over several visits is one run
   and the types are
     session_start  { n, deepest, level, secs, playtime, nodes, cores, fresh }
     run_start      { n, deepest, cores, nodes: [ids held], bought: [ids], dropped: [ids], playtime }
                    sent when a run begins after the prestige tree: what the tree holds, and what that visit changed
     run_end        { n, level, secs, kills, fails, cores, first, weapons, ups, skills, deepest, playtime,
                      counts: { forged, equipped, scrapped, reroll_type, reroll_sockets, upgrade, upgrade_ranks,
                                craft_strip, craft_recast, craft_add, craft_third, craft_morph, market, salvage, drops } }
                    sent on prestige: n is the run's number, level the deepest it reached, secs its game time
     progress       { n, from, to, secs, levels: [[level, secs], ...], fails: { level: count } }
                    how far the run has got, for the runs that never reach a prestige. It is not sent for every
                    level: it goes with the two-minute post (and when the page is left, and before a run_end), and
                    only if the run has reached a new level since the last one, or has lost fights and ten minutes
                    have passed. from and to are the deepest level as last reported and now (from is 0 the first
                    time); levels is each level reached since, with the run's game time when it was; fails the
                    fights lost since, by the level they were lost on
     error          { message, stack }
   Events wait in a queue in localStorage and are posted together; a failed post leaves them for next time. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, G = SW.game;
const T = SW.telemetry = { ready: false, session: '', errs: 0, busy: false, visit: { bought: [], dropped: [] } };
const PREF = 'smeltworks-idle.tele', QUEUE = 'smeltworks-idle.tq', MAX_QUEUE = 150000, MAX_ERRS = 5;

const uid = () => { let s = ''; for (let i = 0; i < 4; i++) s += Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1); return s + '-' + Date.now().toString(36); };
/* ---- where things are kept and how they leave: replaced in tests */
T.env = {
  host: () => (typeof location !== 'undefined' ? location.hostname : ''),
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage blocked or full */ } },
  post: (url, body) => fetch(url, { method: 'POST', body, keepalive: body.length < 60000, headers: { 'Content-Type': 'text/plain' } }).then(r => r.ok, () => false),
  beacon: (url, body) => (typeof navigator !== 'undefined' && navigator.sendBeacon ? navigator.sendBeacon(url, body) : false),
  os: () => { const u = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''; return /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Other'; },
};
/* ---- the player's choice: { id, on, asked }. On unless switched off, but nothing goes until the switch has been shown (asked) */
T.pref = function () { let p = null; try { p = JSON.parse(T.env.get(PREF) || 'null'); } catch (e) { /* unreadable: start again */ } if (!p || !p.id) { p = { id: uid(), on: true, asked: false }; T.env.set(PREF, JSON.stringify(p)); } return p; };
/* is this the hosted game? Anywhere else (a file on disk, a local server, an embedded copy) nothing is ever sent, and the switch is not shown */
T.hosted = () => D.TELEMETRY.hosts.includes(T.env.host());
T.asked = () => T.pref().asked;
T.wanted = () => T.pref().on;                       // what the switch shows
T.enabled = () => T.hosted() && T.pref().asked && T.pref().on;
T.setEnabled = function (on) {
  const p = T.pref(), was = p.asked && p.on; p.on = !!on; p.asked = true; T.env.set(PREF, JSON.stringify(p));
  if (!p.on) T.env.set(QUEUE, null);                       // switching it off also throws away anything not yet sent
  else if (!was && T.ready && T.hosted()) T.sessionStart();
};
/* ---- the run's id and its counts live in the save (S.run), so a run played over several visits stays one run */
const runId = () => { const R = G.S.run; if (!R.tid) R.tid = uid(); return R.tid; };
const count = (k, n) => { if (!T.enabled()) return; const R = G.S.run, c = R.tc || (R.tc = {}); c[k] = (c[k] || 0) + (n == null ? 1 : n); };
/* ---- how far the run has got, kept in the save (S.run.tp) until it is next sent:
     hi: the deepest level noted, sent: the deepest reported, lv: [level, secs] for each reached since, f: fights lost since, by level */
const MAX_LEVELS = 200, FAILS_EVERY = 600;
function prog(fresh) {
  const S = G.S, R = S.run;
  if (!R.tp) R.tp = fresh || !(R.time > 5) ? { hi: 0, sent: 0, lv: [], f: {} } : { hi: S.maxLevel, sent: 0, lv: [], f: {} };      // (a run already under way when the play data began: where it is, but not when it got there. A new save's first run begins without a visit to the tree: it is fresh too)
  return R.tp;
}
function noteLevel(fresh) {
  if (!T.enabled() || G.S.alloc) return;
  const S = G.S, P = prog(fresh), secs = Math.round(S.run.time || 0);
  if (S.maxLevel <= P.hi) return;
  for (let l = P.hi ? P.hi + 1 : S.maxLevel; l <= S.maxLevel; l++) if (P.lv.length < MAX_LEVELS) P.lv.push([l, secs]);      // a run begins at its first level: a Head start's levels were never reached
  P.hi = S.maxLevel;
}
/* say where the run is, if there is anything new to say. force: say it now if there is anything at all (the page is going, or the run is over) */
T.progress = function (force) {
  if (!T.enabled() || !G.S.run.tp) return false;
  const S = G.S, P = S.run.tp, fails = Object.keys(P.f).length, now = Date.now() / 1000;
  if (P.hi <= P.sent && !(fails && (force || now - (T.failsAt || 0) >= FAILS_EVERY))) return false;
  if (!T.push('progress', { n: S.runs + 1, from: P.sent, to: P.hi, secs: Math.round(S.run.time || 0), levels: P.lv, fails: P.f })) return false;
  P.sent = P.hi; P.lv = []; P.f = {}; T.failsAt = now;
  return true;
};
/* the two-minute post */
T.beat = function () { T.progress(false); return T.flush(); };
/* ---- the queue */
T.push = function (type, data) {
  if (!T.enabled()) return false;
  const line = JSON.stringify({ type, game: 'SMELTWORKS_IDLE', version: D.VERSION, install: T.pref().id, session: T.session, run: runId(), time: new Date().toISOString(), host: T.env.host(), os: T.env.os(), data });
  let q = (T.env.get(QUEUE) || '') + line + '\n';
  while (q.length > MAX_QUEUE) q = q.slice(q.indexOf('\n') + 1);      // offline for a long time: the oldest go first
  T.env.set(QUEUE, q);
  return true;
};
T.flush = function () {
  if (!T.enabled() || T.busy) return null;
  const body = T.env.get(QUEUE); if (!body) return null;
  T.busy = true;
  return Promise.resolve(T.env.post(D.TELEMETRY.url, body)).then(ok => {
    T.busy = false;
    if (ok) { const now = T.env.get(QUEUE) || ''; T.env.set(QUEUE, now.startsWith(body) ? now.slice(body.length) || null : now); }      // keep whatever was queued meanwhile
    return ok;
  });
};
/* the page is going away: hand whatever is left to the browser to send */
T.farewell = function () { if (!T.enabled()) return; if (T.ready && !G.S.alloc) T.progress(true); const body = T.env.get(QUEUE); if (body && T.env.beacon(D.TELEMETRY.url, body)) T.env.set(QUEUE, null); };

/* ---- what is said */
const played = () => Math.round(G.S.stats.time || 0);
T.sessionStart = function () {
  const S = G.S;
  T.push('session_start', { n: S.runs + 1, deepest: S.best, level: S.maxLevel, secs: Math.round(S.run.time || 0), playtime: played(), nodes: Object.keys(S.tree).length, cores: G.cores(), fresh: !S.runs && !S.stats.kills });
  T.flush();
};
/* a node bought and then handed back in the same visit to the tree (or the other way about) was never bought at all */
const visit = (id, on) => { const V = T.visit, to = on ? V.bought : V.dropped, from = on ? V.dropped : V.bought, i = from.indexOf(id); if (i >= 0) from.splice(i, 1); else if (!to.includes(id)) to.push(id); };
/* every event of the game passes through here (js/main.js), whether or not the page is being drawn */
T.onGame = function (ev) {
  if (ev.t !== 'run' && ev.t !== 'prestige' && ev.t !== 'tree') noteLevel(false);
  switch (ev.t) {
    case 'fail': if (T.enabled()) { const P = prog(false), l = G.S.level + (ev.back ? 1 : 0); P.f[l] = (P.f[l] || 0) + 1; } break;
    case 'tree': if (ev.id) visit(ev.id, !!ev.on); break;
    case 'run': {      // the tree is settled and a run begins: what it holds, and what this visit changed
      const S = G.S;
      T.push('run_start', { n: S.runs + 1, deepest: S.best, cores: G.cores(), nodes: Object.keys(S.tree), bought: T.visit.bought, dropped: T.visit.dropped, playtime: played() });
      T.visit = { bought: [], dropped: [] }; noteLevel(true); T.progress(true); T.flush(); break; }
    case 'prestige': {      // the run is over (the rules have already cleared it away: what it was is in ev.was)
      const S = G.S, R = S.run;
      if (T.enabled()) {      // where it had got to, first (the rules have reset the save: ev.was has what it was)
        const P = R.tp || { hi: ev.was.level, sent: 0, lv: [], f: {} };
        for (let l = P.hi + 1; l <= ev.was.level && P.lv.length < MAX_LEVELS; l++) P.lv.push([l, ev.was.secs]);
        P.hi = Math.max(P.hi, ev.was.level);
        if (P.hi > P.sent || Object.keys(P.f).length) T.push('progress', { n: S.runs, from: P.sent, to: P.hi, secs: ev.was.secs, levels: P.lv, fails: P.f });
      }
      T.push('run_end', Object.assign({ n: S.runs, cores: ev.earned, deepest: S.best, playtime: played(), counts: R.tc || {} }, ev.was));
      delete R.tid; delete R.tc; delete R.tp; T.flush(); break; }
    case 'made': count('forged'); break;
    case 'buy': count('equipped'); break;
    case 'sell': count('scrapped'); break;
    case 'bench': if (ev.kind === 'type') count('reroll_type'); else if (ev.kind === 'socks') count('reroll_sockets'); break;
    case 'forge': count('craft_' + ev.kind); break;
    case 'upgrade': count('upgrade'); count('upgrade_ranks', ev.gain || 1); break;
    case 'bought': count('market'); break;
    case 'salvage': count('salvage'); break;
    case 'drop': count('drops'); break;
  }
};
T.error = function (message, stack) {
  if (T.errs >= MAX_ERRS) return; T.errs++;
  const clean = s => String(s || '').replace(/(?:https?|file):\/\/[^\s)]*\/([^\s/):]+)/g, '$1').slice(0, 1500);      // file names and line numbers, never whole addresses
  T.push('error', { message: clean(message).slice(0, 300), stack: clean(stack) }); T.flush();
};
/* Start listening. Called once at boot, after the save is loaded. */
T.init = function () {
  T.session = uid(); T.errs = 0; T.visit = { bought: [], dropped: [] }; T.ready = true;
  if (T.enabled()) T.sessionStart();
  if (typeof window !== 'undefined') {
    window.addEventListener('error', e => T.error(e.message, e.error && e.error.stack));
    window.addEventListener('unhandledrejection', e => T.error(e.reason && e.reason.message || String(e.reason), e.reason && e.reason.stack));
    window.addEventListener('pagehide', T.farewell);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') T.farewell(); });
    setInterval(T.beat, 120000);      // an idle game is left open for hours: do not wait for the page to close
  }
};
})();
