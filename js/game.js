/* Smeltworks Idle — the rules. No DOM in here: the tests and the pacing sim load this file on its own. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util;
const G = SW.game = { S: null, F: null, X: null, ev: [], offline: null };
const emit = (t, o) => { if (G.ev.length < 400) G.ev.push(Object.assign({ t }, o)); };

/* ------------------------------------------------------------------ state */
/* Patch notes (js/notes.js): a save keeps the id of the newest one it has been shown (S.notes). A new save starts with
   them all counted as read; one from before there were any has read none. */
const notes = () => (SW.notes || []).filter(n => n && n.id > 0 && n.lines && n.lines.length);
G.noteTop = () => notes().reduce((m, n) => Math.max(m, n.id), 0);
G.unseenNotes = () => notes().filter(n => n.id > (G.S.notes || 0)).sort((a, b) => b.id - a.id);
G.seeNotes = () => { G.S.notes = Math.max(G.S.notes || 0, G.noteTop()); };
G.fresh = function () {
  const S = {
    v: 1, gate: 2, gold: 0, crafter: 0, runs: 0, hsOut: 1, tailIn: 1, col3: 1, k1at8: 1, notes: G.noteTop(),
    best: 1,                 // the deepest level ever reached
    bank: 0,                 // cores in hand: what runs have earned, less what the tree has cost
    tree: {},                // the nodes of the prestige tree that are held
    alloc: false,            // true between a reset and the next run: the only time the tree can be changed
    run: { drops: 0, kills: 0, time: 0, earn: 0, paid: 0 },      // what this run has done so far (earn: the cores it has earned, banked at prestige; paid: the highest level it has been paid for)
    level: 1, maxLevel: 1, fight: 0, auto: true,
    posts: [], bag: [], bench: null, uid: 1,
    cur: { up: 0, sockets: [] },      // the cursor: its Upgrade rank this run, and its sockets (G.cursorSockets)
    stats: { kills: 0, clicks: 0, bosses: 0, fails: 0, gold: 0, drops: 0, bought: 0, time: 0, made: 0 },
    opts: { sound: true, buy: 1 }, seen: Date.now(), gps: 0,
  };
  for (let i = 0; i < D.POSTS0; i++) S.posts.push({ unit: null });
  return S;
};
const freshFight = () => ({ es: [], enc: null, eid: 1, meter: {}, meterT: 0, life: null, wait: 0, cd: [], nova: {}, cdC: 0, hold: false, ax: 0, ay: 0, goldWin: 0, winT: 0, dur: 0, skip: 0 });
G.init = function (saved) {
  G.S = saved || G.fresh();
  const S = G.S;
  if (!S.bench) S.bench = G.blankBench();
  // what has been unlocked before, so that only what is new to you is pointed out (see G.features)
  if (!S.unl) S.unl = saved ? G.features() : {};
  G.F = freshFight();
  if (saved && S.fight > 0 && S.life > 0) G.F.life = S.life;      // partway through a level: the fight begins again, with the Life that was left
  G.ev.length = 0;
  G.tidy();
  G.recompute();
  G.spawn();
};

/* ------------------------------------------------------------------ skills */
const round = (v, dec) => dec ? Math.round(v * 10) / 10 : Math.round(v);
/* a primary affix is flat: the skill's own number, whatever the level and whichever copy it is */
G.primVal = gem => D.SKILL[gem.sk].v;
/* a secondary affix is worth its tier, and nothing else: there is no range. The tiers flatten towards the top (D.TIER_VAL) */
G.affVal = (gem, a) => { const per = D.AFFIX[a.k].per, v = per * D.TIER_VAL[Math.min(D.TIER_MAX, a.t) - 1]; return per < 5 ? Math.round(v * 10) / 10 : Math.round(v); };      // (a small one keeps a decimal: 1.4 Life on kill)
/* the highest tier an affix on this skill can roll: the skill's own */
G.tierOf = gem => D.tier(gem.lvl);
const rollTier = gem => 1 + Math.floor(U.rng() * G.tierOf(gem));
G.rollAffix = function (gem, not) {
  const have = new Set(gem.aff.map(a => a.k)); if (not) have.add(not);
  const pool = D.AFFIXES.filter(a => !have.has(a.id));
  return { k: U.wpick(pool, a => a.w).id, t: rollTier(gem) };
};
G.rollGem = function (lvl, boss, skill, depth) {      // lvl: its tier's level; depth: the level it came from (how often it has two affixes)
  const S = G.S, gem = { id: S.uid++, sk: skill || G.dropOf(U.pick(D.SKILLS)), lvl, aff: [] };
  const n = U.rng() < D.twoChance(depth || lvl, boss) ? 2 : 1;      // one, or two: more often with level
  while (gem.aff.length < n) gem.aff.push(G.rollAffix(gem));
  return gem;
};
G.color = gem => D.SKILL[gem.sk].c;
/* A skill's tier is rolled as it comes (dropped, bought, or with the run), whatever level it came from: one of the
   five, by odds that the tree's tier nodes tilt towards the top (D.tierOdds). */
G.tierPoints = () => G.treeVal('tier');
/* ...and by how deep it came from: every D.TIER_DEPTH levels count as one more tier point, for that skill. A drop goes by
   the level it dropped on, a skill bought or given by the deepest level of the run. (With no level given, the tree alone.) */
G.depthPoints = lvl => lvl ? Math.floor((lvl - 1) / D.TIER_DEPTH) : 0;
G.tierOdds = lvl => D.tierOdds(G.tierPoints() + G.depthPoints(lvl));
G.rollSkillTier = lvl => { const o = G.tierOdds(lvl); let r = U.rng(); for (let t = 0; t < o.length; t++) { r -= o[t]; if (r <= 0) return t + 1; } return o.length; };
G.dropLevel = lvl => 1 + D.TIER_LVLS * (G.rollSkillTier(lvl) - 1);      // (a tier, as the level it is kept as)
/* A colour's real skills are a node on the tree. Until it is held, a skill of that colour comes as the colour's plain
   one: so what would have been this skill drops as. The colours' odds are the same either way. */
G.colourOpen = c => G.treeVal(D.UNLOCK[c]) > 0;
G.dropOf = sk => G.colourOpen(sk.c) ? sk.id : D.PLAIN[sk.c].id;
/* the skills that can come to you now: each open colour's own, and each closed colour's plain one */
G.dropping = () => D.ALL_SKILLS.filter(k => k.plain ? !G.colourOpen(k.c) : G.colourOpen(k.c));
/* how many times as often skills drop, for the kinds there are to drop: one with the three plain ones, 8/3 with all eight real ones */
G.dropRows = () => G.dropping().length / D.DROP_ROWS;
/* how much the skills already loose in the bag slow the next drop: 1 with none, a half with D.DROP_HELD of them */
G.dropSlow = () => 1 / (1 + G.S.bag.length / D.DROP_HELD);
/* and how much a nearly bare bag hurries it. It goes by rows: of the kinds of skill open to drop, how many have one loose in the bag. With
   none it is D.DROP_LOW.mult, easing to 1 as D.DROP_LOW.share of the rows are filled. Not for a boss, whose drop is fixed */
G.dropHurry = function () {
  const kinds = G.dropping(), have = new Set(G.S.bag.map(g => g.sk)), filled = kinds.filter(k => have.has(k.id)).length;
  return 1 + (D.DROP_LOW.mult - 1) * Math.max(0, 1 - filled / (kinds.length * D.DROP_LOW.share));
};
/* is this enemy on fire enough to show it? (a burn fades out and never quite reaches nothing) */
G.burning = e => !e.dead && e.burn > e.max * 0.0002;
/* where a loose skill is: { gem, bag: index } or { gem, post: BENCH or CURSOR, i: socket }. Two things have sockets
   a skill can be moved in and out of: the weapon on the bench, until it is equipped, and the cursor, always.
   The skills inside a made weapon are not found: they are its stats now, and nothing can reach them. */
const CURSOR = G.CURSOR = -1, BENCH = G.BENCH = -2;
G.find = function (id) {
  const S = G.S;
  let i = S.bag.findIndex(g => g.id === id);
  if (i >= 0) return { gem: S.bag[i], bag: i };
  i = S.bench ? S.bench.sockets.findIndex(s => s.gem && s.gem.id === id) : -1;
  if (i >= 0) return { gem: S.bench.sockets[i].gem, post: BENCH, i };
  i = S.cur.sockets.findIndex(s => s.gem && s.gem.id === id);
  if (i >= 0) return { gem: S.cur.sockets[i].gem, post: CURSOR, i };
  return null;
};
const socks = post => post === CURSOR ? G.S.cur.sockets : G.S.bench ? G.S.bench.sockets : [];
const getSock = (post, i) => socks(post)[i].gem;
const setSock = (post, i, gem) => { socks(post)[i].gem = gem; };
G.sockColor = (post, i) => post === CURSOR ? null : G.S.bench.sockets[i].c;      // the cursor's sockets have no colour: they take any skill
G.sockGem = (post, i) => { const k = socks(post)[i]; return k ? k.gem : null; };
G.socketExists = (post, i) => (post === BENCH || post === CURSOR) && !!socks(post)[i];
/* a weapon takes one of each skill. Only the plain ones (Might, Hex, Aid) go in as many times as there are sockets:
   is there a copy of this skill in another socket of the weapon on the bench already? */
G.dupe = (gem, i, post) => !D.SKILL[gem.sk].plain && socks(post == null ? BENCH : post).some((s, j) => j !== i && s.gem && s.gem.id !== gem.id && s.gem.sk === gem.sk);
G.fits = (gem, post, i) => G.socketExists(post, i) && (post === CURSOR || G.sockColor(post, i) === G.color(gem)) && !G.dupe(gem, i, post);
/* the bag keeps itself in order: by colour, then by primary affix (the skills in the order D.SKILLS lists them, so
   every Ignite sits together), then the highest level first */
const ORDER = { r: 0, b: 1, g: 2 };
function toBag(gem) { const S = G.S; S.bag.push(gem); S.bag.sort((a, b) => ORDER[G.color(a)] - ORDER[G.color(b)] || D.ALL_SKILLS.indexOf(D.SKILL[a.sk]) - D.ALL_SKILLS.indexOf(D.SKILL[b.sk]) || b.aff.length - a.aff.length || b.lvl - a.lvl || a.id - b.id); }
G.tidy = function () { const S = G.S, all = S.bag.splice(0); for (const g of all) toBag(g); };
/* put a skill in a socket of the weapon on the bench, or of the cursor. Whatever was there goes where the skill
   came from if it fits, and to the bag if not. */
G.socket = function (id, post, i) {
  const S = G.S, at = G.find(id);
  const benchBusy = p => p === BENCH && (S.forge || !S.bench.made);      // (the bench is busy while a weapon is on the anvil; the cursor never is)
  if (!at || benchBusy(post) || (at.bag == null && benchBusy(at.post)) || !G.socketExists(post, i) || !G.fits(at.gem, post, i)) return false;
  if (at.post === post && at.i === i) return false;
  const old = getSock(post, i);
  if (at.bag != null) S.bag.splice(at.bag, 1); else setSock(at.post, at.i, null);
  setSock(post, i, at.gem); delete at.gem.nw;
  if (old) { if (at.bag == null && G.fits(old, at.post, at.i)) setSock(at.post, at.i, old); else toBag(old); }
  G.recompute(); emit('socket');
  return true;
};
G.unsocket = function (id) {
  const at = G.find(id); if (!at || at.bag != null || (at.post === BENCH && G.S.forge)) return false;      // (not while it is on the anvil)
  setSock(at.post, at.i, null); toBag(at.gem);
  G.recompute(); emit('socket');
  return true;
};
/* the first empty socket this skill fits: on the bench if there is a weapon there to take it, and if not, the cursor's */
G.autoSocket = function (id) {
  const S = G.S, at = G.find(id); if (!at || at.bag == null) return false;
  if (S.bench && S.bench.made && !S.forge) for (let i = 0; i < S.bench.sockets.length; i++) if (!S.bench.sockets[i].gem && G.fits(at.gem, BENCH, i)) return G.socket(id, BENCH, i);
  for (let i = 0; i < S.cur.sockets.length; i++) if (!S.cur.sockets[i].gem && G.fits(at.gem, CURSOR, i)) return G.socket(id, CURSOR, i);
  return false;
};
/* a skill has been looked at: it stops glowing */
G.inspect = function (id) { const at = G.find(id); if (!at || !at.gem.nw) return false; delete at.gem.nw; return true; };
/* the bag has a row for each skill, and a row holds D.ROW. (A skill coming back off the bench is never turned away,
   so a row can run over; nothing new joins it until it is back under.) */
