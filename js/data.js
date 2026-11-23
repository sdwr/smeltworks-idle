/* Smeltworks Idle — static data: curves, weapons, skills, affixes, monsters. Every number that sets the pace is here. */
(function () {
'use strict';
const SW = globalThis.SW = globalThis.SW || {};

/* ---------------------------------------------------------------- util */
const U = SW.util = {
  rng: Math.random,
  seed(n) { let a = n >>> 0; U.rng = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  rand(a, b) { return a + U.rng() * (b - a); },
  irand(a, b) { return Math.floor(a + U.rng() * (b - a + 1)); },
  chance(p) { return U.rng() < p; },
  pick(arr) { return arr[Math.floor(U.rng() * arr.length)]; },
  wpick(arr, wf) { let tot = 0; for (const x of arr) tot += wf(x); let r = U.rng() * tot; for (const x of arr) { r -= wf(x); if (r <= 0) return x; } return arr[arr.length - 1]; },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  fmt(n) {
    if (!isFinite(n)) return '∞';
    const neg = n < 0; n = Math.abs(n);
    let s;
    if (n < 1000) s = String(Math.round(n));
    else if (n < 1e4) s = Math.round(n).toLocaleString('en-US');
    else {
      const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
      let u = -1;
      while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
      s = n >= 1000 ? n.toExponential(2) + units[u] : (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + units[u];
    }
    return neg ? '-' + s : s;
  },
  /* small numbers keep a decimal: 4.2, 37, 1,250 */
  fmt1(n) { return Math.abs(n) >= 100 ? U.fmt(n) : (Math.round(n * 10) / 10).toString(); },
  esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
};

const D = SW.data = {};
D.VERSION = '0.86.5';
D.SAVE_KEY = 'smeltworks-idle-v1';
/* Play data (js/telemetry.js): where it is posted, and the only addresses of the game it is ever sent from */
D.TELEMETRY = { url: 'https://smeltworks-idle-logging.sdwr.workers.dev/ingest', hosts: ['sdwr.github.io'] };

/* ------------------------------------------------------------ the pace
   A level is ten fights: nine encounters and a boss. Monster life does not grow by a fixed ratio per level: skills
   are the only thing that makes you stronger, and what they give grows in steps (a tier every six levels), not by
   compounding, so a fixed ratio would outrun them and end in a wall. Instead life follows D.depth, a straight
   line through the levels, raised to a power (D.HP_P). The climb is steep at first and eases as you go.
   A run stalls: with the weapons, sockets and tier the tree gives, skills and upgrades carry it so far, and then it
   is time to prestige and buy more. How far each purchase carries a run is this curve: the growth for one level is
   about D.HP_P / (D.DEPTH + level), so a short D.DEPTH makes the first levels steep (a second weapon is worth three
   levels, not ten) and the late ones gentle. tests/sim.cjs shows what a change to D.HP0, D.HP_P or D.DEPTH does,
   and what a run earns in cores (D.CORE) has to move with them.
   There is no clock. The cursor and the troops share one pool of Life, full at the start of a level and lasting
   all ten of its fights, and the only thing that takes it is an enemy attack. More Life is a matter for the prestige
   tree, not for weapons, so the early game is the one short of it: weapons are strong (D.WALL.arm) to get a line
   of one through its first act bosses, and D.HP_P is high so that the late levels do not fall too fast for it. */
D.FIGHTS = 10;
/* How slow the battles are. This one number stretches every fight: enemies have that much more life, and take that
   much longer to get through yours (their swings come further apart, and each takes less). Raise it for slower
   battles, lower it for quicker ones; 1 is the first build, where a fight was over in two or three seconds.
   A fight pays more gold for being longer, but only by the square root: paid in full, a long fight is worth more
   each second than a short one (less of it goes on the pause between fights and on blows that overkill), and the
   levels fly past. With these two, 2.5 makes fights about twice as long as 1 and leaves the levels about where
   they were (tests/sim.cjs shows it). Weapon prices, new offers and skill drops follow the pay, so they are worth
   the same as before. */
D.PACE = 2.5;
D.SWING = Math.sqrt(D.PACE);        // enemy swings are this much further apart, and each takes this much less
D.PAY = Math.sqrt(D.PACE);          // and a fight pays this much more
D.HP0 = 3;   D.HP_P = 4.4;           // a level 1 monster's life (before D.PACE), and how steeply it grows (see D.depth)
D.HP_STEP = 0.05;                   // each fight inside a level has this much more life than the one before
D.GOLD0 = 2;  D.GOLD_P = 3.5;       // gold for a level 1 kill, and how steeply that grows
/* What stands in the arena. A fight is one of three kinds, and the level's tenth is a boss of a kind that goes by
   the level's number, so you can build for it. hp, hit and gold are the whole encounter's, as multiples of one
   ordinary monster's, shared out among its members: a group has more life than a lone monster but hits less hard
   in all, even to begin with, and every death thins its attacks: a group costs time, which Life now has to last
   (it carries from fight to fight), and a line of one slow weapon must be able to afford it. */
/* A level is ten fights on one bar of Life, and where that Life goes is set here. The nine ordinary fights are most of
   it: on a level a line can only just clear they take about three fifths of the bar between them, and the boss a
   quarter, whichever kind of boss it is. So a level that is too much is felt from its first fights, and a boss ends
   an attempt because the Life was already spent, not because it alone outweighs the rest. (A boss's `hp` is a
   multiple of an ordinary monster's at that level; tests/sim.cjs and the README say how this was measured.) */
D.ENC = {
  single: { w: 4, drop: 1 },
  pack:   { w: 4, n: [3, 5],  hp: 1.5, hit: 0.8, drop: 1.3 },
  swarm:  { w: 2, n: [6, 8],  hp: 1.8, hit: 0.7, drop: 1.6 },
  elder:   { hp: 2.7, hit: 1.25, gold: 7 },                                    // one champion
  trio:    { n: 3, hp: 3.8, hit: 1.8, gold: 7.5 },                             // three lesser champions (they hit hard together, and less as they fall)
  warband: { hp: 1.9, hit: 1.0, gold: 4.5, n: 6, minHp: 1.2, minHit: 0.6, minGold: 3 },    // a champion and its followers
  actboss: { hp: 2.2, hit: 0.75, gold: 10, n: 4, minHp: 0.8, minHit: 0.5, minGold: 2 },   // every fifth level: the act's own boss, and its guards
  cycle: ['actboss', 'trio', 'elder', 'elder', 'warband'],                     // by level, modulo five
};
D.LEECH_CAP = 5;                    // Life on kill, from every affix on the line together, is this much a kill at most
D.LIFE = 100; D.LIFE_CAP = 300;     // the Life you begin with. More is on the prestige tree (its Life nodes), and from Life affixes: those
                                    // add LIFE_CAP - LIFE at the very most. A weapon brings none of its own.
D.HIT0 = 18;                         // Life a level 1 attack takes (before D.PACE), times the monster's own `hit`
D.HIT_G = 0.0075; D.HIT_CAP = 2;    // attacks hit 0.75% harder per level, up to twice as hard
D.DEATH_SECS = 10;                  // after a fight is lost: the arena goes grey and counts down before the level starts again
D.RUN_SECS = 3;                     // a run opens on an empty arena for this long: time to forge a weapon before the first fight
D.REACH = { share: 0.42, secs: 0.6 };      // a fight's first blow: at least this share of a cooldown (or this many seconds, if that is less) is still to run when it opens, which is what a weapon takes to get there (arena.js TRIP)
D.SPAWN = 0.7;                      // the pause between one fight and the next
D.LEVEL_PAUSE = 2.2;                // and after the last fight of a level: an interlude that says what the level paid and what comes next

/* Nothing is levelled up: not weapons, not the cursor, and there is no upgrade that adds damage. A weapon is its
   type, its own damage roll and the skills that went into it, and it is exactly as strong at level 50 as on the
   day it was made. Skills are the only thing that grows: deeper levels drop higher-level skills with bigger
   numbers and, more and more often, two secondary affixes. The prestige tree adds room for skills (posts and sockets), not
   damage. So the monsters' growth (D.HP_P, above) is set by what better skills can keep up with. */
/* The cursor has no sockets: its blow is this and no more, though it shares in the line's auras and in whatever the
   troops have done to the enemy. One blow, and how many a second: the cooldown between blows is 1 / aps (1s to
   begin with), and an Attack Speed Aura cannot bring it under minCd. */
D.CURSOR = { dmg: 6, aps: 1, carry: 1, minCd: 0.25, name: 'Cursor' };
D.CRIT = 5; D.CRIT_MULT = 2;         // a critical hit is double: only Deathblow (and the dagger's notable) raises it

D.DEPTH = 12;                       // levels for D.depth to rise by one
D.depth = lvl => 1 + (lvl - 1) / D.DEPTH;
/* The wall. Levels 1 and 2 are the cursor's: it clears them alone. From level 3 everything has D.WALL.mult times
   the life, and without a weapon level 3 cannot be beaten: its boss outlasts your Life. A weapon deals D.WALL.arm
   times what the table gives it (see D.WEAPONS): more than the wall's own measure, because the skills in it are
   plain ones, stats and no effect, until each colour's node is held, and the early bosses have to fall to those. */
D.WALL = { from: 3, mult: 10, arm: 16 };
D.hp = (lvl, fight) => D.PACE * D.HP0 * Math.pow(D.depth(lvl), D.HP_P) * (1 + D.HP_STEP * fight) * (lvl >= D.WALL.from ? D.WALL.mult : 1);
D.gold = lvl => D.PAY * D.GOLD0 * Math.pow(D.depth(lvl), D.GOLD_P);
/* the first two levels are the cursor's alone, and their enemies pull their blows: level 1 hits for two fifths, level 2
   for seven tenths. From level 3 they hit in earnest. */
D.EARLY = [0.4, 1];
D.hit = lvl => D.HIT0 / D.SWING * Math.min(D.HIT_CAP, 1 + D.HIT_G * (lvl - 1)) * (D.EARLY[lvl - 1] || 1);

/* ------------------------------------------------------------ the arena, seen from above
   Enemies roam the middle (D.ROAM); the weapons stand round them on a ring. One unit is about a hundredth of the
   arena across. Area damage comes four ways: the cursor's own circle, a blow that splashes round its target, one
   that arcs on to another enemy, and one that carries on through everything in its line. */
D.RING = 44;                        // how far out the weapons stand
/* Enemies do not stand still. The whole encounter drifts about the arena as one (so a pack stays a pack, and area
   damage is worth what it was), each member meanders a little round its own place in it, and each stops where it
   is to attack: for `windup` seconds before its swing (or 30% of its interval, if that is shorter) and `rest` after.
   One that has stopped is left behind and hurries to catch up. A stunned enemy does not move, and Chill slows its
   feet as it slows its attacks. field: how far from the middle any of them may get. */
D.ROAM = { field: 37, group: 6, speed: 13, leash: 3.5, windup: 0.7, rest: 0.35, stay: [0.3, 1.4] };
/* How far apart a group stands when it appears: the gap between neighbours in a pack and in a swarm, and how far
   out the three Elders, a warband and an act boss's guards stand from the middle. (They were 11, 8, 6.6, 11.5, 21.) */
D.SPREAD = { pack: 17, swarm: 11.5, trio: 11, warband: 16, guards: 25 };
D.AOE = { cursor: 4, splash: 18, arcRange: 45, arcMax: 4, pierce: 1.5, novaEvery: 6 };

/* ------------------------------------------------------------ sockets
   Three colours, by what a skill's primary affix does. The cursor's sockets are colourless and take anything. */
D.COLORS = {
  r: { name: 'Might', word: 'red',   hex: '#ff5a48', desc: 'Makes the one holding it hit harder.' },
  b: { name: 'Hex',   word: 'blue',  hex: '#5aa8ff', desc: 'Its holder afflicts the enemy on hit.' },
  g: { name: 'Aid',   word: 'green', hex: '#6fdc6a', desc: 'Helps the whole line, whoever holds it.' },
};

/* ------------------------------------------------------------ weapons (the troops)
   dmg and aps at post level 1: a blow every second (the bow) to every three (the hammer). The three that hit one target at a time do about a quarter more to it than the
   three that reach others: splash (round the target), arc (on to one more enemy) and pierce (everything in line).
   melee: it goes to its target to strike (the hammer, axe, sword and dagger); the bow and the staff shoot from their posts.
   That is only how the blow is drawn: it lands at the same moment either way.
   col: the odds of each socket's colour. */
/* carry: how many more enemies a blow's overkill can go on to (see carry() in game.js). The heavier and slower the
   weapon the further it carries, so that against small enemies every type clears about as fast as its power says:
   an axe's one blow goes through five where a dagger's three blows go through two each (the hammer, which splashes as well, carries less). */
D.WEAPONS = {
  hammer: { melee: 1, name: 'Hammer', spr: 'hammer', dmg: 13.3, aps: 0.30, carry: 3, splash: 40, col: { r: 70, b: 15, g: 15 }, note: 'Slow. Splashes for 40%.' },
  axe:    { melee: 1, name: 'Axe',    spr: 'axe',    dmg: 12.7, aps: 0.42, carry: 4, col: { r: 55, b: 15, g: 30 }, note: 'One target, hit hard.' },
  sword:  { melee: 1, name: 'Sword',  spr: 'sword',  dmg: 8.7,  aps: 0.60, carry: 2, col: { r: 40, b: 30, g: 30 }, note: 'One target, even-handed.' },
  staff:  { name: 'Staff',  spr: 'staff',  dmg: 8.7,  aps: 0.48, carry: 2, arc: 50, col: { r: 15, b: 65, g: 20 }, note: 'Arcs to a second enemy for 50%.' },
  bow:    { name: 'Bow',    spr: 'bow',    dmg: 4.2,  aps: 1.00, carry: 1, pierce: 50, col: { r: 20, b: 25, g: 55 }, note: 'Pierces the line for 50%.' },
  dagger: { melee: 1, name: 'Dagger', spr: 'dagger', dmg: 3.2,  aps: 1.50, carry: 1, crit: 10, col: { r: 30, b: 45, g: 25 }, note: 'One target, the fastest. +10% crit.' },
};
for (const k in D.WEAPONS) D.WEAPONS[k].dmg *= D.WALL.arm;        // the table is in the cursor's measure; a weapon is worth D.WALL.arm of that
D.WEAPON_IDS = Object.keys(D.WEAPONS);
// a weapon has no quality of its own: every sword is the same sword. (q, where it still appears, is always 1.)
D.PALS = ['rust', 'iron', 'steel', 'rune', 'star', 'void'];   // by socket count
/* The crafter. One weapon is on the bench at a time, with as many sockets as the prestige tree gives (one, and
   one more for each socket node held). You may reroll all of it, or pay more to reroll only its type (the sockets
   stay as they are), and set skills in its sockets and change them as you like. Then you make it, which is free:
   the skills in it become its stats for good, and its sockets, filled or empty, are gone. */
D.CRAFT = { sockets0: 0, max: 6, part: 1.6 };      // sockets0: what a weapon is made with before any socket node; part: what the type alone, or the sockets alone, costs to reroll, as a multiple of a new weapon: more, since it keeps the half you liked
/* A made weapon does not always get every socket the tree has unlocked: the chance of all of them, of one short,
   and of two short (never fewer than one). Rerolling its sockets changes their colours, not how many: for more, make it again. */
D.SOCK_ROLL = [0.30, 0.55, 0.15];
/* Upgrading (the tree's Upgrade node): a weapon on the line can be struck at for gold. Each strike adds one to three
   ranks (`gain`), up to `max`, and each rank is `dmg`% more damage. A strike costs `cost` kills' gold at your deepest
   level, times `step` for each rank the weapon already has. Scrapping the weapon gives half of it back. */
D.UP = { max: 25, dmg: 3, cost: 6, step: 1.25, gain: [1, 3], back: 0.5 };
D.MAKE = 5;                // making the weapon on the bench costs this many kills' gold at your deepest level
D.FORGE_SECS = 1.5;        // and takes this long at the anvil: three blows of the hammer
D.REROLL_CUT = 30;         // the most the tree's Spare stock can take off a reroll, in percent: it stays dearer than a new weapon

/* ------------------------------------------------------------ prestige: the tree
   A reset (prestige) ends the run: levels, gold, weapons and every skill go. What stays is the tree.
   A run earns cores for the levels it clears (D.CORE), and a reset banks them. They buy the tree's nodes (D.PRICE),
   only between runs: a reset opens the tree, you buy what you can afford (and may hand nodes back, one at a time, for
   what they cost), and the tree is then fixed until the next reset.
   The tree grows out from the middle, and a node can be taken only if it touches one you hold (or the start). There
   are three kinds of node:
     hubs      troop posts, sockets on every weapon the crafter makes, a second bench. They sit where paths meet.
     small     the paths between hubs. Every small node belongs to a theme: one weapon type, one affliction, or the
               crafter and its skills. There is no path of plain filler: to reach a post you walk through a weapon.
     notable   the big node a theme's small nodes lead to, one step off the path. It changes a rule: what a weapon
               type does, how an affliction works, or a new way to craft a skill.
   The tree costs far more than a few runs earn, so which way you grow is a choice, and one you keep. */
D.POSTS0 = 0; D.POSTS_MAX = 6;      // a new game has no weapon slot at all: each weapon node is one, six at the most
D.PRESTIGE_AT = 2;                  // the first run cannot be ended until it has reached this level (and earned its first core). After that any run can be, at any time
/* Cores. A run earns them: each level pays D.CORE(level) the first time the run clears it, deeper levels more. They
   are banked when you prestige, and the tree's nodes are bought with them (a node can be handed back for its price while the tree is open, one at a time). So every
   run pays something, a wall can be ground past, and what gates the tree is what its nodes cost:
     the first weapon 1, the socket and Upgrade 2 each
     the other unlocks: Rerolls 2, each colour of skill 4, the Market 5, Life 5
     conv     a convenience, wherever it is: a Purse, a Head start or the Full kit
     bead     a small node: [base, more for each step it is from the middle]
     notable  a big node off a path: this many times a bead at the same distance
     post2, sock2, tier   [price, times this for each step further out, counted from this distance]; a Deep veins
                          notable is tierBig times a tier there
   Every price is the node's own and never moves: nothing gets dearer because something else was bought. It is the
   far ones that cost: the weapon three steps out is 8 cores and the last, twenty-two out, about 600. D.PRICE is the
   lever for which way a tree grows. */
D.CORE = lvl => 1 + Math.floor(lvl / 2.5);
D.SKIP_PAY = 0.5;                   // levels a Head start passed over pay this share of their cores, with the first level the run clears above them
/* Every big node's icon on the tree: one path on a 24 by 24 grid, drawn as a line in the node's colour. A node has
   no word on it; its name is in the tooltip. (The later weapons and sockets share the first ones' icons.) */
D.TREE_ICON = {
  post: 'M20.5 3.5l-1 5-8 8-3-3 8-8zM6 11l7 7M9.5 14.5l-5 5',
  sock: 'M7 4h10l4.5 5.5L12 20.5 2.5 9.5zM2.5 9.5h19M9.5 4L8 9.5l4 11 4-11L14.5 4',
  bench2: 'M7.5 4.5H21c0 4-3 7-7 7H7.5zM7.5 6H3c0 2.5 2 4 4.5 4M10 11.5v5M15 11.5v5M5.5 20.5c0-2.2 1.5-4 3.5-4h7c2 0 3.5 1.8 3.5 4z',
  uUp: 'M10.5 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2zM18.5 15v5.5M15.75 17.75h5.5',
  uReroll: 'M3 7.5h3c5.5 0 6.5 9 12 9h2.5M17.5 13.5l3 3-3 3M3 16.5h3c1.7 0 3-.9 4.1-2.2M13.9 9.7C15 8.4 16.3 7.5 18 7.5h2.5M17.5 4.5l3 3-3 3',
  uBuy: 'M4.5 4.5h15L21 9.5c0 1.4-1 2.5-2.25 2.5S16.5 10.9 16.5 9.5c0 1.4-1 2.5-2.25 2.5S12 10.9 12 9.5c0 1.4-1 2.5-2.25 2.5S7.5 10.9 7.5 9.5C7.5 10.9 6.5 12 5.25 12S3 10.9 3 9.5zM5 12v8.5h14V12M10 20.5V16h4v4.5',
  uR: 'M12 2.5l2 5.5 5-2.5-2.5 5 5.5 1.5-5.5 2 2.5 5-5-2.5-2 5.5-2-5.5-5 2.5 2.5-5-5.5-2 5.5-1.5-2.5-5 5 2.5z',
  uB: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9a3 3 0 1 0 .01 0',
  uG: 'M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z',
  swdN: 'M4.5 19.5L19.5 4.5M6 14l4 4M19.5 19.5L4.5 4.5M18 14l-4 4',
  hamN: 'M7 4h10v5.5H7zM12 9.5v11M4 11.5a9 9 0 0 0 1.6 7.5M20 11.5a9 9 0 0 1-1.6 7.5',
  axeN: 'M9.5 21V3M9.5 6.5l6.5-3c3 2.5 3 7.5 0 10l-6.5-3M20.5 16.5v.01M17.5 19v.01M21 20.5v.01',
  dagN: 'M9 3l2.2 8.5H6.8zM5.5 11.5h7M9 11.5v6M9 20.5v.01M15 7l5-2.5M15 12l5-2.5M15 17l5-2.5',
  bowN: 'M4.5 19.5L14 10M20 4l-9.5 2.8 6.7 6.7zM4.5 19.5v-3.5M4.5 19.5h3.5',
  stfN: 'M12.5 2.5L6 13h5l-1.5 8.5L18 10.5h-5zM20.5 17v.01M3.5 6.5v.01',
  chillN: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.8l2.5 2 2.5-2M9.5 19.2l2.5-2 2.5 2',
  stunN: 'M11 13a1.2 1.2 0 0 1 2.4 0a2.4 2.4 0 0 1-4.8 0a3.6 3.6 0 0 1 7.2 0a4.8 4.8 0 0 1-9.6 0a6 6 0 0 1 12 0M19.5 3v3.4M17.8 4.7h3.4',
  novaN: 'M12 10a2 2 0 1 0 .01 0M12 6.5a5.5 5.5 0 1 0 .01 0M4.3 7.5a9.2 9.2 0 0 0 0 9M19.7 7.5a9.2 9.2 0 0 1 0 9',
  burnN: 'M10 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2 0 1.6.8 2.6 1.8 2.6C10.2 9.6 9 6.5 10 3zM19 13.5c.5 1.3 2 2.1 2 3.7a2 2 0 0 1-4 0c0-1.2 1.2-2 2-3.7z',
  britN: 'M12 3l8 9-8 9-8-9zM12 3l-2 6 4 3-3 4 1 5',
  cull: 'M12 3.5a7 7 0 0 0-7 7c0 2.6 1.2 4.2 3 5.3V19.5h8v-3.7c1.8-1.1 3-2.7 3-5.3a7 7 0 0 0-7-7zM9.3 11v.01M14.7 11v.01M10.5 19.5v-2M13.5 19.5v-2',
  life: 'M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.6C20.5 15 12 20.5 12 20.5z',
  might: 'M6 21V3M6 4.5h12.5l-3 3.75 3 3.75H6',
  tier: 'M12 2.5l2.4 2.8-2.4 2.8-2.4-2.8zM6 15.5l6-5 6 5M6 20.5l6-5 6 5',
  cAdd: 'M4 7.5h16M4 13h9M18 14.5v6M15 17.5h6',
  cThird: 'M4 5.5h16M4 10.5h16M4 15.5h8M18 15v6M15 18h6',
  cMorph: 'M4.5 12a7.5 7.5 0 0 1 13-5.2M19.5 3.5V7.2H15.8M19.5 12a7.5 7.5 0 0 1-13 5.2M4.5 20.5v-3.7h3.7',
};
D.TREE_ICON.post2 = D.TREE_ICON.post; D.TREE_ICON.sock2 = D.TREE_ICON.sock;
D.PRICE = { F1: 1, F2: 2, UPG: 2, URR: 2, UMT: 4, UHX: 4, UAD: 4, UBY: 5, ULF: 5, conv: 3, bead: [2, 0.5], notable: 5, post2: [8, 1.255, 3], sock2: [14, 1.214, 5], tier: [5, 1.24, 2], tierBig: 2.2, bench2: 60 };
D.CULL = 15;                        // Cull (a notable): an enemy at this share of its life or less dies
/* A new game has only the cursor: no post, and no socket, which means no skills either (none drop, none can be
   bought). The first two nodes of the tree give them, in this order: the post, then the socket. Nothing else can be
   taken until both are held. Clearing level 1 with the cursor is the first point, so the first prestige buys the
   weapon; clearing level 2, with that bare weapon's help, is the second, and the next prestige buys the socket. */
D.TREE_GATE = ['F1'];            // the first node, in the middle: the first weapon. Everything hangs from it
D.TREE_FIRST = ['UPG', 'F2'];    // and the two beside it, Upgrade and the socket, in either order: nothing else can be bought until both are held
/* what a node can give. amt: [what a small node of it is worth, a big one]. A notable is worth 1: you hold it or not.
   text: what one node does. sum: what you hold of it altogether (small kinds only). */
const HUB = '#ff9a4a', SOCK = '#b48cff', WPN = '#e8c060', HEX = '#6ab4ff', FORGE = '#7ad66a', MISC = '#9aa3b5', LIFE = '#e86a6a';
D.TREE_EFF = {
  // hubs
  post:   { name: 'Weapon',         amt: [0, 1], col: HUB,  text: () => 'Unlocks weapons', sum: v => `${D.POSTS0 + v} weapon${D.POSTS0 + v === 1 ? '' : 's'}` },
  sock:   { name: 'Forge socket', amt: [0, 1], col: SOCK, text: () => 'Unlocks sockets and skills', sum: v => `${D.CRAFT.sockets0 + v} socket${D.CRAFT.sockets0 + v === 1 ? '' : 's'}` },
  post2:  { name: 'Weapon',         amt: [0, 1], col: HUB,  text: () => '+1 weapon' },
  sock2:  { name: 'Forge socket', amt: [0, 1], col: SOCK, text: () => '+1 socket' },
  uR:     { name: 'Might',          amt: [0, 1], col: '#ff5a48', text: () => 'Unlock Might skills' },
  uB:     { name: 'Hex',            amt: [0, 1], col: '#5aa8ff', text: () => 'Unlock Hex skills' },
  uG:     { name: 'Aid',            amt: [0, 1], col: '#6fdc6a', text: () => 'Unlock Aid skills' },
  uUp:    { name: 'Upgrade',        amt: [0, 1], col: HUB,  text: () => 'Upgrade weapons with gold' },
  uReroll: { name: 'Rerolls',       amt: [0, 1], col: FORGE, text: () => 'Reroll the weapon on the bench' },
  uBuy:   { name: 'Market',         amt: [0, 1], col: FORGE, text: () => 'Buy skills with gold' },
  bench2: { name: 'Second bench',   amt: [0, 1], col: SOCK, text: () => 'Set a weapon aside and work on another' },
  // weapons: the small nodes, and the notable they lead to
  swd:  { name: 'Sword drill',   amt: [25, 0],  col: WPN, text: v => `Swords attack ${v}% faster`, sum: v => `swords ${v}% faster` },
  swdN: { name: 'Riposte',       amt: [0, 1],  col: WPN, text: () => 'Swords: 20% chance to strike twice' },
  ham:  { name: 'Hammer weight', amt: [18, 0],  col: WPN, text: v => `Hammer splash +${v}%`, sum: v => `hammer splash +${v}%` },
  hamN: { name: 'Wide swing',    amt: [0, 1],  col: WPN, text: () => 'Hammer splash reaches 60% farther' },
  axe:  { name: 'Axe edge',      amt: [20, 0],  col: WPN, text: v => `Axes: +${v}% damage to bosses`, sum: v => `axes +${v}% to bosses` },
  axeN: { name: 'Cleaver',       amt: [0, 1],  col: WPN, text: () => 'Axes splash for 30%' },
  dag:  { name: 'Dagger point',  amt: [6, 0],  col: WPN, text: v => `Daggers: +${v}% critical chance`, sum: v => `daggers +${v}% critical chance` },
  dagN: { name: 'Lacerate',      amt: [0, 1],  col: WPN, text: () => 'Dagger criticals deal triple damage' },
  bow:  { name: 'Bow draw',      amt: [14, 0],  col: WPN, text: v => `Bow pierce +${v}%`, sum: v => `bow pierce +${v}%` },
  bowN: { name: 'Heavy arrows',  amt: [0, 1],  col: WPN, text: () => 'Arrows cut twice as wide' },
  stf:  { name: 'Staff charge',  amt: [14, 0],  col: WPN, text: v => `Staff arc +${v}%`, sum: v => `staff arc +${v}%` },
  stfN: { name: 'Chain',         amt: [0, 1],  col: WPN, text: () => 'Staff bolts arc to two more enemies' },
  // afflictions: a notable each (their small nodes are gone: the paths to them are plain weapon damage now)
  chillN: { name: 'Frostbitten',   amt: [0, 1],  col: HEX, text: () => 'Chilled enemies take 15% more damage' },
  stunN:  { name: 'No respite',    amt: [0, 1],  col: HEX, text: () => 'Stun again after 1s, not 2s' },
  novaN:  { name: 'Aftershock',    amt: [0, 1],  col: HEX, text: () => 'Shockwave every 4s, not 6s' },
  burnN:  { name: 'Wildfire',      amt: [0, 1],  col: HEX, text: () => 'A dying enemy\'s burn passes to the nearest' },
  britN:  { name: 'Shattering',    amt: [0, 1],  col: HEX, text: () => 'Brittle: +4% per stack, not +3%' },
  life:   { name: 'Life',          amt: [25, 100], col: LIFE, text: v => `+${v} Life`, sum: v => `${D.LIFE + v} Life` },
  // the crafter and its skills
  craft:  { name: 'Steady hand',   amt: [5, 0],  col: FORGE, text: v => `Skill crafting ${v}% cheaper`, sum: v => `skill crafting ${v}% cheaper` },
  reroll: { name: 'Spare stock',   amt: [8, 0],  col: FORGE, text: v => `Bench rerolls ${v}% cheaper`, sum: v => `bench rerolls ${v}% cheaper` },
  cheap:  { name: 'Haggling',      amt: [4, 0],  col: FORGE, text: v => `Buying skills ${v}% cheaper`, sum: v => `skills ${v}% cheaper` },
  drops:  { name: 'Keen eye',      amt: [12, 0],  col: FORGE, text: v => `+${v}% skill drops`, sum: v => `+${v}% skill drops` },
  cAdd:   { name: 'Second line',   amt: [0, 1],  col: FORGE, text: () => 'Craft: add a second affix' },
  cThird: { name: 'Third line',    amt: [0, 1],  col: FORGE, text: () => 'Craft: add a third affix' },
  cMorph: { name: 'Transmuting',   amt: [0, 1],  col: FORGE, text: () => 'Craft: change it into another skill' },
  // the run
  tier:   { name: 'Deep veins',    amt: [1, 2],  col: '#ffd98a', text: v => `Skills roll higher tiers${v > 1 ? ', twice over' : ''}`, sum: v => { const o = D.tierOdds(v), top = o.reduce((m, x, i) => x > 0 ? i : m, 0); return `T${top + 1} skills ${Math.round(o[top] * 100)}%, T1 ${Math.round(o[0] * 100)}%`; } },
  dmg:    { name: 'Whetstone',     amt: [5, 0],  col: WPN,  text: v => `+${v}% weapon damage`, sum: v => `+${v}% weapon damage` },
  cull:   { name: 'Cull',          amt: [0, 1],  col: LIFE, text: () => `Enemies at ${D.CULL}% life or less die` },
  might:  { name: 'Battle line',   amt: [0, 15], col: MISC, text: v => `+${v}% damage for every weapon` },
  gold:   { name: 'Prospecting',   amt: [10, 0], col: FORGE, text: v => `+${v}% gold`, sum: v => `+${v}% gold` },
  purse:  { name: 'Purse',         amt: [1, 0],  col: MISC, text: v => `Start each run with gold for ${v} weapon${v === 1 ? '' : 's'}`, sum: v => `gold for ${v} weapon${v === 1 ? '' : 's'}` },
  kitAll: { name: 'Full kit',      amt: [1, 0],  col: MISC, text: () => 'Start each run with one of each skill', sum: () => 'one of each skill to start' },
  kit:    { name: 'Provisions',    amt: [1, 0],  col: MISC, text: v => `Start each run with ${v} skill${v === 1 ? '' : 's'}`, sum: v => `${v} starting skill${v === 1 ? '' : 's'}` },
  head:   { name: 'Head start',    amt: [5, 0],  col: MISC, text: v => `Start each run ${v} levels deeper`, sum: v => `${v} levels' head start` },
};
/* the nodes: { id, x, y, eff, big, links: [the nodes it hangs from] }. 'start' is the middle, always held.
   Beside the start are the first two nodes: a troop post to the west and the first socket to the east. West from the post,
   the arsenal: the other five weapons, and between them the six weapons (swords first, then hammers one way and axes
   the other, daggers and bows beyond, staves at the far end). East, the workshop: the five sockets and the second
   bench, by way of cheaper crafting, rerolls and skills, with the ways to craft a skill hanging off the path.
   North: Chill, then Stun one way and Shockwave the other. South: Burn, then Brittle one way and Life the other.
   Four bridges (a run's provisions and head start) join the ends of north and south to the arms.
   Skill tier is the tree's alone (the level you are on has no say): fifteen small nodes of a tier each, one or
   two on every path, and two notables of two. Rerolling the bench and buying skills are a node each, off the
   first post and the first socket, and so is each colour of skill (D.PLAIN). The whole tree is 130 nodes. */
D.TREE = [];
(function () {
  const at = id => id === 'start' ? { x: 0, y: 0 } : D.TREE.find(n => n.id === id);
  const N = (id, x, y, eff, from, big) => { D.TREE.push({ id, x: Math.round(x), y: Math.round(y), eff, big: !!big, links: [].concat(from) }); return id; };
  /* small nodes strung evenly from one node towards a point (by way of any points between), and the hub at that
     point if one is named: way('wu', 'P1', [], [-300, -180], ['ham', 'ham'], 'P2', 'post') */
  const way = (pre, from, via, to, effs, end, endEff) => {
    const pts = [[at(from).x, at(from).y], ...via, to], seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), len = seg.reduce((x, y) => x + y, 0);
    let prev = from;
    effs.forEach((e, k) => {
      let d = len * (k + 1) / (effs.length + 1), i = 0; while (d > seg[i]) d -= seg[i++];
      prev = N(pre + (k + 1), pts[i][0] + (pts[i + 1][0] - pts[i][0]) * d / seg[i], pts[i][1] + (pts[i + 1][1] - pts[i][1]) * d / seg[i], e, prev);
    });
    return end ? N(end, to[0], to[1], endEff, prev, 1) : prev;
  };
  /* a notable, one step off the path: it hangs from one small node and leads nowhere */
  const leaf = (id, from, dx, dy, eff) => N(id, at(from).x + dx, at(from).y + dy, eff, from, 1);
  const rep = (e, n) => Array(n).fill(e);
  /* The layout is drawn to be looked at: the two sides mirror each other, a kite each, with their deepest hubs on a
     spine running back in from the tip; north and south are a fork each; and the middle is a three-by-three block,
     the two first nodes either side of the start with what they unlock above and below them, Life over the
     start and Hex under it. */
  // the first node is the middle one: the first weapon. Two lead out of it: Upgrade to the west, the first socket (and skills with it) to the east
  N('F1', 0, 0, 'post', 'start', 1); N('UPG', -60, 0, 'uUp', 'F1', 1); N('F2', 60, 0, 'sock', 'F1', 1);
  // and two things that have to be unlocked, one step off each: rerolling the bench, and buying skills
  leaf('URR', 'UPG', 0, -60, 'uReroll'); leaf('UBY', 'F2', 0, -60, 'uBuy');
  // over the middle, between Rerolls and the Market: plain weapon damage, the first step north on the way to Life
  N('N0', 0, -60, 'dmg', ['UPG', 'F2']);
  // the three colours of skill: until its node is held a colour's skills are plain ones. Might hangs off the post,
  // Aid off the socket, and Hex is the first step south, on the way to Burn and Brittle
  leaf('UMT', 'UPG', 0, 60, 'uR'); leaf('UAD', 'F2', 0, 60, 'uG'); N('UHX', 0, 60, 'uB', ['UPG', 'F2'], 1);
  // starting gold, close to the middle and cheap: a Purse over Rerolls and one under Might (there are four more out on the bridges)
  N('PU1', -60, -112, 'purse', 'URR'); N('PU2', -60, 112, 'purse', 'UMT');
  // and a head start, which begins a run that many levels in. It hangs from a Purse, here and on the bridges: a run that starts deep
  // with no gold for a weapon cannot clear anything
  N('HS1', -60, -152, 'head', 'PU1'); N('HS3', -100, -152, 'head', 'HS1');
  N('HS2', -60, 152, 'head', 'PU2'); N('HS4', -100, 152, 'head', 'HS2');          // four of them here, five levels each: two beyond each Purse
  // and on the other side, under Aid: a run begins with one of every kind of skill there is to drop
  N('KT1', 60, 112, 'kitAll', 'UAD');
  // west: the other five weapons, by way of the six types; the spine running back in from the tip carries two Battle lines
  way('w', 'UPG', [], [-200, 0], rep('swd', 1), 'P1', 'post2');                       leaf('WSW', 'w1', 0, -54, 'swdN');
  way('wu', 'P1', [], [-370, -225], ['ham', 'ham', 'ham', 'tier'], 'P2', 'post2');                   leaf('WHM', 'wu2', 43, -30, 'hamN');
  way('wd', 'P1', [], [-370, 225], ['axe', 'axe', 'axe', 'tier'], 'P3', 'post2');                    leaf('WAX', 'wd2', 43, 30, 'axeN');
  way('wa', 'P2', [], [-570, -75], ['dag', 'dag', 'dag', 'dag', 'tier', 'dag'], 'P4', 'post2');                    leaf('WDG', 'wa3', -28, -44, 'dagN');
  way('wb', 'P3', [], [-570, 75], ['bow', 'bow', 'bow', 'bow', 'tier', 'bow'], 'P5', 'post2');                     leaf('WBW', 'wb3', -28, 44, 'bowN');
  const j1 = way('wp', 'P4', [], [-490, 0], rep('stf', 2)), j2 = way('wq', 'P5', [], [-490, 0], rep('stf', 2));
  N('wj', -490, 0, 'stf', [j1, j2]); N('wk', -445, 0, 'stf', 'wj'); N('P6', -395, 0, 'might', 'wk', 1);   leaf('WST', 'wk', 0, -54, 'stfN');
  N('wl', -347, 0, 'tier', 'P6'); N('P7', -299, 0, 'might', 'wl', 1);          // (where a seventh and an eighth weapon used to be: a line is six at the most)
  // east: the five sockets and the second bench, by way of the crafter
  way('e', 'F2', [], [200, 0], ['tier', 'cheap', 'craft'], 'K1', 'sock2');
  at('e1').x += 5;      // room for the first socket's hexagon
  way('eu', 'K1', [], [370, -225], ['reroll', 'drops', 'craft', 'tier', 'drops', 'craft', 'reroll'], 'K2', 'sock2');
  leaf('CAD', 'eu3', -43, -30, 'cAdd');
  way('ed', 'K1', [], [370, 225], ['cheap', 'drops', 'craft', 'tier', 'drops', 'craft', 'cheap'], 'K3', 'sock2');
  leaf('CTH', 'ed3', -43, 30, 'cThird'); leaf('CMO', 'ed6', -43, 30, 'cMorph');
  const j3 = way('ep', 'K2', [[570, -75]], [490, 0], ['gold', 'tier', 'gold', 'craft']), j4 = way('eq', 'K3', [[570, 75]], [490, 0], ['gold', 'tier', 'gold', 'craft']);
  N('ej', 490, 0, 'drops', [j3, j4]); N('ek', 445, 0, 'tier', 'ej'); N('K4', 395, 0, 'sock2', 'ek', 1);    leaf('BN2', 'ej', 52, 0, 'bench2');
  N('el', 347, 0, 'tier', 'K4'); N('K5', 299, 0, 'sock2', 'el', 1);          // the sixth socket, the last and deepest
  // north: weapon damage up to Life (a hundred of it, which doubles what you begin with), then on to Stun one way and
  // Shockwave the other; Chill's notable hangs over Life
  way('n', 'N0', [], [0, -170], rep('dmg', 2), 'ULF', 'life');                       leaf('ND', 'ULF', 0, -68, 'chillN');
  way('nl', 'ULF', [], [-190, -322], ['dmg', 'dmg', 'dmg', 'tier'], 'NC', 'stunN');
  way('nr', 'ULF', [], [190, -322], ['dmg', 'dmg', 'dmg', 'tier'], 'NK', 'novaN');
  // south: weapon damage down from Hex to Cull, then on to Brittle one way and more Life the other; Burn's notable hangs under Cull
  way('s', 'UHX', [], [0, 170], rep('dmg', 2), 'SH', 'cull');                        leaf('SW', 'SH', 0, 68, 'burnN');
  way('sl', 'SH', [], [-190, 322], ['dmg', 'dmg', 'dmg', 'tier'], 'SG', 'britN');
  way('sr', 'SH', [], [190, 322], rep('life', 4), 'SL', 'life');
  // bridges, from the ends of north and south to the arms
  const bridge = (pre, from, to, effs) => { const last = way(pre, from, [], [at(to).x, at(to).y], effs); at(to).links.push(last); };
  bridge('xa', 'NC', 'P2', ['purse', 'kit']); bridge('xb', 'NK', 'K2', ['purse', 'head', 'head', 'purse']);
  bridge('xc', 'SG', 'P3', ['purse', 'kit']); bridge('xd', 'SL', 'K3', ['purse', 'head', 'head', 'purse']);
  // the deep-run notables, one off each bridge: damage for the whole line in the west, two tiers on every skill in the east
  leaf('DM1', 'xa1', -25, -46, 'might'); leaf('DM2', 'xc1', -25, 46, 'might'); leaf('TR1', 'xb2', 25, -46, 'tier'); leaf('TR2', 'xd2', 25, 46, 'tier');
})();
D.NODE = {}; D.TREE.forEach(n => { D.NODE[n.id] = n; n.amt = D.TREE_EFF[n.eff].amt[n.big ? 1 : 0]; n.near = []; });
D.TREE.forEach(n => n.links.forEach(l => { n.near.push(l); if (l !== 'start') D.NODE[l].near.push(n.id); }));      // near: every node it touches, either way
D.TREE_START = D.TREE.filter(n => n.links.includes('start')).map(n => n.id);
// dist: how many steps a node is from the middle one
(function () { const todo = D.TREE_START.slice(); for (const id of todo) D.NODE[id].dist = 0; while (todo.length) { const n = D.NODE[todo.shift()]; for (const y of n.near) if (y !== 'start' && D.NODE[y].dist == null) { D.NODE[y].dist = n.dist + 1; todo.push(y); } } })();
D.isKey = n => /^u[A-Z]/.test(n.eff);        // the unlocks round the middle

/* ------------------------------------------------------------ skills
   A skill is its primary affix (which sets its colour) and one or two secondary ones. The primary is flat.
   There are five tiers. A skill has one, rolled as it drops (or is bought): which tier is luck, and the prestige
   tree's tier nodes tilt the odds, from nearly always tier 1 with none of them to mostly tier 5 with all
   (D.TIER_ODDS, D.tierOdds). The upper tiers are not there at all to begin with: tier 3 is first seen with three
   tier points, tier 4 with six and tier 5 with ten (D.TIER_FROM), each rare at first and at its full share six
   points on (D.TIER_RAMP). Each secondary affix rolls a tier of its own, from 1 up to the skill's, any of them as
   likely as another: a tier 4 skill can still roll a tier 1 affix. An affix at a tier is always worth the same: its
   `per` times D.TIER_VAL, which flattens towards the top, so tier 5 is twice tier 1 and only a little more than
   tier 4. There are no ranges, and nothing else scales an affix.
   (A skill's tier is kept as a level, six to a tier, as it was when a tier came from the level a skill dropped at.) */
D.TIER_LVLS = 6; D.TIER_MAX = 5;
D.tier = lvl => Math.min(D.TIER_MAX, 1 + Math.floor((lvl - 1) / D.TIER_LVLS));
D.TIER_VAL = [1, 1.4, 1.7, 1.9, 2];
D.TIER_ODDS = { base: -1.2, step: 0.13 };      // tier t's weight is e^(k(t-1)), with k = base + step for each tier point held on the tree
D.TIER_FROM = [0, 0, 3, 6, 10]; D.TIER_RAMP = 6;
D.tierOdds = pts => { const k = D.TIER_ODDS.base + D.TIER_ODDS.step * pts, w = D.TIER_VAL.map((_, i) => Math.exp(k * i) * (D.TIER_FROM[i] ? Math.max(0, Math.min(1, (pts - D.TIER_FROM[i] + 1) / D.TIER_RAMP)) : 1)), sum = w.reduce((a, b) => a + b, 0); return w.map(x => x / sum); };
D.CHILL = 30;         // Chilled: attacks this much slower
D.HEX_DUR = 4;           // how long a Chill lasts: a hit always applies it, so this is short
D.STUN = { boss: 0.5, immune: 2 };      // a boss is stunned half as long; nothing can be stunned again for 2s after
D.BRITTLE = { per: 3, max: 10, dur: 8 };     // Brittle: +3% damage taken per stack, the same whatever skill laid it on
D.BURN_SECS = 3;      // a burn pays out over about this long

/* A skill's primary affix is flat: one fixed number (v), the same on every copy of the skill at every level. It
   is never rolled and it does not grow. (bare: the text has no number in it at all.) What a skill's level and its
   luck change are its secondary affixes. */
const SK = (id, c, name, glyph, v, text, o) => Object.assign({ id, c, name, glyph, v, text }, o || {});
D.SKILLS = [
  // Might: what the holder's blows do. A weapon holds one of each skill (G.dupe). Reaching more than
  // one enemy is a weapon's own business (the hammer, the staff, the bow), apart from Shockwave
  SK('twin',     'r', 'Twin Strike',  'jab',         25, '{v}% chance to strike twice'),
  SK('nova',     'r', 'Shockwave',    'aftershock', 200, 'Every 6s, hits every enemy for {v}%'),
  SK('savage',   'r', 'Deathblow',    'crush',      100, 'Criticals deal +{v}% damage'),
  // Hex: every hit afflicts the enemy. No chance to it. How hard an affliction bites is the affliction's own
  // (D.CHILL, D.BRITTLE)
  SK('frost',    'b', 'Frostbite',    'frost',        1, 'Hits Chill for {d}s', { bare: 1 }),
  SK('concuss',  'b', 'Concuss',      'punch',      0.5, 'Hits Stun for {v}s (bosses: half)'),
  SK('shatter',  'b', 'Shatter',      'quake',        1, 'Hits add Brittle: +{p}% damage taken per stack, up to {m}', { bare: 1 }),
  SK('ignite',   'b', 'Ignite',       'cinder',      60, 'Hits Burn for {v}% of their damage'),
  // Aid: the whole line, the cursor included. An aura does not stack: one of each kind counts, and a second does nothing
  SK('warcry',   'g', 'Damage Aura',       'flag',     25, 'Aura: all allies deal +{v}% damage', { aura: 1 }),
  SK('rally',    'g', 'Attack Speed Aura', 'tempest',  15, 'Aura: all allies attack {v}% faster', { aura: 1 }),
  SK('ward',     'g', 'Defense Aura',      'ironskin', 20, 'Aura: enemies deal {v}% less damage', { aura: 1 }),
];
/* Every primary affix is an effect: something the weapon does, not a bigger number. Plain stats (damage, attack
   speed, criticals, boss damage, area, Life, gold, skill drops) are secondary affixes only. Skills that have been
   cut become one of these of the same colour in an old save. */
D.SKILL_WAS = { prospect: 'warcry', scavenge: 'rally', brutal: 'twin', frenzy: 'twin', precise: 'twin', ruin: 'twin', slayer: 'nova', cull: 'twin', enfeeble: 'frost', glass: 'warcry', reach: 'rally',
  cleave: 'twin', arc: 'nova', expose: 'frost', bulwark: 'warcry', mend: 'rally' };
D.SKILL = {}; D.SKILLS.forEach(s => D.SKILL[s.id] = s);
/* The plain skills, one a colour: no effect at all, only secondary affixes. A colour's skills drop (and are bought)
   as its plain one until that colour's node on the prestige tree is held (uR, uB, uG); after that, as the real ones. */
D.PLAIN = {
  r: SK('pr', 'r', 'Might',       'gem', 0, '', { plain: 1 }),
  b: SK('pb', 'b', 'Hex',         'gem', 0, '', { plain: 1 }),
  g: SK('pg', 'g', 'Aid',         'gem', 0, '', { plain: 1 }),
};
D.UNLOCK = { r: 'uR', b: 'uB', g: 'uG' };
for (const c in D.PLAIN) D.SKILL[D.PLAIN[c].id] = D.PLAIN[c];
/* every skill there is, in the bag's order: by colour, the plain one first */
D.ALL_SKILLS = ['r', 'b', 'g'].flatMap(c => [D.PLAIN[c]].concat(D.SKILLS.filter(s => s.c === c)));
/* each skill in a few words, for the list of stats on a made weapon */
const SHORT = { twin: '{v}% twin strike', nova: 'shockwave {v}%', savage: 'criticals +{v}%',
  frost: 'Chill on hit', concuss: 'Stun {v}s on hit', shatter: 'Brittle on hit', ignite: 'Burn {v}%',
  warcry: 'damage aura +{v}%', rally: 'speed aura +{v}%', ward: 'defense aura {v}%' };
D.SKILLS.forEach(s => s.short = SHORT[s.id]);

/* secondary affixes: the plain stats, and every one of them does something on any skill, in any weapon: none needs
   a particular primary to matter. (An affix that has been cut becomes one of these in an old save.) They are meant to be felt: one damage affix on a new skill is +20 to 40%, and
   every tier adds a fifth of that again. who: 'own' counts for whoever holds the skill, 'all' for everyone. */
const AF = (id, name, per, text, who, w) => ({ id, name, per, text, who, w });
D.AFFIXES = [
  AF('dmg',     'Damage',           25, '+{v}% damage', 'own', 10),
  AF('aspd',    'Attack speed',     12, '+{v}% attack speed', 'own', 8),
  AF('crit',    'Critical chance',   6, '+{v}% critical chance', 'own', 7),
  AF('boss',    'Boss damage',      35, '+{v}% damage to bosses', 'own', 6),
  AF('gold',    'Gold',             12, '+{v}% gold', 'all', 5),
  AF('time',    'Life',             20, '+{v} Life', 'all', 4),
  // two that most weapons can do without: one is only for the hand on the mouse, the other only for the fights with many in them
  AF('click',   'Cursor damage',    40, '+{v}% cursor damage', 'all', 6),
  AF('leech',   'Life on kill',      1, '+{v} Life on kill', 'all', 6),
];
D.AFFIX = {}; D.AFFIXES.forEach(a => D.AFFIX[a.id] = a);
/* How many secondary affixes a skill drops with: one or two, never none. From level 5 a skill has a growing chance
   of a second (4% more each level, so every skill has two from level 29). A boss's skill is twice as likely to
   have it. Crafting can add more, up to three, if the prestige tree allows it. */
D.AFFIX_MAX = 3;
D.TWO = { from: 5, step: 0.04, boss: 2 };
D.twoChance = (lvl, boss) => Math.max(0, Math.min(1, (lvl - D.TWO.from + 1) * D.TWO.step * (boss ? D.TWO.boss : 1)));
D.DROP = Math.min(0.6, 0.025 * D.PAY);       // a lone monster's chance to drop a skill; a group's is a little higher (D.ENC). Skills are scarce: about one a level
D.DROP_BOSS = [0.5, 1];                      // a boss drops one every other time, and an act's boss always drops one
D.DROP_EVEN = 0.5;     // how hard drops are pulled back towards what the odds owe: this share of the shortfall goes onto the next fight's chance
D.DROP_HELD = 8;       // and the more skills lie loose in the bag the slower they come: with this many held, half as often; with twice as many, a third
D.DROP_ROW = 30;       // and which skill drops goes by the bag: each copy of a kind already in its row makes that kind this many times less likely, so empty rows fill first
D.DROP_ROWS = 3;       // and that is with this many kinds of skill to drop (a new game's three plain ones): with more kinds open, drops come that much more often
D.STARTER = 3;         // a new game's first fights always drop a skill, until this many have been found: enough to fill the first weapon
D.ROW = 5;             // the bag holds this many of each skill: a sixth is salvaged as it drops
D.BUY = 8;             // a random skill can be bought, at your deepest level, for this many kills' worth of its gold
D.buyCost = lvl => Math.ceil(D.gold(lvl) * D.BUY);

/* The forge works on loose skills, for gold, and does two things: rolls a skill's numbers again, or replaces its
   secondary affixes with as many new ones. It cannot change one affix alone, raise a skill's level, or add an affix. Every price
   is a number of kills' worth of gold at the skill's own level, so an old skill is cheap to work and a new one is
   not. Salvaging a skill pays gold on the same scale. */
D.FORGE = {
  salvage: (lvl, n) => Math.ceil(D.gold(lvl) * 0.5 * (1 + 0.5 * n)),
  strip:   lvl => Math.ceil(D.gold(lvl) * 3),                                        // one affix removed, at random
  recast:  lvl => Math.ceil(D.gold(lvl) * 4),                                        // its secondary affixes replaced by as many new ones; the primary is untouched
};

/* ------------------------------------------------------------ monsters
   hp: share of the level's life. hit: its attack, as a multiple of the level's (D.hit). int: seconds between attacks. */
const M = (name, spr, pal, hp, hit, int) => ({ name, spr, pal, hp, hit, int: int * D.SWING });
D.ACTS = [
  { name: 'Ashen Hollow', sky: ['#1d1a26', '#2c2330'], ground: '#241d22',
    mobs: [M('Ash Rat', 'rat', 'ash', 0.6, 0.5, 1.2), M('Soot Wolf', 'wolf', 'soot', 0.9, 0.8, 1.5), M('Cinder Bandit', 'bandit', 'bandit', 1.0, 0.9, 1.7), M('Bandit Archer', 'caster', 'bandit', 0.75, 1.1, 2.1), M('Ember Boar', 'boar', 'boar', 1.5, 2.2, 3.0)],
    boss: M('Grukk, the Slag Ogre', 'ogre', 'ogre', 1, 1.7, 2.0) },
  { name: 'Cinder Mines', sky: ['#1e1512', '#35201a'], ground: '#2a1c18',
    mobs: [M('Kobold Digger', 'imp', 'kobold', 0.6, 0.6, 1.3), M('Ember Bat', 'bat', 'ember', 0.6, 0.5, 1.0), M('Slag Ooze', 'slime', 'slag', 1.2, 1.0, 1.9), M('Kobold Shaman', 'caster', 'kobold', 0.8, 1.1, 2.2), M('Slag Golem', 'golem', 'slag', 1.8, 2.3, 3.0)],
    boss: M('The Foreman', 'bgolem', 'slag', 1.1, 1.9, 2.2) },
  { name: 'Drowned Crypt', sky: ['#101a20', '#16282c'], ground: '#14201f',
    mobs: [M('Drowned Bones', 'skeleton', 'bone', 0.9, 0.9, 1.6), M('Bone Archer', 'skeleton', 'boneb', 0.65, 1.1, 2.0), M('Crypt Ghoul', 'ghoul', 'ghoul', 1.25, 0.9, 1.5), M('Tide Wraith', 'wraith', 'wraith', 0.8, 1.0, 1.7), M('Necromancer', 'caster', 'necro', 0.9, 1.3, 2.4)],
    boss: M('Morvane, the Drowned Lich', 'lich', 'lich', 1.05, 1.6, 1.9) },
  { name: 'Stormspire', sky: ['#121a34', '#20294a'], ground: '#1a2036',
    mobs: [M('Gale Harpy', 'bat', 'harpy', 0.75, 0.6, 1.05), M('Storm Cultist', 'caster', 'storm', 0.85, 1.2, 2.0), M('Spark Wisp', 'wisp', 'spark', 0.5, 0.7, 1.4), M('Wyrmling', 'wyrm', 'wyrm', 1.2, 0.9, 1.6), M('Gargoyle', 'golem', 'stone', 1.9, 2.2, 2.8)],
    boss: M('Azzurath, the Tempest Wyrm', 'dragon', 'storm', 1.15, 1.5, 1.7) },
  { name: 'Hellforge', sky: ['#200a0c', '#3a1210'], ground: '#2a0f0e',
    mobs: [M('Forge Imp', 'imp', 'hell', 0.6, 0.6, 1.15), M('Hellhound', 'wolf', 'hell', 1.0, 0.8, 1.25), M('Ember Witch', 'caster', 'hell', 0.9, 1.3, 2.2), M('Hell Knight', 'knight', 'hell', 1.5, 1.4, 1.8), M('Chain Brute', 'ghoul', 'hell', 1.9, 2.4, 2.8)],
    boss: M('Vulkar, the Forge Tyrant', 'demon', 'hell', 1.2, 1.7, 1.8) },
];
D.ACT_LEVELS = 5;
D.act = lvl => D.ACTS[Math.floor((lvl - 1) / D.ACT_LEVELS) % D.ACTS.length];
D.lap = lvl => Math.floor((lvl - 1) / (D.ACT_LEVELS * D.ACTS.length));          // how many times round the five acts
D.FIRST_GOLD = { first: 2, again: 0.5 };      // a fight pays this many times its gold the first time it is won in a run, and this many whenever it is won again: gold comes from getting deeper, not from the same ground over and over
D.SLAM = { every: 4, mult: 1.6 };       // an act boss's every fourth swing

D.OFFLINE = { share: 0.5, cap: 8 * 3600, min: 60 };      // away from the game: half your recent gold rate, for up to eight hours
})();
