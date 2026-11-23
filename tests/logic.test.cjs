/* The rules, checked without a browser.  node tests/logic.test.cjs */
const assert = require('node:assert/strict');
const { load, play, allocTree } = require('./harness.cjs');
let n = 0;
const test = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-6) * Math.max(1, Math.abs(b)), `${msg || ''} expected ${b}, got ${a}`);
/* a game after its second prestige: the first two nodes of the tree (a troop post, then a socket) and what they give */
function begun(seed) {
  const SW = load(seed == null ? 7 : seed), G = SW.game, S = G.S;
  for (const id of ['F1', 'F2']) S.tree[id] = 1; S.best = 3; S.bank = 0; S.crafter = 1; S.posts.push({ unit: null }); S.bench = G.rollBench(); G.recompute();
  return SW;
}
/* hold the three colours' nodes, so that skills drop as the real ones and not the plain */
const colours = SW => { for (const id of ['UMT', 'UHX', 'UAD']) SW.game.S.tree[id] = 1; return SW; };
/* that, with a second post, one sword on post 0, and plenty of everything */
function rich(seed) {
  const SW = begun(seed), G = SW.game, S = G.S;
  S.gold = 1e9; S.run.kills = 5; while (S.posts.length < 2) S.posts.push({ unit: null });
  S.bench = bench(SW, 'sword', 'rbg');
  assert.ok(G.equip());
  return SW;
}
/* make a weapon on the bench, the gold for it found from nowhere */
const forge = SW => { const G = SW.game; G.S.gold += G.makeCost(); assert.ok(G.make()); return G.S.bench; };
/* a weapon for the bench, of a type and with sockets of these colours */
function bench(SW, type, cols) { return { id: SW.game.S.uid++, type, q: 1, made: true, sockets: cols.split('').map(c => ({ c, gem: null })) }; }
/* put a skill into a weapon that is already made, as if it had been in it on the bench */
function fit(SW, g, post) { const G = SW.game, S = G.S, i = S.bag.indexOf(g); if (i >= 0) S.bag.splice(i, 1); S.posts[post || 0].unit.sockets.push({ c: G.color(g), gem: g }); G.recompute(); return true; }
/* a skill in the bag. An affix is { k, t: its tier }; for short, { k, r } is that share of the way up the skill's tiers */
const gem = (SW, sk, lvl, aff) => { const G = SW.game, T = SW.data.tier(lvl || 1), g = { id: G.S.uid++, sk, lvl: lvl || 1, aff: (aff || []).map(a => ({ k: a.k, t: a.t || Math.max(1, Math.ceil(a.r * T)) })) }; G.S.bag.push(g); return g; };
/* the arena emptied and refilled with enemies that will not die or swing during a measurement: one in the middle,
   or one at each of the places given */
const group = (SW, pts, o) => {
  const G = SW.game, es = pts.map(p => G.enemy({ name: 'Dummy', spr: 'rat', pal: 'ash', int: 1e9 }, Object.assign({ hp: 1e9, max: 1e9, atkT: 1e9, r: 4, x: p[0], y: p[1] }, o || {})));
  G.F.es = es; G.F.enc = { type: 'test', name: 'Dummies', boss: false, actBoss: false, n: es.length, max: es.length * 1e9, drop: 1, lost: false }; G.F.wait = 0; G.F.cd = []; G.F.cdC = 0; G.F.roam = null;       // and they stand where they are put
  return es;
};
const dummy = (SW, o) => group(SW, [[0, 0]], Object.assign({ r: 8 }, o))[0];
const took = e => 1e9 - e.hp;
const hits = SW => SW.game.ev.filter(e => e.t === 'hit');