G.rowCount = sk => G.S.bag.reduce((n, g) => n + (g.sk === sk ? 1 : 0), 0);
G.hasRoom = sk => G.rowCount(sk) < D.ROW;
G.give = function (gem, quiet) {
  const S = G.S;
  if (!G.hasRoom(gem.sk)) {
    // its row is full, so one of them is salvaged: one with no secondary affix before any other, and of those (or,
    // if there is none, of them all) the newest, which is the one arriving unless it has an affix and another has none
    const plain = gem.aff.length ? S.bag.filter(g => g.sk === gem.sk && !g.aff.length && !g.lock).sort((a, b) => b.id - a.id)[0] : null;
    const out = plain || gem, d = G.salvageValue(out); S.gold += d;
    if (plain) S.bag.splice(S.bag.indexOf(plain), 1);
    if (!quiet) emit('bagfull', { gold: d, sk: gem.sk, kept: !!plain });
    if (!plain) return false;
  }
  if (!quiet) gem.nw = 1;                         // new: it glows until you look at it
  toBag(gem); S.stats.drops++; S.run.drops++;
  if (!quiet) emit('drop', { gem });
  return true;
};

/* ------------------------------------------------------------------ the forge */
const spend = n => { if (G.S.gold < n) return false; G.S.gold -= n; return true; };       // the forge is paid in gold
/* buy a skill: a random one of those the bag has room for, at your deepest level, rolled just as a monster there
   would drop it. */
G.buyCost = () => Math.ceil(D.buyCost(D.PRICE_LVL) * (1 - Math.min(75, G.treeVal('cheap')) / 100));
/* which one is not yours to choose: it goes by the bag, an empty row first (pickKind) */
G.buySkill = function () {
  const S = G.S; if (!G.skillsOn()) return false;       // the Market comes with the first socket
  const open = D.SKILLS.map(k => D.SKILL[G.dropOf(k)]).filter(k => G.hasRoom(k.id));        // only a skill whose row has room
  if (!open.length || !spend(G.buyCost())) return false;
  const gem = G.rollGem(G.dropLevel(S.maxLevel), false, pickKind(open.map(k => k.id)), S.maxLevel);      // an empty row first, as with drops
  G.give(gem); S.stats.bought = (S.stats.bought || 0) + 1;
  emit('bought', { gem });
  return gem;
};
G.salvage = function (id) {
  const at = G.find(id); if (!at || at.gem.lock) return false;
  if (at.bag != null) G.S.bag.splice(at.bag, 1); else setSock(at.post, at.i, null);
  G.S.gold += G.salvageValue(at.gem);
  if (at.bag == null) G.recompute();
  emit('salvage');
  return true;
};
G.salvageLoose = function () { let n = 0; for (const g of G.S.bag.slice()) if (!g.lock && G.salvage(g.id)) n++; return n; };
G.lock = function (id) { const at = G.find(id); if (!at) return false; at.gem.lock = at.gem.lock ? 0 : 1; return true; };
/* ------------------------------------------------------------------ crafting a skill
   Two ways are always there: roll its affixes' tiers again, or replace its affixes with as many new ones. The rest
   are unlocked by nodes of the prestige tree (the `node` of each), and cost more. All work on a loose skill (in the
   bag or on the bench), for gold, and never touch its primary affix but Transmuting. */
const craftMult = () => 1 - Math.min(75, G.treeVal('craft')) / 100;
/* (working on a skill's affixes is dear: 26 to take one off, 39 to roll them again, 52 to add one, 156 for a third, where a reroll of the weapon is 26.
   Prices are fixed, so this is where a deep run's gold goes: a whole line of third affixes is a long saving.) */
D.CRAFTS = [
  { id: 'strip',  name: 'Remove affix', price: 'strip', mult: 2.6, node: 'cAdd', can: g => g.aff.length > 0, why: 'No affix', text: () => 'One, at random' },
  { id: 'recast', name: 'Reroll affixes', price: 'recast', mult: 3,   can: g => g.aff.length > 0, why: 'No affix', text: () => 'New affixes' },
  { id: 'add',    name: 'Add an affix', price: 'recast', mult: 4,   node: 'cAdd', can: g => g.aff.length < 2, why: 'Has two already', text: () => 'One more affix' },
  { id: 'third',  name: 'Add a third affix', price: 'recast', mult: 12,  node: 'cThird', can: g => g.aff.length === 2, why: 'Needs two affixes', text: () => 'A third affix' },
  { id: 'morph',  name: 'Transmute', price: 'recast', mult: 2,   node: 'cMorph', can: () => true, text: () => 'Becomes another skill' },
];
D.CRAFT_BY = {}; D.CRAFTS.forEach(c => D.CRAFT_BY[c.id] = c);
G.craftUnlocked = id => { const c = D.CRAFT_BY[id]; return !!c && (!c.node || G.treeVal(c.node) > 0); };
/* what a craft costs goes by how deep the run has been, as a new weapon and a bought skill do: not by the skill */
G.craftCost = (id, gem) => { const c = D.CRAFT_BY[id]; return Math.ceil(D.FORGE[c.price](D.PRICE_LVL) * c.mult * craftMult()); };
/* craft a skill */
G.craft = function (kind, id) {
  const at = G.find(id), c = D.CRAFT_BY[kind]; if (!at || !c || !G.craftUnlocked(kind)) return false;
  const gem = at.gem; if (!c.can(gem)) return false;
  if (!spend(G.craftCost(kind, gem))) return false;
  if (kind === 'strip') gem.aff.splice(Math.floor(U.rng() * gem.aff.length), 1);      // which one goes is not yours to choose
  else if (kind === 'recast') { const n = gem.aff.length; gem.aff = []; while (gem.aff.length < n) gem.aff.push(G.rollAffix(gem)); }
  else if (kind === 'add' || kind === 'third') gem.aff.push(G.rollAffix(gem));
  else if (kind === 'morph') {
    const others = D.SKILLS.map(k => G.dropOf(k)).filter(id => id !== gem.sk); if (others.length) gem.sk = U.pick(others);
    if (at.bag == null && at.post !== CURSOR && G.sockColor(at.post, at.i) !== G.color(gem)) { setSock(at.post, at.i, null); toBag(gem); }       // it no longer fits its socket (the cursor's take any)
    else G.tidy();
  }
  G.recompute(); emit('forge', { kind });
  return true;
};
/* the two that have always been there, by their old names */
G.forgeRecast = id => G.craft('recast', id);

/* ------------------------------------------------------------------ troops and the crafter */
G.unitName = u => D.WEAPONS[u.type].name;      // a weapon has no quality: its name is its type
G.emptyPost = () => G.S.posts.findIndex(p => !p.unit);
G.craftSockets = () => Math.min(D.CRAFT.max, D.CRAFT.sockets0 + G.S.crafter);
const rollColor = (type, not) => U.wpick(['r', 'b', 'g'].filter(c => c !== not), c => D.WEAPONS[type].col[c]);
const rollQuality = () => 1;                    // there is no quality roll any more: every weapon of a type is the same
/* how many sockets a weapon is made with: all the tree has unlocked, or one or two short (D.SOCK_ROLL), never fewer than one */
const rollSockets = () => { const max = G.craftSockets(), r = U.rng(), R = D.sockRoll(max); return max < 1 ? 0 : Math.max(1, max - (r < R[0] ? 0 : r < R[0] + R[1] ? 1 : 2)); };
/* a fresh weapon for the bench: a random type, and its roll of sockets */
G.rollBench = function () {
  const S = G.S, type = U.pick(D.WEAPON_IDS), sockets = [];
  for (let i = 0, n = rollSockets(); i < n; i++) sockets.push({ c: rollColor(type), gem: null });
  return { id: S.uid++, type, q: rollQuality(), sockets, made: true };
};
/* A run's first weapon always has a socket for a skill already in the bag: nobody starts on a weapon nothing they
   hold will go in. If none of its sockets is a colour the bag has, one of them becomes one (by the type's own odds). */
function fitFirst(B) {
  const S = G.S, have = ['r', 'b', 'g'].filter(c => S.bag.some(g => G.color(g) === c));
  if (!B.sockets.length || !have.length || B.sockets.some(s => have.includes(s.c))) return;
  U.pick(B.sockets).c = U.wpick(have, c => D.WEAPONS[B.type].col[c]);
}
/* the bench with nothing on it: until a weapon is made there is nothing to socket, reroll or equip */
G.blankBench = () => ({ id: G.S.uid++, type: 'sword', q: 1, sockets: [], made: false });
G.benchMade = () => !!G.S.bench.made;
/* the Second bench node: one weapon, skills and all, can be set aside while another is worked on. Swap changes
   them over (the first time, a fresh weapon comes to the bench). */
G.hasSpare = () => G.treeVal('bench2') > 0;
/* the panes and buttons there are to use right now, by name: what the tree has unlocked */
G.features = function () {
  const S = G.S, f = {};
  if (G.treeVal('uClick')) f.upcursor = 1;
  if (S.posts.length) f.troops = 1;
  if (G.skillsOn()) f.skills = 1;
  if (S.posts.length && G.treeVal('uReroll')) f.rerolls = 1;
  if (S.posts.length && G.treeVal('uUp')) f.upgrade = 1;
  if (G.skillsOn()) f.market = 1;
  // a weapon slot past the first, a socket on the bench past the first, and each socket of the cursor's: lit the first time a run has that many
  if (S.posts.length > 1) f['slots' + S.posts.length] = 1;
  if (S.posts.length && G.craftSockets() > 1) f['socks' + G.craftSockets()] = 1;
  if (S.cur && S.cur.sockets.length) f['csocks' + S.cur.sockets.length] = 1;
  if (G.skillsOn()) for (const sk of G.dropping()) f['sk-' + sk.id] = 1;      // each skill that can come to you: its name is lit the first time it can
  if (S.posts.length && G.hasSpare()) f.bench2 = 1;
  for (const c of D.CRAFTS) if (c.node && G.skillsOn() && G.treeVal(c.node)) f['craft-' + c.id] = 1;
  return f;
};
G.swapBench = function () {
  const S = G.S; if (!G.hasSpare() || S.forge) return false;
  if (!S.bench.made && !S.spare) return false;    // nothing on either bench
  const aside = S.spare || G.blankBench();
  S.spare = S.bench.made ? S.bench : null; S.bench = aside;
  G.recompute(); emit('bench', { kind: 'swap' });
  return true;
};
/* what it costs to reroll the bench: 'all' of it, or one half and keep the other, which is dearer: the 'type'
   alone (the sockets stay), or the 'socks' alone (the type and its damage roll stay). */
