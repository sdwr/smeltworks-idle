/* Pacing: how long the bot takes to first clear each level, idle and with the cursor striking on cooldown.
   node tests/sim.cjs [hours] [0 = idle only, 1 = active only] */
const { load, play } = require('./harness.cjs');
const hours = +process.argv[2] || 6, only = process.argv[3] != null ? +process.argv[3] : null;
const SW_fmt = n => n < 1e4 ? String(Math.round(n)) : n.toExponential(1);
const hm = s => s < 3600 ? (s / 60).toFixed(1) + 'm' : (s / 3600).toFixed(2) + 'h';
const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0;
for (const mode of only != null ? [only] : [0, 1]) {
  const runs = [1, 2, 3].map(seed => {
    const SW = load(seed, true), G = SW.game, len = { fight: [], boss: [] }; let last = 0;
    // time every fight that was won, from the moment it appeared
    const spawn = G.spawn; G.spawn = function () { if (G.F.enc && !G.F.enc.lost) len[G.F.enc.boss ? 'boss' : 'fight'].push(G.S.stats.time - last); spawn(); last = G.S.stats.time; };
    const list = [], clears = play(SW, hours * 3600, { active: !!mode, runs: list });
    return { SW, clears, len, list };
  });
  console.log(`\n== ${mode ? 'cursor striking on cooldown' : 'idle (the cursor only until there is a weapon)'} · ${hours}h · 3 seeds`);
  const marks = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];
  console.log('level   ' + marks.map(m => String(m).padStart(7)).join(''));
  for (const r of runs) console.log('cleared ' + marks.map(m => (r.clears[m] != null ? hm(r.clears[m]) : '-').padStart(7)).join(''));
  console.log('  a fight lasts ' + runs.map(r => med(r.len.fight).toFixed(1)).join(' / ') + 's, a boss ' + runs.map(r => med(r.len.boss).toFixed(1)).join(' / ') + 's (medians)');
  for (const r of runs) console.log('  runs: ' + (r.list.map((q, i) => `${i + 1}) ${hm(q.secs)} to ${q.reached} [+${q.earned} cores, ${q.nodes} nodes: ${q.posts}w ${q.socks}s T${q.tier}]`).join('   ') || 'never reset'));
  for (const r of runs) {
    const S = r.SW.game.S, X = r.SW.game.X;
    console.log(`  reached ${S.maxLevel}, skills in each weapon ${S.posts.map(P => P.unit ? P.unit.sockets.length : '-').join(' ')}, run ${S.runs + 1}, deepest ${S.best}, ${Object.keys(S.tree).length} nodes held, ${r.SW.game.cores()} cores banked, weapons ${S.posts.length}, sockets ${r.SW.game.craftSockets()}, made ${S.stats.made}, bought ${S.stats.bought}, gold ${SW_fmt(S.gold)}, fails ${S.stats.fails}, life ${Math.round(X.lifeMax)}, cooldown ${X.cooldown.toFixed(2)}s`);
  }
}