test('a new game: clicking kills the first monster and pays gold; a plain sword waits on the bench', () => {
  const SW = load(1), G = SW.game;
  assert.equal(G.S.gold, 0);
  for (let i = 0; i < 400 && G.S.stats.kills < 1; i++) { const e = G.alive()[0]; if (e) G.click(e.x, e.y); G.update(0.1); }
  assert.equal(G.S.stats.kills, 1); assert.ok(G.S.gold > 0);
  assert.equal(G.S.bench.sockets.length, 0, 'no socket until the tree gives one'); assert.equal(G.S.posts.length, 0); assert.equal(G.cores(), 0); assert.equal(G.runCores(), 0);
});
test('the cursor has a cooldown: clicks inside it do nothing, a held button strikes as it comes ready', () => {
  const SW = load(1), G = SW.game, D = SW.data; dummy(SW);
  near(G.X.cooldown, 1 / D.CURSOR.aps);
  let ok = 0; for (let i = 0; i < 2000; i++) { if (G.click(0, 0)) ok++; G.update(0.005); }       // ten seconds of frantic clicking
  assert.ok(ok >= 10 && ok <= 11, ok + ' clicks landed in ten seconds');
  dummy(SW); G.F.cdC = 0; G.ev.length = 0; G.aim(0, 0); G.setHold(true);
  for (let i = 0; i < 2000; i++) { G.update(0.005); if (G.ev.length > 300) G.ev.length = 0; }
  G.setHold(false);
  assert.ok(G.S.stats.clicks - ok >= 10 && G.S.stats.clicks - ok <= 11, 'held: ' + (G.S.stats.clicks - ok));
  assert.equal(G.ready(), 1 - Math.min(1, Math.max(0, G.F.cdC / G.X.cooldown)));
});
test('the cursor has no sockets; an Attack Speed Aura in the line shortens its cooldown, down to its floor', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  assert.equal(S.cursor, undefined); for (const gone of ['buyCursorSocket', 'csockCost']) assert.equal(G[gone], undefined, gone); assert.equal(D.CSOCK_MAX, undefined);
  const f = gem(SW, 'twin', 1, [{ k: 'aspd', r: 0.5 }]); assert.equal(G.socket(f.id, G.CURSOR, 0), false, 'nothing goes in the cursor'); assert.ok(S.bag.includes(f));
  near(G.X.cooldown, 1 / D.CURSOR.aps); near(G.X.cursor.dmg, D.CURSOR.dmg);
  fit(SW, f); near(G.X.cooldown, 1 / D.CURSOR.aps, 1e-6, 'a troop\'s own attack speed is its own:');
  const aura = gem(SW, 'rally'); fit(SW, aura);
  near(G.X.cooldown, 1 / (D.CURSOR.aps * (1 + G.primVal(aura) / 100)), 1e-6, 'an Attack Speed Aura on a troop quickens the cursor too:');
  const war = gem(SW, 'warcry'); fit(SW, war); near(G.X.cursor.dmg, D.CURSOR.dmg * (1 + G.primVal(war) / 100), 1e-6, 'and a Damage Aura adds to its blow:');
  D.SKILL.rally.v = 900; G.recompute(); assert.equal(G.X.cooldown, D.CURSOR.minCd);
  // an old save: the skills in the cursor go to the bag
  const old = JSON.parse(JSON.stringify(S)); old.cursor = { lvl: 9, sockets: [{ id: 9901, sk: 'rally', lvl: 3, r: 0.4, aff: [{ k: 'gold', r: 0.5 }] }, null, { id: 9902, sk: 'twin', lvl: 3, r: 0.4, aff: [{ k: 'critDmg', r: 0.5 }] }] };
  const P = G.patch(old); assert.equal(P.cursor, undefined); assert.ok(P.bag.some(g => g.id === 9901) && P.bag.some(g => g.id === 9902)); assert.equal(P.cores, undefined);
  assert.equal(P.bag.find(g => g.id === 9902).aff[0].k, 'dmg'); assert.equal(P.bag.find(g => g.id === 9901).r, undefined, 'a primary affix has no roll any more');
});
test('a new game has the cursor alone: the first point is the weapon in the middle, the second a socket (and skills with it) or Upgrade', () => {
  const SW = load(3), G = SW.game, S = G.S, D = SW.data;
  assert.equal(D.POSTS0, 0); assert.equal(D.CRAFT.sockets0, 0); assert.equal(S.posts.length, 0); assert.equal(G.skillsOn(), false); assert.equal(G.equip(), false, 'nowhere to stand a weapon');
  S.gold = 1e9; assert.equal(G.buySkill(), false, 'nothing sells skills'); assert.equal(S.gold, 1e9); S.gold = 0;
  assert.equal(D.PRESTIGE_AT, 2); assert.equal(G.cores(), 0); assert.equal(G.runCores(), 0, 'no core until a level is cleared'); assert.equal(G.canPrestige(), false); assert.equal(G.prestige(), false, 'not before level 2');
  // the cursor clears level 1 by itself, and nothing drops: that is one point
  let clears = play(SW, 900, { until: 1, noPrestige: 1 });
  assert.ok(clears[1] != null, 'level 1 with the cursor alone'); assert.ok(clears[1] < 240, 'in ' + Math.round(clears[1]) + 's');
  assert.equal(S.stats.drops, 0); assert.equal(S.bag.length, 0); assert.equal(S.maxLevel, 2); assert.equal(G.runCores(), 1, 'level 1 pays one core'); assert.equal(G.cores(), 0, 'not banked until the run ends');
  // it buys the first weapon, the node in the middle, and nothing else. Two nodes lead out of that: Upgrade and the socket
  assert.ok(G.prestige()); assert.equal(G.cores(), 1); assert.equal(G.runCores(), 0); assert.equal(G.nodeCost('F1'), 1); assert.equal(G.nodeCost('F2'), 2); assert.equal(G.nodeCost('UPG'), 2); assert.deepEqual(Array.from(D.TREE_GATE), ['F1']); assert.equal(D.NODE.F1.eff, 'post'); assert.equal(D.NODE.F2.eff, 'sock'); assert.equal(D.NODE.UPG.eff, 'uUp');
  assert.equal(D.NODE.F1.x, 0); assert.equal(D.NODE.F1.y, 0); assert.equal(D.TREE_START.join(), 'F1'); assert.equal(D.NODE.F1.near.slice().sort().join(), 'F2,UPG,start'); assert.equal(D.TREE_EFF.post.name, 'Weapon');
  for (const id of D.TREE_GATE) assert.ok(D.NODE[id].big && D.NODE[id].near.includes('start'), id + ' is beside the start');
  assert.equal(G.canAllocate('F2'), false, 'the weapon comes before the socket'); assert.equal(G.canAllocate('UPG'), false); assert.equal(G.canAllocate('UHX'), false);
  assert.ok(G.allocate('F1')); assert.equal(G.cores(), 0); assert.equal(G.allocate('F2'), false);
  // the second run: a weapon with no socket, and still no skills
  assert.ok(G.beginRun()); assert.equal(S.posts.length, 1); assert.equal(S.bench.made, false, 'the bench is bare until a weapon is made'); assert.equal(forge(SW).sockets.length, 0); assert.equal(G.skillsOn(), false);
  // after the first prestige a run can be ended at any time, even at level 1 and for nothing. What is bought stays bought
  assert.equal(S.maxLevel, 1); assert.ok(G.canPrestige()); assert.ok(G.prestige()); assert.equal(G.cores(), 0); assert.equal(S.runs, 2);
  assert.ok(G.unallocate('F1'), 'a node bought in an earlier visit can be handed back too, for what it costs'); assert.equal(G.cores(), 1); assert.equal(G.spent(), 0); assert.ok(G.allocate('F1')); assert.equal(G.cores(), 0); assert.ok(G.beginRun()); assert.equal(S.posts.length, 1);
  S.gold = 1e9; assert.equal(G.buySkill(), false); S.gold = 0;
  clears = play(SW, 900, { until: 2, noPrestige: 1 });
  assert.ok(S.posts[0].unit && S.posts[0].unit.sockets.length === 0, 'a bare weapon stands on the post'); assert.ok(S.maxLevel >= 3, 'and with it level 2 falls'); assert.equal(S.stats.drops, 0); assert.ok(G.runCores() >= 2, 'a core a level');
  // prestige again: two cores buy the socket, or Upgrade
  S.run.earn = 2; assert.ok(G.prestige()); assert.equal(G.spent(), 1); assert.equal(G.cores(), 2); assert.equal(G.allocate('w1'), false, 'nothing else touches the weapon'); assert.equal(G.allocate('UHX'), false);
  assert.ok(G.canAllocate('UPG') && G.canAllocate('F2')); assert.ok(G.allocate('UPG')); assert.equal(G.cores(), 0); assert.equal(G.allocate('F2'), false, 'two cores, one of them');
  assert.ok(G.unallocate('UPG'), 'a slip can be handed back, while the tree is still open'); assert.equal(G.cores(), 2); assert.ok(G.allocate('F2')); assert.equal(G.cores(), 0);
  // Upgrade and the socket are the first two after the weapon: nothing else can be bought until both are held, whatever it touches
  S.bank = 11; assert.deepEqual(Array.from(D.TREE_FIRST), ['UPG', 'F2']); assert.equal(G.nodeCost('UHX'), 4, 'a colour of skill');
  for (const id of ['UHX', 'UBY', 'UAD', 'e1', 'N0']) { assert.ok(D.NODE[id].near.includes('F2'), id); assert.ok(G.gated(id), id); assert.equal(G.touches(id), false); assert.equal(G.allocate(id), false, id + ' waits for Upgrade'); }
  assert.equal(G.gated('UPG'), false); assert.ok(G.allocate('UPG')); assert.ok(G.firstHeld()); assert.equal(G.gated('UHX'), false);
  assert.ok(G.allocate('UHX')); assert.equal(G.nodeCost('UAD'), 4, 'and buying one did not move the others'); assert.equal(G.nodeCost('e1'), 5, 'the first skill tier'); assert.ok(G.allocate('e1')); assert.equal(G.cores(), 0);
  assert.equal(G.unallocate('F1'), false); assert.equal(G.unallocate('F2'), false, 'they stay while anything hangs from them'); assert.equal(G.unallocate('UPG'), false, 'and so does Upgrade, though nothing held hangs from it: the two come first');
  assert.ok(G.unallocate('e1')); assert.ok(G.unallocate('UHX')); assert.equal(G.cores(), 9, 'each for what it cost'); assert.ok(G.unallocate('UPG')); assert.equal(G.cores(), 11); S.bank = 9;
  // a save that bought past them when it could keeps what it has, and buys the missing one before anything more
  S.tree.UHX = 1; assert.ok(G.gated('UAD')); assert.equal(G.allocate('UAD'), false); assert.ok(G.canAllocate('UPG')); assert.ok(G.canRemove('UHX')); delete S.tree.UHX;
  assert.ok(G.unallocate('F2')); assert.ok(G.unallocate('F1'), 'and the weapon, bought two runs ago, once nothing hangs from it'); assert.equal(G.cores(), 12); assert.ok(G.allocate('F1')); assert.ok(G.allocate('F2')); S.bank = 0;
  // the third run: one post, a weapon of one socket, and skills from the first fights
  assert.ok(G.beginRun()); assert.equal(S.posts.length, 1); assert.ok(G.skillsOn()); assert.equal(forge(SW).sockets.length, 1);
  play(SW, 60, { noPrestige: 1 }); assert.ok(S.stats.drops >= 1, 'skills drop now'); assert.ok(S.posts[0].unit, 'and a weapon stands on the post');
  // a save from before the first two nodes has a line and skills already: it holds both, and its sockets are what they were
  const save = () => JSON.parse(JSON.stringify(load(5).game.S));
  let old = save(); delete old.gate; old.best = 1; old.posts = [{ unit: null }, { unit: null }]; old.crafter = 2;
  let P = G.patch(old); assert.equal(JSON.stringify(P.tree), '{"F1":1,"F2":1}'); assert.equal(P.best, 3, 'two points, for the two it holds'); assert.equal(P.gate, 2); assert.equal(P.crafter, 3, 'the socket that came free is now a node');
  old = save(); old.gate = 1; old.tree = { F1: 1, F2: 1, e1: 1 }; old.best = 9; old.crafter = 1; P = G.patch(old); assert.equal(P.crafter, 2); assert.equal(P.best, 9);
  old = save(); old.gate = 1; old.bench.sockets = [{ c: 'r', gem: null }]; P = G.patch(old); assert.equal(P.bench.sockets.length, 0, 'a game that had not got its skills yet'); assert.equal(P.tree.F1, undefined);
  P = G.patch(save()); assert.equal(P.tree.F1, undefined, 'a new game is left alone'); assert.equal(P.crafter, 0);
});
test('making a weapon costs gold, equipping it is free and needs an empty post; weapons have no levels to buy, and no quality', () => {
  const SW = begun(2), G = SW.game, S = G.S;
  for (let i = 0; i < 30; i++) { const b = G.rollBench(); assert.equal(b.q, 1); assert.equal(G.unitName(b), SW.data.WEAPONS[b.type].name, 'its name is its type'); } assert.equal(SW.data.QUALITY, undefined);
  const old = JSON.parse(JSON.stringify(S)); old.bench.q = 1.13; assert.equal(G.patch(old).bench.q, 1, 'an old save\'s Prime is the plain thing now');
  const D = SW.data, cost = G.makeCost(); assert.equal(D.MAKE, 5); assert.equal(cost, Math.ceil(5 * D.gold(1)), 'five kills\' gold at your deepest level'); S.maxLevel = 20; assert.equal(G.makeCost(), Math.ceil(5 * D.gold(20))); S.maxLevel = 1;
  // the bench is bare: nothing to equip, nothing to socket; making costs gold and puts a new weapon on it
  S.bench = G.blankBench(); assert.equal(G.benchMade(), false); assert.equal(G.equip(), false, 'nothing to equip'); const loose = gem(SW, 'pr'); assert.equal(G.autoSocket(loose.id), false);
  assert.equal(S.gold, 0); assert.equal(G.canMake(), false); assert.equal(G.make(), false, 'not with no gold'); S.gold = cost - 1; assert.equal(G.make(), false); S.gold = cost + 3; assert.ok(G.make()); assert.equal(S.gold, 3); assert.ok(G.benchMade()); assert.equal(S.posts[0].unit, null, 'made is not equipped');
  const first = S.bench; assert.equal(first.sockets.length, 1);
  // making again is the reroll of the whole thing: a new weapon, and the skills in the old one back in the bag
  first.sockets[0].c = 'r'; assert.ok(G.socket(loose.id, G.BENCH, 0)); S.gold = cost; assert.ok(G.make()); assert.notEqual(S.bench, first); assert.ok(S.bag.includes(loose)); assert.equal(S.gold, 0); S.bag = [];
  // equipping is free, and leaves the bench bare
  assert.ok(G.equip()); assert.ok(S.posts[0].unit); assert.equal(S.gold, 0); assert.equal(G.benchMade(), false); assert.equal(G.equip(), false); S.gold = 3;
  assert.equal(S.posts[0].lvl, undefined); assert.equal(S.posts[0].unit.lvl, undefined);
  S.gold = 1e9; for (const gone of ['levelUp', 'lvlPrice', 'buyStoke', 'stokeCost']) assert.equal(G[gone], undefined, gone);
  assert.ok(G.sell(0)); assert.equal(S.posts[0].unit, null); assert.equal(S.gold, 1e9, 'a weapon with no skills in it pays nothing back');
  // Purse nodes: a run begins with gold for that many weapons, at what they cost where it begins
  assert.equal(D.TREE.filter(n => n.eff === 'purse').length, 8); assert.equal(D.NODE.PU1.links.join(), 'URR'); assert.equal(D.NODE.PU2.links.join(), 'UMT'); assert.equal(G.nodeCost('PU1'), 3, 'starting gold is cheap'); for (const n of D.TREE) if (n.eff === 'purse' || n.eff === 'head') assert.equal(G.nodeCost(n.id), 3, n.id + ': every Purse and Head start is 3, wherever it is'); for (const n of D.TREE) if (n.eff === 'purse' || n.eff === 'head') S.tree[n.id] = 1; S.best = 60; S.maxLevel = 9; G.prestige(); G.beginRun();
  assert.ok(S.maxLevel > 1); assert.equal(S.gold, 8 * G.makeCost(), 'gold for a weapon from each Purse'); S.gold = 0;
});
test('nothing is levelled: a weapon and the cursor are the same at any depth, and only a skill\'s secondary affixes grow', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  near(G.X.units[0].dmg, D.WEAPONS.sword.dmg); near(G.X.bench.dmg, D.WEAPONS[S.bench.type].dmg * S.bench.q); near(G.X.cursor.dmg, D.CURSOR.dmg);
  S.maxLevel = 40; S.level = 40; G.recompute();
  near(G.X.units[0].dmg, D.WEAPONS.sword.dmg, null, 'forty levels deep, the same sword:'); near(G.X.bench.dmg, D.WEAPONS[S.bench.type].dmg * S.bench.q); near(G.X.cursor.dmg, D.CURSOR.dmg);
  for (const gone of ['WPN_G', 'wpnMult', 'lvlMult', 'lvlCost', 'STOKE']) assert.equal(D[gone], undefined, gone);
  assert.equal(S.stoke, undefined);
  // a skill is what grows, and only in its secondary affixes: the primary is flat, the same at any level
  const lo = gem(SW, 'twin', 1, [{ k: 'dmg', t: 1 }]), hi = gem(SW, 'twin', 40, [{ k: 'dmg', t: 5 }]);
  assert.equal(G.primVal(hi), G.primVal(lo)); assert.equal(G.primVal(hi), D.SKILL.twin.v); assert.equal(G.affVal(hi, hi.aff[0]), 2 * G.affVal(lo, lo.aff[0]), 'the top tier is twice the bottom, and no more');
  for (const sk of D.SKILLS) { const a = G.rollGem(1, false, sk.id), b = G.rollGem(90, true, sk.id); assert.equal(G.primVal(a), sk.v, sk.id); assert.equal(G.primVal(b), sk.v, sk.id); assert.equal(a.r, undefined, 'nothing is rolled for it'); }
  assert.equal(G.primRange, undefined);
  fit(SW, hi, 0); near(G.X.units[0].dmg, D.WEAPONS.sword.dmg * (1 + G.affVal(hi, hi.aff[0]) / 100));
  // an old save: its levels go, and so does stoking the forge
  const old = JSON.parse(JSON.stringify(S)); old.stoke = 3; old.cores = 5;
  const P = G.patch(old); assert.equal(P.stoke, undefined); assert.equal(P.cores, undefined);
});
test('the bench\'s sockets take only their own colour, and its skills come and go freely', () => {
  const SW = rich(), G = SW.game, S = G.S;
  S.bench = bench(SW, 'axe', 'rbg');
  const red = gem(SW, 'nova'), blue = gem(SW, 'ignite'), green = gem(SW, 'rally');
  assert.equal(G.socket(blue.id, G.BENCH, 0), false, 'blue in a red socket');
  assert.ok(G.socket(red.id, G.BENCH, 0)); assert.ok(G.socket(blue.id, G.BENCH, 1)); assert.ok(G.socket(green.id, G.BENCH, 2));
  assert.equal(S.bag.length, 0);
  const red2 = gem(SW, 'twin'); assert.ok(G.socket(red2.id, G.BENCH, 0), 'a skill from the bag swaps out the one in the socket');
  assert.equal(S.bench.sockets[0].gem.id, red2.id); assert.equal(S.bag.map(g => g.id).join(), String(red.id));
  assert.ok(G.unsocket(blue.id)); assert.equal(S.bench.sockets[1].gem, null); assert.equal(S.bag.length, 2);
  assert.equal(G.X.units[0].dmg, SW.data.WEAPONS.sword.dmg, 'nothing on the bench fights');
});
test('making takes a second and a half at the anvil: the bench is busy until the new weapon is on it', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  assert.equal(D.FORGE_SECS, 0, 'the tests make at once'); D.FORGE_SECS = 1.5;
  S.bench = bench(SW, 'axe', 'rb'); const b = S.bench, g = gem(SW, 'nova'), g2 = gem(SW, 'frost'); G.socket(g.id, G.BENCH, 0);
  const gold = S.gold; G.ev.length = 0; assert.ok(G.make()); assert.equal(S.gold, gold - G.makeCost(), 'paid at once');
  assert.ok(G.forging()); assert.equal(S.bench, b, 'the old one is still there'); assert.equal(G.ev.filter(e => e.t === 'forging').length, 1); assert.equal(S.stats.made, 0);
  assert.equal(G.make(), false, 'one at a time'); assert.equal(G.equip(), false); assert.equal(G.socket(g2.id, G.BENCH, 1), false); assert.equal(G.unsocket(g.id), false, 'the bench is busy');
  S.tree.URR = 1; S.tree.BN2 = 1; assert.equal(G.benchReroll('type'), false); assert.equal(G.swapBench(), false);
  for (let i = 0; i < 28; i++) G.update(0.05); assert.ok(G.forging(), 'after 1.4s, still on the anvil'); assert.equal(S.bench, b);
  G.ev.length = 0; for (let i = 0; i < 4; i++) G.update(0.05);
  assert.equal(G.forging(), false); assert.notEqual(S.bench, b); assert.ok(S.bench.made); assert.equal(S.stats.made, 1); assert.ok(G.ev.some(e => e.t === 'made')); assert.ok(S.bag.includes(g), 'the old one\'s skill is back in the bag');
  assert.equal(S.posts[1].unit, null, 'it is on the bench, not on a post'); assert.ok(G.equip()); assert.ok(S.posts[1].unit);
  // it goes on between fights, and a prestige throws it away
  assert.ok(G.make()); G.F.es = []; G.F.wait = 5; for (let i = 0; i < 32; i++) G.update(0.05); assert.ok(S.bench.made, 'done while the arena was empty');
  assert.ok(G.make()); S.maxLevel = 9; G.prestige(); assert.equal(S.forge, null); assert.equal(S.bench.made, false); D.FORGE_SECS = 0;
});
test('a made weapon has no sockets: its skills are its stats for good, and an empty socket is lost', () => {
  const SW = rich(), G = SW.game, S = G.S;
  S.bench = bench(SW, 'axe', 'rbg');
  const red = gem(SW, 'twin', 5, [{ k: 'dmg', r: 0.5 }, { k: 'crit', r: 0.5 }]), green = gem(SW, 'rally'); G.socket(red.id, G.BENCH, 0); G.socket(green.id, G.BENCH, 2);
  const gold = S.gold; assert.ok(G.equip()); assert.equal(S.gold, gold, 'equipping is free');
  const u = S.posts[1].unit; assert.equal(u.type, 'axe'); assert.equal(u.sockets.length, 2, 'the empty blue socket is gone');
  near(G.X.units[1].dmg, SW.data.WEAPONS.axe.dmg * (1 + G.affVal(red, red.aff[0]) / 100)); assert.equal(G.X.units[1].twin, G.primVal(red)); assert.ok(G.X.units[1].crit > 5); assert.ok(G.X.glob.rally > 0);
  // nothing can reach them any more
  assert.equal(G.find(red.id), null); assert.equal(G.unsocket(red.id), false); assert.equal(G.salvage(red.id), false); assert.equal(G.craft('strip', red.id), false); assert.equal(G.forgeRecast(red.id), false);
  const other = gem(SW, 'twin'); assert.equal(G.socket(other.id, 1, 0), false); assert.equal(G.socket(other.id, 0, 0), false);
  // the bench is bare again; the next weapon made has every socket the crafter gives
  assert.notEqual(S.bench.id, u.id); assert.equal(S.bench.made, false); assert.equal(S.bench.sockets.length, 0); assert.equal(forge(SW).sockets.length, 1); assert.ok(S.bench.sockets.every(s => !s.gem));
  // scrapping it salvages the skills that went in, for gold
  const g2 = S.gold; assert.equal(G.scrapValue(u), G.salvageValue(red) + G.salvageValue(green)); G.sell(1);
  assert.equal(S.gold, g2 + G.salvageValue(red) + G.salvageValue(green)); assert.equal(S.bag.includes(red), false); assert.equal(S.dust, undefined, 'there is no ember dust');
});
test('rerolling the bench: only the type, or only the sockets (the whole weapon again is Make)', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  G.S.gold = 1e9; const b0 = G.S.bench; for (const k of ['type', 'socks']) assert.equal(G.benchReroll(k), false, 'not until the Rerolls node is held'); assert.equal(G.S.bench, b0); assert.equal(G.S.gold, 1e9); assert.equal(SW.data.NODE.URR.eff, 'uReroll'); G.S.tree.URR = 1;
  S.bench = bench(SW, 'axe', 'rb');
  const part = G.benchCost(); assert.ok(part > G.makeCost(), 'keeping the half you like costs more than a whole new weapon'); assert.equal(part, Math.ceil(D.MAKE * D.gold(S.maxLevel) * D.CRAFT.part)); assert.equal(D.CRAFT.part, 1.6); assert.equal(G.benchReroll('all'), false, 'there is no rerolling all of it: that is Make');
  const red = gem(SW, 'nova'), blue = gem(SW, 'frost'); G.socket(red.id, G.BENCH, 0); G.socket(blue.id, G.BENCH, 1);
  let gold = S.gold;
  for (let i = 0; i < 20; i++) { const was = S.bench.type; assert.ok(G.benchReroll('type')); assert.notEqual(S.bench.type, was); }
  assert.equal(S.gold, gold - 20 * part); assert.equal(S.bench.sockets.map(s => s.c).join(''), 'rb', 'the sockets stay'); assert.equal(S.bench.sockets[0].gem, red, 'and what is in them');
  // the sockets alone: every colour rolled again, never the same set, and as many as there were; the type and its roll stay, the skills come back
  const type = S.bench.type, q = S.bench.q, id0 = S.bench.id; gold = S.gold;
  const seen = new Set();
  for (let i = 0; i < 30; i++) { const was = S.bench.sockets.map(s => s.c).join(''); assert.ok(G.benchReroll('socks')); const now = S.bench.sockets.map(s => s.c).join(''); assert.notEqual(now, was); seen.add(now); assert.ok(/^[rbg]{2}$/.test(now), 'as many as it had: ' + now); }
  assert.ok(seen.size > 1); assert.equal(S.bench.type, type); assert.equal(S.bench.q, q); assert.equal(S.bench.id, id0); assert.equal(S.gold, gold - 30 * part);
  assert.ok(S.bench.sockets.every(s => !s.gem)); assert.ok(S.bag.includes(red) && S.bag.includes(blue), 'the skills on the bench come back');
  assert.equal(G.benchReroll('socket', 1), false, 'not one socket by itself'); assert.equal(S.gold, gold - 30 * part);
  // the whole weapon again is Make: a new one, for the price of a weapon
  const id = S.bench.id; gold = S.gold; assert.ok(G.make()); assert.notEqual(S.bench.id, id); assert.equal(S.gold, gold - G.makeCost()); assert.equal(S.bench.sockets.length, 1);
  S.gold = 0; assert.equal(G.benchReroll('type'), false); assert.equal(G.benchReroll('socks'), false);
});
test('a weapon can wait on the bench while every post is manned, but equipping it needs an empty post', () => {
  const SW = rich(), G = SW.game, S = G.S;
  while (G.emptyPost() >= 0) { S.bench = bench(SW, 'sword', 'rb'); assert.ok(G.equip()); }
  S.bench = bench(SW, 'axe', 'rg'); const g = gem(SW, 'nova'); assert.ok(G.socket(g.id, G.BENCH, 0), 'skills can be set in it meanwhile');
  assert.equal(load(1).game.S.posts.length, 0, 'a new game has no post'); assert.equal(S.posts.length, 2);
  const b = S.bench, old = S.posts[1].unit;
  assert.equal(G.equip(), false); assert.equal(G.equip(1), false, 'not onto a manned post'); assert.equal(S.posts[1].unit, old); assert.equal(S.bench, b);
  G.sell(1); const gold = S.gold;
  assert.ok(G.equip()); assert.equal(S.posts[1].unit, b); assert.equal(S.gold, gold);
});
test('overkill carries: what a blow has left over goes on to the nearest enemy, and the next, as plain damage', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  S.posts[0].unit = null; G.recompute(); const C = G.X.cursor; assert.equal(C.carry, 1, 'the cursor carries to one more'); C.dmg = 25; C.crit = 0; C.splash = 0; C.carry = 9;
  // three in a row: 10, 10 and 100 life. A blow of 25 on the first kills it, carries 15 to the second, and 5 of that to the third
  let es = group(SW, [[-20, 0], [0, 0], [30, 0]], { hp: 10, max: 10, gold: 1, int: 99, atkT: 99, dmg: 0 }); es[2].hp = es[2].max = 100;
  G.ev.length = 0; G.F.cdC = 0; assert.ok(G.click(-20, 0)); assert.ok(es[0].dead && es[1].dead && !es[2].dead); assert.equal(es[2].hp, 95);
  const hits = G.ev.filter(e => e.t === 'hit'); assert.equal(hits.map(h => h.kind).join(), 'main,carry,carry'); assert.equal(hits.map(h => h.d).join(), '25,10,5', 'each shows what it took');
  // it goes to whichever is nearest the one that died, not in any fixed order
  es = group(SW, [[0, 0], [40, 0], [-12, 0]], { hp: 10, max: 10, gold: 1, int: 99, atkT: 99, dmg: 0 }); es[1].hp = es[2].hp = 100;
  G.F.cdC = 0; G.click(0, 0); assert.equal(es[2].hp, 85, 'the near one'); assert.equal(es[1].hp, 100);
  // a blow that does not kill carries nothing, and the last enemy's overkill goes nowhere
  es = group(SW, [[0, 0], [20, 0]], { hp: 30, max: 30, gold: 1, int: 99, atkT: 99, dmg: 0 }); G.F.cdC = 0; G.click(0, 0); assert.equal(es[0].hp, 5); assert.equal(es[1].hp, 30);
  // carried damage is damage and nothing else: no affliction rides on it
  es = group(SW, [[0, 0], [20, 0]], { hp: 10, max: 10, gold: 1, int: 99, atkT: 99, dmg: 0 }); es[1].hp = es[1].max = 100; C.frost = 1; C.brittle = 3; C.stun = 1;
  G.F.cdC = 0; G.click(0, 0); assert.ok(es[0].dead); assert.equal(es[1].hp, 85); assert.equal(es[1].chill, 0); assert.equal(es[1].brit, 0); assert.ok(!(es[1].stun > 0));
  // but only as far as the weapon can: the cursor's own reach is one more enemy, and the rest of the blow is lost
  C.carry = 1; C.frost = 0; C.brittle = 0; C.stun = 0; es = group(SW, [[-20, 0], [0, 0], [30, 0]], { hp: 10, max: 10, gold: 1, int: 99, atkT: 99, dmg: 0 }); es[2].hp = es[2].max = 100;
  G.F.cdC = 0; G.click(-20, 0); assert.ok(es[0].dead && es[1].dead); assert.equal(es[2].hp, 100, 'it stops at the second');
  assert.equal(['hammer', 'axe', 'sword', 'staff', 'bow', 'dagger'].map(k => D.WEAPONS[k].carry).join(), '3,4,2,2,1,1', 'the slower the weapon, the further (the hammer has its splash as well)');
  // a swarm of seven small ones: a sword's blow takes three of them, so the wave is three blows, not one
  S.bench = bench(SW, 'sword', ''); assert.ok(G.equip(0)); let blows = 0; es = group(SW, [[0, 0], [8, 0], [16, 0], [24, 0], [32, 0], [40, 0], [48, 0]], { hp: 3, max: 3, gold: 1, int: 99, atkT: 99, dmg: 0 });
  assert.equal(G.X.units[0].carry, 2); G.X.units[0].crit = 0; G.X.units[0].twin = 0; G.F.cd[0] = 0; for (let i = 0; i < 2000 && es.some(e => !e.dead); i++) { G.update(0.01); blows += G.ev.filter(e => e.t === 'strike' && e.who === 0).length; G.ev.length = 0; }
  assert.equal(blows, 3, 'seven at three a blow'); G.sell(0);
  // a weapon's blow carries the same way
  S.bench = bench(SW, 'axe', ''); assert.ok(G.equip(0)); const W = G.X.units[0]; W.dmg = 50; W.crit = 0; W.aps = 1;
  es = group(SW, [[0, 0], [15, 0], [30, 0]], { hp: 20, max: 20, gold: 1, int: 99, atkT: 99, dmg: 0 }); G.F.cd[0] = 0.999; G.update(0.01);
  assert.equal(es.filter(e => e.dead).length, 2, 'fifty into twenty, twenty and ten of the third'); assert.equal(es.find(e => !e.dead).hp, 10);
});
test('a stalled run earns nothing: being driven back and clearing the same levels again, or failing a boss over and over, pays no cores', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  const hit = () => { const e = G.alive()[0]; if (e) { G.F.cdC = 0; G.click(e.x, e.y); } };
  const lose = boss => { group(SW, [[0, 0]], { hp: 1e12, max: 1e12, gold: 1, int: 0.05, atkT: 0.05, dmg: 1e9 }); G.F.enc.boss = !!boss; let f = null; for (let i = 0; i < 200 && !f; i++) { G.update(0.05); f = G.ev.find(e => e.t === 'fail'); G.ev.length = 0; } assert.ok(f, 'the fight is lost'); return f; };
  D.HP0 = 0.001; for (let i = 0; i < 9000 && S.maxLevel < 5; i++) { hit(); G.update(0.02); G.ev.length = 0; }
  assert.equal(S.maxLevel, 5); const earned = G.runCores(); assert.equal(earned, [1, 2, 3, 4].reduce((x, l) => x + D.CORE(l), 0));
  for (let round = 0; round < 3; round++) {
    // lost in an ordinary fight of level 5: back to level 4, which is cleared again, and again it pays nothing
    S.level = 5; S.fight = 2; G.spawn(); const f = lose(); assert.equal(f.back, true); assert.equal(S.level, 4); assert.equal(S.maxLevel, 5);
    let done = null; for (let i = 0; i < 9000 && !done; i++) { hit(); G.update(0.02); done = G.ev.find(e => e.t === 'leveldone'); assert.ok(!G.ev.some(e => e.t === 'cleared')); G.ev.length = 0; }
    assert.equal(done.level, 4); assert.equal(done.pay, 0); assert.equal(G.runCores(), earned, 'round ' + round);
    // lost at the boss of level 5: the level begins again, and that pays nothing either
    S.level = 5; S.fight = 9; G.spawn(); const b = lose(true); assert.equal(b.boss, true); assert.equal(S.level, 5); assert.equal(G.runCores(), earned);
  }
  // only a level the run had not cleared yet pays: here, level 5 at last
  S.level = 5; S.fight = 9; G.spawn(); for (let i = 0; i < 9000 && S.maxLevel < 6; i++) { hit(); G.update(0.02); G.ev.length = 0; } assert.equal(G.runCores(), earned + D.CORE(5));
  // and a new run pays for the same levels again
  assert.ok(G.prestige()); assert.equal(G.cores(), earned + D.CORE(5)); assert.ok(G.beginRun()); for (let i = 0; i < 9000 && S.maxLevel < 3; i++) { hit(); G.update(0.02); G.ev.length = 0; } assert.equal(G.runCores(), D.CORE(1) + D.CORE(2));
});
test('a reload is not a refill: the Life left in a level goes with the save, and the fight begins again with it', () => {
  const SW = rich(), G = SW.game, S = G.S;
  // save by hand, as G.save does, and load into a fresh game
  S.fight = 4; G.spawn(); G.F.life = 37; const snap = () => { S.seen = 1; S.life = G.F.life > 0 ? G.F.life : null; return JSON.parse(JSON.stringify(S)); };
  let N = load(9), G2 = N.game; G2.init(G2.patch(snap())); assert.equal(G2.S.fight, 4); assert.equal(G2.F.life, 37, 'the Life that was left'); assert.ok(G2.alive().length > 0, 'the fight begins again');
  assert.ok(G2.alive().every(e => e.hp === e.max), 'with its enemies whole');
  // more Life than the bar holds cannot come back from a save
  G.F.life = 9999; N = load(9); G2 = N.game; G2.init(G2.patch(snap())); assert.equal(G2.F.life, G2.X.lifeMax);
  // at the first fight of a level the bar is full, as it is whenever a level begins
  S.fight = 0; G.spawn(); G.F.life = 12; N = load(9); G2 = N.game; G2.init(G2.patch(snap())); assert.equal(G2.F.life, G2.X.lifeMax);
  // a save from before this has no Life in it: full, as it used to be
  S.fight = 4; G.spawn(); G.F.life = 37; const old = snap(); delete old.life; N = load(9); G2 = N.game; G2.init(G2.patch(old)); assert.equal(G2.F.life, G2.X.lifeMax);
  // and G.save itself writes it
  assert.ok(/G\.S\.life = G\.F && G\.F\.life > 0 \? G\.F\.life : null/.test(String(G.save)), 'G.save puts the Life in the save');
});
const SWd = () => load(1).data;
test('skills drop more often the more kinds there are to drop, so one kind comes as often with every colour open as with none', () => {
  const rate = (ids, fights, boss, held) => { const SW = begun(11), G = SW.game, S = G.S, D = SW.data; for (const id of ids) S.tree[id] = 1; G.recompute(); D.HP0 = 0.0001; S.run.drops = 99; S.level = 5; S.maxLevel = 9;
    const d0 = S.stats.drops; let n = 0; for (let k = 0; k < fights; k++) { S.fight = boss ? 9 : 1 + (k % 8); S.level = 5; G.spawn(); for (let i = 0; i < 400 && G.alive().length; i++) { const e = G.alive()[0]; G.F.cdC = 0; G.click(e.x, e.y); G.update(0.02); } n++; G.ev.length = 0; S.bag.length = 0; for (let h = 0; h < (held || 0); h++) gem(SW, 'pr'); }
    return { per: (S.stats.drops - d0) / n, rows: G.dropRows(), kinds: G.dropping().length }; };
  const none = rate([], 1500), might = rate(['UMT'], 1500), all = rate(['UMT', 'UHX', 'UAD'], 1500);
  assert.equal(none.kinds, 3); assert.equal(none.rows, 1); assert.equal(might.kinds, 5); near(might.rows, 5 / 3, 1e-9); assert.equal(all.kinds, 10); near(all.rows, 10 / 3, 1e-9);
  near(might.per / none.per, 5 / 3, 0.25, 'five kinds for three, two thirds more drops:'); near(all.per / none.per, 10 / 3, 0.25, 'ten kinds, ten thirds:');
  // a boss's drops do not grow: an act's boss drops one, whatever is open
  const b0 = rate([], 60, true), b8 = rate(['UMT', 'UHX', 'UAD'], 300, true); assert.equal(b0.per, 1); assert.equal(b8.per, 1); assert.deepEqual(Array.from(SWd().DROP_BOSS), [0.5, 1]);
  // the fuller the bag, the slower they come: half as often with eight loose in it, a third with sixteen, and a boss's drops the same
  const h8 = rate([], 3000, false, 8), h16 = rate([], 3000, false, 16); const low = SWd().DROP_LOW; assert.deepEqual([low.share, low.mult], [0.5, 2.5]);      // (an empty bag, as in `none`, is hurried by DROP_LOW.mult)
  // a nearly bare bag hurries them, by rows: here three kinds are open and the held skills are all one kind, so one row of three is filled
  const one = 1 + (low.mult - 1) * (1 - 1 / (3 * low.share));
  near(h8.per / none.per, one / 2 / low.mult, 0.06, 'eight held:'); near(h16.per / none.per, one / 3 / low.mult, 0.05, 'sixteen held:');
  const h1 = rate([], 3000, false, 1); near(none.per / h1.per, low.mult / (one / (1 + 1 / 8)), 0.4, 'no row filled against one:');
  { const SW = begun(11), G = SW.game; near(G.dropHurry(), 2.5, 1e-9); gem(SW, 'pr'); near(G.dropHurry(), one, 1e-9); for (const k of G.dropping().slice(0, 2)) gem(SW, k.id); near(G.dropHurry(), 1, 1e-9, 'half the rows or more filled, no hurry:');
    for (const id of ['UMT', 'UHX', 'UAD']) G.S.tree[id] = 1; G.recompute(); assert.equal(G.dropping().length, 10); assert.ok(G.dropHurry() > 1, 'more rows open, and the same bag is bare again'); }
  near(rate([], 400, true, 8).per, 0.5, 0.08, 'an act boss, eight held:'); assert.equal(SWd().DROP_HELD, 8);
});
test('drops are evened out: no long dry spell; and which kind drops goes by the bag, empty rows first', () => {
  const SW = colours(begun(12)), G = SW.game, S = G.S, D = SW.data; G.recompute(); D.HP0 = 0.0001; S.run.drops = 99; S.maxLevel = 9;
  assert.equal(D.DROP_EVEN, 0.5); assert.equal(D.DROP_DECK, undefined); assert.equal(D.DROP_ROW, 30);
  let gap = 0, worst = 0, total = 0; const got = [];
  for (let k = 0; k < 2500; k++) { S.fight = 1 + (k % 8); S.level = 5; G.spawn(); for (let i = 0; i < 400 && G.alive().length; i++) { const e = G.alive()[0]; G.F.cdC = 0; G.click(e.x, e.y); G.update(0.02); }
    const d = G.ev.filter(e => e.t === 'drop' || e.t === 'bagfull'); G.ev.length = 0; for (const g of S.bag) got.push(g.sk); total += S.bag.length; if (S.bag.length) { worst = Math.max(worst, gap); gap = 0; } else gap++; S.bag.length = 0; }
  const per = total / 2500, plain = 1 / per;      // fights to a drop, on average
  assert.ok(worst <= plain * 3, 'the longest dry spell was ' + worst + ' fights, against one drop in ' + plain.toFixed(1) + ' (left to chance it would run past ' + Math.round(plain * 6) + ')');
  assert.ok(Math.abs(S.run.owed) <= 3, 'what is owed stays small: ' + S.run.owed);
  // kinds, with the bag emptied after every fight (every row as empty as the next): all ten turn up about alike, and the same one seldom twice running
  assert.ok(got.length > 250, got.length + ' drops'); const c = {}; let twice = 0; got.forEach((sk, i) => { c[sk] = (c[sk] || 0) + 1; if (i && got[i - 1] === sk) twice++; });
  assert.equal(Object.keys(c).length, 10); for (const sk in c) near(c[sk] / got.length, 1 / 10, 0.45, sk + ':'); assert.ok(twice < got.length * 0.08, twice + ' of ' + got.length + ' the same as the one before');
  // the bag decides: with one row empty and a copy in each of the other nine, three drops in four are for the empty row
  const kinds = G.dropping().map(k => k.id), fill = but => { S.bag.length = 0; for (const k of kinds) if (k !== but) gem(SW, k); };
  const drop1 = () => { let sk = null; for (let k = 0; k < 4000 && !sk; k++) { const n0 = S.bag.length; S.fight = 1 + (k % 8); S.level = 5; G.spawn(); for (let i = 0; i < 400 && G.alive().length; i++) { const e = G.alive()[0]; G.F.cdC = 0; G.click(e.x, e.y); G.update(0.02); } G.ev.length = 0; if (S.bag.length > n0) sk = S.bag.reduce((a, b) => a.id > b.id ? a : b).sk; } return sk; };
  let hit = 0; for (let i = 0; i < 120; i++) { fill('ignite'); if (drop1() === 'ignite') hit++; }
  near(hit / 120, 1 / (1 + 9 / 30), 0.15, 'the empty row:');
  // two empty rows share it, and a row with two copies is far behind a row with one
  let two = 0; for (let i = 0; i < 120; i++) { fill('ignite'); S.bag.splice(S.bag.findIndex(g => g.sk === 'twin'), 1); const sk = drop1(); if (sk === 'ignite' || sk === 'twin') two++; }
  assert.ok(two / 120 > 0.82, 'one of the two empty rows: ' + two + ' of 120');
  // buying goes by the bag the same way
  S.tree.UBY = 1; G.recompute(); S.gold = 1e12; let bought = 0; for (let i = 0; i < 120; i++) { fill('nova'); const g = G.buySkill(); assert.ok(g); if (g.sk === 'nova') bought++; }
  near(bought / 120, 1 / (1 + 9 / 30), 0.15, 'a bought skill, the empty row:');
  // with the colours locked there are three kinds, the plain ones, and they come about alike
  const L = begun(13), GL = L.game, SL = L.game.S; L.data.HP0 = 0.0001; SL.run.drops = 99; SL.maxLevel = 9; const cl = {};
  for (let k = 0; k < 3000 && Object.values(cl).reduce((a, b) => a + b, 0) < 160; k++) { SL.fight = 1 + (k % 8); SL.level = 5; GL.spawn(); for (let i = 0; i < 400 && GL.alive().length; i++) { const e = GL.alive()[0]; GL.F.cdC = 0; GL.click(e.x, e.y); GL.update(0.02); } GL.ev.length = 0; for (const g of SL.bag) cl[g.sk] = (cl[g.sk] || 0) + 1; SL.bag.length = 0; }
  assert.equal(Object.keys(cl).sort().join(), 'pb,pg,pr'); for (const k in cl) near(cl[k] / 160, 1 / 3, 0.35, k + ':');
});
const SWplain = (SW, g) => !!SW.data.SKILL[g.sk].plain;
test('the Full kit: a run begins with one of every kind of skill there is to drop', () => {
  const D0 = load(1).data; assert.equal(D0.NODE.KT1.eff, 'kitAll'); assert.equal(D0.NODE.KT1.links.join(), 'UAD'); assert.equal(D0.TREE_EFF.kitAll.text(1), 'Start each run with one of each skill');
  const start = ids => { const SW = begun(14), G = SW.game, S = G.S; for (const id of ids) S.tree[id] = 1; S.maxLevel = 9; assert.ok(G.prestige()); assert.ok(G.beginRun()); return { SW, G, S }; };
  assert.equal(start([]).S.bag.length, 0, 'not without the node'); assert.equal(start([]).G.nodeCost('KT1'), 3, 'a convenience: 3 cores');
  let r = start(['KT1']); assert.equal(r.S.bag.map(g => g.sk).sort().join(), 'pb,pg,pr', 'the three plain ones, with no colour open'); assert.ok(r.S.bag.every(g => g.nw && g.aff.length >= 1 && r.SW.data.tier(g.lvl) >= 1 && r.SW.data.tier(g.lvl) <= 5));
  r = start(['KT1', 'UMT']); assert.equal(r.S.bag.map(g => g.sk).sort().join(), 'nova,pb,pg,savage,twin', 'Might open: its three, and the plain blue and green');
  r = start(['KT1', 'UMT', 'UHX', 'UAD']); assert.equal(r.S.bag.length, 10); assert.equal(new Set(r.S.bag.map(g => g.sk)).size, 10, 'all ten'); assert.ok(r.S.bag.every(g => !SWplain(r.SW, g)));
  r = start(['KT1', 'UMT', 'UHX', 'UAD', 'e1']); assert.ok(r.S.bag.every(g => r.SW.data.tier(g.lvl) >= 1 && r.SW.data.tier(g.lvl) <= 5), 'each at a tier of its own');
  // no socket, no skills: the kit waits for one
  const N = load(15), GN = N.game; GN.S.tree.F1 = 1; GN.S.tree.KT1 = 1; GN.S.maxLevel = 5; GN.S.runs = 1; assert.ok(GN.prestige()); assert.ok(GN.beginRun()); assert.equal(GN.S.bag.length, 0);
});
test('rerolling the bench weapon\'s type or sockets goes on the anvil like a new weapon: it takes the forge time, and the bench is busy', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data; S.tree.URR = 1; S.gold = 1e9; D.FORGE_SECS = 1.5;
  S.bench = bench(SW, 'axe', 'rb'); const g = gem(SW, 'nova'); assert.ok(G.socket(g.id, G.BENCH, 0));
  G.ev.length = 0; const gold = S.gold; assert.ok(G.benchReroll('type')); assert.equal(S.gold, gold - G.benchCost()); const ev = G.ev.find(e => e.t === 'forging'); assert.ok(ev && ev.kind === 'type' && ev.secs === 1.5);
  assert.ok(G.forging()); assert.equal(S.bench.type, 'axe', 'not yet'); assert.equal(G.benchReroll('socks'), false, 'one thing at a time'); assert.equal(G.make(), false); assert.equal(G.equip(), false); assert.equal(G.unsocket ? G.unsocket(g.id) : false, false);
  G.update(1.0); assert.ok(G.forging()); assert.equal(S.bench.type, 'axe'); G.update(0.6); assert.equal(G.forging(), false); assert.notEqual(S.bench.type, 'axe', 'done: a new type'); assert.equal(S.bench.sockets[0].gem, g, 'its skills stay');
  assert.ok(G.ev.some(e => e.t === 'bench' && e.kind === 'type'));
  // the sockets: the skills stay in until the blows are struck, then come back to the bag
  const was = S.bench.sockets.map(s => s.c).join(''); assert.ok(G.benchReroll('socks')); assert.equal(S.bench.sockets[0].gem, g); G.update(1.6); assert.equal(G.forging(), false);
  assert.notEqual(S.bench.sockets.map(s => s.c).join(''), was); assert.equal(S.bench.sockets.length, 2); assert.ok(S.bench.sockets.every(s => !s.gem)); assert.ok(S.bag.includes(g));
  // a save taken mid-reroll finishes the reroll, not a new weapon
  const id = S.bench.id; assert.ok(G.benchReroll('type')); const N = load(2), G2 = N.game; N.data.FORGE_SECS = 1.5; G2.init(G2.patch(JSON.parse(JSON.stringify(S)))); assert.ok(G2.forging()); G2.update(2); assert.equal(G2.S.bench.id, id, 'the same weapon'); assert.equal(G2.forging(), false);
});
test('after the last fight of a level there is an interlude: a pause, and word of what the level paid and what comes next', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  assert.ok(D.LEVEL_PAUSE >= 2 && D.LEVEL_PAUSE <= 3); assert.ok(D.SPAWN < 1);
  const hit = () => { const e = G.alive()[0]; if (e) { G.F.cdC = 0; G.click(e.x, e.y); } };
  D.HP0 = 0.001; let done = null; for (let i = 0; i < 4000 && !done; i++) { hit(); G.update(0.02); for (const ev of G.ev) if (ev.t === 'leveldone') done = ev; G.ev.length = 0; }
  assert.equal(done.level, 1); assert.equal(done.pay, 1); assert.equal(done.next, 2); assert.equal(done.secs, D.LEVEL_PAUSE); assert.equal(S.level, 2); assert.equal(S.fight, 0);
  near(G.F.wait, D.LEVEL_PAUSE, 0.03, 'the pause:'); assert.equal(G.alive().length, 0); assert.equal(G.click(0, 0), false, 'nothing to strike meanwhile');
  let t = 0; while (G.F.wait > 0 && t < 5) { G.update(0.02); t += 0.02; } near(t, D.LEVEL_PAUSE, 0.05, 'it lasts:'); assert.ok(G.alive().length > 0, 'then the next level begins');
  // a fight inside a level waits only the short while
  S.fight = 3; G.spawn(); for (let i = 0; i < 4000 && S.fight === 3; i++) { hit(); G.update(0.02); } near(G.F.wait, D.SPAWN, 0.03, 'between fights:');
  // a level cleared again in the same run has its interlude too, and pays nothing
  S.level = 1; S.fight = 9; G.spawn(); done = null; G.ev.length = 0; for (let i = 0; i < 4000 && !done; i++) { hit(); G.update(0.02); for (const ev of G.ev) if (ev.t === 'leveldone') done = ev; G.ev.length = 0; }
  assert.equal(done.level, 1); assert.equal(done.pay, 0); assert.equal(done.next, 2);
});
test('Upgrade: with its node, gold strikes a weapon on the line up a rank, ten at most, each dearer than the last', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data, U = D.UP;
  assert.equal(D.NODE.UPG.eff, 'uUp'); assert.equal(D.TREE_EFF.uUp.name, 'Upgrade'); assert.equal(U.max, 25); assert.equal(U.dmg, 3); assert.equal(U.gain.join(), '1,3');
  const u = S.posts[0].unit, dmg0 = G.X.units[0].dmg; S.gold = 1e9;
  assert.equal(G.canUpgrade(0), false, 'not without the node'); assert.equal(G.upgrade(0), false); assert.equal(S.gold, 1e9); assert.equal(G.features().upgrade, undefined);
  S.tree.UPG = 1; G.recompute(); assert.equal(G.features().upgrade, 1);
  assert.equal(G.upCost(u), Math.ceil(U.cost * D.gold(S.maxLevel))); S.gold = G.upCost(u) - 1; assert.equal(G.upgrade(0), false, 'not without the gold'); assert.equal(G.upgrade(1), false, 'nor an empty slot');
  // a strike adds one to three ranks, each 3% more damage, and the next costs more for every rank the weapon has
  S.gold = 1e9; const c1 = G.upCost(u); G.ev.length = 0; assert.ok(G.upgrade(0)); const g1 = u.up; assert.ok(g1 >= 1 && g1 <= 3); assert.equal(G.ev.find(e => e.t === 'upgrade').gain, g1); assert.equal(S.gold, 1e9 - c1);
  near(G.X.units[0].dmg, dmg0 * (1 + 0.03 * g1), 1e-9); assert.equal(G.upCost(u), Math.ceil(U.cost * D.gold(S.maxLevel) * Math.pow(U.step, g1)));
  near(G.X.cursor.dmg, D.CURSOR.dmg, 1e-9, 'the cursor is not a weapon:');
  let paid = c1, strikes = 1; const gains = { [g1]: 1 }; while (u.up < U.max) { const b = u.up; paid += G.upCost(u); assert.ok(G.upgrade(0)); strikes++; const g = u.up - b; assert.ok(g >= 1 && g <= 3, 'a strike gave ' + g); gains[g] = (gains[g] || 0) + 1; }
  assert.equal(u.up, 25, 'never past the top'); assert.ok(strikes >= 9 && strikes <= 25, strikes + ' strikes to the top'); near(G.X.units[0].dmg, dmg0 * 1.75, 1e-9); assert.equal(G.upgrade(0), false, 'twenty-five is all'); assert.equal(S.gold, 1e9 - paid);
  const tally = {}; for (let i = 0; i < 3000; i++) { u.up = 0; G.upgrade(0); tally[u.up] = (tally[u.up] || 0) + 1; } for (const k of [1, 2, 3]) near(tally[k] / 3000, 1 / 3, 0.15, 'each as likely, +' + k + ':'); paid = u.upGold; u.up = 25; G.recompute(); S.gold = 1e9 - paid;
  // scrapping it gives half of that back, with what its skills salvage for
  const skills = G.unitGems(u).reduce((n, g) => n + G.salvageValue(g), 0); assert.equal(G.scrapValue(u), skills + Math.floor(paid * U.back)); const gold = S.gold; assert.ok(G.sell(0)); assert.equal(S.gold, gold + skills + Math.floor(paid * U.back));
  // and a prestige takes the weapon, ranks and all
  S.bench = bench(SW, 'axe', ''); assert.ok(G.equip()); assert.ok(G.upgrade(0)); S.maxLevel = 9; assert.ok(G.prestige()); assert.ok(G.beginRun()); assert.equal(S.posts[0].unit, null);
});
test('posts and sockets are the tree\'s; a made weapon rolls all its sockets, or one or two short', () => {
  const SW = load(4, true), G = SW.game, S = G.S, D = SW.data;
  for (const gone of ['buyPost', 'buySocket', 'postCost', 'sockCost']) assert.equal(G[gone], undefined, gone); assert.equal(D.SHOP, undefined);
  assert.equal(D.TREE.filter(n => n.eff === 'post').map(n => n.id).join(), 'F1'); assert.equal(D.TREE.filter(n => n.eff === 'sock').map(n => n.id).join(), 'F2');
  assert.equal(D.TREE.filter(n => n.eff === 'post2').length, 5); assert.equal(D.POSTS_MAX, 6, 'six weapons at the most'); assert.equal(D.TREE.filter(n => n.eff === 'sock2').length, 5);
  assert.equal(D.SOCK_ROLL.join(), '0.3,0.55,0.15'); near(D.SOCK_ROLL.reduce((x, y) => x + y), 1);
  S.best = 200; S.maxLevel = 9; G.prestige(); for (const n of D.TREE) if (/^(post|sock)2?$/.test(n.eff)) S.tree[n.id] = 1; assert.ok(G.beginRun());
  assert.equal(S.posts.length, 6); assert.equal(G.craftSockets(), 6);
  const tally = max => { S.crafter = max; const n = {}; for (let i = 0; i < 4000; i++) { const k = G.rollBench().sockets.length; n[k] = (n[k] || 0) + 1; } return n; };
  let n = tally(6); assert.equal(Object.keys(n).sort().join(), '4,5,6'); near(n[6] / 4000, 0.30, 0.1); near(n[5] / 4000, 0.55, 0.1); near(n[4] / 4000, 0.15, 0.2);
  n = tally(2); assert.equal(Object.keys(n).sort().join(), '1,2', 'never fewer than one'); near(n[2] / 4000, 0.30, 0.1);
  n = tally(1); assert.equal(Object.keys(n).join(), '1');
  // rerolling the sockets changes their colours and never how many: a weapon that rolled short stays short
  S.crafter = 6; S.tree.URR = 1; S.gold = 1e9; for (const want of [4, 5, 6]) { do { S.bench = G.rollBench(); } while (S.bench.sockets.length !== want);
    const cols = new Set(); for (let i = 0; i < 40; i++) { assert.ok(G.benchReroll('socks')); assert.equal(S.bench.sockets.length, want, 'still ' + want); cols.add(S.bench.sockets.map(s => s.c).join('')); } assert.ok(cols.size > 5, 'new colours each time'); }
  // not before the first two nodes
  const N0 = load(3), G0 = N0.game; assert.equal(G0.S.posts.length, 0); assert.equal(G0.craftSockets(), 0); assert.equal(G0.rollBench().sockets.length, 0);
});
test('the bag sorts itself by colour, then primary affix, then how many secondary affixes, then level; a dropped skill is new until it is looked at', () => {
  const SW = begun(8), G = SW.game, S = G.S, D = SW.data;
  for (let i = 0; i < 40; i++) G.give(G.rollGem(1 + (i * 7) % 20));
  const key = g => 'rbg'.indexOf(G.color(g)) * 1e6 + D.SKILLS.indexOf(D.SKILL[g.sk]) * 1000 - g.aff.length * 100 - g.lvl;
  assert.ok(new Set(S.bag.map(g => g.aff.length)).size > 1 && S.bag.some((g, i) => i && S.bag[i - 1].sk === g.sk && S.bag[i - 1].aff.length > g.aff.length && S.bag[i - 1].lvl < g.lvl), 'more affixes come before a higher level');
  const runs = S.bag.map(g => g.sk).filter((sk, i, a) => i === 0 || a[i - 1] !== sk); assert.equal(new Set(runs).size, runs.length, 'every copy of a skill sits together: ' + runs.join(' '));
  assert.equal(S.bag.map(g => G.color(g)).join('').replace(/r+b+g+/, ''), '', 'red, then blue, then green');
  for (let i = 1; i < S.bag.length; i++) assert.ok(key(S.bag[i - 1]) <= key(S.bag[i]), 'out of order at ' + i);
  assert.ok(S.bag.every(g => g.nw)); const g = S.bag[3];
  assert.ok(G.inspect(g.id)); assert.ok(!g.nw); assert.equal(G.inspect(g.id), false);
  const h = S.bag[0]; S.bench.sockets[0].c = G.color(h); assert.ok(G.socket(h.id, G.BENCH, 0)); assert.ok(!h.nw, 'setting it counts as looking'); G.unsocket(h.id);
  for (let i = 1; i < S.bag.length; i++) assert.ok(key(S.bag[i - 1]) <= key(S.bag[i]), 'out of order after coming back');
});
test('a save from before the crafter: weapons become made, the rack goes, the crafter starts at what you had', () => {
  const SW = rich(), G = SW.game;
  const S = JSON.parse(JSON.stringify(G.S)); delete S.bench; delete S.crafter; S.shop = [{ id: 1, type: 'bow', q: 1, sockets: [], price: 5 }];
  S.posts[0].unit.sockets = [{ c: 'r', gem: { id: 9001, sk: 'brutal', lvl: 5, r: 0.5, aff: [], rr: 0 } }, { c: 'b', gem: null }, { c: 'g', gem: null }, { c: 'g', gem: null }];
  assert.ok(G.importSave(Buffer.from(unescape(encodeURIComponent(JSON.stringify(S))), 'binary').toString('base64')));
  assert.equal(G.S.shop, undefined); assert.equal(G.S.crafter, 4); assert.equal(G.S.posts[0].unit.sockets.length, 1); assert.equal(G.S.bench.made, false); assert.equal(forge(SW).sockets.length, 4);
});
test('auto-socket fills the first socket on the bench that fits', () => {
  const SW = rich(), G = SW.game, S = G.S;
  S.bench = bench(SW, 'axe', 'grr');
  const a = gem(SW, 'nova'), b = gem(SW, 'twin'), c = gem(SW, 'nova');
  assert.ok(G.autoSocket(a.id)); assert.ok(G.autoSocket(b.id));
  assert.equal(S.bench.sockets[1].gem.id, a.id); assert.equal(S.bench.sockets[2].gem.id, b.id); assert.equal(S.bench.sockets[0].gem, null);
  assert.equal(G.autoSocket(c.id), false, 'nowhere left for a red one'); assert.ok(S.bag.includes(c));
});
test('damage affixes add together; a Damage Aura multiplies on top, for everyone; auras never stack', () => {
  const SW = rich(), G = SW.game, base = G.X.units[0].dmg, click = G.X.cursor.dmg;
  const g = gem(SW, 'nova', 1, [{ k: 'dmg', r: 0.5 }]), g2 = gem(SW, 'twin', 1, [{ k: 'dmg', r: 1 }]); fit(SW, g); fit(SW, g2);
  const a = G.affVal(g, g.aff[0]) + G.affVal(g2, g2.aff[0]);
  near(G.X.units[0].dmg, base * (1 + a / 100));
  const w = gem(SW, 'warcry'); fit(SW, w);
  near(G.X.units[0].dmg, base * (1 + a / 100) * (1 + G.primVal(w) / 100));
  near(G.X.cursor.dmg, click * (1 + G.primVal(w) / 100));
  // auras are flat and do not stack: a second of the same kind does nothing, wherever it is and whatever its level
  const same = gem(SW, 'warcry'); fit(SW, same); near(G.X.cursor.dmg, click * (1 + G.primVal(w) / 100), 1e-6, 'a second one on the same weapon:');
  G.S.bench = bench(SW, 'axe', 'g'); const deep = gem(SW, 'warcry', 60); G.socket(deep.id, G.BENCH, 0); G.equip();
  assert.equal(G.primVal(deep), G.primVal(w)); near(G.X.cursor.dmg, click * (1 + G.primVal(w) / 100), 1e-6, 'a third on another weapon, from sixty levels down:'); assert.equal(G.X.glob.warcry, G.primVal(w));
  near(G.X.units[1].dmg, SW.data.WEAPONS.axe.dmg * (1 + G.primVal(w) / 100));
  // the two auras are different kinds, and each counts
  const sp = gem(SW, 'rally'); fit(SW, sp);
  assert.equal(G.X.glob.rally, G.primVal(sp)); near(G.X.cursor.dmg, click * (1 + G.primVal(w) / 100));
});
test('a Hex lands on every hit: Frostbite Chills, and that is all it does; there is no Vulnerable any more', () => {
  const SW = rich(), G = SW.game, D = SW.data;
  const fr = gem(SW, 'frost', 40); fit(SW, fr);
  const W = G.X.units[0]; W.crit = 0;
  assert.equal(W.frost, true); assert.equal(G.X.chill, D.CHILL, 'no Chill effect of its own'); assert.ok(!/\{v\}/.test(D.SKILL.frost.text));
  for (let i = 0; i < 25; i++) { const e = dummy(SW); G.ev.length = 0; G.F.cd[0] = 1; G.update(0.0001); near(e.chill, D.HEX_DUR, 1e-3, 'hit ' + i + ':'); near(hits(SW)[0].d, W.dmg, 1e-6, 'a Chill does not change what a blow deals:'); }
  for (const gone of ['VULN', 'BARRIER_CAP', 'BARRIER_SOAK', 'BULWARK_EVERY']) assert.equal(D[gone], undefined, gone);
  assert.equal(D.AFFIX.vuln, undefined); assert.equal(W.vuln, undefined); assert.equal(W.expose, undefined); assert.equal(G.enemy({ name: 'x', spr: 'rat', pal: 'ash', int: 1 }, {}).vuln, undefined);
  // a splash is a hit too: a hammer's own splash Chills what it catches
  G.sell(0); G.S.bench = bench(SW, 'hammer', 'b'); const f2 = gem(SW, 'frost'); G.socket(f2.id, G.BENCH, 0); G.equip(0);
  const es = group(SW, [[0, 0], [8, 0]]); G.F.cd[0] = 1; G.update(0.0001); assert.ok(es[0].chill > 0 && es[1].chill > 0);
});
test('nothing takes Life but enemy attacks, and nothing soaks them; Chill slows them', () => {
  const SW = rich(), G = SW.game, F = G.F;
  let e = dummy(SW, { int: 1, atkT: 1, dmg: 20 });
  F.life = 100; G.update(0.9); assert.equal(F.life, 100, 'no clock: waiting costs nothing'); G.update(0.11); near(F.life, 80);
  for (let i = 0; i < 16; i++) G.update(0.05); assert.equal(F.life, 80, 'nothing between attacks'); G.update(0.25); near(F.life, 60);
  e = dummy(SW, { int: 1, atkT: 1, dmg: 20, chill: 99 }); F.life = 100;
  G.update(1.2); assert.equal(F.life, 100, 'chilled, not yet'); G.update(0.25); near(F.life, 80, 1e-6, 'chilled, after 1/0.7s:');
  assert.equal(F.barrier, undefined, 'there is no Barrier'); assert.equal(G.X.bulwark, undefined); assert.equal(G.X.mend, undefined); void e;
});
test('Life lasts the level: full at its first fight and carried from fight to fight; more of it is on the tree, not in weapons', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data; D.DEATH_SECS = 1.4;
  assert.equal(D.LIFE, 100); assert.equal(D.LIFE_POST, undefined); assert.equal(G.X.lifeMax, 100, 'a weapon brings no Life of its own'); S.tree.ULF = 1; G.recompute(); assert.equal(D.NODE.ULF.eff, 'life'); assert.equal(G.X.lifeMax, 200, 'the Life node, north of the middle, is a hundred more'); assert.equal(D.NODE.ULF.y, -170); assert.equal(D.NODE.ULF.links.join(), 'n2'); assert.equal(D.NODE.N0.links.join(), 'UPG,F2'); assert.equal(D.NODE.n1.links.join(), 'N0'); assert.equal(['N0', 'n1', 'n2'].map(id => D.NODE[id].eff).join(), 'dmg,dmg,dmg', 'by way of weapon damage');
  S.run.kills = 0; S.fight = 0; G.F.life = 3; G.spawn(); assert.equal(G.F.life, 200, 'a level\'s first fight');
  assert.equal(G.F.es.length, 1, 'the first fight of a new game is one monster');
  assert.ok(G.F.es[0].dmg >= D.hit(1) * 0.5 && G.F.es[0].dmg <= D.hit(1) * 2.4, 'a level 1 monster hits for ' + G.F.es[0].dmg);
  near(D.hit(3), D.HIT0 / D.SWING * (1 + 2 * D.HIT_G)); near(D.hit(1000), D.HIT0 / D.SWING * 2); assert.ok(D.hit(50) > D.hit(49));
  assert.equal(D.EARLY.join(), '0.4,1'); near(D.hit(1), D.HIT0 / D.SWING * 0.4, 1e-9, 'level 1 pulls its blows:'); near(D.hit(2), D.HIT0 / D.SWING * (1 + D.HIT_G), 1e-9, 'and level 2 does not:');
  // what is left carries on to the next fight of the level, and the next
  G.F.life = 61; S.fight = 1; G.spawn(); assert.equal(G.F.life, 61); S.fight = 9; G.spawn(); assert.equal(G.F.life, 61, 'the boss too');
  D.HP0 = 0.001; for (let i = 0; i < 400 && S.level === 1; i++) { G.update(0.05); G.ev.length = 0; } assert.equal(S.level, 2); for (let i = 0; i < 80 && G.F.wait > 0; i++) G.update(0.05);
  assert.equal(S.fight, 0); assert.equal(G.F.life, 200, 'and a new level begins full');
  // a lost fight starts a level over, so it is full again
  S.fight = 4; G.spawn(); for (const e of G.F.es) e.hp = e.max = 1e12; G.F.life = 0.01; G.F.es[0].atkT = 0.01; G.F.es[0].dmg = 5; G.update(0.05); assert.ok(G.F.enc.lost); G.update(2); assert.equal(S.fight, 0); assert.equal(G.F.life, 200);
  // won with the last of it gone in the same breath: it stands, on a single point of Life, and is not made whole
  S.fight = 4; G.spawn(); G.F.es = [G.F.es[0]]; G.F.life = 0.01; for (const e of G.F.es) { e.atkT = 0.01; e.dmg = 5; e.hp = 0.001; } G.F.cd = [0.999]; G.update(0.05); assert.ok(!G.F.enc.lost); assert.equal(G.F.life, 1); G.update(2); assert.equal(S.fight, 5); assert.equal(G.F.life, 1);
  // making a weapon, or scrapping one, changes nothing about Life
  G.F.life = 40; S.bench = bench(SW, 'axe', 'r'); assert.ok(G.equip()); assert.equal(G.X.lifeMax, 200); assert.equal(G.F.life, 40); G.sell(1); G.sell(0); assert.equal(G.X.lifeMax, 200); assert.equal(G.F.life, 40);
  // a Life affix in a weapon made partway through is Life in hand there and then; losing it only lowers the ceiling
  S.bench = bench(SW, 'axe', 'r'); const lf = gem(SW, 'twin', 1, [{ k: 'time', t: 1 }]); G.socket(lf.id, G.BENCH, 0); assert.ok(G.equip()); assert.equal(G.X.lifeMax, 200 + D.AFFIX.time.per); assert.equal(G.F.life, 40 + D.AFFIX.time.per);
  G.F.life = G.X.lifeMax; G.sell(0); assert.equal(G.X.lifeMax, 200); assert.equal(G.F.life, 200);
  // the tree's Life: the hundred over the start, and in the south-east four of twenty-five and another hundred
  assert.equal(D.TREE.filter(n => n.eff === 'life').map(n => n.amt).sort((a, b) => a - b).join(), '25,25,25,25,100,100');
  // the weapons go on winding up between fights
  const SW2 = rich(), G2 = SW2.game; G2.F.es = []; G2.F.wait = 0.5; G2.F.cd = [0.2]; G2.update(0.05); G2.update(0.05); near(G2.F.cd[0], 0.2 + 0.1 * G2.X.units[0].aps); G2.F.cd = [0.99]; G2.update(0.05); assert.ok(G2.F.cd[0] < 1);
});
test('Concuss stuns on every hit it can: a stunned enemy does not attack, and cannot be stunned again at once', () => {
  const SW = rich(), G = SW.game, F = G.F, D = SW.data;
  const g = gem(SW, 'concuss', 13); fit(SW, g); const st = G.X.units[0].stun; assert.equal(st, G.primVal(g)); assert.equal(st, 0.5);
  const e = dummy(SW, { int: 0.5, atkT: 0.5, dmg: 50 }); G.X.units[0].aps = 0;
  F.cd[0] = 1; G.update(0.0001); near(e.stun, st, 1e-3); near(e.immune, st + D.STUN.immune, 1e-3);
  F.life = 100; G.update(st - 0.05); assert.equal(F.life, 100, 'no attack while stunned');
  e.stun = 0; F.cd[0] = 1; G.update(0.0001); assert.ok(e.stun <= 0, 'immune straight after');
  e.immune = 0; e.boss = true; F.cd[0] = 1; G.update(0.0001); near(e.stun, st * D.STUN.boss, 1e-3, 'a boss, half as long:');
});
test('Ignite burns for its share of the hit; Shatter stacks to ten', () => {
  const SW = rich(), G = SW.game, D = SW.data;
  const g = gem(SW, 'ignite'); fit(SW, g);
  const W = G.X.units[0]; W.crit = 0; W.aps = 0.0001;
  let e = dummy(SW); G.F.cd[0] = 1; G.update(0.0001);
  near(e.burn, W.dmg * G.primVal(g) / 100, 1e-3);
  const hp = e.hp; for (let i = 0; i < 400; i++) G.update(0.05);
  near(hp - e.hp, W.dmg * G.primVal(g) / 100, 1e-3, 'burn paid out:');
  // Shatter, on the sword: every hit is a stack, and the cursor's blow gains by them too
  const SW2 = rich(), G2 = SW2.game; const s = gem(SW2, 'shatter', 60); fit(SW2, s); const W2 = G2.X.units[0]; W2.crit = 0; G2.X.cursor.crit = 0;
  e = dummy(SW2);
  for (let i = 0; i < 12; i++) { G2.F.cd[0] = 1; G2.update(0.0001); }
  assert.equal(e.brit, 10);
  G2.ev.length = 0; G2.F.cdC = 0; G2.click(0, 0); near(hits(SW2)[0].d, G2.X.cursor.dmg * (1 + 10 * D.BRITTLE.per / 100));
  assert.equal(D.SKILL.shatter.bare, 1); assert.equal(W2.brittle, D.BRITTLE.per); assert.equal(G2.X.cursor.brittle, 0, 'the cursor lays on nothing itself');
});
test('Life affixes add Life, up to the cap', () => {
  const SW = rich(), G = SW.game;
  const g = gem(SW, 'rally', 1, [{ k: 'time', r: 0.5 }]); fit(SW, g); near(G.X.lifeMax, 100 + G.affVal(g, g.aff[0]));
  for (let i = 0; i < 12; i++) { const h = gem(SW, 'rally', 80, [{ k: 'time', r: 1 }]); fit(SW, h); }
  assert.equal(SW.data.AFFIX.time.per, 20); assert.equal(G.X.lifeMax, 300, 'affixes add two hundred at most'); for (const n of SW.data.TREE) if (n.eff === 'life') G.S.tree[n.id] = 1; G.recompute(); assert.equal(G.X.lifeMax, 600, 'and the tree\'s three hundred are on top of that');
});
test('running out of Life on a boss restarts the level; on a monster it drops you back a level, to climb again', () => {
  const SW = load(3), G = SW.game, S = G.S, D = SW.data;
  S.level = 4; S.maxLevel = 6; S.fight = 9; G.spawn(); assert.ok(G.F.enc.boss);
  G.F.life = 0.01; G.F.es[0].atkT = 0.01; G.ev.length = 0; G.update(0.05);
  assert.equal(S.level, 4); assert.equal(S.fight, 0); assert.equal(S.auto, true);
  // down for the count: ten seconds in which nothing fights, and going to another level does not cut it short
  assert.equal(D.DEATH_SECS, 10); assert.equal(G.ev.find(e => e.t === 'fail').secs, 10); near(G.deadLeft(), 10, 1e-9);
  G.update(6); near(G.deadLeft(), 4, 1e-9); assert.ok(G.F.enc.lost); assert.equal(G.click(0, 0), false);
  assert.ok(G.goto(2)); near(G.deadLeft(), 4, 1e-9); assert.ok(G.goto(4));
  G.update(3.9); assert.ok(G.deadLeft() > 0); G.update(0.2); assert.equal(G.deadLeft(), 0); assert.ok(!G.F.enc.boss && !G.F.enc.lost && G.alive().length > 0, 'and the level starts again');
  G.F.life = 0.01; G.F.es[0].atkT = 0.01; G.update(0.05);
  assert.equal(S.level, 3); assert.equal(S.auto, true, 'a cleared level still leads on to the next'); assert.equal(S.maxLevel, 6);
  // an old save that had Auto-advance switched off: there is no switch any more
  const old = JSON.parse(JSON.stringify(S)); old.auto = false; assert.equal(G.patch(old).auto, true);
});
test('cores: every level a run clears pays, deeper ones more; prestige banks them, and a second run pays again', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  D.HP0 = 0.01;                                   // monsters of paper
  assert.equal(D.CORE(1), 1); assert.equal(D.CORE(2), 1); assert.equal(D.CORE(3), 2); assert.equal(D.CORE(5), 3); assert.equal(D.CORE(24), 10); assert.equal(D.CORE(100), 41);
  assert.equal(S.best, 3); assert.equal(G.cores(), 0); assert.equal(G.runCores(), 0); assert.equal(G.spent(), 2);
  assert.equal(D.PRESTIGE_AT, 2); assert.equal(G.canPrestige(), false); assert.equal(G.prestige(), false, 'not before level 2');
  const pays = []; let t = 0; for (; t < 900 / 0.05 && S.maxLevel < 8; t++) { const e = G.alive()[0]; if (e) { G.F.cdC = 0; G.click(e.x, e.y); } G.update(0.05); for (const ev of G.ev) if (ev.t === 'cleared') pays.push(ev); G.ev.length = 0; }
  const deep = S.maxLevel; assert.ok(deep >= 8); assert.equal(pays.map(p => p.level).join(), '1,2,3,4,5,6,7'); assert.equal(pays.map(p => p.pay).join(), '1,1,2,2,3,3,3');
  assert.equal(S.best, deep); assert.equal(G.runCores(), 15, 'what the run has earned'); assert.equal(G.cores(), 0, 'none of it banked yet');
  assert.equal(G.allocate('UHX'), false, 'the tree cannot be touched during a run'); assert.equal(G.spent(), 2);
  // going back over a level the run has cleared pays nothing more
  S.level = 2; S.fight = 9; G.spawn(); for (let i = 0; i < 4000 && S.level === 2; i++) { const e = G.alive()[0]; if (e) { G.F.cdC = 0; G.click(e.x, e.y); } G.update(0.05); } G.ev.length = 0;
  assert.equal(S.level, 3); assert.equal(G.runCores(), 15);
  // prestige banks it; a second run to the same depth pays the same again
  let got = null; G.ev.length = 0; assert.ok(G.prestige()); for (const ev of G.ev) if (ev.t === 'prestige') got = ev; assert.equal(got.earned, 15); assert.equal(G.cores(), 15); assert.equal(G.runCores(), 0);
  assert.ok(G.beginRun()); assert.equal(S.maxLevel, 1); assert.equal(S.best, deep, 'the deepest ever is remembered');
  for (let i = 0; i < 900 / 0.05 && S.maxLevel < 8; i++) { const e = G.alive()[0]; if (e) { G.F.cdC = 0; G.click(e.x, e.y); } G.update(0.05); G.ev.length = 0; }
  assert.equal(G.runCores(), 15, 'every run pays'); assert.ok(G.prestige()); assert.equal(G.cores(), 30);
});
test('prestige ends the run and opens the tree; nothing moves until the next run begins', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  S.maxLevel = 24; S.level = 23; S.best = 24; S.fight = 4; for (let i = 0; i < 9; i++) G.give(G.rollGem(20));
  const kills = S.stats.kills, made = S.stats.made; S.run.earn = 40;
  assert.ok(G.prestige()); assert.equal(S.alloc, true); assert.equal(S.runs, 1); assert.equal(G.cores(), 40, 'what the run earned is banked');
  assert.equal(S.level, 1); assert.equal(S.maxLevel, 1); assert.equal(S.gold, 0); assert.equal(S.bag.length, 0); assert.ok(S.posts.every(P => !P.unit));
  assert.equal(S.stats.kills, kills, 'the tallies are for good'); assert.equal(S.stats.made, made);
  assert.equal(G.prestige(), false, 'not twice'); assert.equal(G.canPrestige(), false);
  // the game stands still while the tree is open
  const t = S.stats.time, life = G.F.life; G.update(5); assert.equal(S.stats.time, t); assert.equal(G.F.life, life); assert.equal(G.click(0, 0), false);
  // the tree: a node has its price, and only one that touches what is held can be bought
  assert.equal(G.spent(), 2, 'the first two nodes'); assert.equal(G.allocate('P1'), false, 'the next weapon is three nodes away'); assert.equal(G.allocate('nope'), false);
  const cost = ['UPG', 'w1', 'P1'].map(id => { const c = G.nodeCost(id); assert.ok(G.allocate(id), id); return c; }); assert.equal(cost.join(), '2,3,8'); assert.equal(G.spent(), 5); assert.equal(G.cores(), 40 - 13);
  assert.equal(G.allocate('w1'), false, 'not twice'); assert.equal(G.treeVal('post2'), 1); assert.equal(G.treeVal('swd'), D.TREE_EFF.swd.amt[0]);
  // handing one back, while the tree is open: only if nothing hangs from it, and for what it costs
  assert.equal(G.canRemove('w1'), false); assert.equal(G.unallocate('w1'), false, 'the weapon hangs from it'); assert.ok(G.unallocate('P1')); assert.ok(G.unallocate('w1')); assert.ok(G.unallocate('UPG')); assert.equal(G.spent(), 2); assert.equal(G.cores(), 40);
  assert.ok(G.canRemove('F2')); assert.ok(G.unallocate('F2'), 'one that an earlier run bought comes back as well'); assert.equal(G.cores(), 42); assert.equal(G.unallocate('F2'), false, 'not twice'); assert.ok(G.allocate('F2')); assert.equal(G.cores(), 40); assert.equal(G.clearTree, undefined, 'one at a time: the whole tree is not cleared at a stroke');
  S.bank = 12; assert.equal(G.allocate('UPG') && G.allocate('w1') && G.allocate('P1'), false, 'not without the cores'); assert.equal(G.cores(), 7); assert.ok(G.touches('P1') && !G.canAllocate('P1')); S.bank = 40 - 5;
  // the run begins: the line the tree gives, and the tree is fixed
  for (const id of ['P1', 'UHX']) assert.ok(G.allocate(id));
  assert.equal(S.posts.length, 2, 'not until the run begins'); assert.ok(G.beginRun()); assert.equal(S.alloc, false); assert.equal(G.beginRun(), false);
  assert.equal(S.posts.length, 2, 'the two posts the tree holds'); assert.equal(G.F.es.length, 0, 'a new run opens on an empty arena: a moment to forge'); assert.equal(D.RUN_SECS, 3); assert.equal(G.F.life, G.X.lifeMax); near(G.openLeft(), 3, 1e-9);
  G.update(2.9); assert.equal(G.F.es.length, 0); assert.ok(G.openLeft() > 0); G.update(0.2); assert.equal(G.openLeft(), 0); assert.equal(G.F.es.length, 1, 'then one monster'); assert.equal(G.X.units.filter(Boolean).length, 0);
  assert.equal(G.allocate('s1'), false); assert.equal(G.unallocate('UHX'), false); assert.equal(G.spent(), 6); assert.equal(G.cores(), 40 - 13 - 4, 'cores not spent are kept');
  const t2 = S.stats.time; G.update(1); assert.ok(S.stats.time > t2, 'and time moves again');
  // the first fights of every run drop a skill
  D.HP0 = 0.01; for (let i = 0; i < 400 && S.fight < 3 && S.level === 1; i++) { const e = G.alive()[0]; if (e) { G.F.cdC = 0; G.click(e.x, e.y); } G.update(0.05); }
  assert.ok(S.bag.length >= 3, 'starter drops again: ' + S.bag.length);
  // next time the tree opens as it was
  S.maxLevel = 6; assert.ok(G.prestige()); assert.equal(G.spent(), 6, 'it opens as it was'); { const c0 = G.cores(), price = G.nodeCost('P1'); assert.ok(G.unallocate('P1'), 'and any of it can be handed back'); assert.equal(G.cores(), c0 + price); assert.equal(G.treeVal('post2'), 0); assert.ok(G.allocate('P1')); assert.equal(G.cores(), c0); } assert.ok(G.allocate('e1'));
  assert.ok(G.beginRun()); assert.equal(S.posts.length, 2); assert.equal(G.treeVal('tier'), 1, 'the first step east is a skill tier'); assert.equal(G.tierPoints(), 1); assert.equal(G.skillTier, undefined);
  // a save from before the tree: no cores, no perks, a point for each level of depth, and its line kept until it next prestiges
  const old = JSON.parse(JSON.stringify(S)); delete old.tree; delete old.alloc; delete old.gate; old.best = 30; old.maxLevel = 12; old.cores = 77; old.perk = { head: 3 }; old.posts.push({ unit: null }, { unit: null }, { unit: null }); old.crafter = 2;
  const P = G.patch(old); assert.equal(P.cores, undefined); assert.equal(P.perk, undefined); assert.equal(P.best, 31); assert.equal(JSON.stringify(P.tree), '{"F1":1,"F2":1}', 'only the first two nodes, which it had the use of already'); assert.equal(P.alloc, false); assert.equal(P.posts.length, 5); assert.equal(P.crafter, 3, 'the same sockets as it had: the first is no longer free');
  // a save from when a level was a point and a node cost one: the points it had not spent become cores, and its tree is kept
  const pts = JSON.parse(JSON.stringify(S)); delete pts.bank; delete pts.run.earn; pts.best = 20; pts.tree = { F1: 1, F2: 1, ULF: 1, e1: 1 }; const Q = G.patch(pts); assert.equal(Q.bank, 15); assert.equal(Q.run.earn, 0); assert.equal(Object.keys(Q.tree).length, 4);
});
/* hold every node of these kinds, whatever the tree's shape, and work out the line again */
const hold = (SW, ...effs) => { const G = SW.game; for (const n of SW.data.TREE) if (effs.includes(n.eff)) G.S.tree[n.id] = 1; G.recompute(); };
test('the tree: hubs where paths meet, themed small nodes between them, a notable one step off the path', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  assert.equal(D.TREE.length, 138); assert.equal(new Set(D.TREE.map(n => n.id)).size, 138);
  assert.equal(D.TREE.filter(n => n.eff === 'bench2').length, 1); assert.equal(D.TREE.filter(n => n.eff === 'tier' && !n.big).length, 15); assert.equal(D.TREE.filter(n => n.eff === 'tier' && n.big).length, 2); assert.equal(D.TREE.filter(n => n.eff === 'might').length, 4, 'two on the bridges, two on the west spine where the seventh and eighth weapons were'); assert.equal(D.TREE.filter(n => n.eff === 'gold').length, 4);
  for (const n of D.TREE) {
    const E = D.TREE_EFF[n.eff]; assert.ok(E, n.id); assert.ok(n.amt > 0, n.id); assert.ok(typeof E.text(n.amt) === 'string' && E.text(n.amt).length > 5, n.id);
    if (n.big) assert.ok(D.TREE_ICON[n.eff], n.id + ' has an icon'); if (!n.big || n.eff === 'tier') assert.ok(E.sum, n.id + ' adds up');
    const CORE = ['F1', 'UPG', 'F2', 'URR', 'UBY', 'UMT', 'UAD', 'UHX'];       // the block in the middle: all big, and touching
    if (n.id === 'F1') assert.ok(n.big && n.links.join() === 'start', 'the first weapon is the middle');
    else if (n.id === 'UPG' || n.id === 'F2') assert.equal(n.links.join(), 'F1', n.id + ': one of the two that lead out of it');
    else if (n.id === 'UHX' || n.id === 'N0') assert.equal(n.links.join(), 'UPG,F2', 'Hex, and the first step north, hang between Upgrade and the socket');
    else if (n.id === 'ND' || n.id === 'SW') assert.ok(D.NODE[n.links[0]].big && n.links.length === 1, 'Chill\'s notable hangs over Life, and Burn\'s under Cull');
    else if (n.big && !CORE.includes(n.id)) assert.ok(n.near.every(x => x !== 'start' && (!D.NODE[x].big || CORE.includes(x) || x === 'ND' || x === 'SW')), n.id + ': a big node is reached through small ones');
    for (const x of n.near) if (x !== 'start') assert.ok(D.NODE[x].near.includes(n.id), 'links go both ways');
  }
  for (const a of D.TREE) for (const b of D.TREE) if (a.id < b.id) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 30, a.id + ' and ' + b.id + ' are drawn apart');
  // no plain filler: every small node on the way to a post is a weapon's or a skill tier, and each weapon and affliction has its notable
  for (const w of ['swd', 'ham', 'axe', 'dag', 'bow', 'stf']) { const big = D.TREE.find(n => n.eff === w + 'N'); assert.ok(big && big.near.length === 1 && D.NODE[big.near[0]].eff === w, w + ': its notable hangs off its own path'); }
  for (const h of ['chill', 'stun', 'nova', 'burn', 'brit']) { assert.equal(D.TREE.filter(n => n.eff === h + 'N').length, 1, h + ' has its notable'); assert.ok(!D.TREE.some(n => n.eff === h) && !D.TREE_EFF[h], h + ' has no small nodes: the paths are weapon damage'); }
  assert.equal(D.TREE.filter(n => n.eff === 'dmg').length, 14); assert.equal(D.TREE_EFF.dmg.amt[0], 5); assert.equal(D.NODE.SH.eff, 'cull'); assert.equal(D.NODE.SH.y, 170);
  for (const p of D.TREE.filter(n => n.eff === 'post2')) for (const x of p.links) assert.ok(['swd', 'ham', 'axe', 'dag', 'bow', 'stf', 'kit', 'tier'].includes(D.NODE[x].eff), p.id + ' is reached through ' + D.NODE[x].eff);
  for (const c of D.CRAFTS) if (c.node) assert.ok(D.TREE.some(n => n.eff === c.node && n.big), c.id + ' has its node');
  // prices: the first weapon 1, the two beside it 2; unlocks, weapons, sockets and tiers cost more for each already held; a small node by how far out it is
  const fresh = load(1), G1 = fresh.game, P = D.PRICE; G1.S.alloc = true; G1.S.bank = 1e9;
  assert.equal(G1.nodeCost('F1'), 1); assert.equal(G1.nodeCost('F2'), 2); assert.equal(G1.nodeCost('UPG'), 2); assert.equal(D.NODE.F1.dist, 0); assert.equal(D.NODE.w1.dist, 2); assert.equal(G1.nodeCost('w1'), 3); assert.equal(G1.nodeCost('WSW'), Math.round((P.bead[0] + P.bead[1] * 3) * P.notable));
  // every node has its own price, and it stays put whatever else is bought
  const keys = { URR: 2, UMT: 4, UHX: 4, UAD: 4, UBY: 5, ULF: 5 }; for (const id in keys) assert.equal(G1.nodeCost(id), keys[id], id);
  const before = {}; for (const n of D.TREE) before[n.id] = G1.nodeCost(n.id);
  for (const n of D.TREE) G1.S.tree[n.id] = 1; for (const n of D.TREE) assert.equal(G1.nodeCost(n.id), before[n.id], n.id + ' costs the same with the whole tree held'); G1.S.tree = {};
  // weapons, sockets and tiers: the further out, the dearer
  for (const k of ['post2', 'sock2', 'tier']) { const ns = D.TREE.filter(n => n.eff === k && !n.big).concat(k === 'tier' ? [] : D.TREE.filter(n => n.eff === k && n.big)).filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => a.dist - b.dist);
    for (let i = 1; i < ns.length; i++) assert.ok(ns[i].dist === ns[i - 1].dist ? before[ns[i].id] === before[ns[i - 1].id] : before[ns[i].id] > before[ns[i - 1].id], k + ': ' + ns[i - 1].id + ' ' + before[ns[i - 1].id] + ', ' + ns[i].id + ' ' + before[ns[i].id]); }
  assert.equal(before.P1, 8); assert.equal(before.P2, before.P3, 'the two sides mirror each other'); assert.ok(before.P5 > 100, 'the fifth and sixth weapons are the dear ones: ' + before.P5); assert.equal(D.NODE.P7.eff, 'might'); assert.equal(before.K1, 14); assert.ok(before.K5 > 300); assert.equal(before.e1, 5); assert.equal(before.TR1, Math.round(before.wa5 * D.PRICE.tierBig), 'a Deep veins is 2.2 tiers at the same distance');
  let total = 0;
  for (const n of D.TREE.slice().sort((a, b) => a.dist - b.dist)) { const c = G1.nodeCost(n.id); total += c; assert.ok(c >= 1 && Number.isInteger(c), n.id + ' costs ' + c); assert.ok(G1.allocate(n.id), n.id); }
  assert.ok(total > 3000 && total < 8000, 'the whole tree: ' + total); assert.equal(G1.cores(), 1e9 - total);
  // what the bot does with its cores: the weapon, a socket and the Market first, saving for each; then whatever adds most for its price
  const got = n => { S.bank = n; S.alloc = true; allocTree(SW); return G.spent(); };
  assert.equal(got(2), 3, 'Upgrade, which comes before anything else'); assert.ok(G.has('UPG')); assert.equal(G.cores(), 0); assert.equal(got(4), 3, 'not enough for the Market: it saves'); assert.equal(G.cores(), 4); assert.equal(got(5), 4); assert.ok(G.has('UBY')); assert.equal(G.cores(), 0); got(60); assert.ok(G.has('ULF') && G.has('UPG'), 'Life and Upgrade soon after');
  got(400); assert.ok(G.treeVal('post2') >= 2 && G.treeVal('sock2') >= 1 && G.treeVal('tier') >= 4, 'weapons, sockets and tiers together: ' + [G.treeVal('post2'), G.treeVal('sock2'), G.treeVal('tier')]); assert.ok(G.has('UPG'));
  assert.equal(got(1e6), 138, 'and with cores to burn, the whole tree');
  assert.ok(G.has('UBY') && G.has('URR')); assert.equal(D.NODE.URR.near.join(), 'UPG,PU1'); assert.equal(D.NODE.UBY.links.join(), 'F2'); assert.equal(D.NODE.CPK, undefined, 'there is no Standing order: which skill is bought goes by the bag');
  // the whole tree, in play
  S.best = 150; assert.ok(G.beginRun());
  assert.equal(S.posts.length, 6); assert.equal(forge(SW).sockets.length, 6);
  // skill tier is the tree's, whatever the level: fifteen nodes of one and two of two, on top of tier 1
  assert.equal(G.tierPoints(), 19); assert.ok(G.tierOdds()[4] > 0.6 && G.tierOdds()[0] < 0.02, 'with every tier node, mostly tier 5'); assert.ok(S.bag.every(g => D.tier(g.lvl) >= 1 && D.tier(g.lvl) <= 5)); assert.ok(S.bag.filter(g => D.tier(g.lvl) >= 4).length > S.bag.length / 2, 'the starting skills too'); near(G.X.goldMult, 1.4); S.gold = 1e9; assert.ok(D.tier(G.buySkill().lvl) >= 2); S.level = S.maxLevel = 60; assert.ok(D.tier(G.buySkill().lvl) <= 5, 'depth has no say'); S.level = 1; S.maxLevel = 1 + D.TREE.filter(n => n.eff === 'head').reduce((x, n) => x + n.amt, 0);
  S.bench = bench(SW, 'sword', ''); G.equip(); near(G.X.units[0].dmg, D.WEAPONS.sword.dmg * 2.3, 1e-9, 'four Battle lines and fourteen Whetstones:'); near(G.X.cursor.dmg, D.CURSOR.dmg, 1e-9, 'the cursor is not a weapon:'); G.sell(0); S.bag = S.bag.filter(g => g.nw && g.lvl === G.dropLevel(S.maxLevel)).slice(0, D.TREE.filter(n => n.eff === 'kit').length);
  const sum = eff => D.TREE.filter(n => n.eff === eff).reduce((x, n) => x + n.amt, 0);
  near(G.X.dropMult, 1 + sum('drops') / 100); assert.equal(G.X.lifeMax, D.LIFE + sum('life')); assert.equal(sum('life'), 300, 'the tree has three hundred Life in all');
  assert.equal(S.maxLevel, 1 + sum('head')); assert.equal(sum('head'), 40, 'eight Head starts of five levels: four beside the middle, four on the bridges'); assert.equal(['HS1', 'HS2', 'HS3', 'HS4'].map(id => D.NODE[id].links.join()).join(' '), 'PU1 PU2 HS1 HS2'); assert.ok(['HS1', 'HS2', 'HS3', 'HS4'].every(id => G.nodeCost(id) === 3)); assert.equal(S.bag.length, sum('kit')); assert.ok(S.bag.every(g => g.lvl === G.dropLevel(S.maxLevel) && g.nw));
  assert.equal(G.buyCost(), Math.ceil(D.buyCost(S.maxLevel) * (1 - sum('cheap') / 100)));
  assert.equal(G.benchCost(), Math.ceil(D.MAKE * D.gold(S.maxLevel) * D.CRAFT.part * (1 - sum('reroll') / 100))); assert.ok(sum('reroll') <= D.REROLL_CUT); assert.ok(G.benchCost() > G.makeCost(), 'still dearer than a new weapon, with every Spare stock held');
  // a head start reaches no deeper than you have ever cleared
  S.best = 4; assert.equal(G.headLevels(), 3);
  // Head start: the run begins that many levels in, and the levels passed over are paid for with the first one it clears
  const H = begun(5), GH = H.game, SH = H.game.S; assert.equal(D.NODE.HS1.eff, 'head'); assert.equal(D.NODE.HS1.links.join(), 'PU1', 'it hangs from a Purse'); assert.equal(GH.nodeCost('HS1'), 3, 'it is cheap');
  for (const n of D.TREE) if (n.eff === 'head') assert.ok(n.near.some(x => D.NODE[x].eff === 'purse' || (D.NODE[x].eff === 'head' && D.NODE[x].near.some(y => D.NODE[y].eff === 'purse'))), n.id + ': a head start is reached through a Purse');
  for (const end of ['NK', 'K2', 'SL', 'K3']) assert.ok(D.NODE[end].near.every(x => D.NODE[x].eff !== 'head'), end + ': no bridge opens on a head start');
  SH.tree.HS1 = 1; SH.best = 30; SH.maxLevel = 9; assert.ok(GH.prestige()); assert.ok(GH.beginRun()); assert.equal(SH.level, 6, 'five levels in'); assert.equal(SH.maxLevel, 6); assert.equal(SH.run.paid, 0); assert.equal(GH.runCores(), 0, 'nothing for them yet');
  H.data.HP0 = 0.0001; let hsPaid = null; for (let i = 0; i < 6000 && !hsPaid; i++) { const e = GH.alive()[0]; if (e) { GH.F.cdC = 0; GH.click(e.x, e.y); } GH.update(0.02); for (const ev of GH.ev) if (ev.t === 'cleared') hsPaid = ev; GH.ev.length = 0; }
  assert.equal(hsPaid.level, 6); assert.equal(D.SKIP_PAY, 0.5); assert.equal(hsPaid.pay, D.CORE(6) + Math.floor([1, 2, 3, 4, 5].reduce((x, l) => x + D.CORE(l), 0) / 2), 'level 6, and half of the five it passed over'); assert.equal(hsPaid.pay, 7); assert.equal(GH.runCores(), hsPaid.pay); assert.equal(SH.run.paid, 6);
  // a head start too deep for the line is no trap: driven back, the run is paid for whatever it does clear
  const T = begun(6), GT = T.game, ST = T.game.S; ST.tree.HS1 = 1; ST.best = 30; ST.maxLevel = 9; assert.ok(GT.prestige()); assert.ok(GT.beginRun()); assert.equal(ST.level, 6); T.data.HP0 = 0.0001;
  const clearAt = lvl => { ST.level = lvl; ST.fight = 9; GT.spawn(); let done = null; for (let i = 0; i < 6000 && !done; i++) { const e = GT.alive()[0]; if (e) { GT.F.cdC = 0; GT.click(e.x, e.y); } GT.update(0.02); done = GT.ev.find(ev => ev.t === 'leveldone'); GT.ev.length = 0; } return done; };
  let d3 = clearAt(3); assert.equal(d3.level, 3); assert.equal(d3.pay, D.CORE(3) + Math.floor((D.CORE(1) + D.CORE(2)) / 2), 'level 3, and half of the two under it'); assert.equal(ST.maxLevel, 6, 'no deeper than it began');
  assert.equal(clearAt(4).pay, D.CORE(4)); assert.equal(clearAt(3).pay, 0, 'not twice'); assert.equal(GT.runCores(), D.CORE(3) + 1 + D.CORE(4)); assert.equal(clearAt(6).pay, D.CORE(6) + Math.floor(D.CORE(5) / 2), 'and level 6 in full when it gets there, with half of the one it jumped'); assert.equal(ST.maxLevel, 7);
  // a run saved before this, with a Head start's levels still owing, is owed them; one already under way has been paid to where it stands
  let old = JSON.parse(JSON.stringify(ST)); delete old.run.paid; old.run.skip = 5; old.maxLevel = 6; assert.equal(GT.patch(old).run.paid, 0); old = JSON.parse(JSON.stringify(ST)); delete old.run.paid; old.maxLevel = 12; const P12 = GT.patch(old); assert.equal(P12.run.paid, 11); assert.equal(P12.run.skip, undefined);
});
test('weapon nodes: each type has small nodes that sharpen what it does and a notable that changes it', () => {
  const D0 = load(1).data;
  const made = (type, ...effs) => { const SW = rich(), G = SW.game; G.sell(0); G.S.bench = bench(SW, type, 'r'); G.equip(0); hold(SW, ...effs); return { SW, G, W: G.X.units[0], D: SW.data }; };
  const n = eff => D0.TREE.filter(x => x.eff === eff).reduce((a, x) => a + x.amt, 0);
  // sword: faster, and Riposte strikes twice
  let a = made('sword'), b = made('sword', 'swd', 'swdN'); near(b.W.aps, a.W.aps * (1 + n('swd') / 100)); assert.equal(a.W.twin, 0); assert.equal(b.W.twin, 20);
  // hammer: a heavier splash, and Wide swing a farther one
  a = made('hammer'); b = made('hammer', 'ham', 'hamN'); assert.equal(a.W.splash, 40); assert.equal(b.W.splash, 40 + n('ham')); near(b.W.splashR, a.W.splashR * 1.6);
  // axe: more to bosses, and Cleaver gives it a splash of its own
  a = made('axe'); b = made('axe', 'axe', 'axeN'); assert.equal(a.W.boss, 0); assert.equal(b.W.boss, n('axe')); assert.equal(a.W.splash, 0); assert.equal(b.W.splash, 30);
  const es = group(b.SW, [[0, 0], [8, 0]]); b.W.crit = 0; b.G.F.cd[0] = 1; b.G.update(0.0001); const t = es.map(took).sort((x, y) => y - x); near(t[1], t[0] * 0.3, 1e-6, 'the splash lands:');
  // dagger: more criticals, and Lacerate makes them triple
  a = made('dagger'); b = made('dagger', 'dag', 'dagN'); assert.equal(b.W.crit, a.W.crit + n('dag')); assert.equal(a.W.critMult, 2); assert.equal(b.W.critMult, 3);
  // bow: a harder pierce, and Heavy arrows a wider line
  a = made('bow'); b = made('bow', 'bow', 'bowN'); assert.equal(b.W.pierce, 50 + n('bow')); near(b.W.pierceW, a.W.pierceW * 2);
  // staff: a harder arc, and Chain two more of them
  a = made('staff'); b = made('staff', 'stf', 'stfN'); assert.equal(b.W.arc, 50 + n('stf')); assert.equal(a.W.arcN, 1); assert.equal(b.W.arcN, 3);
  const row = group(b.SW, [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]]); b.W.crit = 0; b.G.F.cd[0] = 1; b.G.update(0.0001); assert.equal(row.filter(e => took(e) > 0).length, 4, 'the blow and three arcs');
  // a weapon's nodes are its own: none of it reaches another type, or the cursor
  const c = made('sword', 'ham', 'hamN', 'axe', 'axeN', 'dag', 'dagN', 'bow', 'bowN', 'stf', 'stfN'), plain = made('sword');
  for (const k of ['aps', 'crit', 'critMult', 'twin', 'boss', 'splash', 'pierce', 'arcN', 'dmg']) assert.equal(c.W[k], plain.W[k], k); assert.equal(c.G.X.cursor.critMult, 2); assert.equal(c.G.X.cursor.splash, 0);
});
test('affliction notables: Chill, Stun, Shockwave, Burn and Brittle each have one; Whetstones are plain weapon damage; Cull finishes the weak', () => {
  const sum = (D, eff) => D.TREE.filter(x => x.eff === eff).reduce((a, x) => a + x.amt, 0);
  const with_ = (skill, ...effs) => { const SW = rich(), G = SW.game; const g = gem(SW, skill, 1); fit(SW, g); hold(SW, ...effs); const W = G.X.units[0]; W.crit = 0; return { SW, G, W, D: SW.data }; };
  // Chill: slower still, and Frostbitten enemies take more
  let a = with_('frost'), b = with_('frost', 'chillN'); assert.equal(a.G.X.chill, a.D.CHILL); assert.equal(b.G.X.chill, b.D.CHILL);
  let e = dummy(b.SW); b.G.ev.length = 0; b.G.F.cd[0] = 1; b.G.update(0.0001); near(hits(b.SW)[0].d, b.W.dmg, 1e-6, 'the hit that Chills is not yet on a Chilled enemy:');
  b.G.ev.length = 0; b.G.F.cd[0] = 1; b.G.update(0.0001); near(hits(b.SW)[0].d, b.W.dmg * 1.15, 1e-6, 'the next one is:');
  // Stun: longer, and again sooner
  a = with_('concuss'); b = with_('concuss', 'stunN'); near(b.W.stun, a.W.stun); assert.equal(a.G.X.stunImmune, 2); assert.equal(b.G.X.stunImmune, 1);
  e = dummy(b.SW); b.G.F.cd[0] = 1; b.G.update(0.0001); near(e.immune, b.W.stun + 1, 1e-3);
  // Shockwave: harder, and every four seconds
  a = with_('nova'); b = with_('nova', 'novaN'); near(b.W.nova, a.W.nova); assert.equal(a.G.X.novaEvery, 6); assert.equal(b.G.X.novaEvery, 4);
  b.W.aps = 0; e = dummy(b.SW); for (let i = 0; i < 79; i++) b.G.update(0.05); assert.equal(took(e), 0); b.G.update(0.1); near(took(e), b.W.dmg * b.W.nova / 100);
  // Burn: hotter, and Wildfire passes it on
  a = with_('ignite'); b = with_('ignite', 'burnN'); near(b.W.ignite, a.W.ignite);
  const two = group(b.SW, [[0, 0], [10, 0]]); two[0].hp = two[0].max = 1e9; two[1].hp = two[1].max = 1e9; two[0].burn = 500; two[0].by = { 0: 500 }; two[0].hp = 0.5;
  b.W.aps = 0; b.G.update(0.01); assert.ok(two[0].dead, 'it burns to death'); assert.ok(two[1].burn > 400 && two[1].burn < 500, 'and what was left of the burn is on the other: ' + two[1].burn);
  const lone = group(a.SW, [[0, 0], [10, 0]]); lone[1].hp = lone[1].max = 1e9; lone[0].burn = 500; lone[0].by = { 0: 500 }; lone[0].hp = 0.5; a.W.aps = 0; a.G.update(0.01); assert.equal(lone[1].burn, 0, 'without Wildfire it dies with it');
  // Brittle: more stacks, and Shattering more for each
  a = with_('shatter'); b = with_('shatter', 'britN'); assert.equal(a.W.brittle, 3); assert.equal(b.W.brittle, 4); assert.equal(b.G.X.britMax, 10);
  e = dummy(b.SW); for (let i = 0; i < 30; i++) { b.G.F.cd[0] = 1; b.G.update(0.0001); } assert.equal(e.brit, 10);
  b.G.ev.length = 0; b.G.F.cd[0] = 1; b.G.update(0.0001); near(hits(b.SW)[0].d, b.W.dmg * (1 + 10 * 4 / 100));
  // Whetstones: 5% weapon damage each, with the Battle lines, and nothing for the cursor
  a = with_('twin'); b = with_('twin', 'dmg'); assert.equal(sum(b.D, 'dmg'), 70); near(b.W.dmg, a.W.dmg * 1.7, 1e-9); near(b.G.X.cursor.dmg, a.G.X.cursor.dmg, 1e-9);
  b = with_('twin', 'dmg', 'might'); near(b.W.dmg, a.W.dmg * 2.3, 1e-9, 'fourteen Whetstones and four Battle lines:');
  // Cull: an enemy brought to 15% of its life or less dies; one left above that does not
  a = with_('twin'); b = with_('twin', 'cull'); assert.equal(a.G.X.cull, 0); assert.equal(b.G.X.cull, 15); assert.equal(b.D.CULL, 15);
  b.W.twin = 0; b.W.dmg = 80; let c = group(b.SW, [[0, 0], [15, 0]], { hp: 100, max: 100, gold: 1, int: 99, atkT: 99, dmg: 0 }); b.G.F.cd[0] = 1; b.G.update(0.0001);
  assert.equal(c[0].hp, 20, 'at a fifth it stands'); assert.ok(!c[0].dead); c[0].hp = 95; b.W.dmg = 81; b.G.F.cd[0] = 1; b.G.update(0.0001); assert.ok(c[0].dead, 'at 14% it is culled'); assert.equal(c[1].hp, 100, 'and nothing carries from a cull');
  a.W.twin = 0; a.W.dmg = 81; c = group(a.SW, [[0, 0], [15, 0]], { hp: 95, max: 100, gold: 1, int: 99, atkT: 99, dmg: 0 }); a.G.F.cd[0] = 1; a.G.update(0.0001); assert.ok(!c[0].dead, 'not without the node'); assert.equal(c[0].hp, 14);
  // a burn culls too, and so does damage carried on from another enemy
  c = group(b.SW, [[0, 0], [15, 0]], { hp: 100, max: 100, gold: 1, int: 99, atkT: 99, dmg: 0 }); c[0].hp = 16; c[0].burn = 5; c[0].by = { 0: 5 }; b.W.aps = 0; for (let i = 0; i < 40 && !c[0].dead; i++) b.G.update(0.05); assert.ok(c[0].dead, 'burned down to the mark');
  c = group(b.SW, [[0, 0], [15, 0]], { hp: 10, max: 10, gold: 1, int: 99, atkT: 99, dmg: 0 }); c[1].hp = c[1].max = 100; b.W.aps = 1; b.W.dmg = 96; b.W.carry = 2; b.G.F.cd[0] = 1; b.G.update(0.0001); assert.ok(c[0].dead && c[1].dead, 'ten for the first, eighty-six carried: fourteen left is a cull');
});
test('crafting a skill: two ways are always there, and the tree unlocks three more', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data; colours(SW);
  assert.equal(D.CRAFTS.map(c => c.id).join(), 'strip,recast,add,third,morph'); assert.equal(D.CRAFT_BY.fuse, undefined); assert.equal(G.fuseFodder, undefined); assert.equal(D.TREE_EFF.cFuse, undefined);
  assert.ok(G.craftUnlocked('strip') && G.craftUnlocked('recast')); for (const k of ['add', 'third', 'morph']) assert.equal(G.craftUnlocked(k), false, k); assert.equal(D.CRAFT_BY.one, undefined, 'one affix cannot be picked out and replaced'); assert.equal(D.TREE_EFF.cOne, undefined); assert.equal(G.craft.length, 2);
  const g = gem(SW, 'nova', 31, [{ k: 'dmg', t: 1 }]);
  for (const k of ['add', 'third', 'morph']) { const gold = S.gold; assert.equal(G.craft(k, g.id), false, k + ' is locked'); assert.equal(S.gold, gold); }
  assert.equal(g.aff.length, 1); assert.equal(g.sk, 'nova');
  // Add an affix: none or one becomes one more; a third takes its own node
  const bare = gem(SW, 'frost', 12); assert.equal(G.craft('add', bare.id), false); hold(SW, 'cAdd');
  assert.equal(G.craft('strip', bare.id), false, 'nothing on it to remove'); assert.equal(G.craft('recast', bare.id), false);
  assert.ok(G.craft('add', bare.id)); assert.equal(bare.aff.length, 1); assert.ok(G.craft('add', bare.id)); assert.equal(bare.aff.length, 2); assert.notEqual(bare.aff[0].k, bare.aff[1].k);
  assert.equal(G.craft('add', bare.id), false, 'two is as far as it goes'); assert.equal(G.craft('third', bare.id), false);
  hold(SW, 'cThird'); assert.ok(G.craft('third', bare.id)); assert.equal(bare.aff.length, 3); assert.equal(new Set(bare.aff.map(a => a.k)).size, 3); assert.equal(G.craft('third', bare.id), false);
  for (const a of bare.aff) assert.ok(a.t >= 1 && a.t <= 2);
  // Transmute: another skill, the same tier and affixes; off the bench if it no longer fits
  hold(SW, 'cMorph'); const kinds = new Set(), aff = JSON.stringify(g.aff), lvl = g.lvl;
  for (let i = 0; i < 40; i++) { const old = g.sk; assert.ok(G.craft('morph', g.id)); assert.notEqual(g.sk, old); kinds.add(g.sk); }
  assert.ok(kinds.size >= 6); assert.equal(JSON.stringify(g.aff), aff); assert.equal(g.lvl, lvl);
  S.bench = bench(SW, 'sword', 'r'); const red = gem(SW, 'twin', 5); G.socket(red.id, G.BENCH, 0);
  for (let i = 0; i < 30 && S.bench.sockets[0].gem; i++) G.craft('morph', red.id);
  assert.equal(S.bench.sockets[0].gem, null); assert.ok(S.bag.includes(red)); assert.notEqual(G.color(red), 'r');
  // crafting costs less with the workshop's nodes
  const full = G.craftCost('recast', g); hold(SW, 'craft'); assert.equal(G.craftCost('recast', g), Math.ceil(D.FORGE.recast(S.maxLevel) * (1 - D.TREE.filter(n => n.eff === 'craft').reduce((a, n) => a + n.amt, 0) / 100))); assert.ok(G.craftCost('recast', g) < full);
});
test('the second bench sets a weapon aside, skills and all', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  assert.equal(G.hasSpare(), false); assert.equal(G.swapBench(), false);
  hold(SW, 'bench2');
  S.bench = bench(SW, 'axe', 'rb'); const a = S.bench, g = gem(SW, 'nova'); G.socket(g.id, G.BENCH, 0);
  assert.ok(G.swapBench()); assert.notEqual(S.bench, a); assert.equal(S.spare, a); assert.equal(S.spare.sockets[0].gem, g); assert.equal(G.find(g.id), null, 'what is set aside is out of reach');
  assert.equal(S.bench.made, false, 'the other bench is bare until something is made on it'); const b = forge(SW); assert.ok(G.swapBench()); assert.equal(S.bench, a); assert.equal(S.spare, b); assert.equal(G.find(g.id).post, G.BENCH);
  assert.ok(G.equip()); assert.equal(S.spare, b, 'equipping one leaves the other aside'); assert.ok(G.swapBench()); assert.equal(S.bench, b); assert.equal(S.spare, null, 'a bare bench is not set aside'); S.spare = b;
  S.maxLevel = 8; G.prestige(); assert.equal(S.spare, null, 'a reset takes both');
});
test('Auto-advance off repeats the level', () => {
  const SW = rich(), G = SW.game, S = G.S;
  SW.data.HP0 = 0.01; G.setAuto(false);
  for (let t = 0; t < 4000 && S.stats.bosses < 2; t++) { G.update(0.05); G.ev.length = 0; }
  assert.equal(S.stats.bosses, 2); assert.equal(S.level, 1); assert.equal(S.maxLevel, 2);
});
test('a skill drops with one or two secondary affixes, never none; more of them with level; never the same one twice', () => {
  const SW = load(4), G = SW.game, D = SW.data;
  const share = (lvl, boss) => { const c = [0, 0, 0]; for (let i = 0; i < 3000; i++) { const g = G.rollGem(lvl, boss); c[g.aff.length]++; if (g.aff.length === 2) assert.notEqual(g.aff[0].k, g.aff[1].k); } return c.map(x => x / 3000); };
  assert.equal(D.oneChance, undefined); assert.equal(D.ONE, undefined); assert.equal(D.twoChance(4), 0); near(D.twoChance(16), 0.48); assert.equal(D.twoChance(29), 1);
  let c = share(1); assert.equal(c[0], 0, 'never none'); assert.equal(c[1], 1, 'at level 1, one');
  c = share(10); assert.equal(c[0], 0); near(c[2], D.twoChance(10), 0.2);
  c = share(29); assert.equal(c[2], 1, 'and from 29, two');
  assert.ok(share(8, true)[2] > share(8)[2] + 0.1, 'a boss\'s skill is likelier to have two');
  assert.equal(D.AFFIX_MAX, 3); for (let i = 0; i < 500; i++) assert.ok(G.rollGem(80, true).aff.length <= 2, 'a third only ever comes from crafting');
});
test('a colour\'s skills are a node on the tree: until it is held that colour drops as its plain skill, stats and no effect', () => {
  const SW = rich(12), G = SW.game, S = G.S, D = SW.data;
  assert.deepEqual(Object.keys(D.PLAIN), ['r', 'b', 'g']); assert.deepEqual(Object.assign({}, D.UNLOCK), { r: 'uR', b: 'uB', g: 'uG' });
  for (const c of 'rbg') { const p = D.PLAIN[c]; assert.equal(p.c, c); assert.ok(p.plain && D.SKILL[p.id] === p && !D.SKILLS.includes(p)); assert.equal(p.v, 0); assert.equal(D.TREE.filter(n => n.eff === D.UNLOCK[c] && n.big).length, 1); }
  assert.equal(D.ALL_SKILLS.map(k => k.id).join(), 'pr,twin,nova,savage,pb,frost,concuss,shatter,ignite,pg,warcry,rally,ward');
  assert.deepEqual(Array.from(D.NODE.UMT.near), ['UPG', 'PU2']); assert.deepEqual(Array.from(D.NODE.UAD.near), ['F2', 'KT1']); assert.ok(D.NODE.UHX.links.join() === 'UPG,F2' && D.NODE.s1.links.includes('UHX'), 'Hex is on the way to Burn');
  // nothing unlocked: only the three plain ones, by how many skills each colour has (three, four and three in ten)
  const tally = n => { const c = {}; for (let i = 0; i < n; i++) { const g = G.rollGem(12); c[g.sk] = (c[g.sk] || 0) + 1; assert.ok(g.aff.length >= 1); } return c; };
  let c = tally(4000); assert.deepEqual(Object.keys(c).sort(), ['pb', 'pg', 'pr']); near(c.pr / 4000, 0.3, 0.1); near(c.pb / 4000, 0.4, 0.08); near(c.pg / 4000, 0.3, 0.1);
  assert.equal(G.dropping().map(k => k.id).join(), 'pr,pb,pg');
  // a plain skill is its colour and its stats: it fits its colour's socket, and adds nothing but its affixes
  const p = gem(SW, 'pb', 12, [{ k: 'dmg', t: 2 }]), base = G.X.units[0].dmg, power = G.X.units[0].power; S.bench = bench(SW, 'axe', 'rb');
  assert.equal(G.socket(p.id, G.BENCH, 0), false, 'a blue one, not in a red socket'); assert.ok(G.socket(p.id, G.BENCH, 1)); G.unsocket(p.id);
  fit(SW, p, 0); assert.equal(G.affVal(p, p.aff[0]), 35); near(G.X.units[0].dmg, base * 1.35); near(G.X.units[0].power, power * 1.35, 1e-9, 'nothing but the damage:');
  dummy(SW); const e = G.F.es[0]; for (let i = 0; i < 200; i++) G.update(0.05); assert.ok(took(e) > 0); assert.ok(!(e.chill > 0) && !(e.stun > 0) && !e.brit && !(e.burn > 0), 'no affliction comes of it');
  // hold blue: blue drops as the four hexes, the others still plain; what is in the bag stays what it was
  const mine = gem(SW, 'pb', 5, [{ k: 'crit', t: 1 }]); hold(SW, 'uB');
  c = tally(4000); assert.deepEqual(Object.keys(c).sort(), ['concuss', 'frost', 'ignite', 'pg', 'pr', 'shatter']); assert.equal(mine.sk, 'pb');
  assert.equal(G.dropping().map(k => k.id).join(), 'pr,frost,concuss,shatter,ignite,pg');
  // buying, a run's first drops and a starting kit all follow the same rule
  hold(SW, 'uBuy', 'kit'); S.gold = 1e12; S.bag = [];
  for (let i = 0; i < 24; i++) { const g = G.buySkill(); assert.ok(g); assert.ok(D.SKILL[g.sk].plain ? g.sk !== 'pb' : G.color(g) === 'b', 'red and green come plain, blue as its real skills: ' + g.sk); }
  assert.ok(S.bag.some(g => g.sk === 'pr') && S.bag.some(g => G.color(g) === 'b')); assert.equal(G.buySkill.length, 0, 'there is no buying by colour');
  S.maxLevel = 9; G.prestige(); G.beginRun(); assert.ok(S.bag.length >= 1 && S.bag.every(g => D.SKILL[g.sk].plain ? g.sk !== 'pb' : G.color(g) === 'b'), S.bag.map(g => g.sk).join());
  // all three: no plain skill comes any more
  hold(SW, 'uR', 'uG'); c = tally(2000); assert.equal(Object.keys(c).length, 10); assert.ok(!c.pr && !c.pb && !c.pg); assert.equal(G.dropping().length, 10);
});
test('an old save that held Lucky tiers, Fusing, Standing order or Fine work gets its cores back: 20, 40, 18 and 23', () => {
  const SW = rich(), G = SW.game, S = G.S; S.tree.CLK = 1; S.tree.CFU = 1; S.tree.CPK = 1; S.tree.CON = 1; S.bank = 7;
  G.patch(S); assert.equal(S.tree.CLK, undefined); assert.equal(S.tree.CFU, undefined); assert.equal(S.tree.CPK, undefined); assert.equal(S.tree.CON, undefined); assert.equal(S.bank, 108); G.patch(S); assert.equal(S.bank, 108, 'once');
});
test('five tiers: a skill rolls one by the tree\'s odds, an affix rolls from 1 to the skill\'s own, and a tier is a fixed value', () => {
  const SW = load(9), G = SW.game, D = SW.data, S = G.S;
  assert.equal(D.TIER_MAX, 5); assert.equal(D.tier(1), 1); assert.equal(D.tier(6), 1); assert.equal(D.tier(7), 2); assert.equal(D.tier(25), 5); assert.equal(D.tier(31), 5); assert.equal(D.tier(240), 5); assert.equal(D.tierMult, undefined); assert.equal(G.affRange, undefined);
  // what a tier is worth flattens towards the top: the best is twice the worst, and each step is smaller than the last
  assert.deepEqual(Array.from(D.TIER_VAL), [1, 1.4, 1.7, 1.9, 2]); for (let t = 1; t < 4; t++) assert.ok(D.TIER_VAL[t + 1] - D.TIER_VAL[t] < D.TIER_VAL[t] - D.TIER_VAL[t - 1]);
  const count = {};
  for (let i = 0; i < 3000; i++) { const g = G.rollGem(25, true); for (const a of g.aff) { assert.ok(Number.isInteger(a.t) && a.t >= 1 && a.t <= 5, 'tier ' + a.t); assert.equal(a.r, undefined); count[a.t] = (count[a.t] || 0) + 1; { const per = D.AFFIX[a.k].per, v = per * D.TIER_VAL[a.t - 1]; assert.equal(G.affVal(g, a), per < 5 ? Math.round(v * 10) / 10 : Math.round(v)); } } }
  const all = Object.values(count).reduce((x, y) => x + y); for (let t = 1; t <= 5; t++) near(count[t] / all, 1 / 5, 0.2, 'a tier 5 skill rolls any tier as likely as another, tier ' + t + ':');
  for (let i = 0; i < 200; i++) for (const a of G.rollGem(3).aff) assert.equal(a.t, 1, 'a tier 1 skill has only tier 1 affixes');
  for (let i = 0; i < 200; i++) for (const a of G.rollGem(19).aff) assert.ok(a.t <= 4, 'a tier 4 skill rolls 1 to 4');
  assert.equal(G.affVal({ lvl: 25 }, { k: 'dmg', t: 1 }), 25); assert.equal(G.affVal({ lvl: 25 }, { k: 'dmg', t: 5 }), 50); assert.equal(G.affVal({ lvl: 1 }, { k: 'dmg', t: 5 }), 50, 'the skill\'s own tier adds nothing');
  // a skill's tier: luck, and every tier point on the tree tilts it towards the top. Nothing else changes with them
  const o0 = D.tierOdds(0), o19 = D.tierOdds(19); near(o0.reduce((a, b) => a + b, 0), 1, 1e-9); assert.ok(o0[0] > 0.65 && o0[4] < 0.02, 'with none, nearly always tier 1: ' + o0.map(x => x.toFixed(2))); assert.ok(o19[4] > 0.65 && o19[0] < 0.02, 'with all, mostly tier 5: ' + o19.map(x => x.toFixed(2)));
  // the upper tiers are not there at all to begin with: tier 3 from three points, tier 4 from six, tier 5 from ten, each rare when it first appears
  assert.deepEqual(Array.from(D.TIER_FROM), [0, 0, 3, 6, 10]); assert.equal(o0[2], 0); assert.equal(o0[3], 0); assert.equal(o0[4], 0); assert.ok(o0[1] > 0.15);
  for (const [t, from] of [[2, 3], [3, 6], [4, 10]]) { assert.equal(D.tierOdds(from - 1)[t], 0, 'no tier ' + (t + 1) + ' at ' + (from - 1)); const x = D.tierOdds(from)[t]; assert.ok(x > 0 && x < 0.08, 'tier ' + (t + 1) + ' first seen at ' + from + ': ' + x.toFixed(3)); }
  for (let p = 0; p < 19; p++) { const a = D.tierOdds(p), b = D.tierOdds(p + 1); assert.ok(b[4] >= a[4] && (p < 9 || b[4] > a[4]) && b[0] < a[0], 'point ' + (p + 1) + ': more tier 5, less tier 1'); const m = o => o.reduce((s, x, i) => s + x * (i + 1), 0); assert.ok(m(b) > m(a)); }
  const tiers = n => { const c = [0, 0, 0, 0, 0]; for (let i = 0; i < n; i++) c[D.tier(G.dropLevel()) - 1]++; return c.map(x => x / n); };
  let got = tiers(4000); for (let t = 0; t < 5; t++) near(got[t], o0[t], 0.03, 'drops with no tier node, tier ' + (t + 1) + ':', true);
  for (const n of D.TREE) if (n.eff === 'tier') S.tree[n.id] = 1; G.recompute(); assert.equal(G.tierPoints(), 19);
  got = tiers(4000); for (let t = 0; t < 5; t++) near(got[t], o19[t], 0.03, 'drops with every tier node, tier ' + (t + 1) + ':', true);
  assert.equal(D.TREE_EFF.tier.text(1), 'Skills roll higher tiers'); assert.ok(/^T5 skills \d+%, T1 \d+%$/.test(D.TREE_EFF.tier.sum(19)), D.TREE_EFF.tier.sum(19)); assert.equal(D.TREE_EFF.tier.sum(0), 'T2 skills 23%, T1 77%', 'the best there is to roll, and the worst');
  // an old save: its affixes' rolls become tiers, and a skill from above the five is tier 5, its affixes kept in their place between bottom and top
  const old = JSON.parse(JSON.stringify(G.S)); old.bag = [{ id: 1, sk: 'twin', lvl: 31, r: 0.3, aff: [{ k: 'dmg', r: 0.05 }, { k: 'crit', r: 0.99 }] }, { id: 2, sk: 'nova', lvl: 115, aff: [{ k: 'dmg', t: 20 }, { k: 'aspd', t: 9 }, { k: 'crit', t: 1 }] }, { id: 3, sk: 'frost', lvl: 13, aff: [{ k: 'dmg', t: 3 }] }];
  const P = G.patch(old); const by = id => P.bag.find(g => g.id === id);
  assert.equal(by(1).aff.map(a => a.t).join(), '1,5'); assert.equal(by(1).aff[0].r, undefined); assert.equal(by(1).lvl, 25);
  assert.equal(by(2).aff.map(a => a.t).join(), '5,3,1'); assert.equal(by(2).lvl, 25); assert.equal(by(3).aff[0].t, 3); assert.equal(by(3).lvl, 13, 'one inside the five is as it was');
});
test('gold buys a random skill, priced by your deepest level and of a tier the tree\'s odds give, if the bag has room', () => {
  const SW = colours(begun(6)), G = SW.game, S = G.S, D = SW.data;
  S.gold = 1e9; assert.equal(G.buySkill(), false, 'not until the Market is held'); assert.equal(S.gold, 1e9); S.gold = 0; assert.equal(D.NODE.UBY.eff, 'uBuy'); S.tree.UBY = 1;
  assert.equal(G.buySkill(), false, 'not without gold'); assert.equal(S.bag.length, 0);
  S.maxLevel = 20; S.level = 3; S.gold = 1e9;
  assert.equal(G.buyCost(), Math.ceil(D.gold(20) * D.BUY)); const cost = G.buyCost();
  const kinds = new Set(); let two = 0, t1 = 0;
  for (let i = 0; i < 40; i++) { const g = G.buySkill(); assert.ok(g); assert.ok(D.tier(g.lvl) >= 1 && D.tier(g.lvl) <= 5); t1 += D.tier(g.lvl) === 1; assert.equal(g.nw, 1, 'new, like a drop'); kinds.add(g.sk); two += g.aff.length === 2; }
  assert.ok(t1 >= 20, 'with no tier node, mostly tier 1, whatever the level: ' + t1 + ' of 40');
  assert.equal(S.gold, 1e9 - 40 * cost); assert.equal(S.bag.length, 40); assert.ok(D.SKILLS.every(k => G.rowCount(k.id) <= D.ROW)); assert.equal(S.stats.bought, 40); assert.ok(kinds.size > 6); assert.ok(two > 10 && two < 40, 'one or two affixes, by the level');
  while (S.bag.length < D.ROW * D.SKILLS.length) assert.ok(G.buySkill(), 'it only buys what there is room for: ' + S.bag.length);
  for (const k of D.SKILLS) assert.equal(G.rowCount(k.id), D.ROW, k.id);
  const gold = S.gold; assert.equal(G.buySkill(), false, 'a full bag takes no more'); assert.equal(S.gold, gold, 'and nothing is paid');
});
test('the bag holds five of each skill: a sixth salvages one with no affix first, and failing that the newest', () => {
  const SW = load(4), G = SW.game, S = G.S, D = SW.data;
  assert.equal(D.ROW, 5);
  const mk = (n, lvl) => { const g = G.rollGem(lvl || 30, false, 'nova'); g.aff = [{ k: 'dmg', t: 1 }, { k: 'aspd', t: 1 }, { k: 'crit', t: 1 }].slice(0, n); return g; };
  const a = [mk(1), mk(0), mk(2), mk(0), mk(1)]; for (const g of a) assert.ok(G.give(g));
  assert.equal(S.bag.filter(g => g.sk === 'nova').map(g => g.aff.length).join(''), '21100', 'the most affixes first');
  // one with an affix arrives: the newest of those with none goes, and the drop stays
  G.ev.length = 0; let gold = S.gold; const b = mk(1); assert.equal(G.hasRoom('nova'), false); assert.ok(G.give(b)); assert.equal(G.rowCount('nova'), 5);
  assert.ok(S.bag.includes(b)); assert.ok(!S.bag.includes(a[3]), 'the newer of the two plain ones'); assert.ok(S.bag.includes(a[1])); assert.equal(S.gold, gold + G.salvageValue(a[3])); assert.equal(G.ev.find(e => e.t === 'bagfull').kept, true);
  // one with none arrives: it is plain and the newest, so it is the one
  gold = S.gold; const c = mk(0); assert.equal(G.give(c), false); assert.ok(!S.bag.includes(c)); assert.ok(S.bag.includes(a[1])); assert.equal(S.gold, gold + G.salvageValue(c));
  // a locked one is never taken
  G.lock(a[1].id); const d = mk(2); assert.equal(G.give(d), false, 'the only plain one is locked, so the newest goes: the drop'); assert.ok(S.bag.includes(a[1])); G.lock(a[1].id);
  assert.ok(G.give(mk(2))); assert.ok(!S.bag.includes(a[1])); assert.ok(S.bag.every(g => g.aff.length));
  // none plain left: the newest is the drop itself, whatever it is worth
  gold = S.gold; const e = mk(3, 60); assert.equal(G.give(e), false); assert.equal(G.rowCount('nova'), 5); assert.equal(S.gold, gold + G.salvageValue(e)); S.gold = 1;
  assert.ok(G.give(G.rollGem(1, false, 'twin')), 'another skill still has room'); assert.equal(S.bag.length, 6);
  // one coming back off the bench is never turned away
  S.bench = bench(SW, 'axe', 'r'); const off = S.bag.find(g => g.sk === 'nova'); G.socket(off.id, G.BENCH, 0); assert.ok(G.give(G.rollGem(1, false, 'nova'))); assert.ok(G.unsocket(off.id)); assert.equal(G.rowCount('nova'), 6);
});
test('the forge works for gold and does two things: one affix removed at random, or the affixes replaced by as many new ones', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  const g = gem(SW, 'nova', 10, [{ k: 'dmg', r: 0.5 }, { k: 'crit', r: 0.5 }]);
  // remove an affix: one goes, which one is chance, and what is left is untouched; a skill can be taken down to none
  let gold = S.gold; const gone = { dmg: 0, crit: 0 };
  for (let i = 0; i < 60; i++) {
    g.aff = [{ k: 'dmg', t: 2 }, { k: 'crit', t: 1 }]; assert.ok(G.craft('strip', g.id)); assert.equal(g.aff.length, 1); assert.equal(g.sk, 'nova'); assert.equal(g.lvl, 10);
    const kept = g.aff[0]; assert.equal(kept.t, kept.k === 'dmg' ? 2 : 1, 'its tier is as it was'); gone[kept.k === 'dmg' ? 'crit' : 'dmg']++;
  }
  assert.ok(gone.dmg >= 15 && gone.crit >= 15, 'either may go: ' + JSON.stringify(gone)); assert.equal(S.gold, gold - 60 * D.FORGE.strip(S.maxLevel)); near(D.FORGE.strip(10), 3 * D.gold(10), 0.05, 'three kills of gold, at the run\'s deepest level:'); S.maxLevel = 30; assert.equal(G.craftCost('strip', g), D.FORGE.strip(30), 'the same skill costs more to work on deeper in'); S.maxLevel = 1;
  assert.ok(G.craft('strip', g.id)); assert.equal(g.aff.length, 0); const bareGold = S.gold; assert.equal(G.craft('strip', g.id), false, 'nothing left to remove'); assert.equal(S.gold, bareGold); assert.equal(D.CRAFT_BY.strip.why, 'No affix');
  g.aff = [{ k: 'dmg', t: 2 }, { k: 'crit', t: 1 }];
  // reroll all affixes: both secondary affixes are new, the primary is not touched, and nothing is added
  const two = gem(SW, 'frost', 10, [{ k: 'dmg', r: 0.5 }, { k: 'crit', r: 0.5 }]);
  gold = S.gold; let changed = 0;
  for (let i = 0; i < 20; i++) { const was = two.aff.map(a => a.k + a.t).join(); assert.ok(G.forgeRecast(two.id)); assert.equal(two.aff.length, 2); assert.notEqual(two.aff[0].k, two.aff[1].k); if (two.aff.map(a => a.k + a.t).join() !== was) changed++; }
  assert.ok(changed >= 15, 'new affixes nearly every time: ' + changed); assert.equal(two.sk, 'frost'); assert.equal(two.lvl, 10); assert.equal(S.gold, gold - 20 * D.FORGE.recast(S.maxLevel));
  // a skill with one affix still has one, however often it is rerolled, and it is always a different one
  const one = gem(SW, 'ignite', 30, [{ k: 'dmg', r: 0.5 }]);
  for (let i = 0; i < 30; i++) { const was = one.aff[0].k; assert.ok(G.forgeRecast(one.id)); assert.equal(one.aff.length, 1, 'the number of affixes never changes'); void was; }
  // and that is all it does
  for (const gone of ['forgeAdd', 'forgeReroll', 'forgeChoose', 'forgeTemper', 'rerollCost', 'canTemper']) assert.equal(G[gone], undefined, gone);
  assert.deepEqual(Object.keys(D.FORGE).sort().join(), 'recast,salvage,strip'); assert.equal(G.forgeValues, undefined, 'tiers are not rerolled any more'); assert.equal(D.CRAFT_BY.values, undefined); assert.equal(D.CRAFT_BY.lucky, undefined); assert.equal(D.TREE_EFF.cLucky, undefined);
  const sv = G.salvageValue(two); gold = S.gold; assert.ok(G.salvage(two.id)); assert.equal(S.gold, gold + sv, 'salvage pays gold');
  S.gold = 0; assert.equal(G.craft('strip', g.id), false); assert.equal(G.forgeRecast(g.id), false);
});
test('locked skills are not salvaged', () => {
  const SW = rich(), G = SW.game, S = G.S;
  const a = gem(SW, 'nova'), b = gem(SW, 'twin'); G.lock(a.id);
  assert.equal(G.salvage(a.id), false); assert.equal(G.salvageLoose(), 1); assert.equal(S.bag.map(g => g.id).join(), String(a.id)); void b;
});
test('a save survives the round trip, and time away pays half the recent rate', () => {
  const SW = rich(), G = SW.game, S = G.S;
  const g = gem(SW, 'nova'); fit(SW, g);
  const text = G.exportSave(), gold = S.gold;
  S.gold = 5; assert.ok(G.importSave(text)); assert.equal(G.S.gold, gold); assert.equal(G.S.posts[0].unit.sockets[0].gem.sk, 'nova');
  assert.equal(G.importSave('nonsense'), false);
  G.S.gps = 10; G.S.seen = Date.now() - 3600 * 1000;
  const o = G.claimOffline(); near(o.gold, 3600 * 10 * 0.5, 0.01);
  G.S.seen = Date.now() - 100 * 3600 * 1000; near(G.claimOffline().secs, 8 * 3600);
});
test('every weapon, skill and affix is well formed', () => {
  const SW = load(6), D = SW.data;
  for (const s of D.SKILLS) { assert.ok(D.COLORS[s.c], s.id); assert.ok(s.v > 0 && s.lo === undefined && s.hi === undefined, s.id + ': one flat number, no range'); assert.ok(s.bare ? !s.text.includes('{v}') : s.text.includes('{v}'), s.id); }
  for (const a of D.AFFIXES) assert.ok(a.per > 0 && a.lo === undefined && a.w > 0 && a.text.includes('{v}'), a.id);
  for (const id of D.WEAPON_IDS) { const w = D.WEAPONS[id]; near(w.col.r + w.col.b + w.col.g, 100); }
  assert.equal(D.SKILLS.map(s => s.id).join(), 'twin,nova,savage,frost,concuss,shatter,ignite,warcry,rally,ward'); for (const c of ['r', 'b', 'g']) assert.ok(D.SKILLS.filter(s => s.c === c).length >= 2);
  for (const s of D.SKILLS) assert.ok(s.short && s.glyph, s.id);
});
test('a click must touch an enemy, and catches every enemy its circle touches', () => {
  const SW = rich(), G = SW.game; G.X.cursor.crit = 0;
  const [a, b, c] = group(SW, [[-5, 0], [5, 0], [30, 0]]);            // radius 4 each; the cursor's circle is 3
  assert.equal(G.click(0, -30), false, 'empty floor'); assert.equal(G.F.cdC, 0, 'a miss spends no cooldown');
  assert.ok(G.click(-5, 0)); near(took(a), G.X.cursor.dmg); assert.equal(took(b), 0);
  G.F.cdC = 0; assert.ok(G.click(0, 0), 'between the two'); near(took(a), 2 * G.X.cursor.dmg); near(took(b), G.X.cursor.dmg); assert.equal(took(c), 0);
  assert.equal(G.X.cursor.radius, SW.data.AOE.cursor, 'the circle is always the same size');
});
test('hammers splash, staffs arc, bows pierce; swords hit one', () => {
  const SW = rich(), G = SW.game, S = G.S;
  const arm = type => { G.sell(0); S.bench = bench(SW, type, 'rb'); assert.ok(G.equip(0)); G.X.units[0].crit = 0; return G.X.units[0]; };
  const blow = () => { G.F.cd[0] = 1; G.update(0.0001); };
  // post 0 stands at the top of the ring, (0, -44): three enemies in a column below it, one off to the side
  let W = arm('sword'), es = group(SW, [[0, -10], [0, 0], [0, 10], [25, 0]]); blow();
  assert.equal(es.filter(e => took(e) > 0).length, 1);
  W = arm('hammer'); es = group(SW, [[0, -10], [0, 0], [0, 10], [25, 0]]); blow();
  near(took(es[1]), W.dmg, 1e-6, 'the hammer picks the middle, which takes two with it:'); near(took(es[0]), W.dmg * 0.4); near(took(es[2]), W.dmg * 0.4); assert.equal(took(es[3]), 0);
  W = arm('staff'); es = group(SW, [[0, 0], [8, 0], [30, 0]], { hp: 1e9 }); es[0].hp -= 1; blow();
  near(took(es[0]), W.dmg + 1); near(took(es[1]), W.dmg * 0.5, 1e-6, 'the arc goes to the nearest:'); assert.equal(took(es[2]), 0);
  W = arm('bow'); es = group(SW, [[0, -10], [0, 0], [0, 10], [25, 0]]); blow();
  const d = es.map(took).sort((x, y) => y - x); near(d[0], W.dmg); near(d[1], W.dmg * 0.5); near(d[2], W.dmg * 0.5); assert.equal(took(es[3]), 0);
});
test('reaching more than one enemy is the weapon\'s own; Shockwave is the one skill that does', () => {
  const SW = rich(), G = SW.game, D = SW.data;
  for (const gone of ['cleave', 'arc', 'expose', 'bulwark', 'mend']) { assert.equal(D.SKILL[gone], undefined, gone); assert.ok(D.SKILL[D.SKILL_WAS[gone]], gone + ' converts'); }
  const t = gem(SW, 'twin'); fit(SW, t); const W = G.X.units[0]; assert.equal(W.splash, 0); assert.equal(W.arcN, 0); assert.equal(W.pierce, 0);
  // Shockwave: every six seconds, everything
  const SW3 = rich(), G3 = SW3.game; const n = gem(SW3, 'nova'); fit(SW3, n); const W3 = G3.X.units[0]; W3.crit = 0; W3.aps = 0;
  const all = group(SW3, [[-20, 0], [0, 0], [20, 0], [0, 20]]);
  for (let i = 0; i < 119; i++) G3.update(0.05); assert.ok(all.every(e => took(e) === 0)); G3.update(0.1);
  for (const e of all) near(took(e), W3.dmg * G3.primVal(n) / 100);
});
test('fights come as one monster, a pack or a swarm, and the boss by the level number', () => {
  const SW = load(11), G = SW.game, S = G.S, D = SW.data, seen = {};
  S.run.kills = 1;
  for (let i = 0; i < 300; i++) {
    S.level = 1 + (i % 7); S.maxLevel = 9; S.fight = i % 9; G.spawn();
    const F = G.F, n = F.es.length; seen[F.enc.type] = (seen[F.enc.type] || 0) + 1;
    assert.ok(F.enc.type === 'single' ? n === 1 : F.enc.type === 'pack' ? n >= 3 && n <= 5 : n >= 6 && n <= 8, F.enc.type + ' of ' + n);
    for (const e of F.es) assert.ok(Math.hypot(e.x, e.y) + e.r <= D.ROAM.field - D.ROAM.leash, 'enemies start on the field');
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) assert.ok(Math.hypot(F.es[a].x - F.es[b].x, F.es[a].y - F.es[b].y) >= (F.enc.type === 'pack' ? D.SPREAD.pack : D.SPREAD.swarm) - 1.5, 'well apart: a ' + F.enc.type);
  }
  assert.ok(seen.single > 60 && seen.pack > 60 && seen.swarm > 20, JSON.stringify(seen));
  const boss = lvl => { S.level = lvl; S.fight = 9; G.spawn(); return G.F; };
  assert.equal(boss(2).enc.type, 'elder'); assert.equal(G.F.es.length, 1);
  assert.equal(boss(3).enc.type, 'elder'); assert.equal(boss(1).enc.type, 'trio'); assert.equal(G.F.es.length, 3); assert.ok(G.F.es.every(e => e.boss));
  assert.equal(boss(4).enc.type, 'warband'); assert.equal(G.F.es.length, 7); assert.equal(G.F.es.filter(e => e.boss).length, 1);
  assert.equal(boss(5).enc.type, 'actboss'); assert.equal(G.F.es.length, 5); assert.ok(G.F.es[0].slam && !G.F.es[1].slam);
});
test('enemies roam the arena as a group, and each stops where it is to attack', () => {
  const SW = rich(11), G = SW.game, S = G.S, D = SW.data, R = D.ROAM;
  for (const fight of [1, 4, 9]) {                // whatever the dice give, and a boss with its guards
    S.level = 5; S.fight = fight; S.run.kills = 5; G.spawn();
    const es = G.F.es; for (const e of es) { e.hp = e.max = 1e12; e.dmg = 0; }
    const at0 = es.map(e => [e.x, e.y]); assert.ok(G.F.roam && G.F.roam.x === 0, 'it starts in the middle');
    let moved = 0, far = 0, stray = 0, swings = 0; const still = { windup: 0, rest: 0, stun: 0 };
    es[0].stun = 3;
    for (let i = 0; i < 1200; i++) {              // a minute
      const was = es.map(e => ({ x: e.x, y: e.y, wind: e.atkT < Math.min(R.windup, e.int * 0.3), rest: e.rest > 0, stun: e.stun > 0 }));
      G.ev.length = 0; G.update(0.05); swings += G.ev.filter(ev => ev.t === 'hurt').length;
      es.forEach((e, j) => {
        const d = Math.hypot(e.x - was[j].x, e.y - was[j].y); moved += d;
        for (const k of ['wind', 'rest', 'stun']) if (was[j][k]) { assert.ok(d < 1e-9, 'it stands still: ' + k); still[k === 'wind' ? 'windup' : k]++; }
        assert.ok(d <= R.speed * 0.05 + 1e-9, 'no faster than its feet');
        far = Math.max(far, Math.hypot(e.x, e.y) + e.r);
        stray = Math.max(stray, Math.hypot(e.x - G.F.roam.x - e.ox, e.y - G.F.roam.y - e.oy));
        assert.equal(e.mv, d > 1e-9 ? e.mv : 0);
      });
    }
    assert.ok(moved / es.length > 60, 'they get about: ' + Math.round(moved / es.length) + ' a head in a minute');
    assert.ok(far <= R.field + 1e-6, 'and stay on the field, inside the ring of weapons: ' + far.toFixed(1)); assert.ok(R.field < D.RING);
    assert.ok(stray <= R.leash + R.group * (R.windup + R.rest + 3) + 1, 'a group stays a group: ' + stray.toFixed(1));
    assert.ok(swings > 5 && still.windup > 10 && still.rest > 5 && still.stun > 10, JSON.stringify(still));
    assert.ok(es.some((e, j) => Math.hypot(e.x - at0[j][0], e.y - at0[j][1]) > 3));
  }
  // Chill slows their feet as it slows their swings
  S.fight = 1; G.spawn(); const run = chill => { G.spawn(); const e = G.F.es[0]; e.hp = e.max = 1e12; e.dmg = 0; e.atkT = 1e9; e.chill = chill; e.wt = 1e9; e.wx = e.wy = 0; Object.assign(G.F.roam, { x: 25, y: 0, tx: 25, ty: 0, wait: 1e9 }); const x = e.x, y = e.y; for (let i = 0; i < 10; i++) G.update(0.05); return Math.hypot(e.x - x, e.y - y); };
  const plain = run(0), cold = run(99); near(plain, D.ROAM.speed * 0.5, 1e-6, 'half a second at full stride:'); near(cold, plain * (1 - D.CHILL / 100), 1e-6, 'and Chilled:');
});
test('a fight ends when the last of them dies; each death thins the attacks', () => {
  const SW = rich(), G = SW.game, S = G.S;
  G.X.units[0].aps = 0;
  const es = group(SW, [[-10, 0], [10, 0]], { hp: SW.data.CURSOR.dmg, max: SW.data.CURSOR.dmg, gold: 5, int: 1, atkT: 1, dmg: 10 });      // (a click kills one exactly: nothing is left over to carry)
  const fight = S.fight; G.F.life = 100; G.X.cursor.crit = 0;
  G.update(1.01); near(G.F.life, 80, 1e-6, 'two swing:');
  G.click(-10, 0); assert.ok(es[0].dead && !es[1].dead); assert.equal(S.fight, fight, 'one left');
  near(G.F.life, 80, 1e-6, 'a kill gives no Life back:'); G.update(1); near(G.F.life, 70, 1e-6, 'one swings:');
  G.F.cdC = 0; G.click(10, 0); assert.equal(S.fight, fight + 1);
});
test('every primary affix is an effect; an old save\'s plain-stat skills and cut affixes are converted', () => {
  const SW = rich(), G = SW.game, D = SW.data;
  for (const s of D.SKILLS) assert.ok(!/^\+\{v\}%? (damage|attack speed|critical|gold|skill drops|Life)/.test(s.text), s.name + ': ' + s.text);
  assert.ok(D.AFFIX.gold && D.AFFIX.dmg && D.AFFIX.aspd && D.AFFIX.time, 'the plain stats live on as secondary affixes'); assert.equal(D.AFFIX.find, undefined, 'skill drops is not an affix any more');
  { const o = JSON.parse(JSON.stringify(G.S)); o.bag = [{ id: 99001, sk: 'twin', lvl: 7, aff: [{ k: 'find', t: 2 }, { k: 'dmg', t: 1 }] }]; const g = G.patch(o).bag[0]; assert.ok(g.aff.every(a => D.AFFIX[a.k]) && g.aff[0].k !== g.aff[1].k && g.aff[0].t === 2, 'an old save\'s becomes another: ' + JSON.stringify(g.aff)); }
  const mk = (id, sk, aff) => ({ id, sk, lvl: 5, r: 0.5, aff: aff || [], rr: 0 });
  const S = JSON.parse(JSON.stringify(G.S));
  S.bag.push(mk(9001, 'prospect'), mk(9003, 'brutal', [{ k: 'apply', r: 0.5 }]), mk(9004, 'enfeeble', [{ k: 'dmg', r: 0.2 }, { k: 'chill', r: 0.5 }]), mk(9005, 'glass', [{ k: 'barrier', r: 0.5 }, { k: 'area', r: 0.5 }]), mk(9006, 'ruin', [{ k: 'burn', r: 0.5 }, { k: 'dur', r: 0.5 }])); S.cursor = { sockets: [mk(9002, 'scavenge')] };
  S.bench = { id: 9100, type: 'staff', q: 1, sockets: [{ c: 'b', gem: mk(9007, 'arc') }, { c: 'b', gem: mk(9008, 'expose', [{ k: 'vuln', r: 0.5 }]) }] };       // Arc becomes Shockwave, which is red; Expose becomes Frostbite, still blue
  G.patch(S);
  const by = id => S.bag.find(g => g.id === id);
  assert.equal(by(9001).sk, 'warcry'); assert.equal(by(9003).sk, 'twin'); assert.equal(by(9003).aff[0].k, 'dmg', 'a cut affix becomes one that exists'); assert.equal(by(9004).sk, 'frost'); assert.equal(by(9005).sk, 'warcry'); assert.equal(by(9006).sk, 'twin');
  assert.equal(S.cursor, undefined); assert.equal(by(9002).sk, 'rally', 'what was in the cursor is in the bag, converted');
  assert.equal(S.bench.sockets[0].gem, null, 'a red skill cannot stay in a blue socket'); assert.equal(by(9007).sk, 'nova'); assert.equal(S.bench.sockets[1].gem.id, 9008); assert.equal(S.bench.sockets[1].gem.sk, 'frost'); assert.equal(S.bench.sockets[1].gem.aff[0].k, 'dmg', 'Vulnerable damage is cut too');
  for (const k in D.SKILL_WAS) assert.ok(D.SKILL[D.SKILL_WAS[k]] && !D.SKILL[k], k);
  for (const g of S.bag) { for (const af of g.aff) assert.ok(D.AFFIX[af.k], 'an affix that exists: ' + af.k); assert.equal(new Set(g.aff.map(af => af.k)).size, g.aff.length, 'and never the same one twice'); }
  assert.equal(by(9004).aff.map(af => af.k).join(), 'dmg,aspd'); assert.equal(D.AFFIXES.map(a => a.id).join(), 'dmg,aspd,crit,boss,gold,time,click,leech'); assert.equal(D.AFFIX.critDmg, undefined, 'critical damage is cut: a critical is always double'); for (const cut of ['burn', 'dur', 'area', 'chill', 'barrier', 'apply', 'vuln']) assert.ok(!D.AFFIX[cut], cut);
  for (const cut of ['cull', 'reach']) assert.ok(!D.SKILL[cut] && D.SKILL_WAS[cut], cut + ' is gone, and converts');
});
test('the wall: the cursor barely clears level 2 alone, and dies partway through level 3', () => {
  const D0 = load(1).data;
  assert.equal(D0.WALL.from, 3); assert.ok(D0.WALL.mult >= 4); assert.ok(D0.WALL.arm >= D0.WALL.mult); near(D0.WEAPONS.sword.dmg, 8.7 * D0.WALL.arm, 1e-9, 'a weapon is worth that much more:'); assert.equal(D0.CURSOR.dmg, 6);
  near(D0.hp(3, 0) / D0.hp(2, 0), D0.WALL.mult * Math.pow(D0.depth(3) / D0.depth(2), D0.HP_P), 1e-9, 'and so has everything from level 3:'); near(D0.hp(2, 0) / D0.hp(1, 0), Math.pow(D0.depth(2), D0.HP_P));
  assert.equal(D0.ENC.cycle[1], 'trio'); assert.equal(D0.ENC.cycle[2], 'elder'); assert.equal(D0.ENC.cycle[3], 'elder');
  // the cursor on its best spot, never resting: Life left as each of the first two levels falls, and where level 3 ends it
  const left1 = [], left2 = [], died = []; let first = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const SW = load(seed), G = SW.game, S = G.S; let l1 = null, l2 = null, d3 = null, last = 100;
    for (let i = 0; i < 24000 && d3 == null; i++) {
      const p = require('./harness.cjs').bestAim(SW); if (p) G.aim(p.x, p.y); G.setHold(true);
      const lvl = S.level, fight = S.fight; if (G.F.life > 0) last = G.F.life;
      G.update(0.05);
      for (const ev of G.ev) { if (ev.t === 'cleared' && S.stats.fails === 0) { if (ev.level === 1) l1 = last; if (ev.level === 2) l2 = last; } if (ev.t === 'fail' && lvl === 3) d3 = fight + 1; }
      G.ev.length = 0;
    }
    assert.ok(S.maxLevel === 3, 'seed ' + seed + ': level 2 falls in the end, and level 3 never: ' + S.maxLevel); assert.equal(G.runCores(), 2, 'a core for each of the two');
    if (l1 != null) left1.push(l1); if (l2 != null) { left2.push(l2); first++; } died.push(d3);
  }
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  assert.equal(left1.length, 16, 'level 1 falls at the first try'); assert.ok(med(left1) > 80, 'with Life to spare: ' + med(left1));
  assert.ok(first >= 15, 'level 2 at the first try: ' + first + ' of 16'); assert.ok(med(left2) > 35 && med(left2) < 72, 'with less to spare: ' + Math.round(med(left2)) + ' Life left');
  assert.ok(died.every(f => f != null), 'level 3 always ends it'); assert.ok(med(died) >= 1 && med(died) <= 5 && Math.max(...died) <= 8, 'early on, long before its boss: fight ' + died.join());
  // one weapon with nothing in it, and the cursor: level 3 falls
  for (const seed of [1, 2, 3, 4]) {
    const SW = load(seed), G = SW.game, S = G.S; S.tree.F1 = 1; S.best = 2; S.alloc = true; G.beginRun(); assert.equal(forge(SW).sockets.length, 0); assert.ok(G.equip());
    play(SW, 600, { noPrestige: 1, active: 1, until: 3 });
    assert.ok(S.maxLevel >= 4, 'seed ' + seed + ': a bare ' + S.posts[0].unit.type + ' and the cursor clear level 3');
  }
});
test('D.PACE stretches a fight: more life, slower and lighter swings, more gold and drops', () => {
  const SW = load(12), D = SW.data, P = D.PACE;
  near(D.hp(1, 0), D.HP0 * P); near(D.gold(1), 2 * D.PAY); assert.ok(D.PAY <= P);
  near(D.hit(1) / D.ACTS[0].mobs[0].int, D.HIT0 * D.EARLY[0] / (1.2 * P), 1e-6, 'swings take Life that much slower:');
  near(D.DROP, 0.025 * D.PAY);
  assert.ok(P >= 1);
});
test('power is the estimate; actual dps is what a weapon really dealt, burns and splashes included', () => {
  const SW = rich(), G = SW.game, S = G.S;
  const W = G.X.units[0]; W.crit = 0;
  near(W.power, SW.data.WEAPONS.sword.dmg * 0.6 * (1 + 0.05 * 1), 1e-6, 'a level 1 sword:'); near(G.X.power, W.power);
  assert.equal(G.actual(0), 0);
  dummy(SW); for (let i = 0; i < 1200; i++) G.update(0.05);                    // a minute against something that will not die
  near(G.actual(0), W.dmg * W.aps, 0.06, 'measured:'); assert.equal(G.actual(-1), 0, 'the cursor did nothing'); near(G.actualTotal(), G.actual(0));
  // a hammer with Ignite against three: the splash and the burn are its doing, and power does not see the splash
  G.sell(0); assert.equal(G.actual(0), 0, 'a scrapped weapon leaves no reading');
  S.bench = bench(SW, 'hammer', 'b'); const ig = gem(SW, 'ignite'); G.socket(ig.id, G.BENCH, 0);
  const est = G.X.bench.power; assert.ok(est > 0, 'the bench is estimated too'); G.equip(0);
  const H = G.X.units[0]; H.crit = 0; near(H.power, est, 1e-6, 'made, it is what the bench said:');
  group(SW, [[0, 0], [8, 0], [-8, 0]]); for (let i = 0; i < 1200; i++) G.update(0.05);
  const one = H.dmg * H.aps * (1 + H.ignite / 100); near(H.power, one * 1.05, 1e-6, 'power counts its 5% criticals, which this test has switched off:');
  near(G.actual(0), one * (1 + 2 * 0.4), 0.08, 'one target, two splashed, all three burning:');
  // nothing is counted that the enemy did not have left
  group(SW, [[0, 0]], { hp: 1, max: 1 }); const before = G.F.meter[0].b.reduce((a, b) => a + b, 0); G.F.cd[0] = 1; G.update(0.0001);
  near(G.F.meter[0].b.reduce((a, b) => a + b, 0) - before, 1, 1e-6, 'overkill:');
});
test('a run\'s first fights always drop a skill, and ones that fill the first weapon', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const SW = begun(seed), G = SW.game, S = G.S, D = SW.data;
    const want = S.bench.sockets.map(s => s.c).sort().join('');
    for (let f = 1; f <= D.STARTER; f++) {
      for (let i = 0; i < 4000 && S.stats.kills < 9999 && S.fight < f && S.level === 1; i++) { const e = G.alive()[0]; if (e) G.click(e.x, e.y); G.update(0.05); }
      assert.equal(S.stats.drops, f, 'seed ' + seed + ': after fight ' + f);
    }
    assert.equal(S.bag.slice().map(g => G.color(g)).sort().join('').indexOf(want[0]) >= 0, true);
    for (const g of S.bag.slice()) G.autoSocket(g.id);
    assert.ok(S.bench.sockets.every(s => s.gem), 'seed ' + seed + ': the first weapon can be filled (' + want + ')'); assert.equal(S.bag.length, D.STARTER - S.bench.sockets.length, 'and one is left over for the next');
    assert.ok(S.gold >= 0);
  }
  // after that, drops are down to chance again
  const SW = begun(9), G = SW.game, S = G.S; S.stats.drops = 3; let won = 0;
  for (let i = 0; i < 60000 && won < 40; i++) { const f = S.fight, l = S.level; const e = G.alive()[0]; if (e) { e.hp = 0.001; G.F.cdC = 0; G.click(e.x, e.y); } G.update(0.05); if (S.fight !== f || S.level !== l) won++; if (S.fight === 9) { S.fight = 0; G.F.es = []; G.F.wait = 0.01; } }
  assert.ok(S.stats.drops - 3 < won * 0.6, (S.stats.drops - 3) + ' drops in ' + won + ' ordinary fights');
});
test('a weapon takes one of each skill, and any number of the plain ones', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  S.bench = bench(SW, 'axe', 'rrrb'); S.bag = [];
  const a = gem(SW, 'twin'), b = gem(SW, 'twin'), c = gem(SW, 'nova'), p1 = gem(SW, 'pr'), p2 = gem(SW, 'pr');
  assert.ok(G.socket(a.id, G.BENCH, 0));
  assert.equal(G.socket(b.id, G.BENCH, 1), false, 'a second Twin Strike'); assert.equal(G.autoSocket(b.id), false); assert.ok(S.bag.includes(b));
  assert.ok(G.socket(b.id, G.BENCH, 0), 'but it can take the place of the first'); assert.ok(S.bag.includes(a)); assert.equal(S.bench.sockets[0].gem, b);
  assert.ok(G.socket(b.id, G.BENCH, 2), 'and move to another socket'); assert.equal(S.bench.sockets[0].gem, null);
  assert.ok(G.socket(c.id, G.BENCH, 0), 'another skill of the colour is fine');
  assert.ok(G.socket(p1.id, G.BENCH, 1)); assert.ok(G.unsocket(c.id)); assert.ok(G.socket(p2.id, G.BENCH, 0), 'two plain Might');
  // an old save with two of one skill in a weapon: the second goes back to the bag, on the bench and in the line
  const tw = () => gem(SW, 'ignite'); const x = tw(), y = tw(), z = tw(), w = tw(); S.bag = [];
  S.bench = bench(SW, 'sword', 'bb'); S.bench.sockets[0].gem = x; S.bench.sockets[1].gem = y;
  S.posts[0].unit.sockets = [{ c: 'b', gem: z }, { c: 'b', gem: w }];
  G.patch(S);
  assert.equal(S.bench.sockets[1].gem, null); assert.equal(S.posts[0].unit.sockets.length, 1); assert.deepEqual(S.bag.map(g => g.id).sort(), [y.id, w.id].sort());
  // the skills a run starts with, and the ones the first fights owe an empty weapon, can all go in it
  for (let seed = 1; seed <= 30; seed++) {
    const T = colours(begun(seed)), g = T.game, s = g.S; s.bench = bench(T, 'sword', 'rrrbbbggg'.slice(seed % 4, seed % 4 + 5)); s.bag = [];
    for (let i = 0; i < 5; i++) { const k = g.starterSkill(); const made = g.rollGem(1, false, k, 1); s.bag.push(made); }
    for (const q of s.bag.slice()) g.autoSocket(q.id);
    assert.ok(s.bench.sockets.every(k => k.gem), 'seed ' + seed + ': ' + s.bench.sockets.map(k => k.c + ':' + (k.gem ? k.gem.sk : '-')).join(' '));
  }
});
test('a fight pays double its gold the first time it is won in a run, and half whenever it is won again', () => {
  const SW = begun(21), G = SW.game, S = G.S, D = SW.data; D.HP0 = 0.0001; S.maxLevel = 9;
  assert.deepEqual(Object.assign({}, D.FIRST_GOLD), { first: 2, again: 0.5 }); assert.equal(D.FIRST_GOLD.first / D.FIRST_GOLD.again, 4); assert.equal(D.BOSS_GOLD, undefined);
  const fight = (lvl, f) => { S.level = lvl; S.fight = f; G.spawn(); const due = G.alive().reduce((s, e) => s + e.gold, 0) * G.X.goldMult, boss = G.F.enc.boss, g0 = S.gold; for (let i = 0; i < 600 && G.alive().length; i++) { const e = G.alive()[0]; G.F.cdC = 0; G.click(e.x, e.y); G.update(0.02); } G.ev.length = 0; S.bag.length = 0; return { ratio: (S.gold - g0) / due, boss }; };
  delete S.run.far;
  let r = fight(4, 3); assert.equal(r.boss, false); near(r.ratio, 2, 1e-9, 'a fight on the way, the first time:'); assert.equal(S.run.far, 33, 'the furthest fight won: level 4, fight 3');
  near(fight(4, 3).ratio, 0.5, 1e-9, 'the same fight again:'); near(fight(4, 2).ratio, 0.5, 1e-9, 'and any before it:'); near(fight(2, 9).ratio, 0.5, 1e-9, 'an earlier level\'s boss:');
  near(fight(4, 4).ratio, 2, 1e-9, 'the next one on:');
  for (const lvl of [4, 5]) {      // an ordinary boss, and an act's boss with its guards
    r = fight(lvl, 9); assert.equal(r.boss, true); near(r.ratio, 2, 1e-9, 'the boss of level ' + lvl + ', the first time:'); near(fight(lvl, 9).ratio, 0.5, 1e-9, 'and again:');
  }
  // losing does not make it new: a level that keeps beating you pays in full only for the fights you had not won before
  near(fight(6, 0).ratio, 2, 1e-9); near(fight(6, 1).ratio, 2, 1e-9); near(fight(6, 0).ratio, 0.5, 1e-9, 'back at the start of the level after a loss:'); near(fight(6, 2).ratio, 2, 1e-9);
  // a new run, and it is all new again
  S.run = { drops: 99, kills: 0, time: 0, earn: 0, paid: 0 }; near(fight(1, 0).ratio, 2, 1e-9, 'a new run:');
  // an old save: every fight up to where it stands has been won
  const old = JSON.parse(JSON.stringify(S)); old.run = { drops: 5, kills: 9, time: 1, earn: 0, paid: 6 }; old.maxLevel = 7; old.level = 7; old.fight = 4; assert.equal(G.patch(old).run.far, 63);
});
test('Deathblow adds to what a critical deals, and the Defense Aura takes a fifth off every enemy blow', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data; colours(SW);
  assert.equal(D.SKILL.savage.c, 'r'); assert.equal(D.SKILL.savage.v, 100); assert.equal(D.SKILL.ward.c, 'g'); assert.equal(D.SKILL.ward.aura, 1); assert.equal(D.SKILL.ward.v, 20); assert.ok(!D.SKILL_WAS.savage && !D.SKILL_WAS.ward, 'neither name is an old skill\'s');
  // Deathblow: a critical is double; with it, triple. Power counts it. A second copy cannot go in the same weapon
  S.bench = bench(SW, 'sword', 'rrg'); G.recompute(); assert.equal(G.X.bench.critMult, 2); const p0 = G.X.bench.power;
  const a = gem(SW, 'savage'), b = gem(SW, 'savage'); assert.ok(G.socket(a.id, G.BENCH, 0)); assert.equal(G.X.bench.critMult, 3); assert.equal(G.socket(b.id, G.BENCH, 1), false);
  const c = G.X.bench.crit / 100; near(G.X.bench.power / p0, (1 + c * 2) / (1 + c), 1e-9, 'power, by its criticals:');
  let crits = 0; const es = [{ id: 1, x: 0, y: 0, r: 5, hp: 1e9, max: 1e9, gold: 0 }]; void es; void crits;
  // the Defense Aura: every enemy blow takes a fifth less Life, for the whole line; a second one adds nothing
  S.bench = bench(SW, 'axe', 'g'); const w = gem(SW, 'ward'); assert.ok(G.socket(w.id, G.BENCH, 0)); assert.equal(G.X.ward, 0, 'not from the bench');
  while (S.posts.length < 3) S.posts.push({ unit: null }); assert.ok(G.equip()); assert.equal(G.X.ward, 20);
  S.bench = bench(SW, 'axe', 'g'); const w2 = gem(SW, 'ward'); assert.ok(G.socket(w2.id, G.BENCH, 0)); assert.ok(G.equip()); assert.equal(G.X.ward, 20, 'auras do not stack');
  S.level = 3; S.fight = 2; G.spawn(); const e = G.alive()[0]; for (const o of G.alive()) { o.atkT = 99; o.hp = o.max = 1e12; } e.dmg = 10; e.slam = false; e.atkT = 0.001; const life = G.F.life; G.update(0.01);
  near(life - G.F.life, 8, 1e-9, 'a blow of 10 takes 8:'); assert.equal(G.ev.find(x => x.t === 'hurt').d, 8);
});
test('two affixes most weapons can do without: Cursor damage is for the cursor alone, Life on kill gives Life back for each kill, up to a cap', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  assert.equal(D.AFFIX.click.per, 40); assert.equal(D.AFFIX.leech.per, 1); assert.equal(D.AFFIX.click.who, 'all'); assert.equal(D.AFFIX.leech.who, 'all'); assert.equal(D.LEECH_CAP, 5);
  const share = ['dmg', 'aspd', 'crit'].reduce((s, k) => s + D.AFFIX[k].w, 0) / D.AFFIXES.reduce((s, a) => s + a.w, 0); near(share, 25 / 52, 1e-9, 'damage, speed and criticals are under half of what rolls:');
  assert.deepEqual([1, 2, 3, 4, 5].map(t => G.affVal({ lvl: 25 }, { k: 'leech', t })), [1, 1.4, 1.7, 1.9, 2]); assert.deepEqual([1, 5].map(t => G.affVal({ lvl: 25 }, { k: 'click', t })), [40, 80]);
  // Cursor damage: from any weapon on the line, for the cursor and nothing else
  const c0 = G.X.cursor.dmg, u0 = G.X.units[0].dmg, p0 = G.X.units[0].power; near(c0, D.CURSOR.dmg);
  S.bench = bench(SW, 'axe', 'r'); const a = gem(SW, 'pr', 25, [{ k: 'click', t: 5 }, { k: 'leech', t: 5 }]); assert.ok(G.socket(a.id, G.BENCH, 0)); near(G.X.cursor.dmg, c0, 1e-9, 'not from the bench:'); assert.equal(G.X.leech, 0);
  assert.ok(G.equip()); near(G.X.cursor.dmg, c0 * 1.8, 1e-9, 'the cursor, by 80%:'); near(G.X.units[0].dmg, u0, 1e-9, 'the sword is as it was:'); near(G.X.units[0].power, p0); near(G.X.units[1].dmg, D.WEAPONS.axe.dmg, 1e-9, 'and so is the axe that carries it:');
  // Life on kill: each kill gives it back, never past the top of the bar; and all of it together is capped
  assert.equal(G.X.leech, 2); S.level = 2; S.fight = 1; G.spawn(); G.F.life = 50; const e = G.alive()[0], n = G.alive().length; for (const o of G.alive()) o.atkT = 99; e.hp = 0.001; G.F.cdC = 0; G.click(e.x, e.y); G.update(0.001);
  assert.ok(e.dead); const fell = n - G.alive().length; assert.ok(fell >= 1); near(G.F.life, 50 + 2 * fell, 1e-9, 'two Life for each kill (' + fell + '):');
  G.spawn(); G.F.life = G.X.lifeMax - 0.5; const e2 = G.alive()[0]; for (const o of G.alive()) o.atkT = 99; e2.hp = 0.001; G.F.cdC = 0; G.click(e2.x, e2.y); G.update(0.001); near(G.F.life, G.X.lifeMax, 1e-9, 'not past full:');
  while (S.posts.length < 6) S.posts.push({ unit: null });
  for (let i = 0; i < 3; i++) { S.bench = bench(SW, 'axe', 'rb'); const x = gem(SW, 'pr', 25, [{ k: 'leech', t: 5 }]), y = gem(SW, 'pb', 25, [{ k: 'leech', t: 5 }]); G.socket(x.id, G.BENCH, 0); G.socket(y.id, G.BENCH, 1); assert.ok(G.equip()); }
  assert.equal(G.X.glob.leech, 14); assert.equal(G.X.leech, 5, 'capped');
});