G.benchCost = () => Math.ceil(D.MAKE * D.gold(D.PRICE_LVL) * D.CRAFT.part * (1 - Math.min(D.REROLL_CUT, G.treeVal('reroll')) / 100));      // (never down to what a new weapon costs)
G.benchReroll = function (kind) {
  const S = G.S, B = S.bench, c = G.benchCost(kind);
  if (kind !== 'type' && kind !== 'socks') return false;      // (the whole weapon again is Make)
  if (!G.treeVal('uReroll') || S.forge || !B.made) return false;        // rerolling is a node on the tree, and needs a weapon on the bench
  if (S.gold < c) return false;
  S.gold -= c;
  // it goes back on the anvil: the same three blows as a new weapon, and the bench is busy until it is done
  if (D.FORGE_SECS > 0) { S.forge = { left: D.FORGE_SECS, kind }; emit('forging', { secs: D.FORGE_SECS, kind }); }
  else reforged(kind);
  return true;
};
function reforged(kind) {
  const S = G.S, B = S.bench; S.forge = null;
  if (kind === 'socks') {                    // every socket's colour, by the type's own odds; how many it has stays as it was made. Skills on the bench go back to the bag
    const was = B.sockets.map(s => s.c).join('');
    for (const s of B.sockets) if (s.gem) { toBag(s.gem); s.gem = null; }
    for (let n = 0; n < 12; n++) { for (const s of B.sockets) s.c = rollColor(B.type); if (B.sockets.map(s => s.c).join('') !== was) break; }      // never the same set again
    if (S.run.made === 1) fitFirst(B);       // still the run's first weapon: it keeps a socket for something in the bag
  }
  else { B.type = U.pick(D.WEAPON_IDS.filter(t => t !== B.type)); B.q = rollQuality(); }      // always a different type; the sockets and what is in them stay
  G.recompute(); emit('bench', { kind });
}
G.salvageValue = gem => D.FORGE.salvage(D.PRICE_LVL, gem.aff.length);
G.unitGems = u => u.sockets.map(s => s.gem).filter(Boolean);
/* what scrapping a weapon pays: the salvage of the skills that went into it */
G.scrapValue = u => G.unitGems(u).reduce((n, g) => n + G.salvageValue(g), 0) + Math.floor((u.upGold || 0) * D.UP.back);      // and half of what went into upgrading it
/* Upgrading: with the tree's Upgrade node a weapon on the line can be struck up a rank for gold (D.UP) */
/* The cursor is upgraded with gold as a weapon is, once the tree's first node (Cursor upgrade) is held: a strike adds
   one to three ranks, each rank D.CUP.dmg% of its blow, and costs more the higher it stands. It lasts the run. */
G.cursorSockets = () => (G.treeVal('sock') ? 1 : 0) + G.treeVal('cSock');
G.curMult = () => 1 + D.CUP.dmg / 100 * ((G.S.cur && G.S.cur.up) || 0);
G.curUpCost = () => Math.ceil(D.CUP.cost * D.gold(D.PRICE_LVL) * Math.pow(D.CUP.step, G.S.cur.up || 0));
G.canUpCursor = () => !!(G.treeVal('uClick') && (G.S.cur.up || 0) < D.CUP.max && G.S.gold >= G.curUpCost());
G.upCursor = function () {
  const S = G.S; if (!G.canUpCursor()) return false;
  const c = G.curUpCost(), was = S.cur.up || 0, gain = Math.min(D.CUP.max - was, D.UP.gain[0] + Math.floor(U.rng() * (D.UP.gain[1] - D.UP.gain[0] + 1)));
  S.gold -= c; S.cur.up = was + gain;
  G.recompute(); emit('upgrade', { post: CURSOR, rank: S.cur.up, gain });
  return true;
};
G.upMult = u => 1 + D.UP.dmg / 100 * (u.up || 0);
G.upCost = u => Math.ceil(D.UP.cost * D.gold(D.PRICE_LVL) * Math.pow(D.UP.step, u.up || 0));
G.canUpgrade = post => { const S = G.S, P = S.posts[post]; return !!(G.treeVal('uUp') && P && P.unit && (P.unit.up || 0) < D.UP.max && S.gold >= G.upCost(P.unit)); };
G.upgrade = function (post) {
  const S = G.S; if (!G.canUpgrade(post)) return false;
  const u = S.posts[post].unit, c = G.upCost(u);
  const was = u.up || 0, gain = Math.min(D.UP.max - was, D.UP.gain[0] + Math.floor(U.rng() * (D.UP.gain[1] - D.UP.gain[0] + 1)));      // one to three ranks, as the strike falls
  S.gold -= c; u.up = was + gain; u.upGold = (u.upGold || 0) + c;
  G.recompute(); emit('upgrade', { post, rank: u.up, gain });
  return true;
};
/* can the bench's weapon be made, onto this post (the first empty one if none is named)? Making is free, but it
   needs an empty post: to replace a troop, scrap it first. */
/* Making a weapon: gold, and D.FORGE_SECS at the anvil, for a new weapon on the bench, its type and every socket
   rolled afresh (so making again is the reroll of the whole thing; skills in the old one go back to the bag). It
   costs D.MAKE kills' gold at your deepest level. Equipping it, once you have set its skills, is free. */
G.makeCost = () => Math.ceil(D.MAKE * D.gold(D.PRICE_LVL));
G.canMake = function () { const S = G.S; return S.posts.length > 0 && !S.forge && S.gold >= G.makeCost(); };
G.make = function () {
  const S = G.S; if (!G.canMake()) return false;
  S.gold -= G.makeCost();
  if (D.FORGE_SECS > 0) { S.forge = { left: D.FORGE_SECS }; emit('forging', { secs: D.FORGE_SECS }); }
  else forged();
  return true;
};
/* the new weapon comes off the anvil, on to the bench */
function forged() {
  const S = G.S;
  if (S.forge && S.forge.kind) return reforged(S.forge.kind);      // a reroll of the weapon's type or sockets, not a new weapon
  for (const sk of S.bench.sockets) if (sk.gem) toBag(sk.gem);
  S.forge = null; S.stats.made++; S.bench = G.rollBench();
  if (!S.run.made) fitFirst(S.bench);             // the run's first weapon
  S.run.made = (S.run.made || 0) + 1;
  G.recompute(); emit('made');
}
G.forging = () => !!G.S.forge;
/* can the weapon on the bench go to this post (the first empty one if none is named)? It needs a weapon, and an
   empty post: to replace a troop, scrap it first. */
G.canEquip = function (post) {
  const S = G.S; if (post == null) post = G.emptyPost();
  const P = S.posts[post];
  return !!P && !P.unit && S.bench.made && !S.forge;
};
/* equip it: free, at once and for good. Its skills are its stats from here on, and an empty socket is lost */
G.equip = function (post) {
  const S = G.S; if (post == null) post = G.emptyPost();
  if (!G.canEquip(post)) return false;
  const u = S.bench; delete u.made;
  u.sockets = u.sockets.filter(sk => sk.gem);     // what is left of them is only a record of what went in
  S.posts[post].unit = u; S.bench = G.blankBench();
  G.F.cd[post] = 0; delete G.F.meter[post];
  G.recompute(); emit('buy', { post });
  return true;
};
/* scrap a troop: the skills that went into it are salvaged for gold, and the post is free */
G.sell = function (post) {
  const S = G.S, P = S.posts[post]; if (!P || !P.unit) return false;
  S.gold += G.scrapValue(P.unit); P.unit = null; delete G.F.meter[post];
  G.recompute(); emit('sell', { post });
  return true;
};
G.swapPosts = function (a, b) {
  const P = G.S.posts; if (!P[a] || !P[b] || a === b) return false;
  [P[a].unit, P[b].unit] = [P[b].unit, P[a].unit];
  G.recompute(); emit('socket');
  return true;
};
/* ------------------------------------------------------------------ prestige: cores and the tree */
/* A run earns cores (D.CORE, for each level it clears); prestige banks them; nodes are bought with them (D.PRICE) */
G.cores = () => G.S.bank || 0;
G.runCores = () => (G.S.run && G.S.run.earn) || 0;
/* what clearing a level is worth to this run: all of D.CORE if no run before this one cleared it, D.CORE_OLD of it if one did */
G.coreFor = lvl => D.CORE(lvl) * (lvl > D.CORE_FREE && lvl < ((G.S.run && G.S.run.deep) || 1) ? D.CORE_OLD : 1);      // (the first D.CORE_FREE levels always pay in full)
G.spent = () => Object.keys(G.S.tree).length;      // how many nodes are held
G.has = id => id === 'start' || !!G.S.tree[id];
/* what the held nodes of one kind add up to */
G.treeVal = function (eff) { let v = 0; for (const id in G.S.tree) { const n = D.NODE[id]; if (n && n.eff === eff) v += n.amt; } return v; };
/* what a node costs: its own price, which never moves. Weapons, sockets and tiers cost more the further out they are */
G.nodeCost = function (id) {
  const n = D.NODE[id], P = D.PRICE; if (!n) return Infinity;
  if (typeof P[id] === 'number') return P[id];
  const bead = P.bead[0] + P.bead[1] * n.dist, far = k => P[k][0] * Math.pow(P[k][1], n.dist - P[k][2]);
  if (n.eff === 'tier') return Math.round(far('tier') * (n.big ? P.tierBig : 1));
  if (n.eff === 'post2' || n.eff === 'sock2') return Math.round(far(n.eff));
  if (n.eff === 'bench2') return P.bench2;
  if (n.eff === 'purse' || n.eff === 'tail' || n.eff === 'kitAll') return P.conv;
  return Math.round(n.big ? bead * P.notable : bead);
};
/* the first node (D.TREE_GATE: the first weapon, in the middle) comes before everything else.
   Skills are for sockets: until a weapon has one, none drop and none are sold. */
G.gateHeld = () => D.TREE_GATE.every(G.has);
G.skillsOn = () => G.craftSockets() > 0;
/* a node can be bought, between runs, if it touches one that is held (or the start) and there are the cores for it */
/* ...and, after the first weapon, Upgrade and the socket come before anything else (D.TREE_FIRST) */
G.firstHeld = () => D.TREE_FIRST.every(G.has);
G.gated = id => !D.TREE_GATE.includes(id) && !D.TREE_FIRST.includes(id) && !G.firstHeld() && !(D.TREE_WITH[id] && G.has(D.TREE_WITH[id]));
G.touches = id => { const n = D.NODE[id]; return !!n && !G.has(id) && !G.gated(id) && n.near.some(G.has); };
G.canAllocate = id => G.S.alloc && G.touches(id) && G.cores() >= G.nodeCost(id);
G.allocate = function (id) {
  const S = G.S; if (!G.canAllocate(id)) return false;
  const c = G.nodeCost(id); S.bank -= c; S.tree[id] = 1;
  emit('tree', { id, on: true }); return true;
};
/* Any node can be handed back while the tree is open (between runs), one at a time and for what it costs: one bought
   a moment ago or many runs ago. The one condition is that everything else held still reaches the middle without it,
   so a tree is taken apart from its tips inwards. There is no clearing it all at once. */
