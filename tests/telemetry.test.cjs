/* The play data: what is sent, when, and that nothing is sent without the switch having been seen. node tests/telemetry.test.cjs */
const assert = require('node:assert'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
let n = 0; const waits = [];
const bad = (name, e) => { process.exitCode = 1; console.log('FAIL ' + name + '\n  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n  ')); };
const test = (name, fn) => { try { const p = fn(); if (p && p.then) waits.push(p.then(() => { n++; }, e => bad(name, e))); else n++; } catch (e) { bad(name, e); } };
/* the rules and the play data in a context of their own: storage and the network are stand-ins */
function load(host) {
  const ctx = vm.createContext({ console, Math: Object.create(Math), Date, JSON, Promise, setInterval: () => 0 });
  for (const f of ['data', 'game', 'telemetry']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  const SW = ctx.SW, T = SW.telemetry, store = {}, posts = [], beacons = [];
  SW.util.seed(7); SW.data.FORGE_SECS = 0; SW.data.SOCK_ROLL = [1, 0, 0]; SW.data.SOCK_STEP.per = 0;
  T.env = { host: () => host, get: k => (k in store ? store[k] : null), set: (k, v) => { if (v == null) delete store[k]; else store[k] = v; }, post: (url, body) => { posts.push({ url, body }); return T.fail ? false : true; }, beacon: (url, body) => { beacons.push({ url, body }); return true; }, os: () => 'Linux' };
  SW.game.init(null);
  const pump = () => { for (const ev of SW.game.ev) T.onGame(ev); SW.game.ev.length = 0; };
  const queue = () => (store['smeltworks-idle.tq'] || '').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const last = type => queue().filter(e => e.type === type).pop();
  return { SW, G: SW.game, D: SW.data, T, store, posts, beacons, pump, queue, last };
}
const HOST = 'sdwr.github.io';

test('nothing is sent away from the hosted game, and nothing before the switch has been seen', () => {
  let r = load('localhost'); r.T.init(); assert.equal(r.T.hosted(), false); assert.equal(r.T.enabled(), false);
  r.T.setEnabled(true); assert.equal(r.T.enabled(), false, 'a yes changes nothing off the hosted game'); assert.equal(r.T.push('session_start', {}), false); assert.equal(r.queue().length, 0); assert.equal(r.posts.length, 0);
  r = load(HOST); r.T.init(); assert.ok(r.T.hosted()); assert.equal(r.T.asked(), false); assert.equal(r.T.wanted(), true, 'the switch starts on'); assert.equal(r.T.enabled(), false, 'but it has not been seen yet');
  r.G.S.maxLevel = 4; r.G.prestige(); r.pump(); assert.equal(r.queue().length, 0, 'not even a run that ends'); assert.equal(r.posts.length, 0); assert.equal(r.G.S.run.tid, undefined, 'and the save is not written in');
  assert.deepEqual(Object.assign({}, r.D.TELEMETRY), { url: 'https://smeltworks-idle-logging.sdwr.workers.dev/ingest', hosts: ['sdwr.github.io'] });
});

test('seen and left on: a session_start goes at once; switched off: nothing, and what was waiting is thrown away', () => {
  const r = load(HOST), { T, G } = r; T.init(); T.fail = true;      // (the collector is down: the queue keeps everything)
  T.setEnabled(true); assert.ok(T.asked() && T.enabled());
  let q = r.queue(); assert.equal(q.length, 1); const e = q[0];
  assert.equal(e.type, 'session_start'); assert.equal(e.game, 'SMELTWORKS_IDLE'); assert.equal(e.version, r.D.VERSION); assert.equal(e.host, HOST); assert.equal(e.os, 'Linux');
  assert.ok(e.install && e.session && e.run && e.install !== e.session); assert.ok(!Number.isNaN(Date.parse(e.time)));
  assert.deepEqual(e.data, { n: 1, deepest: G.S.best, level: 1, secs: 0, playtime: 0, nodes: 0, cores: 0, fresh: true });
  assert.equal(r.posts.length, 1); assert.equal(r.posts[0].url, r.D.TELEMETRY.url); assert.equal(r.posts[0].body, r.store['smeltworks-idle.tq']);
  assert.equal(Object.keys(e).sort().join(), 'data,game,host,install,os,run,session,time,type,version', 'and nothing else about the player');
  T.setEnabled(false); assert.equal(T.enabled(), false); assert.equal(r.queue().length, 0, 'thrown away'); assert.equal(T.push('run_end', {}), false);
  const id = e.install; T.setEnabled(true); assert.equal(r.queue()[0].install, id, 'the same browser, the same id'); assert.equal(r.queue()[0].type, 'session_start');
});

test('a run: what was forged, equipped, scrapped, rerolled, upgraded and crafted is counted, and sent when the run ends', () => {
  const r = load(HOST), { T, G, D } = r, S = G.S; T.init(); T.setEnabled(true); T.fail = true;
  for (const id of ['F1', 'F2', 'UPG', 'URR', 'UMT']) S.tree[id] = 1; for (const nd of D.TREE) if (/^c[A-Z]/.test(nd.eff)) S.tree[nd.id] = 1;
  S.posts = [{ unit: null }, { unit: null }]; S.crafter = 1; S.gold = 1e12; G.recompute();
  assert.ok(G.make()); r.pump(); assert.ok(G.benchReroll('type')); r.pump(); assert.ok(G.benchReroll('socks')); r.pump(); assert.ok(G.benchReroll('socks')); r.pump();
  assert.ok(G.equip()); r.pump(); assert.ok(G.make()); r.pump(); assert.ok(G.equip()); r.pump(); assert.ok(G.upgrade(0)); r.pump(); assert.ok(G.sell(1)); r.pump();
  const g = G.buySkill(); assert.ok(g); r.pump(); g.aff = [{ k: 'dmg', t: 1 }, { k: 'crit', t: 1 }]; assert.ok(G.craft('strip', g.id)); r.pump(); assert.ok(G.craft('recast', g.id)); r.pump(); assert.ok(G.craft('add', g.id)); r.pump(); assert.ok(G.salvage(g.id)); r.pump();
  const c = S.run.tc; assert.equal(c.forged, 2); assert.equal(c.equipped, 2); assert.equal(c.scrapped, 1); assert.equal(c.reroll_type, 1); assert.equal(c.reroll_sockets, 2); assert.equal(c.upgrade, 1); assert.ok(c.upgrade_ranks >= 1 && c.upgrade_ranks <= 3);
  assert.equal(c.market, 1); assert.equal(c.craft_strip, 1); assert.equal(c.craft_recast, 1); assert.equal(c.craft_add, 1); assert.equal(c.salvage, 1);
  // the run id and the counts are in the save: a reload in the middle of a run loses neither
  const tid = S.run.tid; assert.ok(tid); assert.equal(JSON.parse(JSON.stringify(S)).run.tc.forged, 2);
  S.maxLevel = 9; S.run.time = 754.6; S.run.kills = 321; S.run.fails = 4; S.run.earn = 19; const best = S.best, ups = S.posts[0].unit.up;
  assert.ok(G.prestige()); r.pump();
  const e = r.queue().pop(); assert.equal(e.type, 'run_end'); assert.equal(e.run, tid);
  assert.equal(e.data.n, 1); assert.equal(e.data.level, 9); assert.equal(e.data.secs, 755); assert.equal(e.data.kills, 321); assert.equal(e.data.fails, 4); assert.equal(e.data.cores, 19); assert.equal(e.data.first, 9 > best);
  assert.equal(e.data.weapons, 1); assert.equal(e.data.ups, ups); assert.equal(e.data.deepest, Math.max(best, 9)); assert.equal(e.data.counts.forged, 2); assert.equal(e.data.counts.reroll_sockets, 2);
  assert.equal(S.run.tid, undefined, 'the next run gets an id of its own'); assert.equal(S.run.tc, undefined);
});

test('the tree: what a visit bought and handed back goes with the run that follows, and a change of mind is not counted', () => {
  const r = load(HOST), { T, G } = r, S = G.S; T.init(); T.setEnabled(true); T.fail = true;
  S.maxLevel = 12; S.run.earn = 60; assert.ok(G.prestige()); r.pump(); const ended = r.queue().pop().run;
  for (const id of ['CL0', 'F1', 'F2', 'UPG', 'UAD']) { assert.ok(G.allocate(id), id); r.pump(); }
  assert.ok(G.unallocate('UAD')); r.pump(); assert.ok(G.allocate('URR')); r.pump(); assert.ok(G.unallocate('URR')); r.pump(); assert.ok(G.allocate('UAD')); r.pump();
  assert.ok(G.beginRun()); r.pump();
  let e = r.last('run_start'); assert.equal(r.queue().pop().type, 'progress', 'and where the run begins goes with it'); assert.notEqual(e.run, ended, 'a new run, a new id'); assert.equal(e.data.n, 2);
  assert.equal(e.data.nodes.slice().sort().join(), 'CL0,F1,F2,UAD,UPG'); assert.equal(e.data.bought.slice().sort().join(), 'CL0,F1,F2,UAD,UPG'); assert.equal(e.data.dropped.join(), '', 'bought and handed back in one visit: neither');
  assert.equal(e.data.cores, G.cores()); const second = e.run;
  // the next visit hands one back that an earlier one bought
  S.maxLevel = 5; assert.ok(G.prestige()); r.pump(); assert.equal(r.queue().pop().run, second, 'the run that ended is the one that started');
  assert.ok(G.unallocate('UAD')); r.pump(); assert.ok(G.allocate('UMT')); r.pump(); assert.ok(G.beginRun()); r.pump();
  e = r.last('run_start'); assert.equal(e.data.n, 3); assert.equal(e.data.bought.join(), 'UMT'); assert.equal(e.data.dropped.join(), 'UAD'); assert.equal(e.data.nodes.slice().sort().join(), 'CL0,F1,F2,UMT,UPG');
});

test('the queue: sent together, kept if the post fails, and handed to the browser when the page goes away', () => {
  const r = load(HOST), { T } = r; T.init(); T.fail = true; T.setEnabled(true); T.push('error', { message: 'x' });
  assert.equal(r.queue().length, 2); assert.equal(r.posts.length, 1, 'the first post failed, and nothing was lost');
  T.fail = false; return Promise.resolve().then(() => T.flush()).then(ok => {
    assert.equal(ok, true); assert.equal(r.posts[1].body.split('\n').filter(Boolean).length, 2); assert.equal(r.queue().length, 0);
    T.push('error', { message: 'y' }); T.farewell(); assert.equal(r.beacons.length, 1); assert.equal(r.queue().length, 0);
    T.setEnabled(false); T.push('error', { message: 'z' }); T.farewell(); assert.equal(r.beacons.length, 1, 'nothing when it is off');
  });
});

test('an error: the message and where, with addresses cut down to file names, and no more than five a visit', () => {
  const r = load(HOST), { T } = r; T.init(); T.setEnabled(true); T.fail = true;
  T.error('boom at https://sdwr.github.io/smeltworks-idle/js/ui.js:10:5', 'Error: boom\n    at f (https://sdwr.github.io/smeltworks-idle/js/ui.js:10:5)\n    at file:///C:/Users/someone/code/game.js:3:1');
  const e = r.queue().pop(); assert.equal(e.type, 'error'); assert.ok(!/https?:|file:|Users/.test(JSON.stringify(e.data)), JSON.stringify(e.data)); assert.ok(/ui\.js:10:5/.test(e.data.stack) && /game\.js:3:1/.test(e.data.stack));
  for (let i = 0; i < 9; i++) T.error('again'); assert.equal(r.queue().filter(x => x.type === 'error').length, 5);
});
test('progress: where a run has got to, sent with the two-minute post and never once a level', () => {
  const r = load(HOST), { T, G, D } = r, S = G.S; T.init(); T.setEnabled(true); T.fail = true;
  const prog = () => r.queue().filter(e => e.type === 'progress');
  // a new save's first run begins with no visit to the tree: its first level is noted all the same
  { const f = load(HOST); f.T.init(); f.T.setEnabled(true); f.G.ev.push({ t: 'spawn' }); f.pump(); assert.deepEqual(JSON.parse(JSON.stringify(f.G.S.run.tp)), { hi: 1, sent: 0, lv: [[1, 0]], f: {} }); }
  // a run under way before any of this is known by where it is, not by when it got there
  S.maxLevel = 4; S.level = 4; S.run.time = 300; G.ev.push({ t: 'spawn' }); r.pump();
  assert.deepEqual(JSON.parse(JSON.stringify(S.run.tp)), { hi: 4, sent: 0, lv: [], f: {} }); assert.equal(prog().length, 0, 'noted in the save, not sent');
  // levels are reached: noted with the run's time, still nothing sent
  S.maxLevel = 5; S.run.time = 360.4; G.ev.push({ t: 'leveldone' }); r.pump(); S.maxLevel = 6; S.run.time = 431; G.ev.push({ t: 'leveldone' }); r.pump();
  S.level = 6; G.ev.push({ t: 'fail', boss: true, back: false }); r.pump(); S.level = 5; G.ev.push({ t: 'fail', boss: false, back: true }); r.pump();      // (the rules have already dropped the level by the time the event is heard)
  assert.equal(prog().length, 0); assert.deepEqual(JSON.parse(JSON.stringify(S.run.tp)), { hi: 6, sent: 0, lv: [[5, 360], [6, 431]], f: { 6: 2 } }, 'a fight lost and driven back is counted on the level it was lost on');
  assert.equal(JSON.parse(JSON.stringify(S)).run.tp.hi, 6, 'and it is in the save: a reload loses none of it');
  // the two-minute post says it once
  S.run.time = 500; T.beat(); let p = prog(); assert.equal(p.length, 1);
  assert.deepEqual(p[0].data, { n: 1, from: 0, to: 6, secs: 500, levels: [[5, 360], [6, 431]], fails: { 6: 2 } }); assert.equal(p[0].run, S.run.tid);
  T.beat(); T.beat(); assert.equal(prog().length, 1, 'nothing new, nothing sent');
  // fights lost with no new level wait ten minutes; the page going away does not wait
  G.ev.push({ t: 'fail', boss: false, back: false }); r.pump(); T.beat(); assert.equal(prog().length, 1, 'a stalled run does not chatter');
  T.farewell(); assert.equal(r.beacons.length, 1); p = r.beacons[0].body.split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.type === 'progress');
  assert.deepEqual(p[p.length - 1].data, { n: 1, from: 6, to: 6, secs: 500, levels: [], fails: { 5: 1 } });
  // the run ends: what had not been said goes first, then the run_end
  S.maxLevel = 8; S.run.time = 700; G.ev.push({ t: 'leveldone' }); r.pump(); assert.ok(G.prestige()); r.pump();
  const q = r.queue(); assert.equal(q[q.length - 1].type, 'run_end'); assert.equal(q[q.length - 2].type, 'progress');
  assert.deepEqual(q[q.length - 2].data, { n: 1, from: 6, to: 8, secs: 700, levels: [[7, 700], [8, 700]], fails: {} }); assert.equal(q[q.length - 2].run, q[q.length - 1].run); assert.equal(S.run.tp, undefined);
  // the next run begins at its first level, at once: a run abandoned on level 1 is still a run that was there
  S.tree.F1 = 1; assert.ok(G.beginRun()); r.pump(); const b = r.queue().pop(); assert.equal(b.type, 'progress'); assert.deepEqual(b.data, { n: 2, from: 0, to: 1, secs: 0, levels: [[1, 0]], fails: {} });
  // switched off: nothing is noted in the save
  T.setEnabled(false); S.maxLevel = 3; G.ev.push({ t: 'leveldone' }); r.pump(); assert.equal(S.run.tp.hi, 1); assert.equal(T.progress(true), false);
});
Promise.all(waits).then(() => console.log(process.exitCode ? 'some tests failed' : `${n} tests passed`));
