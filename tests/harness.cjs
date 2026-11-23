/* Loads the rules into a vm context (no DOM) and provides a bot that plays them. */
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function load(seed, real) {         // real: weapons roll their sockets as in the game (the sim); otherwise every one gets them all, so a test knows what it made
  const ctx = vm.createContext({ console, Math: Object.create(Math), Date, JSON, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'), escape, unescape, encodeURIComponent, decodeURIComponent });
  for (const f of ['data', 'game']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  if (seed != null) ctx.SW.util.seed(seed);
  ctx.SW.data.FORGE_SECS = 0;                     // weapons are made at once here: the anvil's second and a half is tested by itself
  ctx.SW.data.SOCK_ROLL0 = ctx.SW.data.SOCK_ROLL; if (!real) ctx.SW.data.SOCK_ROLL = [1, 0, 0];
  ctx.SW.game.init(null);
  return ctx.SW;
}
/* The bot. It keeps the weapon on the bench filled with its best loose skills,
   makes a weapon for every empty post as soon as it can pay, and once every post is manned scraps its weakest
   weapon for the one on the bench whenever that is clearly stronger: weapons cannot be levelled or changed, so
   better skills are the only way anything improves. Its gold goes on buying skills. It salvages what it cannot use,
   and never touches the forge or rerolls the bench. */
/* what a skill is worth to the bot: a little for its own tier, and its affixes by how useful they are and the tier each rolled */
const AFF_W = { dmg: 1, aspd: 1, crit: 0.8, boss: 0.5, time: 0.4, gold: 0.2, find: 0.2, click: 0.05, leech: 0.3 };
let TM = l => 1;
const VAL = [1, 1.4, 1.7, 1.9, 2];
const worth = g => 2 * TM(g.lvl) + 10 * g.aff.reduce((n, a) => n + (AFF_W[a.k] || 0.3) * VAL[a.t - 1], 0);
function botTurn(SW, o) {
  const G = SW.game, S = G.S; TM = SW.data.tier;
  if (!S.posts.length) return;                    // a new game: the cursor is all there is
  // a head start: once there are weapons on the line, go straight to the deepest level open (a lost fight brings it back)
  if (S.maxLevel > 1 && S.level === 1 && !o.jumped && S.posts.filter(P => P.unit).length >= Math.min(3, S.posts.length)) { o.jumped = true; G.goto(S.maxLevel); }
  // gold: skills, while there is room to look at them
  // (a weapon costs gold too: while a post stands empty, that much is kept back for it)
  const keep = S.bench.made ? 0 : G.makeCost();
  // a weapon that rolled two sockets short is made again, when gold is easy
  if (S.bench.made && !S.forge && S.bench.sockets.length < G.craftSockets() - 1 && S.gold >= 4 * G.makeCost()) G.make();
  // Upgrade: the cheapest rank on the line, whenever it is under half the gold in hand
  if (G.treeVal('uUp') && !o.noUp) for (let n = 0; n < 4; n++) {
    let best = -1; S.posts.forEach((P, p) => { if (P.unit && (P.unit.up || 0) < SW.data.UP.max && (best < 0 || G.upCost(P.unit) < G.upCost(S.posts[best].unit))) best = p; });
    if (best < 0 || G.upCost(S.posts[best].unit) > (S.gold - keep) * 0.5 || !G.upgrade(best)) break;
  }
  if (!o.noBuy) for (let n = 0; n < 6 && S.bag.length < 16 && S.gold - G.buyCost() >= keep; n++) if (!G.buySkill()) break;
  const best = (post, i, over) => S.bag.filter(g => G.fits(g, post, i) && worth(g) > over).sort((a, b) => worth(b) - worth(a))[0];
  const fill = () => {
    S.bench.sockets.forEach((s, i) => { const g = best(G.BENCH, i, s.gem ? worth(s.gem) * 1.1 : -1); if (g) G.socket(g.id, G.BENCH, i); });
  };
  const score = u => G.unitGems(u).reduce((n, g) => n + worth(g), 0);
  if (!S.bench.made) { if (!G.make() || !S.bench.made) return; }       // nothing on the bench: make a weapon (it takes gold, and a moment)
  fill();
  for (let n = 0; n < 4; n++) {
    const empty = G.emptyPost();
    if (empty >= 0) { if (!G.equip(empty)) break; if (!G.make() || !S.bench.made) break; fill(); continue; }
    let worst = 0; S.posts.forEach((P, p) => { if (score(P.unit) < score(S.posts[worst].unit)) worst = p; });
    const ready = S.bench.sockets.every((s, i) => s.gem || !best(G.BENCH, i, -1));
    if (!ready || score(S.bench) < score(S.posts[worst].unit) * 1.2 + 4) break;       // only its skills can make it better: every weapon grows alike
    G.sell(worst); G.equip(worst); if (!G.make() || !S.bench.made) break; fill();        // a post must be empty before a weapon can go to it
  }
  if (S.bag.length > 12) for (const g of S.bag.slice().sort((a, b) => worth(b) - worth(a)).slice(10)) G.salvage(g.id);
  if (!S.auto && S.stats.time - (o.offAt || 0) > 45) G.setAuto(true);
  if (S.auto) o.offAt = S.stats.time;
}
/* where a click catches the most enemies: on one of them, or midway between two */
function bestAim(SW) {
  const G = SW.game, es = G.alive(), R = G.X.cursor.radius; if (!es.length) return null;
  const spots = es.map(e => ({ x: e.x, y: e.y }));
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) spots.push({ x: (es[i].x + es[j].x) / 2, y: (es[i].y + es[j].y) / 2 });
  let best = null, bn = 0;
  for (const p of spots) { const n = es.filter(e => Math.hypot(e.x - p.x, e.y - p.y) <= R + e.r).length; if (n > bn) { bn = n; best = p; } }
  return best;
}
/* The bot at the tree: it buys with the cores it has banked, and what it buys it keeps. First what a line cannot do
   without, in order, saving for each: the weapon, a socket, the Market. Then power, by a rough measure of it
   (weapons, times what the skills in their sockets are worth at the tree's tier, times a guess at what Upgrade, the
   colours' skills and the Battle lines add): whichever buy gives the most for the cores it takes to reach, counting
   what lies on the way. If that one is beyond its means it saves. */
function allocTree(SW) {
  const G = SW.game, D = SW.data, S = G.S;
  const pathTo = target => {                       // the unheld nodes on the shortest way to it, from the held side, the target last
    const prev = { [target]: null }, todo = [target];
    while (todo.length) {
      const x = todo.shift();
      for (const y of D.NODE[x].near) {
        if (G.has(y)) { const path = []; for (let z = x; z; z = prev[z]) path.push(z); return path; }
        if (!(y in prev)) { prev[y] = x; todo.push(y); }
      }
    }
    return null;
  };
  const costOf = p => { let c = 0; for (const id of p) { c += G.nodeCost(id); S.tree[id] = 1; } for (const id of p) delete S.tree[id]; return c; };      // prices move as nodes are held
  const buy = p => { for (const id of p) if (!G.allocate(id)) throw new Error('could not buy ' + id); };
  for (const id of ['F1', 'F2', 'UBY']) if (!G.has(id)) { const p = pathTo(id); if (!p || costOf(p) > G.cores()) return; buy(p); }
  const POW = { post2: 'p', sock2: 's', tier: 't', dmg: 'd', might: 'd' }, EXTRA = { UPG: 1.35, ULF: 1.4, UAD: 1.25, UHX: 1.25, UMT: 1.15, SH: 1.18, SL: 1.1, ND: 1.05, PU1: 1.03, PU2: 1.03, KT1: 1.03 };
  // (what a tier point is worth: the average affix, on a skill of the tier the odds give, from 1 to that tier)
  const mean = pts => D.tierOdds(pts).reduce((s, p, T) => s + p * D.TIER_VAL.slice(0, T + 1).reduce((a, b) => a + b, 0) / (T + 1), 0);
  const model = o => o.p * (1 + 0.6 * Math.max(1, o.s - 0.5) * mean(o.t)) * (1 + o.d / 100) * o.x;
  for (;;) {
    const now = { p: G.treeVal('post') + G.treeVal('post2'), s: G.treeVal('sock') + G.treeVal('sock2'), t: G.treeVal('tier'), d: G.treeVal('dmg') + G.treeVal('might'), x: 1 };
    let best = null, bestGain = 0, bestCost = 0;
    for (const n of D.TREE) if ((POW[n.eff] || EXTRA[n.id]) && !G.has(n.id)) {
      const p = pathTo(n.id); if (!p) continue;
      const after = Object.assign({}, now); for (const id of p) { const m = D.NODE[id]; if (POW[m.eff]) after[POW[m.eff]] += m.amt; if (EXTRA[id]) after.x *= EXTRA[id]; }
      const cost = costOf(p), gain = Math.log(model(after) / model(now)) / cost;
      if (gain > bestGain) { bestGain = gain; best = p; bestCost = cost; }
    }
    if (!best || bestCost > G.cores()) break;
    buy(best);
  }
  // with nothing left that adds power, the rest of the tree, cheapest first
  if (!D.TREE.some(n => (POW[n.eff] || EXTRA[n.id]) && !G.has(n.id))) for (;;) {
    const open = D.TREE.filter(n => G.canAllocate(n.id)).sort((a, b) => G.nodeCost(a.id) - G.nodeCost(b.id))[0];
    if (!open) break; G.allocate(open.id);
  }
}

/* play for `secs` of game time; returns the time each level was first cleared (in the run that first cleared it).
   The bot resets when a run has stalled: no new level for o.stall seconds (ten minutes unless told). It lays out
   its tree afresh each time. o.runs collects one line for each run it finished. */
function play(SW, secs, o) {
  o = o || {};
  const G = SW.game, clears = {}, step = 0.05, stall = o.stall || 600;
  let nextBot = 0, lastNew = 0, lastMax = G.S.maxLevel, began = 0;
  for (let t = 0; t < secs; t += step) {
    if (G.S.maxLevel !== lastMax) { lastMax = G.S.maxLevel; lastNew = t; }
    // before it holds the first two nodes (a post, then a socket) a run is over as soon as there is a point for the
    // next of them. Otherwise, when it stalls
    if (!o.noPrestige && G.canPrestige() && (t - lastNew > stall || (!G.has('F2') && G.cores() + G.runCores() >= (G.has('F1') ? 2 : 1)))) {
      const reached = G.S.maxLevel, earned = G.runCores(); G.prestige(); allocTree(SW); G.beginRun();
      if (o.runs) o.runs.push({ at: t, secs: t - began, reached, earned, cores: G.cores(), nodes: G.spent(), tier: G.tierPoints(), posts: G.S.posts.length, socks: G.craftSockets() });
      began = t; lastNew = t; lastMax = G.S.maxLevel; o.jumped = false; nextBot = t;
    }
    if (t >= nextBot) { botTurn(SW, o); nextBot = t + 1; }
    // an active player holds the button on the best spot; even the idle bot has to click its way through the two
    // short runs before there are skills, and to a first weapon
    const hold = !!o.active || !G.skillsOn() || !G.S.posts.some(P => P.unit) || !G.has('ULF');       // and until it has bought its first Life
    if (hold) { const p = bestAim(SW); if (p) G.aim(p.x, p.y); }
    G.setHold(hold);
    G.update(step);
    for (const ev of G.ev) if (ev.t === 'cleared' && clears[ev.level] == null) clears[ev.level] = t;
    G.ev.length = 0;
    if (o.until && G.S.maxLevel > o.until) break;
  }
  return clears;
}
module.exports = { allocTree, load, botTurn, play, bestAim };