G.canRemove = function (id) {
  const S = G.S; if (!S.alloc || !S.tree[id]) return false;
  if (D.TREE_GATE.includes(id) || D.TREE_FIRST.includes(id)) return false;      // the first three (the weapon, Upgrade and the socket) are never handed back: everything else can be
  const seen = new Set(['start']), todo = ['start'], near = x => x === 'start' ? D.TREE_START : D.NODE[x].near;
  while (todo.length) for (const y of near(todo.pop())) if (y !== id && y !== 'start' && S.tree[y] && !seen.has(y)) { seen.add(y); todo.push(y); }
  return seen.size === G.spent();          // the start, and every held node but this one
};
G.unallocate = function (id) { const S = G.S; if (!G.canRemove(id)) return false; S.bank += G.nodeCost(id); delete S.tree[id]; emit('tree', { id, on: false }); return true; };
/* how many levels a run begins with already open: the Head start, as far as the deepest level ever cleared */
G.headLevels = () => Math.min(G.treeVal('head'), G.S.best - 1);
/* a run's beginning: level 1, nothing in hand but what the tree gives */
function newRun() {
  const S = G.S, head = G.headLevels();
  S.maxLevel = 1 + head; S.level = S.maxLevel; S.fight = 0; S.auto = true; S.gps = 0;      // a Head start begins the run that many levels in
  S.gold = G.treeVal('purse') * D.PURSE;      // Purse nodes: each one the gold to set a weapon up (D.PURSE)
  S.bag = []; for (const P of S.posts) P.unit = null;
  S.bench = G.blankBench(); S.spare = null;
  S.run = { drops: 0, kills: 0, time: 0, earn: 0, paid: 0, part: 0, deep: S.best || 1 };      // (deep: levels below this were cleared in a run before, and pay less)
  for (let i = 0, n = G.skillsOn() ? G.treeVal('kit') : 0; i < n; i++) {
    let sk = i < S.bench.sockets.length ? D_pick(S.bench.sockets[i].c, S.bag.map(g => g.sk)) : G.dropOf(U.pick(D.SKILLS));
    if (!G.hasRoom(sk)) sk = U.pick(G.dropping().filter(k => G.hasRoom(k.id))).id;
    const g = G.rollGem(G.dropLevel(S.maxLevel), false, sk, S.maxLevel); g.nw = 1; toBag(g);
  }
  if (G.skillsOn() && G.treeVal('kitAll')) fullKit();
}
/* a skill of this colour, and not one of these (a weapon takes one of each): the plain one if there is nothing else left */
const D_pick = (c, not) => { const ks = D.SKILLS.filter(k => k.c === c).map(k => G.dropOf(k)).filter(id => !not || D.SKILL[id].plain || !not.includes(id)); return ks.length ? U.pick(ks) : D.PLAIN[c].id; };
/* the Full kit: one of every kind of skill there is to drop, as the run begins */
function fullKit() { const S = G.S; for (const k of G.dropping()) if (G.hasRoom(k.id)) { const g = G.rollGem(G.dropLevel(S.maxLevel), false, k.id, S.maxLevel); g.nw = 1; toBag(g); } }
/* the first run can be reset once it has reached level D.PRESTIGE_AT; after the first prestige, any run at any time */
G.canPrestige = () => !G.S.alloc && (G.S.runs > 0 || G.S.maxLevel >= D.PRESTIGE_AT);
/* prestige: the run ends here. Levels, gold, weapons and skills go, and the tree opens: nothing more happens until
   G.beginRun. */
G.prestige = function () {
  const S = G.S; if (!G.canPrestige()) return false;
  // what the run was, for whoever is listening (the play data), before it is cleared away
  const was = { level: S.maxLevel, secs: Math.round(S.run.time || 0), kills: S.run.kills || 0, fails: S.run.fails || 0, first: S.maxLevel > S.best,
    weapons: S.posts.filter(P => P.unit).length, ups: S.posts.reduce((n, P) => n + (P.unit && P.unit.up || 0), 0), skills: S.posts.reduce((n, P) => n + (P.unit ? P.unit.sockets.filter(s => s.gem).length : 0), 0) };
  S.best = Math.max(S.best, S.maxLevel); S.runs++; S.alloc = true;
  const earned = G.runCores(); S.bank = G.cores() + earned; S.run.earn = 0;      // the run's cores are banked, and the tree opens
  S.gold = 0; S.gps = 0; S.level = 1; S.maxLevel = 1; S.fight = 0; S.bag = []; S.forge = null; for (const P of S.posts) P.unit = null;
  S.bench = G.blankBench(); S.spare = null;
  G.F = freshFight(); G.recompute(); G.spawn();
  emit('prestige', { earned, cores: G.cores(), was });
  return true;
};
/* the tree is settled: build the line it gives and begin. Unspent points are kept for next time. */
G.beginRun = function () {
  const S = G.S; if (!S.alloc) return false;
  S.alloc = false; delete S.fresh;                // the tree is fixed until the run ends (S.fresh: left by saves from when only a node bought that visit could be handed back)
  S.posts = []; for (let i = 0, n = Math.min(D.POSTS_MAX, D.POSTS0 + G.treeVal('post') + G.treeVal('post2')); i < n; i++) S.posts.push({ unit: null });
  S.crafter = Math.min(D.CRAFT.max - D.CRAFT.sockets0, G.treeVal('sock') + G.treeVal('sock2'));
  S.cur = { up: 0, sockets: Array.from({ length: G.cursorSockets() }, () => ({ gem: null })) };      // the cursor starts each run bare: no ranks, empty sockets
  newRun();
  G.F = freshFight(); G.recompute();
  if (D.RUN_SECS > 0) { G.F.wait = D.RUN_SECS; G.F.opening = true; G.F.life = G.X.lifeMax; } else G.spawn();      // a moment at the forge before the first enemies come
  emit('run', { secs: D.RUN_SECS });
  return true;
};

/* a weapon (or the cursor) and the skills in it. Nothing else goes into what it does: there are no levels. */
function holder(base, q, gems, glob, type) {
  const p = {}, a = {}, n = {};
  for (const g of gems) {
    const v = G.primVal(g);
    if (D.SKILL[g.sk].aura) glob[g.sk] = Math.max(glob[g.sk], v);       // auras do not stack: one of each kind counts, and they are all alike
    else { p[g.sk] = (p[g.sk] || 0) + v; n[g.sk] = (n[g.sk] || 0) + 1; }
    for (const af of g.aff) a[af.k] = (a[af.k] || 0) + G.affVal(g, af);
  }
  for (const k of ['gold', 'time', 'find', 'click', 'leech']) glob[k] += a[k] || 0;
  return { base, q, p, a, n, type };
}
/* how often a Shockwave strikes */
G.novaEvery = () => G.treeVal('novaN') ? 4 : D.AOE.novaEvery;
function finish(h, glob) {
  const p = h.p, a = h.a, v = k => p[k] || 0, w = k => a[k] || 0;
  const T = G.treeVal, is = t => h.type === t;        // the prestige tree: what it does for this type of weapon, and for afflictions
  const W = {
    dmg: h.base.dmg * h.q * (1 + w('dmg') / 100) * (1 + glob.warcry / 100) * (h.type ? 1 + (T('might') + T('dmg')) / 100 : 1 + T('cDmg') / 100),      // (Battle line and Whetstones: the weapons, not the cursor; Heavy hand: the cursor, not the weapons)
    aps: h.base.aps * (1 + w('aspd') / 100) * (1 + glob.rally / 100) * (is('sword') ? 1 + T('swd') / 100 : 1) * (h.type ? 1 : 1 + T('cSpd') / 100),      // (Quick hand: the cursor's own)
    crit: Math.min(100, D.CRIT + (h.base.crit || 0) + w('crit') + (is('dagger') ? T('dag') : 0)),
    critMult: (is('dagger') && T('dagN') ? 3 : D.CRIT_MULT) + v('savage') / 100,      // Deathblow adds to what a critical already deals
    carry: h.base.carry || 0,                    // how many more enemies a blow's overkill can go on to
    twin: v('twin') + (is('sword') && T('swdN') ? 20 : 0),
    boss: w('boss') + (is('axe') ? T('axe') : 0),
    // a hit from the holder of one of these always afflicts
    frost: v('frost') > 0, stun: v('concuss'),
    brittle: v('shatter') > 0 ? D.BRITTLE.per + (T('britN') ? 1 : 0) : 0, ignite: v('ignite'),
    // splash, arc and pierce are the weapon's own: no skill adds them, but the tree's weapon nodes do
    splash: is('hammer') ? h.base.splash + T('ham') : is('axe') && T('axeN') ? 30 : h.base.splash || 0,
    pierce: is('bow') ? h.base.pierce + T('bow') : h.base.pierce || 0,
    nova: v('nova'),
  };
  W.arcN = h.base.arc ? 1 + (is('staff') && T('stfN') ? 2 : 0) : 0; W.arc = is('staff') ? h.base.arc + T('stf') : h.base.arc || 0;
  W.radius = D.AOE.cursor * (h.type ? 1 : 1 + T('cRad') / 100); W.splashR = D.AOE.splash * (is('hammer') && T('hamN') ? 1.6 : 1); W.pierceW = D.AOE.pierce * (is('bow') && T('bowN') ? 2 : 1);
  // power: an estimate of its damage per second against one enemy. Its own blows only: criticals, twin strikes,
  // burning and Shockwave are in it; area damage, afflictions and what it gives the rest of the line are not.
  const crit = 1 + W.crit / 100 * (W.critMult - 1);
  W.power = W.dmg * crit * (W.aps * (1 + W.twin / 100) + W.nova / 100 / G.novaEvery()) * (1 + W.ignite / 100);
  return W;
}
G.recompute = function () {
  const S = G.S, glob = { rally: 0, warcry: 0, ward: 0, gold: 0, time: 0, find: 0, click: 0, leech: 0 };
  const hc = holder(D.CURSOR, G.curMult(), ((S.cur && S.cur.sockets) || []).map(s => s.gem).filter(Boolean), glob);      // the cursor: its Upgrade ranks and the skills in its sockets; the line's auras reach it all the same
  const hu = S.posts.map(P => P.unit ? holder(D.WEAPONS[P.unit.type], P.unit.q * G.upMult(P.unit), P.unit.sockets.map(s => s.gem).filter(Boolean), glob, P.unit.type) : null);
  const X = G.X = {
    cursor: finish(hc, glob), units: hu.map(h => h ? finish(h, glob) : null), glob,
    lifeMax: D.LIFE + G.treeVal('life') + Math.min(D.LIFE_CAP - D.LIFE, glob.time),      // what you begin with, the tree's Life nodes, and Life affixes up to their cap
    goldMult: (1 + glob.gold / 100) * (1 + G.treeVal('gold') / 100), dropMult: (1 + glob.find / 100) * (1 + G.treeVal('drops') / 100),
    leech: Math.min(D.LEECH_CAP, glob.leech),      // Life on kill, the whole line's together, up to its cap
    chill: D.CHILL, ward: glob.ward,      // the Defense Aura: every enemy's blow takes this much less Life
    // the tree's afflictions, read once here: the tree cannot change during a run
    novaEvery: G.novaEvery(), chillDmg: G.treeVal('chillN') ? 15 : 0, britMax: D.BRITTLE.max, cull: G.treeVal('cull') ? D.CULL : 0, stunImmune: G.treeVal('stunN') ? 1 : D.STUN.immune, wildfire: !!G.treeVal('burnN'),
  };
  // Cursor damage: a weapon that carries the affix adds that share of its own blow to the click. It is added after
  // the cursor's ranks and nodes, which multiply the cursor's own 6 and not what the weapons lend it. In a cursor
  // socket the affix is a share of the click itself, lent damage and all, and what it adds is click damage too, so it
  // feeds on itself: with a share r in the cursor's sockets the click is 1 / (1 - r) of what it was. (r is held under
  // D.CLICK_SELF, so that more sockets or higher tiers can never run it away)
  { const own = X.cursor.dmg; let lent = 0; hu.forEach((h, i) => { if (h) lent += (h.a.click || 0) / 100 * X.units[i].dmg; });
    const r = Math.min(D.CLICK_SELF, (hc.a.click || 0) / 100), all = (own + lent) / (1 - r); X.cursor.own = own; X.cursor.lent = all - own; X.cursor.power *= all / own; X.cursor.dmg = all; }
  X.cooldown = Math.max(D.CURSOR.minCd, 1 / X.cursor.aps);                 // seconds between the cursor's blows
  // more Life to hold (a weapon made, a Life affix) is Life in hand at once; less is only a lower ceiling
  if (G.F) { if (G.F.lifeMax != null && X.lifeMax > G.F.lifeMax && G.F.life > 0) G.F.life += X.lifeMax - G.F.lifeMax; G.F.lifeMax = X.lifeMax; if (G.F.life > X.lifeMax) G.F.life = X.lifeMax; }
  X.power = X.units.reduce((s, W) => s + (W ? W.power : 0), 0);
  // the weapon on the bench, as it would be if it were made. What it would give the others is worked out on a
  // copy, so nothing on the bench touches the fight.
  const g2 = Object.assign({}, glob);
  X.bench = finish(holder(D.WEAPONS[S.bench.type], S.bench.q, S.bench.sockets.map(s => s.gem).filter(Boolean), g2, S.bench.type), g2);
  return X;
};