test('a run\'s first weapon always has a socket for a skill already in the bag, and keeps one when its sockets are rerolled', () => {
  let forced = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const SW = begun(seed), G = SW.game, S = G.S, D = SW.data, col = 'rbg'[seed % 3];
    S.tree.URR = 1; S.crafter = 1 + seed % 2; G.recompute(); S.bench = G.blankBench(); S.bag.length = 0; gem(SW, 'p' + col, 1, []); S.run.made = 0; S.gold = 1e12;
    assert.ok(G.make(), 'seed ' + seed); G.update(D.FORGE_SECS + 0.1);
    assert.ok(S.bench.made && S.bench.sockets.length >= 1); assert.equal(S.run.made, 1);
    assert.ok(S.bench.sockets.some(k => k.c === col), 'seed ' + seed + ': ' + S.bench.sockets.map(k => k.c).join('') + ' has no ' + col);
    assert.ok(G.benchReroll('socks'), 'seed ' + seed + ': reroll'); G.update(D.FORGE_SECS + 0.1);
    assert.ok(S.bench.sockets.some(k => k.c === col), 'seed ' + seed + ': rerolled to ' + S.bench.sockets.map(k => k.c).join(''));
    // the second weapon of the run is as it rolls
    assert.ok(G.equip()); S.posts.push({ unit: null }); assert.ok(G.make()); G.update(D.FORGE_SECS + 0.1); assert.equal(S.run.made, 2);
    if (!S.bench.sockets.some(k => k.c === col)) forced++;
  }
  assert.ok(forced > 5, 'later weapons are not held to it (' + forced + ')');
  // an empty bag asks nothing of it
  const SW = begun(3), G = SW.game, S = G.S; S.bench = G.blankBench(); S.bag.length = 0; S.run.made = 0; S.gold = 1e12; assert.ok(G.make()); G.update(SW.data.FORGE_SECS + 0.1); assert.ok(S.bench.made);
});
test('a fight\'s first blow is not instant: between fights a weapon winds up only so far, so it is seen crossing to its enemy', () => {
  const SW = rich(), G = SW.game, S = G.S, D = SW.data;
  for (const type of ['dagger', 'hammer']) {
    S.bench = bench(SW, type, ''); S.posts[0].unit = null; assert.ok(G.equip(0)); const a = G.X.units[0].aps, keep = Math.min(D.REACH.share, D.REACH.secs * a);
    G.F.cd[0] = 0.97; G.F.wait = 5; G.update(4.9); near(G.F.cd[0], 1 - keep, 1e-9, type + ' waits with');
    assert.ok((1 - G.F.cd[0]) / a >= Math.min(D.REACH.secs, D.REACH.share / a) - 1e-9, type + ': there is time to get there');
  }
});
console.log(process.exitCode ? 'some tests failed' : `${n} tests passed`);