/* ------------------------------------------------------------------ the arena
   Positions are in arena units: the middle is (0, 0), the weapons stand on a ring D.RING out. */
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
G.isBoss = (fight) => fight === D.FIGHTS - 1;
G.postPos = function (i) { const a = -Math.PI / 2 + Math.PI * 2 * i / G.S.posts.length; return { x: Math.cos(a) * D.RING, y: Math.sin(a) * D.RING }; };
G.alive = () => G.F.es.filter(e => !e.dead);
const ringSpots = (n, R) => { const a0 = U.rng() * Math.PI * 2, out = []; for (let i = 0; i < n; i++) out.push({ x: Math.cos(a0 + Math.PI * 2 * i / n) * R, y: Math.sin(a0 + Math.PI * 2 * i / n) * R }); return out; };
/* n spots packed round the middle, `gap` apart: a honeycomb, nearest first */
function hexSpots(n, gap) {
  const pts = [];
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) pts.push({ x: gap * (q + r / 2), y: gap * r * 0.866 });
  pts.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
  const a = U.rng() * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
  return pts.slice(0, n).map(p => ({ x: p.x * c - p.y * s + U.rand(-0.5, 0.5), y: p.x * s + p.y * c + U.rand(-0.5, 0.5) }));
}
/* one enemy. hp, hit and gold are multiples of an ordinary monster of this level */
G.enemy = function (m, o) {
  const F = G.F;
  return Object.assign({ id: F.eid++, name: m.name, spr: m.spr, pal: m.pal, x: 0, y: 0, r: 5, hp: 1, max: 1, gold: 0, dmg: 0, int: m.int, atkT: m.int * U.rand(0.55, 1.1), n: 0,
    boss: false, slam: false, chill: 0, stun: 0, immune: 0, brit: 0, britPer: 0, britT: 0, burn: 0, dead: false,
    ox: 0, oy: 0, wx: 0, wy: 0, wt: 0, rest: 0, mv: 0 }, o);       // ox, oy: its place in the group; wx, wy: where it has meandered to from there; mv: walking now
};
/* Roaming (D.ROAM). Its dice are its own, so that where the enemies happen to walk never changes what drops. */
let mseed = 20261122;
const mrand = () => { mseed = (mseed * 1664525 + 1013904223) >>> 0; return mseed / 4294967296; };
/* the encounter as a whole: it walks to a spot, stays a moment, and picks another */
function drift(dt) {
  const R = G.F.roam; if (!R) return;
  if (R.wait > 0) { R.wait -= dt; return; }
  const d = dist(R.x, R.y, R.tx, R.ty), s = D.ROAM.group * dt;
  if (d > s) { R.x += (R.tx - R.x) / d * s; R.y += (R.ty - R.y) / d * s; return; }
  R.x = R.tx; R.y = R.ty; R.wait = D.ROAM.stay[0] + mrand() * (D.ROAM.stay[1] - D.ROAM.stay[0]);
  const a = mrand() * Math.PI * 2, r = R.R * Math.sqrt(mrand()); R.tx = Math.cos(a) * r; R.ty = Math.sin(a) * r;
}
/* one of them: towards its place in the group, unless it has stopped to attack */
function walk(e, dt, slow) {
  const R = G.F.roam; e.mv = 0; if (!R) return;
  if (e.rest > 0) { e.rest -= dt; return; }
  if (e.atkT < Math.min(D.ROAM.windup, e.int * 0.3)) return;
  e.wt -= dt; if (e.wt <= 0) { e.wt = 1 + mrand() * 2; const a = mrand() * Math.PI * 2, l = D.ROAM.leash * mrand(); e.wx = Math.cos(a) * l; e.wy = Math.sin(a) * l; }
  const gx = R.x + e.ox + e.wx, gy = R.y + e.oy + e.wy, d = dist(e.x, e.y, gx, gy), s = D.ROAM.speed * slow * dt;
  if (d < 0.05) return;
  const k = Math.min(1, s / d); e.x += (gx - e.x) * k; e.y += (gy - e.y) * k; e.mv = d > 0.4 ? 1 : 0;
}
G.spawn = function () {
  const S = G.S, F = G.F, X = G.X, E = D.ENC, lvl = S.level, act = D.act(lvl), boss = G.isBoss(S.fight);
  const hp0 = D.hp(lvl, S.fight), hit0 = D.hit(lvl), gold0 = D.gold(lvl), es = [];
  const add = (m, hp, hit, gold, o) => { const h = Math.ceil(hp0 * hp); es.push(G.enemy(m, Object.assign({ hp: h, max: h, dmg: m.hit * hit0 * hit, gold: gold0 * gold }, o))); };
  const place = (from, pts) => pts.forEach((p, i) => { es[from + i].x = p.x; es[from + i].y = p.y; });
  const small = act.mobs.filter(m => m.hp <= 0.9);
  let type, name;
  if (boss) {
    type = E.cycle[lvl % E.cycle.length];
    const T = E[type];
    if (type === 'actboss') {
      const m = act.boss, g = U.pick(act.mobs);
      add(m, T.hp * m.hp, T.hit || 1, T.gold, { boss: true, slam: true, r: 11 });
      for (let i = 0; i < T.n; i++) add(g, T.minHp / T.n, T.minHit / T.n, T.minGold / T.n, { r: 4.5 });
      place(1, ringSpots(T.n, D.SPREAD.guards)); name = m.name;
    } else if (type === 'elder') {
      const m = U.pick(act.mobs); add(m, T.hp, T.hit, T.gold, { boss: true, r: 10, name: 'Elder ' + m.name }); name = 'Elder ' + m.name;
    } else if (type === 'trio') {
      const m = U.pick(act.mobs);
      for (let i = 0; i < T.n; i++) add(m, T.hp / T.n, T.hit / T.n, T.gold / T.n, { boss: true, r: 5.5, name: 'Elder ' + m.name });
      place(0, ringSpots(T.n, D.SPREAD.trio)); name = 'Three Elders: ' + m.name;
    } else {
      const m = U.pick(act.mobs.filter(x => x.hp >= 0.9)), g = U.pick(small);
      add(m, T.hp, T.hit, T.gold, { boss: true, r: 7.5, name: 'Elder ' + m.name });
      for (let i = 0; i < T.n; i++) add(g, T.minHp / T.n, T.minHit / T.n, T.minGold / T.n, { r: 3.6 });
      place(1, ringSpots(T.n, D.SPREAD.warband)); name = 'Elder ' + m.name + ' and its warband';
    }
  } else {
    type = S.run.kills === 0 ? 'single' : U.wpick(['single', 'pack', 'swarm'], k => E[k].w);
    const T = E[type];
    const even = D.roomEven(act);                  // (a room pays by the life in it, and every act's rooms pay the same on average: see D.roomEven)
    if (type === 'single') { const m = U.wpick(act.mobs, x => x.hp); add(m, m.hp, 1, m.hp * even, { r: m.hp >= 1.4 ? 9 : 8 }); name = m.name; }
    else {
      const m = U.pick(type === 'swarm' ? small : act.mobs), n = U.irand(T.n[0], T.n[1]);
      for (let i = 0; i < n; i++) add(m, m.hp * T.hp / n, T.hit / n, m.hp * T.hp / n * even, { r: type === 'swarm' ? 3.6 : 5 });
      place(0, type === 'swarm' ? hexSpots(n, D.SPREAD.swarm) : ringSpots(n, D.SPREAD.pack / (2 * Math.sin(Math.PI / n))));
      name = (type === 'swarm' ? 'Swarm: ' : 'Pack: ') + m.name;
    }
  }
  F.es = es;
  // each one's place in the group is where it starts, and the group may wander as far as keeps them all on the field
  let reach = 0; for (const e of es) { e.ox = e.x; e.oy = e.y; reach = Math.max(reach, Math.hypot(e.x, e.y) + e.r + D.ROAM.leash); }
  F.roam = { x: 0, y: 0, tx: 0, ty: 0, R: Math.max(0, D.ROAM.field - reach), wait: 0.15 };
  F.enc = { type, name, boss, actBoss: type === 'actboss', n: es.length, max: es.reduce((s, e) => s + e.max, 0), drop: (E[type] && E[type].drop) || 1, lost: false };
  /* Tailwind: the fight before this one was won in under a second, and the tree's Tailwinds rolled this one away. It is
     made as it would have been, and then not fought: it pays what its enemies would have paid, drops what it would
     have dropped, and counts as won. Never a boss: a skip that would fall on one is let go. */
  if (F.skip > 0) {
    if (!boss) {
      F.skip--;
      const fn = G.fightNo(), first = !(S.run.won && S.run.won[fn]) && fn > (S.run.base == null ? -1 : S.run.base); let gold = 0;
      for (const e of es) gold += e.gold * X.goldMult * D.FIRST_GOLD[first ? 'first' : 'again'];
      S.gold += gold; S.stats.gold += gold; S.stats.kills += es.length; S.run.kills += es.length; F.goldWin += gold; S.run.tail = (S.run.tail || 0) + 1;
      if (S.fight === 0) F.life = X.lifeMax;      // a level's Life is full at its first fight, fought or not
      spoils(F.enc); S.fight++; F.es = [];
      emit('tailwind', { gold, name });
      return G.spawn();
    }
    F.skip = 0;
  }
  F.dur = 0; F.first = null;
  // Life lasts the level: it is full at a level's first fight (so after a loss too, which always starts one), and
  // what is left of it carries from fight to fight after that
  if (S.fight === 0 || F.life == null) F.life = X.lifeMax; else F.life = Math.min(F.life, X.lifeMax);
  F.wait = 0; F.dead = false; F.opening = false;
  emit('spawn');
};

/* ------------------------------------------------------------------ the meter
   What each weapon (and the cursor) actually dealt, per second of fighting, over the last half minute: every blow,
   splash, arc and burn it caused, as it landed, and never more than the enemy had left. It is a measurement, not
   part of the save: it starts again when the page loads, and for a post when its weapon is made or scrapped. */
const METER = 30, mkey = who => who < 0 ? 'c' : who;
function dealt(key, d) { const F = G.F; if (F.first == null && d > 0) F.first = F.dur || 0;      // (the fight's first blow: Tailwind's second is counted from it)
  const m = F.meter[key] || (F.meter[key] = { b: new Array(METER).fill(0), i: 0, n: 1 }); m.b[m.i] += d; }
function meterTick(dt) {
  const F = G.F; F.meterT += dt;
  while (F.meterT >= 1) { F.meterT -= 1; for (const k in F.meter) { const m = F.meter[k]; m.i = (m.i + 1) % METER; m.b[m.i] = 0; m.n = Math.min(METER, m.n + 1); } }
}
G.actual = function (who) {
  const F = G.F, m = F.meter[mkey(who)]; if (!m) return 0;
  let sum = 0; for (const x of m.b) sum += x;
  return sum / Math.max(1, m.n - 1 + F.meterT);
};
G.actualTotal = () => Object.keys(G.F.meter).reduce((s, k) => s + G.actual(k === 'c' ? -1 : +k), 0);

/* ------------------------------------------------------------------ blows */
/* one blow landing on one enemy. `base` already carries the critical; kind says how it got there */
function land(e, W, base, who, crit, kind) {
  if (e.dead) return;
  let d = base;
  if (e.boss && W.boss) d *= 1 + W.boss / 100;
  if (e.brit) d *= 1 + e.brit * e.britPer / 100;
  if (e.chill > 0 && G.X.chillDmg) d *= 1 + G.X.chillDmg / 100;
  dealt(mkey(who), Math.min(d, e.hp)); e.hp -= d;
  emit('hit', { who, id: e.id, d, crit, kind });
  const dur = D.HEX_DUR;
  if (W.frost) e.chill = Math.max(e.chill, dur);
  if (W.stun && e.immune <= 0) { e.stun = W.stun * (e.boss ? D.STUN.boss : 1); e.immune = e.stun + G.X.stunImmune; emit('status', { id: e.id, s: 'stun' }); }
  if (W.brittle) { e.brit = Math.min(G.X.britMax, e.brit + 1); e.britPer = Math.max(e.britPer, W.brittle); e.britT = D.BRITTLE.dur; }
  if (W.ignite) { const b = d * W.ignite / 100, k = mkey(who); e.burn += b; (e.by || (e.by = {}))[k] = (e.by[k] || 0) + b; }      // who lit it gets the credit as it burns
  if (e.hp <= 0) { const over = -e.hp, x = e.x, y = e.y; kill(e); if (over > 0) carry(over, x, y, who, crit); }
  else cull(e);
}
/* Cull (a notable on the tree): an enemy brought to D.CULL% of its life or less dies there and then */
function cull(e) { const c = G.X.cull; if (c && !e.dead && e.hp > 0 && e.hp <= e.max * c / 100) { emit('cull', { id: e.id }); kill(e); return true; } return false; }
/* Overkill carries: what a blow had left over when its enemy died goes on to the nearest one still standing, and from
   that one to the next, until it is spent or the blow has carried as far as its weapon can (W.carry more enemies,
   for the whole blow, splash and all: carryLeft). It is damage and nothing else: it lays on no affliction and takes
   no bonus. So a heavy blow is not wasted on a small enemy, but no blow clears a whole swarm by itself. */
let carryLeft = 0;
function carry(over, x, y, who, crit) {
  while (over > 0 && carryLeft > 0) {
    carryLeft--;
    let t = null, bd = Infinity; for (const o of G.F.es) if (!o.dead) { const dd = dist(o.x, o.y, x, y); if (dd < bd) { bd = dd; t = o; } }
    if (!t) return;
    dealt(mkey(who), Math.min(over, t.hp)); t.hp -= over;
    emit('hit', { who, id: t.id, d: Math.min(over, over + t.hp), crit, kind: 'carry' });
    if (t.hp > 0) { cull(t); return; }
    over = -t.hp; x = t.x; y = t.y; kill(t);
  }
}
/* a whole blow: the enemies it lands on directly, then whatever it reaches by splash, arc and pierce.
   (px, py) is where it lands: the target for a weapon, the click for the cursor. */
function strike(W, who, direct, px, py, second) {
  const F = G.F, crit = U.rng() * 100 < W.crit, base = W.dmg * (crit ? W.critMult : 1), hit = new Set(direct);
  emit('strike', { who, x: px, y: py, crit, second });
  carryLeft = W.carry || 0;
  for (const e of direct) land(e, W, base, who, crit, 'main');
  if (W.splash > 0) for (const e of F.es) if (!e.dead && !hit.has(e) && dist(e.x, e.y, px, py) <= W.splashR + (who < 0 ? e.r : 0)) { hit.add(e); land(e, W, base * W.splash / 100, who, crit, 'splash'); }
  for (let k = 0, fx = direct[0].x, fy = direct[0].y; k < W.arcN; k++) {
    let best = null, bd = D.AOE.arcRange;
    for (const e of F.es) { if (e.dead || hit.has(e)) continue; const d = dist(e.x, e.y, fx, fy); if (d < bd) { bd = d; best = e; } }
    if (!best) break;
    hit.add(best); emit('arc', { fx, fy, id: best.id });
    fx = best.x; fy = best.y; land(best, W, base * W.arc / 100, who, crit, 'arc');
  }
  if (W.pierce > 0 && who >= 0) {
    const p = G.postPos(who), len = dist(p.x, p.y, px, py) || 1, ux = (px - p.x) / len, uy = (py - p.y) / len;
    emit('pierce', { who, ux, uy });
    for (const e of F.es) {
      if (e.dead || hit.has(e)) continue;
      const along = (e.x - p.x) * ux + (e.y - p.y) * uy, off = Math.abs((e.x - p.x) * uy - (e.y - p.y) * ux);
      if (along > 0 && off <= e.r + W.pierceW) { hit.add(e); land(e, W, base * W.pierce / 100, who, crit, 'pierce'); }
    }
  }
}
/* troops choose for themselves: the weakest enemy, unless the weapon reaches others, when it is whichever target
   takes the most of them with it */
function pickTarget(W, who) {
  const es = G.alive(); if (!es.length) return null;
  let best = null, bs = -1;
  const p = W.pierce > 0 ? G.postPos(who) : null;
  for (const t of es) {
    let s = 0;
    if (W.splash > 0) for (const e of es) if (e !== t && dist(e.x, e.y, t.x, t.y) <= W.splashR) s++;
    if (p) { const len = dist(p.x, p.y, t.x, t.y) || 1, ux = (t.x - p.x) / len, uy = (t.y - p.y) / len; for (const e of es) if (e !== t && (e.x - p.x) * ux + (e.y - p.y) * uy > 0 && Math.abs((e.x - p.x) * uy - (e.y - p.y) * ux) <= e.r + W.pierceW) s++; }
    if (s > bs || (s === bs && t.hp < best.hp)) { bs = s; best = t; }
  }
  return best;
}
/* whom a troop would strike if it struck now: the arena uses it to send the weapon, or its shot, on ahead */
G.target = i => { const W = G.X.units[i]; return W && G.F.wait <= 0 ? pickTarget(W, i) : null; };
function troopStrike(i) {
  const W = G.X.units[i];
  let t = pickTarget(W, i); if (!t) return;
  strike(W, i, [t], t.x, t.y, false);
  if (W.twin && U.rng() * 100 < W.twin && (t = pickTarget(W, i))) strike(W, i, [t], t.x, t.y, true);
}
/* the cursor lands on everything its circle touches. Nothing there: no blow, and no cooldown spent. */
const under = (x, y) => { const R = G.X.cursor.radius; return G.F.es.filter(e => !e.dead && dist(e.x, e.y, x, y) <= R + e.r); };
function cursorStrike(x, y) {
  const S = G.S, F = G.F, W = G.X.cursor;
  let direct = under(x, y); if (!direct.length) return false;
  S.stats.clicks++;
  strike(W, -1, direct, x, y, false);
  if (W.twin && U.rng() * 100 < W.twin && (direct = under(x, y)).length) strike(W, -1, direct, x, y, true);
  return true;
}
/* where a fight stands in the run: every fight of every level, counted from the first */
G.fightNo = () => (G.S.level - 1) * D.FIGHTS + G.S.fight;
function kill(e) {
  const S = G.S, F = G.F, X = G.X;
  e.dead = true; e.hp = 0;
  // a fight pays double the first time it is won in a run and half whenever it is won again. Each fight is kept (S.run.won), so the
  // levels a Head start skipped, or any you were driven back to without having fought there, still pay double their first time
  const fn = G.fightNo(), first = !(S.run.won && S.run.won[fn]) && fn > (S.run.base == null ? -1 : S.run.base), gold = e.gold * X.goldMult * D.FIRST_GOLD[first ? 'first' : 'again'];
  S.gold += gold; S.stats.gold += gold; S.stats.kills++; S.run.kills++; F.goldWin += gold;
  if (X.leech > 0 && F.life > 0) F.life = Math.min(X.lifeMax, F.life + X.leech);      // Life on kill
  emit('kill', { id: e.id, gold, boss: e.boss });
  // Wildfire: what was left of its burn passes to the nearest enemy still standing
  if (X.wildfire && e.burn > 0.001) {
    let to = null, bd = 1e9; for (const o of F.es) if (!o.dead) { const d2 = dist(o.x, o.y, e.x, e.y); if (d2 < bd) { bd = d2; to = o; } }
    if (to) { to.burn += e.burn; to.by = to.by || {}; for (const k in (e.by || {})) to.by[k] = (to.by[k] || 0) + e.by[k]; emit('status', { id: to.id, s: 'burn' }); }
    e.burn = 0;
  }
  if (!F.es.some(o => !o.dead)) won();
}
/* Which skill comes next, dropped or bought: the kinds whose rows in the bag are emptiest, far more often than the
   rest. Each copy of a kind already in its row makes it D.DROP_ROW times less likely, so an empty row is nearly
   always filled before a second copy of anything comes; and among rows as empty as each other, the kind that came
   last is passed over three times in four, so the same one does not come twice running. */
function pickKind(ids) {
  const S = G.S, held = id => S.bag.reduce((n, g) => n + (g.sk === id ? 1 : 0), 0);
  const n = {}; for (const k of ids) n[k] = held(k);
  const again = ids.some(k => k !== S.run.last && n[k] <= n[S.run.last]);      // (only if another row is as empty as its own)
  const id = U.wpick(ids, k => Math.pow(D.DROP_ROW, -n[k]) * (k === S.run.last && again ? 0.25 : 1));
  S.run.last = id; return id;
}
const nextDrop = () => pickKind(G.dropping().map(k => k.id));
/* a skill for the first empty socket on the bench that nothing loose in the bag would fill; any skill if there is none */
G.starterSkill = starterSkill;
function starterSkill() {
  const S = G.S, on = S.bench.sockets.filter(s => s.gem).map(s => s.gem.sk), spare = S.bag.slice();
  for (const s of S.bench.sockets) {
    if (s.gem) continue;
    const j = spare.findIndex(g => G.color(g) === s.c && (D.SKILL[g.sk].plain || !on.includes(g.sk)));      // a second copy of a skill is no use to this weapon
    if (j < 0) return D_pick(s.c, on);
    on.push(spare.splice(j, 1)[0].sk);
  }
  return G.dropOf(U.pick(D.SKILLS));
}
/* the arena is empty */
/* what a fight leaves behind when it is over, fought or waved through: its drops, and its place among the fights won */
function spoils(enc) {
  const S = G.S, X = G.X;
  /* Skills drop more often the more kinds there are to drop: a new game has three (a plain one of each colour) and
     each colour's node on the tree opens its real ones, eight in all. So a kind you want comes as often with every
     colour open as it did with none. A boss's drops do not grow: one from an act's boss, one from any other boss every
     second time (D.DROP_BOSS), whatever is open. */
  // And the fuller the bag, the slower they come, a boss's too: a hoard is not added to at the rate an empty bag is filled
  const want = (enc.boss ? D.DROP_BOSS[enc.actBoss ? 1 : 0] : D.DROP * enc.drop * X.dropMult * G.dropRows() * G.dropHurry()) * G.dropSlow();
  /* and they are evened out a little, so that they do not come in clumps and droughts: the run keeps count of how
     far its drops are behind what the odds owed it (or ahead), and half of that is added to (or taken from) the
     next fight's chance. Over a run the rate is the same; a long dry spell is not possible. */
  const owed = S.run.owed || 0, aim = Math.max(0, want + D.DROP_EVEN * owed);
  let drops = Math.floor(aim); if (aim > drops && U.rng() < aim - drops) drops++;
  // a new run: the first fights always drop a skill, and one that fits the weapon waiting on the bench
  const starter = S.run.drops < D.STARTER;
  if (starter && drops < 1) drops = 1;
  if (!G.skillsOn()) drops = 0;                   // until weapons have a socket there are no skills at all
  else S.run.owed = U.clamp(owed + want - drops, -3, 3);
  while (drops-- > 0) G.give(G.rollGem(G.dropLevel(S.level), enc.boss, starter ? starterSkill() : nextDrop(), S.level));
  S.run.far = Math.max(S.run.far == null ? -1 : S.run.far, G.fightNo()); (S.run.won || (S.run.won = {}))[G.fightNo()] = 1;
}
/* how many of the next fights a fast win waves through: one for each Tailwind the tree holds, D.TAIL.max at the most */
G.tailSkips = () => Math.min(D.TAIL.max, G.treeVal('tail') * D.TAIL.per);
const tailRoll = () => G.tailSkips();
function won() {
  const S = G.S, F = G.F, enc = F.enc;
  if (!(F.life > 0)) F.life = 1;                  // the last blow landed as the last of your Life went: you stand, barely
  if (enc.boss) S.stats.bosses++;
  /* Tailwind: an easy fight, so the next may not need fighting at all (G.spawn). Easy is won within D.TAIL.secs of
     its first blow landing, not of its opening: a hammer takes two and a half seconds to come round, and the fight
     it then ends in one blow is as easy as any a dagger wins. Counted from the opening, slow weapons never had one. */
  F.skip = !enc.boss && F.dur - (F.first == null ? F.dur : F.first) < D.TAIL.secs ? tailRoll() : 0;      // (and not off a boss: a level always opens with a fight)
  spoils(enc);
  S.fight++;
  if (S.fight >= D.FIGHTS) {
    S.fight = 0; let pay = 0;
    /* Cores: a level pays the first time the run clears it, and with it, at D.SKIP_PAY of their worth, any levels below
       that the run has not been paid for (the ones a Head start passed over, which it did not fight). It goes by the
       levels cleared, not by where the run began: a run that starts too deep and is driven back still earns for
       what it does clear. */
    /* ...and a level pays in full only the first time it is ever cleared. One cleared in an earlier run (below
       S.run.deep, the deepest level there was when this run began, and past the first D.CORE_FREE) pays D.CORE_OLD of that: cores come from getting
       deeper. Parts of a core are kept (S.run.part) and paid when they come to a whole one. */
    const paidNow = S.level > (S.run.paid || 0);      // (the first time this run has cleared it)
    if (S.level > (S.run.paid || 0)) {
      let sum = G.coreFor(S.level); for (let l = (S.run.paid || 0) + 1; l < S.level; l++) sum += G.coreFor(l) * D.SKIP_PAY;
      sum += S.run.part || 0; pay = Math.floor(sum + 1e-9); S.run.part = sum - pay; S.run.paid = S.level; S.run.earn = G.runCores() + pay;
    }
    if (S.level === S.maxLevel) {
      S.maxLevel++; if (S.maxLevel > S.best) S.best = S.maxLevel;
      G.recompute();
      emit('cleared', { level: S.level, pay });
    }
    const done = S.level;
    if (S.auto) S.level = Math.min(S.level + 1, S.maxLevel);
    F.wait = D.LEVEL_PAUSE; emit('leveldone', { level: done, pay, next: S.level, secs: D.LEVEL_PAUSE, deeper: paidNow && done >= (S.run.deep || 1), half: paidNow && G.coreFor(done) < D.CORE(done) });      // the interlude
    return;
  }
  F.wait = D.SPAWN;
}
/* the enemy got through all your Life. A boss sends you round the level again; an ordinary fight means the level
   is too much, so you fall back one, and climb again from there. */
function fail() {
  const S = G.S, F = G.F, enc = F.enc;
  enc.lost = true; S.stats.fails++; S.run.fails = (S.run.fails || 0) + 1;
  let back = false;
  if (!enc.boss && S.level > 1) { S.level--; back = true; }
  S.fight = 0; F.skip = 0;
  F.wait = D.DEATH_SECS; F.dead = true;      // down for the count: nothing fights until it is over (the forge and the bag still work)
  emit('fail', { boss: enc.boss, back, secs: D.DEATH_SECS });
}
G.update = function (dt) {
  const S = G.S, F = G.F, X = G.X;
  if (S.alloc) return;                            // between runs, while the tree is open, nothing moves
  S.stats.time += dt; S.run.time += dt;
  F.winT += dt; if (F.winT >= 5) { S.gps = S.gps * 0.7 + (F.goldWin / F.winT) * 0.3; F.goldWin = 0; F.winT = 0; }
  F.cdC = Math.max(-dt, F.cdC - dt);              // the cursor's cooldown runs whether or not there is anything to hit
  if (S.forge) { S.forge.left -= dt; if (S.forge.left <= 0) forged(); }      // and so does the anvil
  if (F.wait > 0) {
    // between fights the weapons go on winding up, so a blow that was nearly ready lands soon after the next fight opens:
    // but not the instant it does. Enough is kept back for the weapon to be seen crossing to its enemy (D.REACH).
    for (let i = 0; i < X.units.length; i++) if (X.units[i]) { const a = X.units[i].aps, top = 1 - Math.min(D.REACH.share, D.REACH.secs * a); F.cd[i] = Math.min(top, (F.cd[i] || 0) + a * dt); }
    F.wait -= dt; if (F.wait <= 0) G.spawn(); return;
  }
  meterTick(dt);                                  // only time spent fighting counts
  F.dur = (F.dur || 0) + dt;                      // how long this fight has run (Tailwind asks)
  // the enemies' turn: they roam, and each stops to swing at the air on its own clock; the swing takes Life
  drift(dt);
  for (const e of F.es) {
    if (e.dead) continue;
    if (e.chill > 0) e.chill -= dt; if (e.immune > 0) e.immune -= dt;
    if (e.britT > 0) { e.britT -= dt; if (e.britT <= 0) e.brit = 0; }
    if (e.stun > 0) e.stun -= dt;
    else {
      const slow = e.chill > 0 ? 1 - X.chill / 100 : 1;
      walk(e, dt, slow);
      e.atkT -= dt * slow;
      if (e.atkT <= 0) {
        e.atkT += e.int; e.n++; e.rest = D.ROAM.rest;
        const slam = e.slam && e.n % D.SLAM.every === 0;
        const d = e.dmg * (slam ? D.SLAM.mult : 1) * (1 - X.ward / 100);
        F.life -= d;
        emit('hurt', { id: e.id, d, slam });
      }
    }
    if (e.burn > 0.001) {
      const f = 1 - Math.exp(-dt / (D.BURN_SECS / 2)), d = e.burn * f, real = Math.min(d, e.hp) / d;
      for (const k in e.by) { const part = e.by[k] * f; e.by[k] -= part; dealt(k === 'c' ? 'c' : +k, part * real); }
      e.burn -= d; e.hp -= d;
      if (e.hp <= 0 ? (kill(e), true) : cull(e)) { if (F.wait > 0) return; }
    }
  }
  // the line
  for (let i = 0; i < X.units.length; i++) {
    const W = X.units[i]; if (!W) continue;
    F.cd[i] = (F.cd[i] || 0) + W.aps * dt;
    while (F.cd[i] >= 1) { F.cd[i] -= 1; troopStrike(i); if (F.wait > 0) return; }
    if (W.nova > 0 && shock(W, i, dt)) return;
  }
  if (F.hold && F.cdC <= 0 && cursorStrike(F.ax, F.ay)) { F.cdC += X.cooldown; if (F.wait > 0) return; }      // a held button strikes the moment the cooldown is up
  if (X.cursor.nova > 0 && shock(X.cursor, -1, dt)) return;
  if (F.life <= 0) fail();
};
/* Shockwave: every few seconds the holder strikes everything. Returns true if that ended the fight. */
function shock(W, who, dt) {
  const F = G.F, k = who < 0 ? 'c' : who;
  F.nova[k] = (F.nova[k] || 0) + dt;
  const every = G.X.novaEvery;
  if (F.nova[k] < every) return false;
  F.nova[k] -= every;
  const crit = U.rng() * 100 < W.crit, base = W.dmg * (crit ? W.critMult : 1) * W.nova / 100;
  emit('nova', { who }); carryLeft = 0;           // a Shockwave strikes everything already: nothing carries
  for (const e of F.es.slice()) land(e, W, base, who, crit, 'nova');
  return F.wait > 0;
}
/* one click at a place in the arena. Returns false when the cursor is on cooldown or the click touches nothing. */
G.click = function (x, y) {
  const F = G.F;
  F.ax = x; F.ay = y;
  if (G.S.alloc || F.wait > 0 || F.cdC > 0 || !cursorStrike(x, y)) return false;
  F.cdC = G.X.cooldown;
  return true;
};
/* where a held button is pointing */
G.aim = function (x, y) { G.F.ax = x; G.F.ay = y; };
/* seconds left of the count after a lost fight, or 0 */
G.deadLeft = () => (G.F.dead && G.F.wait > 0 ? G.F.wait : 0);
/* seconds left before a run's first fight, or 0 */
G.openLeft = () => (G.F.opening && G.F.wait > 0 ? G.F.wait : 0);
G.setHold = function (on) { G.F.hold = !!on; };
/* how far through its cooldown the cursor is: 1 is ready */
G.ready = () => 1 - U.clamp(G.F.cdC / G.X.cooldown, 0, 1);
G.goto = function (lvl) {
  const S = G.S; lvl = U.clamp(lvl | 0, 1, S.maxLevel);
  if (lvl === S.level) return false;
  S.level = lvl; S.fight = 0; G.F.wait = G.F.dead ? Math.max(G.F.wait, 0.25) : 0.25; G.F.es = [];      // (going to another level does not cut the count short)
  emit('goto');
  return true;
};
G.setAuto = function (on) { G.S.auto = !!on; emit('auto'); };

/* ------------------------------------------------------------------ saving */
const store = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };
G.save = function () { const s = store(); if (!s || !G.S) return; G.S.seen = Date.now(); G.S.life = G.F && G.F.life > 0 ? G.F.life : null;       // the Life left in this level goes with the save: a reload is not a refill
  try { s.setItem(D.SAVE_KEY, JSON.stringify(G.S)); } catch (e) { /* full or blocked: play on */ } };
G.valid = S => !!(S && S.v === 1 && Array.isArray(S.posts) && Array.isArray(S.bag));
G.load = function () {
  const s = store(); if (!s) return null;
  try { const S = JSON.parse(s.getItem(D.SAVE_KEY)); return G.valid(S) ? G.patch(S) : null; } catch (e) { return null; }
};
/* fill in anything a save from an older build lacks */
G.patch = function (S) {
  const F = G.fresh();
  S.auto = true;                                  // there is no switch for it any more: a cleared level always leads on
  if (!S.run) S.run = { drops: (S.stats && S.stats.drops) || 0, kills: (S.stats && S.stats.kills) || 0, time: 0 };
  // a save from before the tree: cores and what they bought are gone. It has a point for every level of depth it
  // ever reached, and keeps the posts and sockets it has until its next reset, when the tree decides them
  if (!S.tree) { S.tree = {}; S.alloc = false; S.best = Math.max((S.best || 0) + 1, S.maxLevel || 1); }
  delete S.cores; delete S.perk; delete S.run.from; if (S.stats) delete S.stats.cores;
  const back = (S.tree.CLK ? 20 : 0) + (S.tree.CFU ? 40 : 0) + (S.tree.CPK ? 18 : 0) + (S.tree.CON ? 23 : 0);      // Lucky tiers, Fusing, Standing order and Fine work are gone, with what they unlocked: what they cost comes back
  for (const id of ['xa2', 'xc2']) if (S.tree[id]) S.bank = (S.bank || 0) + 7;      // Provisions is gone from the tree: what it cost comes back
  // the second Head start on each branch beside the middle has moved out to a western bridge (the first stays where it was): one held from before comes back as cores, to be bought again out there
  if (!S.hsOut) { for (const id of ['HS3', 'HS4']) if (S.tree[id]) { S.bank = (S.bank || 0) + 3; delete S.tree[id]; } S.hsOut = 1; }
  // Head start is gone from the tree, and Tailwind stands where it stood: one held from before comes back as cores, and Tailwind is the player's to buy or not
  // the cursor has sockets again, and ranks (S.cur: not the S.cursor of long ago, which is emptied into the bag below)
  if (!S.cur) S.cur = { up: 0, sockets: [] };
  if (S.notes == null) S.notes = 0;      // a save from before there were patch notes has read none of them
  if (!S.tailIn) { for (const n of D.TREE) if (n.eff === 'tail' && S.tree[n.id]) { S.bank = (S.bank || 0) + 3; delete S.tree[n.id]; } S.tailIn = 1; }
  // (nodes that are gone are paid back here, before whatever the tree no longer knows is dropped from the save)
  // the click branch is two Cursor sockets now, and the way east to the first Weapon socket is one step: what stood on them comes back as cores
  for (const [id, c] of [['CK2', 3], ['CK4', 4], ['CK5', 4], ['e2', 4], ['e3', 4]]) if (S.tree[id]) { S.bank = (S.bank || 0) + c; delete S.tree[id]; }
  // the Market comes with the socket: a save that bought its node has the 5 cores back. And Rerolls stands where the
  // first Whetstone north of the middle stood: one held is Rerolls now, or 3 cores if Rerolls was held already
  if (S.tree.UBY) { S.bank = (S.bank || 0) + 5; delete S.tree.UBY; }
  if (S.tree.N0) { if (S.tree.URR) S.bank = (S.bank || 0) + 3; else { S.tree.URR = 1; S.bank = (S.bank || 0) + 1; } delete S.tree.N0; }
  // four Tailwinds are all that count, and the four out on the eastern bridges are gone: each one held is 3 cores back
  for (const id of ['xb2', 'xb3', 'xd2', 'xd3']) if (S.tree[id]) { S.bank = (S.bank || 0) + 3; delete S.tree[id]; }
  for (const id in S.tree) if (!D.NODE[id]) delete S.tree[id];
  delete S.br2;
  // a save from when a level of depth was a point and a node cost one: what it had not spent becomes cores, and it keeps its tree
  if (S.bank == null) S.bank = Math.max(0, (S.best || 1) - 1 - Object.keys(S.tree).length);
  S.bank += back;
  if (S.run.earn == null) S.run.earn = 0;
  if (S.run.deep == null) S.run.deep = S.best || 1;      // (a run from before levels cleared earlier paid less: what it has cleared is paid, and what is new to it from here pays in full)
  // a run from before levels were paid for by the highest one cleared: it has been paid up to where it stands, unless a Head start's levels were still owing
  if (S.run.paid == null) S.run.paid = S.run.skip ? 0 : Math.max(0, (S.maxLevel || 1) - 1);
  // and from before a fight paid less the second time: the run has won every fight up to where it stands
  if (S.run.made == null) S.run.made = S.posts.some(P => P.unit) ? 2 : S.bench && S.bench.made ? 1 : 0;      // weapons made this run, as near as an older save can say
  if (S.run.far == null) S.run.far = Math.max(S.run.paid * D.FIGHTS - 1, S.level === S.maxLevel ? (S.level - 1) * D.FIGHTS + (S.fight || 0) - 1 : -1);
  if (S.run.won == null) { S.run.won = {}; S.run.base = S.run.far; }      // and from before each fight won was kept: every fight up to the furthest counts as won
  delete S.run.skip;
  // a save from before the first two nodes: it has a line and skills already, so it holds them. The first socket
  // used to come free and is now the second of them, so what the crafter had counts one more
  if (S.gate !== 2) {
    if (!S.gate) { S.best = Math.max(S.best || 1, 3); S.tree.F1 = 1; S.tree.F2 = 1; }
    if (S.tree.F2) { if (S.crafter != null) S.crafter++; } else if (S.bench) S.bench.sockets = [];
    S.gate = 2;
  }
  // the first weapon is the middle node now, and what hung west of it hangs from Upgrade: a save that holds any of that holds Upgrade too
  if (!S.tree.UPG && ['URR', 'UMT', 'w1'].some(id => S.tree[id])) S.tree.UPG = 1;
  // the tree's first node is the cursor's now (CL0), and the first weapon is beside it: anyone with a tree already has it.
  // The way north runs through weapon Upgrade: a save that somehow went north without it is given it, so that nothing it holds is cut off
  if (Object.keys(S.tree).length && !S.tree.CL0) S.tree.CL0 = 1;
  if (S.tree.PU1 && !S.tree.UPG) S.tree.UPG = 1;      // (the Purse over the weapon hangs from Upgrade)
  delete S.cadIn;
  // a colour of skill costs 3 where it cost 4: one bought at 4 has the core back
  if (!S.col3) { for (const id of ['UMT', 'UHX', 'UAD']) if (S.tree[id]) S.bank = (S.bank || 0) + 1; S.col3 = 1; }
  // ...and the first Weapon socket 8 where it cost 14, as the second weapon does
  // ...and Cull 5 where it cost 23, as Life does: the four first big things, one each way, are 8, 8, 5 and 5
  if (!S.k1at8) { if (S.tree.K1) S.bank = (S.bank || 0) + 6; if (S.tree.SH) S.bank = (S.bank || 0) + 18; S.k1at8 = 1; }
  if (S.tree.n1 && !S.tree.URR) S.tree.URR = 1;
  // ...and the cursor has the sockets its tree gives, there and then, in the run it is in
  { const want = (S.tree.F2 ? 1 : 0) + D.TREE.filter(n => n.eff === 'cSock' && S.tree[n.id]).reduce((x, n) => x + (D.TREE_EFF.cSock.amt[n.big ? 1 : 0] || 1), 0);
    while (S.cur.sockets.length < want) S.cur.sockets.push({ gem: null }); }
  for (const k in F) if (S[k] == null) S[k] = F[k];
  S.stats = Object.assign(F.stats, S.stats); S.opts = Object.assign(F.opts, S.opts);
  // a save from before the crafter: its level is whatever your best weapon already had, the rack is gone, and the
  // weapons you own are made, so their empty sockets go and the skills in them become their stats
  if (S.shop) {
    S.crafter = Math.max(0, Math.min(D.CRAFT.max, Math.max(0, ...S.posts.map(P => P.unit ? P.unit.sockets.length : 0))) - D.CRAFT.sockets0);
    S.stats.made = S.posts.filter(P => P.unit).length; delete S.shop;
    for (const P of S.posts) if (P.unit) P.unit.sockets = P.unit.sockets.filter(s => s.gem);
  }
  // a save from before making and equipping were two steps: what is on its bench is a made weapon
  for (const b of [S.bench, S.spare]) if (b && b.made == null) b.made = true;
  // weapons have no quality any more: every one is the plain weapon of its type
  for (const u of S.posts.map(P => P.unit).concat([S.bench, S.spare])) if (u) u.q = 1;
  // nothing is levelled any more: old post and cursor levels go, and so does stoking the forge
  for (const P of S.posts) delete P.lvl;
  delete S.stoke;
  delete S.dust;                                  // ember dust is gone: the forge takes gold
  // skills and affixes that no longer exist become the ones that took their place
  // an affix that has been cut becomes one the skill does not already have (the commonest first)
  const fresh = (g, skip) => D.AFFIXES.map(a => a.id).find(k => !g.aff.some(af => af !== skip && af.k === k));
  const fix = g => {
    if (!g) return;
    if (D.SKILL_WAS[g.sk]) g.sk = D.SKILL_WAS[g.sk];
    for (const af of g.aff) if (!D.AFFIX[af.k]) af.k = fresh(g, af);
    delete g.pend; delete g.rr;                   // left by the single-affix reroll, which is gone
    delete g.r;                                   // the primary affix's roll: primaries are flat now
    // an affix used to roll within a range; now it has a tier, and the roll it had decides which
    for (const af of g.aff) if (af.t == null) { const T = D.tier(g.lvl); af.t = U.clamp(Math.ceil((af.r == null ? 0.5 : af.r) * T), 1, T); delete af.r; }
    // there are five tiers now, not forty: a skill from above them is tier 5, and its affixes keep their place between its bottom and its top
    const was = 1 + Math.floor((g.lvl - 1) / D.TIER_LVLS);
    if (was > D.TIER_MAX) { for (const af of g.aff) af.t = U.clamp(Math.ceil(af.t * D.TIER_MAX / was), 1, D.TIER_MAX); g.lvl = 1 + D.TIER_LVLS * (D.TIER_MAX - 1); }
  };
  // the cursor has no sockets any more: the skills that were in it go to the bag
  if (S.cursor) {
    const was = S.cursor.sockets || [];
    for (const g of was) if (g) S.bag.push(g);
    delete S.cursor;
  }
  S.bag.forEach(fix);
  for (const P of S.posts) if (P.unit) P.unit.sockets.forEach(s => fix(s.gem));
  // a skill on the bench whose colour has changed no longer fits its socket: back to the bag
  for (const s of S.cur.sockets) fix(s.gem);
  if (S.bench) for (const s of S.bench.sockets) { fix(s.gem); if (s.gem && D.SKILL[s.gem.sk].c !== s.c) { S.bag.push(s.gem); s.gem = null; } }
  // a weapon holds one of each skill now (the plain ones apart): any second copy goes back to the bag
  const once = socks => { const seen = {}; return socks.filter(s => { if (!s.gem || D.SKILL[s.gem.sk].plain) return true; if (!seen[s.gem.sk]) return seen[s.gem.sk] = true; S.bag.push(s.gem); s.gem = null; return false; }); };
  for (const P of S.posts) if (P.unit) P.unit.sockets = once(P.unit.sockets);
  if (S.bench) once(S.bench.sockets);
  return S;
};
G.wipe = function () { const s = store(); if (s) s.removeItem(D.SAVE_KEY); };
G.exportSave = () => btoa(unescape(encodeURIComponent(JSON.stringify(G.S))));
G.importSave = function (text) {
  try { const S = JSON.parse(decodeURIComponent(escape(atob(text.trim())))); if (!G.valid(S)) return false; G.init(G.patch(S)); G.save(); return true; } catch (e) { return false; }
};
/* gold for the time the game was shut: half the rate you were earning, for up to eight hours */
G.claimOffline = function (now) {
  const S = G.S, secs = Math.min(D.OFFLINE.cap, ((now || Date.now()) - S.seen) / 1000);
  if (!(secs >= D.OFFLINE.min) || !(S.gps > 0)) return null;
  const gold = secs * S.gps * D.OFFLINE.share;
  S.gold += gold; S.stats.gold += gold;
  return (G.offline = { secs, gold });
};
})();
