/* Smeltworks Idle — everything in the page that is not the canvas. Panes are rebuilt when the game says something
   changed; the numbers that move every frame (gold, your Life, the enemy's, the cooldown, what you can afford) are patched in place. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, G = SW.game, SP = SW.sprites, AU = SW.audio, AR = SW.arena;
const UI = SW.ui = { born: {}, upAt: {}, sel: null, down: false, dragging: null, dirty: true, fresh: new Set(), hold: false, hx: 0, hy: 0 };
const $ = id => document.getElementById(id);
const fmt = U.fmt, fmt1 = U.fmt1, esc = U.esc;
const ci = k => `<i class="ci ${k}"></i>`;
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* ------------------------------------------------------------------ words */
const AURA_NOTE = 'Auras do not stack.';
const NOTES = {
  frost: () => `Chilled: attacks ${D.CHILL}% slower.`,
  concuss: () => `Stunned: cannot attack. Immune for ${D.STUN.immune}s after.`,
  shatter: () => `Stacks last ${D.BRITTLE.dur}s; hits renew them.`,
  ignite: () => `Burns over ${D.BURN_SECS}s.`,
  twin: () => 'The second blow picks its own target.',
  nova: () => 'Criticals apply to every enemy hit.',
  savage: () => 'Added to the double a critical already deals.',
  warcry: () => AURA_NOTE, rally: () => AURA_NOTE, ward: () => AURA_NOTE,
};
const skillText = gem => D.SKILL[gem.sk].text.replace('{v}', G.primVal(gem)).replace('{d}', D.HEX_DUR).replace('{p}', D.BRITTLE.per).replace('{m}', D.BRITTLE.max);
const affText = (gem, a) => D.AFFIX[a.k].text.replace('{v}', G.affVal(gem, a));
/* an affix's tier, beside it: T3. Each of the five tiers has its own colour, the same on every skill (a tier 2 affix
   looks the same whether it is the best its skill could roll or not), and a skill's own tier badge uses them too */
const tierTag = (gem, a) => `<span class="tier t${a.t}" data-tip-text="Tier ${a.t} of ${D.tier(gem.lvl)}">T${a.t}</span>`;
const palOf = u => D.PALS[U.clamp(u.sockets.length, 1, D.PALS.length) - 1];
function whereText(at) { return at.bag != null ? 'In your bag' : 'On the bench'; }

/* ------------------------------------------------------------------ pieces */
function gemHTML(gem) {
  const sk = D.SKILL[gem.sk];
  return `<div class="gem c-${sk.c}${UI.sel === gem.id ? ' sel' : ''}${gem.nw ? ' fresh' : ''}${UI.fresh.has(gem.id) ? ' new' : ''}" data-gem="${gem.id}" draggable="true">` +
    `<img src="${SP.url('g_' + sk.glyph, 'glyph', 3)}" alt=""><span class="pips">${'<i></i>'.repeat(gem.aff.length)}</span><i class="glv t${D.tier(gem.lvl)}">T${D.tier(gem.lvl)}</i>${gem.lock ? '<i class="lock">🔒</i>' : ''}</div>`;
}
/* can the selected (or dragged) skill go in this socket right now? Only the weapon on the bench has sockets. */
function canPlace(id, post, i) {
  const at = id != null && G.find(id); if (!at) return false;
  if (at.post === post && at.i === i) return false;
  if (!G.fits(at.gem, post, i)) return false;
  const there = G.S.bench.sockets[i].gem;
  return at.bag != null || !there || UI.dragging != null;       // a socketed skill only moves to an empty socket by clicking
}
function sockHTML(post, i) {
  const S = G.S, c = G.sockColor(post, i), gem = S.bench.sockets[i].gem;
  return `<div class="sock c-${c || 'n'}${canPlace(UI.sel, post, i) ? ' ok' : ''}" data-sock="${post}:${i}"${gem ? '' : ` data-tip-text="Takes ${D.COLORS[c].name} skills. Right-click a skill to socket it."`}>${gem ? gemHTML(gem) : ''}</div>`;
}
/* a made weapon's skills, as what they have become. Each primary affix is an effect, shown as a tag in its colour
   (a weapon holds one of each). The secondary affixes are a plain list of stats underneath, added together.
   An aura that a stronger one in the line has outdone is shown dimmed: it is doing nothing. */
/* which post's aura is the one that counts: the first that has one */
const auraHolder = sk => G.S.posts.findIndex(P => P.unit && G.unitGems(P.unit).some(g => g.sk === sk));
function statHTML(u, post) {
  const gems = G.unitGems(u); if (!gems.length) return '<div class="statlist"><span class="none">No skills</span></div>';
  const tags = new Map(), sums = {}, r1 = v => Math.round(v * 10) / 10;
  for (const g of gems) {
    const sk = D.SKILL[g.sk], v = G.primVal(g), t = tags.get(sk.id) || { sk, v: 0, n: 0 };
    if (!sk.plain) { t.v = sk.aura ? Math.max(t.v, v) : t.v + v; t.n++; tags.set(sk.id, t); }       // a plain skill has no effect to show: only its stats, below
    for (const a of g.aff) sums[a.k] = (sums[a.k] || 0) + G.affVal(g, a);
  }
  let h = '<div class="chips">';
  for (const t of [...tags.values()].sort((a, b) => 'rbg'.indexOf(a.sk.c) - 'rbg'.indexOf(b.sk.c))) {
    const v = t.v;
    const dull = t.sk.aura && auraHolder(t.sk.id) !== post;
    h += `<span class="chip c-${t.sk.c}${dull ? ' dull' : ''}" data-tip-text="${esc(t.sk.name + ': ' + t.sk.text.replace('{v}', r1(v)).replace('{d}', D.HEX_DUR).replace('{p}', D.BRITTLE.per).replace('{m}', D.BRITTLE.max) + (dull ? ' (already active: no effect)' : ''))}">${t.sk.short.replace('{v}', r1(v))}${t.sk.id === 'nova' && post != null ? `<i class="chg" data-nova="${post}"></i>` : ''}</span>`;
  }
  h += '</div>';
  const lines = [];
  for (const a of D.AFFIXES) if (sums[a.id]) lines.push(a.text.replace('{v}', r1(sums[a.id])));
  if (lines.length) h += '<div class="statlist">' + lines.map(l => `<span>${l}</span>`).join('') + '</div>';
  return h;
}
/* what a holder's blows do beyond their target, for its stats line */
function aoeText(W, cursor) {
  const out = [];
  if (W.splash > 0) out.push('splash ' + Math.round(W.splash) + '%');
  if (W.arcN > 0) out.push((W.arcN > 1 ? W.arcN + ' arcs ' : 'arc ') + Math.round(W.arc) + '%');
  if (W.pierce > 0 && !cursor) out.push('pierce ' + Math.round(W.pierce) + '%');
  if (W.nova > 0) out.push('shock ' + Math.round(W.nova) + '%');
  return out.length ? ' · <span class="aoe">' + out.join(' · ') + '</span>' : '';
}
const POWER_TIP = 'Estimated damage per second on one enemy';
const DPS_TIP = 'Damage per second, last 30s';
/* measured dps as it is shown: read every DPS_EVERY seconds, so the numbers sit still long enough to be read */
const DPS_EVERY = 2.5, shownDps = {};
let dpsAt = -9;
function readDps(force) {
  const now = performance.now() / 1000; if (!force && now - dpsAt < DPS_EVERY) return;
  dpsAt = now;
  shownDps[-1] = fmt1(G.actual(-1)); G.S.posts.forEach((P, p) => { shownDps[p] = fmt1(P.unit ? G.actual(p) : 0); });
  for (const el of document.querySelectorAll('[data-dps]')) setText(el, shownDps[el.dataset.dps] || '0');
}

/* ------------------------------------------------------------------ the line (left) */
const UP_SECS = 0.9;                            // and how long a weapon's whole card flashes when it is upgraded
const NEW_SECS = 3.2;                           // how long a newly made weapon's card and post glow
function renderLine() {
  const S = G.S, X = G.X, C = X.cursor, now = performance.now() / 1000;
  let h = `<div class="card cursor"><div class="pic" data-tip-text="Click or hold on an enemy. Auras affect it."><img src="${SP.url('pointer', 'ember', 3)}" alt=""><div class="cdbar"><i id="cd-fill"></i></div></div>
    <div class="who"><b>Cursor</b><span class="dps"><b>${fmt1(C.dmg)}</b> a hit · <span data-tip-text="${DPS_TIP}"><b data-dps="-1">${shownDps[-1] || '0'}</b> dps</span></span></div>
    <div class="stats">${X.cooldown.toFixed(2)}s cooldown · ${Math.round(C.crit)}% crit${aoeText(C, true)}</div>
    </div>`;
  if (S.posts.length) h += `<div class="linehead"><h4>Weapons - ${S.posts.filter(P => P.unit).length}/${S.posts.length}</h4></div>`;       // how many are equipped, of the slots there are       // nothing about troops until there is a post
  // the cursor and that heading stay put; the weapons scroll beneath them, in a box of their own
  h += '<div class="posts">';
  S.posts.forEach((P, p) => {
    if (!P.unit) { h += `<div class="card empty" data-post="${p}"><div class="pic"></div><div class="who"><b>Empty weapon slot</b></div><div class="stats">&nbsp;</div><div class="statlist"><span class="none">&nbsp;</span></div>${G.treeVal('uUp') ? '<div class="uprow"></div>' : ''}</div>`; return; }      // laid out like a weapon with no skills, so the line does not jump when one is equipped
    const u = P.unit, W = X.units[p], wd = D.WEAPONS[u.type], age = UI.born[u.id] != null ? now - UI.born[u.id] : 99, upAge = UI.upAt[u.id] != null ? now - UI.upAt[u.id] : 99, scrap = G.scrapValue(u);
    const lit = upAge < UP_SECS ? ['upglow', upAge] : age < NEW_SECS ? ['isnew', age] : null;      // an upgrade's flash, or a new weapon's glow: whichever is the more recent
    h += `<div class="card post${lit ? ' ' + lit[0] : ''}" data-post="${p}"${lit ? ` style="animation-delay:-${lit[1].toFixed(2)}s"` : ''}><div class="pic" data-tip-text="${esc(G.unitName(u))}: ${wd.note} Overkill carries to ${wd.carry} more."><img src="${SP.url(wd.spr, palOf(u), 3)}" alt=""><div class="cdbar"><i data-cd="${p}"></i></div></div>
      <div class="who"><b>${esc(G.unitName(u))}${u.up ? ` <i class="rank" data-tip-text="Upgraded: +${u.up * D.UP.dmg}% damage">+${u.up}</i>` : ''}</b><span class="dps"><span data-tip-text="${POWER_TIP}"><b>${fmt1(W.power)}</b> power</span> · <span data-tip-text="${DPS_TIP}"><b data-dps="${p}">${shownDps[p] || '0'}</b> dps</span></span>
        <button class="x" data-act="sell" data-post="${p}" data-tip-text="Scrap${scrap ? ' for ' + fmt(scrap) + ' gold' : ''}">✕</button></div>
      <div class="stats">${fmt1(W.dmg)} dmg · every ${(1 / W.aps).toFixed(1)}s · ${Math.round(W.crit)}% crit${aoeText(W, false)}</div>
      ${statHTML(u, p)}
      ${G.treeVal('uUp') ? `<div class="uprow"><div class="upbar${(u.up || 0) >= D.UP.max ? ' max' : ''}" data-tip-text="+${D.UP.dmg}% damage a rank"><i style="width:${100 * (u.up || 0) / D.UP.max}%"></i></div><span class="upn"><b>+${u.up || 0}</b> / ${D.UP.max}</span>
        ${(u.up || 0) < D.UP.max ? `<button class="small uprank${glow('upgrade')}" data-act="upgrade" data-post="${p}" data-cost="${G.upCost(u)}" data-cur="gold" data-tip-text="+${D.UP.gain[0]} to +${D.UP.gain[1]} ranks">Upgrade · ${ci('gold')}${fmt(G.upCost(u))}</button>` : ''}</div>` : ''}</div>`;
  });
  h += '</div>';
  // (the box is drawn again each time: it keeps its place)
  const was = $('line').querySelector('.posts'), top = was ? was.scrollTop : 0;
  $('line').innerHTML = h;
  if (top) $('line').querySelector('.posts').scrollTop = top;
}

/* how the weapon on the bench stands against the line: a green arrow up if it has more power than one that is
   equipped (the weakest: that is the one it would replace), a red arrow down if it has less than every one of them */
function benchArrow() {
  const X = G.X, on = G.S.posts.map((P, p) => P.unit ? { u: P.unit, pw: X.units[p].power } : null).filter(Boolean); if (!on.length) return '';
  const pw = X.bench.power, low = on.reduce((a, b) => b.pw < a.pw ? b : a);
  if (pw > low.pw) return `<i class="cmp up" data-tip-text="Stronger than your ${esc(G.unitName(low.u))} (${fmt1(low.pw)} power)">▲</i>`;
  if (pw < low.pw) return `<i class="cmp down" data-tip-text="Weaker than every weapon equipped">▼</i>`;
  return '';
}
/* ------------------------------------------------------------------ the Forge (top right, above the skills): the weapon crafter, as the code still calls it */
function renderBench() {
  const S = G.S, X = G.X, B = S.bench, wd = D.WEAPONS[B.type], free = G.emptyPost() >= 0, n = G.craftSockets();
  $('shop').classList.toggle('hidden', !S.posts.length); if (!S.posts.length) { $('shop').innerHTML = ''; return; }       // locked: not shown at all
  const part = G.benchCost(), empty = B.sockets.filter(s => !s.gem).length, cost = G.makeCost();
  const head = `<div class="shophead"><h4>Forge</h4></div>`;
  // sockets the tree has unlocked that this weapon did not roll: faint outlines after its own
  const lost = B.made ? '<div class="sock ghost" data-tip-text="Not rolled"></div>'.repeat(Math.max(0, n - B.sockets.length)) : '';
  const forge = `<div class="forgebar"><i data-forge></i><span>Forging</span></div>`;
  const make = cls => `<button class="${cls}" data-act="make" data-cost="${cost}" data-cur="gold" data-tip-text="${B.made ? 'Forge a new weapon' : ''}">${B.made ? 'New' : 'Forge weapon'} · ${ci('gold')}${fmt(cost)}</button>`;
  // nothing on the bench: the anvil, and Make
  if (!B.made) { $('shop').innerHTML = head + `<div class="bench blank${S.forge ? ' forging' : ''}"><div class="pic"><span class="anvil"></span></div><div class="what"><span class="dim">${S.forge ? '' : 'No weapon'}</span></div>${S.forge ? forge : make('big')}</div>`; return; }
  $('shop').innerHTML = head + `
    <div class="bench${S.forge ? ' forging' : ''}">
      <div class="pic"><img src="${SP.url(wd.spr, D.PALS[U.clamp(B.sockets.length, 1, D.PALS.length) - 1], 3)}" alt=""></div>
      <div class="what"><div class="who"><b>${esc(G.unitName(B))}</b><span class="dps" data-tip-text="${POWER_TIP}"><b>${fmt1(X.bench.power)}</b> power</span>${benchArrow()}</div>
        <div class="stats"><span>${fmt1(X.bench.dmg)} dmg every ${(1 / X.bench.aps).toFixed(1)}s · ${Math.round(X.bench.crit)}% crit${aoeText(X.bench, false)}</span></div></div>
      <div class="bsocks">${B.sockets.map((s, i) => sockHTML(G.BENCH, i)).join('')}${lost}</div>
      ${G.treeVal('uReroll') && !S.forge ? `<div class="bbtns${glow('rerolls')}"><span class="dim">Reroll</span>
        <button class="small" data-act="bench-type" data-cost="${part}" data-cur="gold" data-tip-text="New type; sockets stay">Type · ${ci('gold')}${fmt(part)}</button>
        ${n ? `<button class="small" data-act="bench-socks" data-cost="${part}" data-cur="gold" data-tip-text="New socket colours; type stays">Sockets · ${ci('gold')}${fmt(part)}</button>` : ''}</div>` : ''}
      ${S.forge ? forge : `<div class="bmake"><button class="big${free ? '' : ' off'}" data-act="equip" data-tip-text="${free ? (empty ? plural(empty, 'empty socket') + ' will be lost' : '') : 'No free weapon slot. Scrap one weapon first (the ✕ on its card).'}">Equip</button>${make('remake')}</div>`}
      ${G.hasSpare() && !S.forge ? `<button class="small swap${glow('bench2')}" data-act="bench-swap" data-tip-text="${S.spare ? esc(G.unitName(S.spare)) + ' is set aside' : 'Set this weapon aside'}">⇄ ${S.spare ? `Swap with the ${esc(G.unitName(S.spare))} set aside` : 'Set aside and start another'}</button>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ skills and the forge (right) */
/* A craft that takes an affix off a skill or puts one on shows it happen: the one removed turns red, is struck through
   and closes up; a new one slides in lit gold (every one of them, when the affixes are rerolled). The panel is drawn
   again while that plays, so what is playing is kept here, with when it began. */
const AFF_FX = 0.7;
function affFx(gem, before) {
  const gone = before.findIndex(a => !gem.aff.includes(a)), fresh = gem.aff.map((a, k) => before.includes(a) ? -1 : k).filter(k => k >= 0);
  const all = fresh.length && fresh.length === gem.aff.length && before.length === gem.aff.length;      // rerolled: the old ones are not shown going, only the new ones coming
  UI.affFx = { gem: gem.id, at: performance.now() / 1000, in: fresh, out: gone >= 0 && !all ? { i: gone, a: before[gone] } : null };
}
function detailHTML() {
  const at = UI.sel != null && G.find(UI.sel);
  if (!at) return '';
  const gem = at.gem, sk = D.SKILL[gem.sk], col = D.COLORS[sk.c];
  const fxT = UI.affFx && UI.affFx.gem === gem.id ? performance.now() / 1000 - UI.affFx.at : 99, fx = fxT < AFF_FX ? UI.affFx : null, fxDelay = ` style="animation-delay:-${Math.max(0, fxT).toFixed(2)}s"`;
  const ghost = k => fx && fx.out && fx.out.i === k ? `<div class="aff affout"${fxDelay}>${tierTag(gem, fx.out.a)}<span class="txt">${affText(gem, fx.out.a)}</span></div>` : '';
  // the primary affix is flat; each secondary affix shows the tier it rolled
  let h = `<div id="detail"><div class="name">${gemHTML(gem)}<b class="t-${sk.c}">${sk.name}</b><span class="tname t${D.tier(gem.lvl)}">Tier ${D.tier(gem.lvl)}</span></div>
    ${sk.plain ? '' : `<div class="aff prim"><span class="txt">${skillText(gem)}</span></div>`}`;
  gem.aff.forEach((a, k) => { h += ghost(k) + `<div class="aff${fx && fx.in.includes(k) ? ' affin' : ''}"${fx && fx.in.includes(k) ? fxDelay : ''}>${tierTag(gem, a)}<span class="txt">${affText(gem, a)}</span></div>`; });
  h += ghost(gem.aff.length);      // (the last one was the one removed)
  if (!gem.aff.length && !(fx && fx.out)) h += `<div class="aff none"><span class="txt dim">No secondary affix</span></div>`;
  // every way to craft it that is unlocked: one the prestige tree has not given yet is not shown at all
  h += `<div class="forge">`;
  for (const c of D.CRAFTS) {
    if (c.pick || !G.craftUnlocked(c.id)) continue;       // (Replace one affix sits beside each affix, above)
    const can = c.can(gem), cost = G.craftCost(c.id, gem), why = typeof c.why === 'function' ? c.why(gem) : c.why || '';
    h += `<button class="cr${glow('craft-' + c.id)}" data-act="craft" data-kind="${c.id}" ${can ? `data-cost="${cost}" data-cur="gold"` : 'data-off'}>${c.name} · ${ci('gold')}${fmt(cost)}<small>${can ? c.text(gem) : why}</small></button>`;
  }
  h += `
  </div>${NOTES[gem.sk] ? `<div class="hint">${NOTES[gem.sk]()}</div>` : ''}
  <div class="hint keys"><kbd>Right-click</kbd> ${at.bag != null ? 'socket' : 'remove'} &nbsp; <kbd>Shift-click</kbd> salvage ${ci('gold')}${fmt(G.salvageValue(gem))} &nbsp; <kbd>Alt-click</kbd> ${gem.lock ? 'unlock' : 'lock'}</div></div>`;
  return h;
}
/* The Skills tab is one of two things. With nothing selected it is the bag: a row for each skill (its primary
   affix), in the order of colour, holding up to D.ROW of it, the highest level first; the box scrolls inside itself.
   Click a skill and the bag gives way to that skill's crafting; Back (or Esc) returns. A right click sockets it. */
function renderSkills() {
  const S = G.S, el = $('tab-skills'), at = UI.sel != null && G.find(UI.sel), old = $('bag');
  if (old) UI.bagScroll = old.scrollTop;
  if (at) {
    el.innerHTML = `<div class="baghead"><button class="backbtn" data-act="back">◀ All skills</button></div>` + detailHTML();
    return;
  }
  if (!G.skillsOn()) { el.innerHTML = ''; return; }       // locked: not shown at all (see lockSkills)
  const now = G.dropping(), full = !now.some(k => G.hasRoom(k.id));
  let h = `<div class="baghead"><h4>Skills</h4><span>${S.bag.length}${full ? ' · <b class="bad">full</b>' : ''}</span><button class="small" data-act="salvage-loose">Salvage all</button></div>
    ${G.treeVal('uBuy') ? `<button class="buyskill${glow('market')}" data-act="buy-skill" ${full ? 'data-off' : `data-cost="${G.buyCost()}" data-cur="gold"`} data-tip-text="${full ? 'Bag full' : ''}">Buy a skill · ${ci('gold')}${fmt(G.buyCost())}</button>` : ''}
    <div id="bag">`;
  for (const sk of D.ALL_SKILLS) {         // a row for each skill that can come to you now, and for any other you still hold
    const mine = S.bag.filter(g => g.sk === sk.id), n = Math.max(D.ROW, mine.length);
    if (!mine.length && !now.includes(sk)) continue;
    h += `<div class="brow c-${sk.c}"><span class="bname t-${sk.c}" ${sk.plain ? '' : `data-tip-text="${esc(sk.name + ': ' + sk.text.replace('{v}', sk.v).replace('{d}', D.HEX_DUR).replace('{p}', D.BRITTLE.per).replace('{m}', D.BRITTLE.max))}"`}>${sk.name}</span>`;
    for (let i = 0; i < n; i++) h += `<div class="slot">${mine[i] ? gemHTML(mine[i]) : ''}</div>`;
    h += '</div>';
  }
  el.innerHTML = h + `</div><div class="hint keys"><kbd>Click</kbd> craft &nbsp; <kbd>Right-click</kbd> socket<br><kbd>Shift-click</kbd> salvage &nbsp; <kbd>Alt-click</kbd> lock</div>`;
  $('bag').scrollTop = UI.bagScroll || 0;
}
/* the Prestige window: a popup of its own, opened from beside the level. It holds the tree. During a run the tree
   is only shown, and the one button ends the run; between runs every node can be taken or given back, and the one
   way out is to begin the next run. It is redrawn only while it is open. */
/* the popup for a node of the tree: what it is, what it gives, what you would have of it, and whether it can be taken */
function nodeTip(n) {
  const S = G.S, E = D.TREE_EFF[n.eff], held = G.has(n.id);
  let h = `<div class="tn" style="color:${E.col}">${E.name}</div><div class="tp">${E.text(n.amt)}</div>`;
  if (held) return h + (!S.alloc ? '' : G.canRemove(n.id) ? `<div class="tk">Unspec for ${ci('core')}${fmt(G.nodeCost(n.id))}</div>` : '<div class="tk">Other nodes hang from it</div>');
  const c = G.nodeCost(n.id), poor = c - G.cores();
  h += `<div class="tc${poor > 0 ? ' poor' : ''}">${ci('core')}${fmt(c)}</div>`;
  if (!S.alloc) return h;
  const ok = G.canAllocate(n.id);
  return h + `<div class="${ok ? 'tk' : 'tf'}">${ok ? 'Click to buy' : !G.touches(n.id) ? 'Not connected' : `${fmt(poor)} short`}</div>`;
}
/* The tree, drawn. Three shapes of big node, so that what a node is can be read from across the room: a hexagon is a
   hub (a troop post, a socket, the second bench), a rounded square unlocks something (rerolls, the market, a colour
   of skill), and a ringed circle is a notable. Small nodes are beads on the paths between them. A path you hold
   glows in its theme's colour; the ones you could take next are lit and pulse. The background is plain black, with
   each quarter's name on it. */
const HEXPTS = r => [0, 1, 2, 3, 4, 5].map(i => (Math.cos(Math.PI / 3 * i + Math.PI / 6) * r).toFixed(1) + ',' + (Math.sin(Math.PI / 3 * i + Math.PI / 6) * r).toFixed(1)).join(' ');
const nodeShape = n => !n.big ? 'bead' : /^(post|sock)2?$/.test(n.eff) || n.eff === 'bench2' ? 'hub' : /^u[A-Z]/.test(n.eff) ? 'key' : 'notable';      // the block of nine round the start is all squares
/* When the page opens the tree ripples out from its centre, twice: a faint ring spreads from the first node and each
   path and node comes up softly as it passes, then a second ring follows and they brighten a little once more. It is
   slow and quiet. The page is drawn again while that plays (and it must not start over), so every delay is counted
   from when the page opened. */
const RIPPLE = { spread: 1.5, reach: 640, fade: 1.3, gap: 0.62 };      // seconds for a ripple to get from the centre to `reach` (the tree's far edge); how long a node's two swells take; and how far the second ripple is behind the first
function treeSVG() {
  const at = id => id === 'start' ? { x: 0, y: 0 } : D.NODE[id];
  const rt = performance.now() / 1000 - (UI.presAt == null ? -99 : UI.presAt), rip = rt < RIPPLE.spread + RIPPLE.fade + 0.4, ring = RIPPLE.spread * 740 / RIPPLE.reach;      // (a ring is drawn out to 740, at the ripple's own pace)
  const rd = (x, y) => rip ? `animation-delay:${(Math.hypot(x, y) / RIPPLE.reach * RIPPLE.spread - rt).toFixed(2)}s;` : '';
  let h = `<svg id="tree"${rip ? ' class="ripple"' : ''} viewBox="-615 -372 1230 744" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="gorb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
    </defs>
    <g class="bg">
      <text class="region" x="-575" y="-318" style="--c:#ff9a4a">ARSENAL</text><text class="region" x="575" y="-318" text-anchor="end" style="--c:#b48cff">WORKSHOP</text>
      <text class="region" x="0" y="-348" text-anchor="middle" style="--c:#5aa8ff">CONTROL</text><text class="region" x="0" y="360" text-anchor="middle" style="--c:#ff5a48">ATTRITION</text>
    </g>${rip ? [0.12, 0.12 + RIPPLE.gap].map(d => `<circle class="ripwave" r="100" style="animation-duration:${ring.toFixed(2)}s;animation-delay:${(d - rt).toFixed(2)}s"/>`).join('') : ''}<g class="links">`;
  for (const n of D.TREE) for (const l of n.links) {
    const a = at(l), on = G.has(n.id) && G.has(l), next = !on && ((G.has(l) && G.canAllocate(n.id)) || (G.has(n.id) && l !== 'start' && G.canAllocate(l)));
    h += `<line class="link${on ? ' on' : next ? ' next' : ''}" style="--c:${D.TREE_EFF[n.eff].col};${rd((a.x + n.x) / 2, (a.y + n.y) / 2)}" x1="${a.x}" y1="${a.y}" x2="${n.x}" y2="${n.y}"/>`;
  }
  h += `</g><g class="startnode"><circle r="35" class="halo"/></g>`;
  for (const n of D.TREE) {
    const E = D.TREE_EFF[n.eff], held = G.has(n.id), edge = !held && G.touches(n.id), open = edge && G.canAllocate(n.id), shape = nodeShape(n), R = shape === 'hub' ? 27 : n.big ? 21 : 7.5;      // a hub is the biggest thing on the tree: it matters most
    h += `<g class="node ${shape}${n.eff === 'tier' ? ' tier' : ''}${n.big ? ' big' : ''}${held ? ' held' : open ? ' open' : edge ? ' edge locked' : ' locked'}" style="--c:${E.col};${rd(n.x, n.y)}" data-act="node" data-node="${n.id}" transform="translate(${n.x} ${n.y})"><circle class="hit" r="${R + 7}"/>`;
    if (shape === 'bead' && n.eff === 'tier') h += `<rect class="ring" x="-7.5" y="-7.5" width="15" height="15" rx="1.5" transform="rotate(45)"/>${held ? '' : '<circle class="pip" r="2.6"/>'}`;      // a skill tier: a diamond, to be found at a glance
    else if (shape === 'bead') h += `<circle class="ring" r="${R}"/>${held ? `<circle class="shine" r="${R}"/>` : '<circle class="pip" r="2.6"/>'}`;
    else {
      if (shape === 'hub') h += `<polygon class="ring" points="${HEXPTS(R)}"/><polygon class="inner" points="${HEXPTS(R - 5.5)}"/>`;
      else if (shape === 'key') h += `<rect class="ring" x="${-R + 1}" y="${-R + 1}" width="${2 * R - 2}" height="${2 * R - 2}" rx="7"/><rect class="inner" x="${-R + 5}" y="${-R + 5}" width="${2 * R - 10}" height="${2 * R - 10}" rx="4"/>`;
      else h += `<circle class="ring" r="${R}"/><circle class="inner" r="${R - 4.5}"/>`;
      // a big node is known by its icon: its name is in the tooltip
      h += `<path class="ico" transform="${shape === 'hub' ? 'scale(1.3) ' : ''}translate(-12 -12)" d="${D.TREE_ICON[n.eff]}"/>`;
    }
    if (edge) h += `<text class="price" y="${-R - 5}">${fmt(G.nodeCost(n.id))}</text>`;      // what the next steps cost: always above the node
    h += '</g>';
  }
  return h + '</svg>';
}
function renderCores() {
  if (!UI.pres) return;
  const S = G.S;
  let h = `<div class="preshead"><h3>Prestige</h3><span class="ppts">${ci('core')}<b class="free">${fmt(G.cores())}</b> ${G.cores() === 1 ? 'core' : 'cores'}</span>`;
  if (S.alloc) h += `<span class="pnote"></span>
      <div class="pbtns"><button class="big" data-act="begin-run">Begin run ${S.runs + 1}</button></div>`;
  h += '</div>' + treeSVG();
  const box = $('pres-box'); box.innerHTML = h;
  $('prestige').classList.toggle('alloc', !!S.alloc);
}
UI.render = function () {
  if (!UI.dirty || UI.down || UI.dragging != null) return;
  UI.dirty = false;
  if (UI.sel != null && !G.find(UI.sel)) UI.sel = null;
  lockSkills(); renderLine(); renderBench(); renderSkills(); renderCores();
  UI.fresh.clear(); retip();
  lastCosts = ''; patch(true);
};
UI.redraw = () => { UI.dirty = true; };

/* ------------------------------------------------------------------ what moves every frame */
let lastCosts = '', patchT = 0, pipKey = '', statKey = '';
const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
/* one blow at the anvil: the sound, the weapon jolts, and sparks fly off it */
function tink(at) {            // at: the weapon struck, if it is not the one on the bench (an upgrade on the line)
  AU.play('tink', 0);
  const pic = document.querySelector(at || '#shop .bench .pic'); if (!pic) return;
  pic.classList.remove('strike'); void pic.offsetWidth; pic.classList.add('strike');
  for (let i = 0; i < 9; i++) {
    const sp = document.createElement('i'), a = -Math.PI * (0.1 + 0.8 * Math.random()), d = 26 + Math.random() * 44;
    sp.className = 'spark'; sp.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px'); sp.style.setProperty('--dy', (Math.sin(a) * d).toFixed(0) + 'px'); sp.style.animationDuration = (0.35 + Math.random() * 0.3).toFixed(2) + 's';
    pic.appendChild(sp); setTimeout(() => sp.remove(), 700);
  }
}
function goldGlint(n) {
  const bar = $('goldbar'); bar.classList.remove('gain'); void bar.offsetWidth; bar.classList.add('gain');
  const f = document.createElement('em'); f.textContent = '+' + fmt(n); bar.appendChild(f); setTimeout(() => f.remove(), 950);
}
function patch(force) {
  const S = G.S, F = G.F, X = G.X, enc = F.enc;
  setText($('cur-gold'), fmt(Math.floor(S.gold))); setText($('cur-cores'), fmt(G.cores())); setText($('cur-best'), String(S.best));
  // gold coming in: the meter glints, and what came floats up beside it (gathered over a moment, so a pack's worth is one number)
  { const gold = Math.floor(S.gold), now = performance.now();
    if (UI.goldWas != null && gold > UI.goldWas) UI.goldGain = (UI.goldGain || 0) + gold - UI.goldWas;
    UI.goldWas = gold;
    if (UI.goldGain && now - (UI.goldT || 0) > 400) { goldGlint(UI.goldGain); UI.goldGain = 0; UI.goldT = now; } }
  // life, and the cursor's cooldown
  const frac = U.clamp(F.life / X.lifeMax, 0, 1), lf = $('life-fill');
  lf.style.transform = `scaleX(${frac})`; lf.classList.toggle('low', frac < 0.3);
  setText($('life-txt'), 'Life ' + Math.max(0, Math.ceil(F.life)) + ' / ' + Math.round(X.lifeMax));
  const cd = $('cd-fill'); if (cd) { const r = G.ready(); cd.style.transform = `scaleX(${r})`; cd.classList.toggle('ready', r >= 1); }
  { const fb = document.querySelector('#shop [data-forge]'); if (fb && S.forge) fb.style.transform = `scaleX(${U.clamp(1 - S.forge.left / D.FORGE_SECS, 0, 1)})`; }
  // each weapon's own bar fills towards its next blow, and a Shockwave's towards its next strike
  for (const el of document.querySelectorAll('#line [data-nova]')) el.style.transform = `scaleX(${U.clamp((G.F.nova[+el.dataset.nova] || 0) / G.X.novaEvery, 0, 1)})`;
  for (const el of document.querySelectorAll('#line [data-cd]')) el.style.transform = `scaleX(${U.clamp(G.F.cd[+el.dataset.cd] || 0, 0, 1)})`;
  // the encounter: its name, how many are left, and their life added together
  if (enc) {
    let hp = 0, left = 0, lead = null;
    for (const e of F.es) if (!e.dead) { hp += e.hp; left++; if (!lead || e.max > lead.max) lead = e; }
    const en = $('e-name'); setText(en, enc.name + (enc.n > 1 ? '  ·  ' + left + ' left' : '')); en.classList.toggle('boss', !!enc.boss);
    $('hp-fill').style.transform = `scaleX(${U.clamp(hp / enc.max, 0, 1)})`;
    setText($('hp-txt'), fmt(Math.max(0, Math.ceil(hp))) + ' / ' + fmt(enc.max));
    // afflictions are each enemy's own (the pips over its head); the chips name those on the biggest one standing
    const st = [], e = lead;
    if (e) {
      if (e.chill > 0) st.push(['chill', 'Chilled']);
      if (e.stun > 0) st.push(['stun', 'Stunned']); if (e.brit > 0) st.push(['brit', 'Brittle ×' + e.brit]); if (G.burning(e)) st.push(['burn', 'Burning']);
    }
    const key = st.map(x => x[1]).join();
    if (key !== statKey) { statKey = key; $('e-status').innerHTML = st.map(x => `<span class="st-${x[0]}">${x[1]}</span>`).join(''); }
  }
  // the level
  const pk = S.level + ':' + S.fight + ':' + S.maxLevel + ':' + S.auto;
  if (pk !== pipKey || force) {
    pipKey = pk;
    const lap = D.lap(S.level);
    setText($('lv-n'), 'Level ' + S.level); setText($('lv-act'), D.act(S.level).name + (lap ? ' · lap ' + (lap + 1) : '') + (S.level < S.maxLevel ? ' · cleared' : ''));
    let h = ''; for (let i = 0; i < D.FIGHTS; i++) h += `<i class="${i < S.fight ? 'done' : i === S.fight ? 'now' : ''}${G.isBoss(i) ? ' boss' : ''}"></i>`;
    $('pips').innerHTML = h;
    $('lv-prev').disabled = S.level <= 1; $('lv-next').disabled = S.level >= S.maxLevel;
  }
  // what you can afford: checked a few times a second
  patchT -= 1; if (patchT > 0 && !force) return; patchT = 8;
  const have = { gold: S.gold };
  for (const b of document.querySelectorAll('[data-cost]')) b.disabled = b.hasAttribute('data-off') || have[b.dataset.cur] < +b.dataset.cost;
  for (const b of document.querySelectorAll('button[data-off]')) b.disabled = true;
  const earn = G.runCores(), can = G.canPrestige(), pb = $('btn-prestige'), key = (S.alloc ? 'a' : can ? 'y' : 'e') + earn + ':' + G.cores();
  if (pb.dataset.k !== key) {
    // it glows once this run has earned enough to buy something the bank alone could not
    let worth = false; if (can && earn > 0) for (const n of D.TREE) if (G.touches(n.id)) { const c = G.nodeCost(n.id); if (c > G.cores() && c <= G.cores() + earn) { worth = true; break; } }
    pb.dataset.k = key; pb.classList.toggle('on', worth); pb.classList.toggle('can', can); pb.classList.toggle('cannot', !can);
    pb.innerHTML = S.alloc ? 'Between runs' : !can ? 'Prestige' : `Prestige <span class="dim">for</span> ${ci('core')}<b>${fmt(earn)}</b>`;
    pb.dataset.tipText = can ? 'Ends the run, banks its cores and opens the tree' : `Reach level ${D.PRESTIGE_AT} first`;
    if (UI.pres) UI.dirty = true;
  }
  if (S.alloc && !UI.pres) showPrestige(true);     // between runs the tree is all there is
  readDps(false);
}
/* the count after a lost fight: grey over the arena, the seconds left in the middle */
let deadN = -1;
function deadTick() {
  const left = G.S.alloc ? 0 : G.deadLeft(), n = left > 0 ? Math.ceil(left) : 0;
  if (n === deadN) return; deadN = n;
  $('dead').classList.toggle('hidden', !n); if (n) $('dead-n').textContent = n;
}
UI.frame = function () { patch(false); deadTick(); };

/* ------------------------------------------------------------------ toasts, banners, tips, dialogs */
function toast(html) {
  const box = $('toasts'); while (box.children.length > 4) box.firstChild.remove();
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = html; box.appendChild(d);
  setTimeout(() => d.remove(), 3700);
}
UI.toast = toast;
/* the interlude after a level: what it paid, what the run has earned, and what comes next, for as long as the pause lasts */
function interlude(ev) {
  const el = $('interlude'), S = G.S, on = ev.next !== ev.level;
  el.innerHTML = `<div class="ibox" style="--secs:${ev.secs}s"><small>Level ${ev.level}</small><b>Cleared</b>
    ${ev.pay ? `<span class="ipay">${ci('core')}+${fmt(ev.pay)}<i>${fmt(G.runCores())} this run</i></span>` : ''}
    <span class="inext">${on ? `Level ${ev.next} · ${esc(D.act(ev.next).name)}` : 'Again'}</span><div class="ibar"><i></i></div></div>`;
  el.classList.remove('hidden', 'out'); clearTimeout(interlude.t);
  interlude.t = setTimeout(() => { el.classList.add('out'); interlude.t = setTimeout(() => el.classList.add('hidden'), 400); }, ev.secs * 1000);      // the bar fills, then it fades
}
/* the words across the arena: a run beginning, or a fight lost. `secs` is how long they are up (a loss stays longer: it has something to tell you) */
function banner(title, sub, color, secs) { $('banner').innerHTML = `<div style="color:${color}${secs ? `;animation-duration:${secs}s` : ''}">${title}<small>${sub}</small></div>`; }
/* a skill's tooltip: its name, what it does, and its secondary affixes, each with its tier in front */
function gemTip(gem) {
  const sk = D.SKILL[gem.sk];
  return `<div class="tn t-${sk.c}">${sk.name}</div>${sk.plain ? '' : `<div class="tp">${skillText(gem)}</div>`}` +
    gem.aff.map(a => `<div class="ta">${tierTag(gem, a)}${affText(gem, a)}</div>`).join('') +
    `<div class="tk">${gem.lock ? 'Locked' : 'Salvage: ' + fmt(G.salvageValue(gem)) + ' gold'}</div>`;
}
function showTip(html, ev) {
  const tip = $('tip'); tip.innerHTML = html; tip.classList.remove('hidden');
  const r = tip.getBoundingClientRect(); let x = ev.clientX + 16, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 12;
  if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - r.height - 8);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { $('tip').classList.add('hidden'); }
/* the tooltip for whatever is under the pointer: a skill, a node of the tree, or anything with a tip of its own */
let mouse = null;
function tipFor(el, ev) {
  if (!el || UI.dragging != null) return hideTip();
  const g = el.closest('[data-gem]');
  if (g) { const at = G.find(+g.dataset.gem); if (at) { if (G.inspect(at.gem.id)) g.classList.remove('fresh'); return showTip(gemTip(at.gem), ev); } }
  const nd = el.closest('[data-node]');
  if (nd && D.NODE[nd.dataset.node]) return showTip(nodeTip(D.NODE[nd.dataset.node]), ev);
  const t = el.closest('[data-tip-text]');
  if (t && t.dataset.tipText) return showTip(esc(t.dataset.tipText), ev);      // a tooltip with nothing to say is not shown
  hideTip();
}
/* after a redraw the pointer may be over something else without having moved (salvage a skill and the next one in
   its row slides under it): the tooltip follows what is there now */
function retip() { if (!mouse) return hideTip(); tipFor(document.elementFromPoint(mouse.clientX, mouse.clientY), mouse); }
function modal(html) { const m = $('modal'); m.innerHTML = `<div class="box">${html}</div>`; m.classList.remove('hidden'); }
/* closing a box that carries the play-data switch settles it: as it stands, on or off (and from then on it has been seen) */
function closeModal() { const c = $('tele-on'); if (c && !$('modal').classList.contains('hidden')) SW.telemetry.setEnabled(c.checked); $('modal').classList.add('hidden'); }
/* The play-data switch. Only on the hosted game; it starts on, and nothing is sent until a box with it in has been closed. */
function playDataLine() {
  const T = SW.telemetry; if (!T.hosted()) return '';
  return `<label class="teleopt"><input type="checkbox" id="tele-on" ${T.wanted() ? 'checked' : ''}><span><b>Send anonymous play data</b><small>How long runs last, how deep they go, which nodes you buy, what you forge, scrap, reroll and craft, and errors. No name, no address, nothing you type: only a random id for this browser. Change it in Settings (⚙).</small></span></label>`;
}
/* for a save from before there was any: the switch, once, in a box of its own */
UI.playDataNotice = function () {
  const T = SW.telemetry; if (!T.hosted() || T.asked() || !$('modal').classList.contains('hidden')) return;
  modal(`<h3>One new thing</h3><p>This test build can send anonymous notes on how your runs go, to help balance the game.</p>${playDataLine()}
    <div class="btns"><button class="big" data-act="close">Continue</button></div>`);
};
function showPrestige(on) { if (!on && G.S.alloc) return; if (on && !UI.pres) UI.presAt = performance.now() / 1000; UI.pres = !!on; $('prestige').classList.toggle('hidden', !on); if (on) renderCores(); hideTip(); }
UI.welcome = function () {
  modal(`<h3>Smeltworks Idle</h3>
    <p><b>Click enemies</b> to strike them. Hold to keep striking.</p>
    <p>Their attacks drain <b>Life</b>, which must last the whole level.</p>
    <p>Every level you clear pays <b>cores</b>. Prestige to bank and spend them.</p>${playDataLine()}
    <div class="btns"><button class="big" data-act="close">Begin</button></div>`);
};
UI.offline = function (o) {
  const h = Math.floor(o.secs / 3600), m = Math.floor(o.secs % 3600 / 60);
  modal(`<h3>While you were away</h3><p><b>${h ? h + 'h ' : ''}${m}m</b> · <b class="hot">${fmt(o.gold)} gold</b></p>${SW.telemetry.asked() ? '' : playDataLine()}
    <div class="btns"><button class="big" data-act="close">Continue</button></div>`);
};
function settings() {
  modal(`<h3>Settings</h3>
    <p>Saved in this browser. Copy the text to move it.</p>
    <textarea id="save-text" spellcheck="false" placeholder="Paste a save here, then Load"></textarea>
    ${playDataLine()}
    <div class="btns"><button data-act="export">Copy save</button><button data-act="import">Load save</button><button class="danger" data-act="wipe">Start over</button><button class="big" data-act="close">Done</button></div>`);
}

/* ------------------------------------------------------------------ what the game said happened */
const REDRAW = new Set(['socket', 'buy', 'upgrade', 'forging', 'made', 'sell', 'prestige', 'run', 'tree', 'forge', 'core', 'bench', 'salvage', 'goto', 'auto', 'drop', 'bagfull', 'cleared', 'fail']);
UI.onEvent = function (ev) {
  if (REDRAW.has(ev.t)) UI.dirty = true;
  if (ev.t === 'buy' || ev.t === 'sell') shownDps[ev.post] = '0';
  if (ev.t === 'buy') { const P = G.S.posts[ev.post], u = P && P.unit; if (u) UI.born[u.id] = performance.now() / 1000; AU.play('equip'); }      // (it may be gone again already)
  // on the anvil: three blows of the hammer, a tink and a burst of sparks each, and then it is done
  if (ev.t === 'forging') for (let i = 0; i < 3; i++) setTimeout(tink, i * ev.secs * 1000 / 3 + 40);
  // and the new weapon is on the bench: it rings, and shines for a moment. A reroll of its type or its sockets ends the same way
  if (ev.t === 'made' || (ev.t === 'bench' && ev.kind && ev.kind !== 'swap')) { AU.play('forge'); UI.madeAt = performance.now(); setTimeout(() => { const b = document.querySelector('#shop .bench'); if (b) { b.classList.remove('fresh'); void b.offsetWidth; b.classList.add('fresh'); } }, 30); }
  switch (ev.t) {
    // the fight is quiet: soft sounds, and not one for every blow of a full line
    case 'hit': if (ev.who < 0) AU.play(ev.crit ? 'tapCrit' : 'tap', 0.05); else AU.play(ev.crit ? 'softCrit' : 'soft', ev.crit ? 0.3 : 0.22); break;
    case 'hurt': { AU.play(ev.slam ? 'ouchBig' : 'ouch', 0.18); const c = document.querySelector('.lifebar'); c.classList.remove('hurt'); void c.offsetWidth; c.classList.add('hurt'); break; }
    case 'kill': AU.play(ev.boss ? 'win' : 'fall', 0.15); AU.play('chink', 0.25); break;
    case 'spawn': if (G.F.enc.actBoss) AU.play('boss'); break;
    case 'nova': AU.play('boom', 0.4); break;
    case 'arc': AU.play('zap', 0.3); break;
    case 'status': if (ev.s === 'stun') AU.play('daze', 0.4); break;
    case 'drop': {
      const sk = D.SKILL[ev.gem.sk]; UI.fresh.add(ev.gem.id);
      toast(`<b class="t-${sk.c}">${sk.name}</b> <span class="tname t${D.tier(ev.gem.lvl)}">T${D.tier(ev.gem.lvl)}</span>`);
      AU.play('drop1'); break;
    }
    case 'bagfull': toast(`<b class="t-${D.SKILL[ev.sk].c}">${D.SKILL[ev.sk].name}</b> row full: salvaged ${ci('gold')}${fmt(ev.gold)}`); break;
    case 'leveldone': interlude(ev); AU.play('level'); break;
    case 'prestige': AU.play('master'); $('interlude').classList.add('hidden'); UI.sel = null; UI.fresh.clear(); UI.glows = {}; for (const el of document.querySelectorAll('.newglow')) el.classList.remove('newglow'); showPrestige(true); break;
    case 'run': UI.pres = false; $('prestige').classList.add('hidden'); banner('Run ' + (G.S.runs + 1), ev.secs ? 'First fight in ' + ev.secs + 's' : '', 'var(--hot)', ev.secs || 0); AU.play('level'); UI.dirty = true; UI.render(); flashNew(); break;
    case 'goto': $('interlude').classList.add('hidden'); break;
    case 'fail': $('banner').innerHTML = ''; $('dead-title').textContent = ev.boss ? 'Overrun' : 'Driven back'; $('dead-sub').textContent = ev.back ? 'Back to level ' + G.S.level : 'Level ' + G.S.level + ' restarts'; deadTick(); AU.play('death'); break;
  }
  AR.onEvent(ev);
};

/* ------------------------------------------------------------------ doing things */
function selGem() { const at = UI.sel != null && G.find(UI.sel); return at ? at.gem : null; }
function act(name, b, ev) {
  const S = G.S, d = b.dataset;
  let ok = null;
  switch (name) {

    case 'back': UI.sel = null; UI.dirty = true; break;
    case 'bench-type': ok = G.benchReroll('type'); break;        // (the anvil makes its own noise: see 'forging')
    case 'bench-socks': ok = G.benchReroll('socks'); break;
    case 'buy-skill': ok = !!G.buySkill(); break;
    case 'make':      // a new weapon on the bench, for gold (the anvil makes its own noise: see 'forging')
      if (G.S.gold < G.makeCost()) { ok = false; toast('Not enough gold'); break; }
      ok = G.make();
      break;
    case 'equip':     // free and at once, empty sockets or not: the button's own tip says what an empty one costs. With no free slot it is greyed out
      // but still answers a click and a hover (a truly disabled button does neither), so the toast and the tooltip can say what to do
      if (G.emptyPost() < 0) { ok = false; toast('Scrap one weapon first (✕)'); break; }
      ok = G.equip();
      break;
    case 'sell': ok = G.sell(+d.post); if (ok) AU.play('salvage'); break;
    case 'upgrade': ok = G.upgrade(+d.post); if (ok) { const p = +d.post; UI.upAt[G.S.posts[p].unit.id] = performance.now() / 1000; setTimeout(() => tink(`#line .card[data-post="${p}"] .pic`), 40); } break;      // once the line has been drawn again
    case 'craft': { const at = G.find(UI.sel), before = at ? at.gem.aff.slice() : []; ok = G.craft(d.kind, UI.sel); if (ok) { affFx(at.gem, before); AU.play(d.kind === 'strip' ? 'forge' : 'master'); setTimeout(() => { UI.dirty = true; }, AFF_FX * 1000 + 30); } break; }      // (drawn once more when it has played, to clear it away)
    case 'bench-swap': ok = G.swapBench(); if (ok) AU.play('click'); break;
    case 'salvage-loose': {
      const loose = S.bag.filter(g => !g.lock);
      if (!loose.length) { toast('Nothing to salvage'); break; }
      modal(`<h3>Salvage ${plural(loose.length, 'skill')}?</h3><p>For <b class="hot">${fmt(loose.reduce((s, g) => s + G.salvageValue(g), 0))} gold</b>. Locked and socketed skills are kept.</p>
        <div class="btns"><button data-act="close">Keep them</button><button class="danger" data-act="salvage-yes">Salvage them</button></div>`);
      break;
    }
    case 'salvage-yes': G.salvageLoose(); closeModal(); AU.play('salvage'); UI.dirty = true; break;
    case 'close': closeModal(); break;
    case 'export': { const t = G.exportSave(); $('save-text').value = t; $('save-text').select(); if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Save copied.'), () => {}); break; }
    case 'import': if (G.importSave($('save-text').value)) { closeModal(); UI.sel = null; UI.dirty = true; toast('Save loaded.'); } else toast('That is not a Smeltworks Idle save.'); break;
    case 'prestige-now':      // the button beside the level: straight to it, no window in between and no question
      if (G.canPrestige()) { UI.stopHold(); ok = !!G.prestige(); UI.sel = null; UI.dirty = true; } else ok = false;      // the tree is seen only by prestiging
      break;
    case 'prestige': UI.stopHold(); ok = !!G.prestige(); UI.sel = null; UI.dirty = true; break;      // no second question: opening the window and pressing this are two deliberate steps already
    case 'begin-run': ok = G.beginRun(); UI.dirty = true; break;
    case 'node': {
      const id = d.node;
      if (!S.alloc) { ok = false; toast('Prestige to change the tree'); break; }
      if (G.has(id)) { ok = G.unallocate(id); if (ok) AU.play('click'); }       // any node comes back, for its price, unless others hang from it
      else { ok = G.allocate(id); if (ok) AU.play(D.NODE[id].big ? 'nodeBig' : 'node'); else toast(!G.touches(id) ? 'Not connected' : `${fmt(G.nodeCost(id) - G.cores())} cores short`); }
      break;
    }
    case 'wipe': modal(`<h3>Start over?</h3><p>This erases <b>everything</b>.</p><div class="btns"><button data-act="close">Keep playing</button><button class="danger" data-act="wipe-yes">Erase my save</button></div>`); break;
    case 'wipe-yes': G.wipe(); G.init(null); G.save(); closeModal(); UI.sel = null; UI.dirty = true; UI.welcome(); break;
  }
  if (ok === false) AU.play('deny');
  void ev;
}
/* Shift-click a skill, wherever it is, to salvage it */
function shiftSalvage(id) {
  // if its crafting is open, that moves to the skill that takes its place in the row (the next one along), if there is one
  const at = G.find(id), row = at && at.bag != null ? G.S.bag.filter(g => g.sk === at.gem.sk) : null, k = row ? row.indexOf(at.gem) : -1;
  if (G.salvage(id)) { if (UI.sel === id) { const next = row && G.S.bag.filter(g => g.sk === at.gem.sk)[k]; UI.sel = next ? next.id : null; } AU.play('salvage'); } else { AU.play('deny'); toast('Locked'); }
}
function clickSock(el, ev) {
  const [post, i] = el.dataset.sock.split(':').map(Number), gemEl = el.querySelector('[data-gem]'), there = gemEl ? +gemEl.dataset.gem : null;
  if (ev.altKey && there != null) { G.lock(there); UI.dirty = true; return; }
  if (ev.shiftKey && there != null) return shiftSalvage(there);
  // with a skill's crafting open, a click on a socket it fits sets it there; otherwise a click opens the crafting of what is in the socket
  if (UI.sel != null && UI.sel !== there && canPlace(UI.sel, post, i)) { if (G.socket(UI.sel, post, i)) AU.play('equip'); return; }
  if (there != null) craftGem(there);
  else if (UI.sel != null) { const at = G.find(UI.sel); AU.play('deny'); toast(at && G.sockColor(post, i) === G.color(at.gem) && G.dupe(at.gem, i) ? 'Already on this weapon' : 'Wrong colour'); }
}
/* right click on a skill: socket it (into the first empty socket on the bench that fits), or take it out if it is in one */
function useGem(id) {
  const at = G.find(id); if (!at) return;
  if (at.bag != null) { if (G.autoSocket(id)) AU.play('equip'); else { AU.play('deny'); toast(G.S.bench.sockets.some((s, i) => !s.gem && G.dupe(at.gem, i) && G.sockColor(G.BENCH, i) === G.color(at.gem)) ? 'Already on this weapon' : 'No socket fits'); } }
  else if (G.unsocket(id)) AU.play('click');
}
/* left click on a skill: its crafting, in place of the bag (again, or Back, to close it) */
function craftGem(id) { UI.sel = UI.sel === id ? null : id; UI.dirty = true; AU.play('click'); }
function clickGem(id, ev) {
  if (ev.altKey) { G.lock(id); UI.dirty = true; return; }
  if (ev.shiftKey) return shiftSalvage(id);
  craftGem(id);
}
/* until there are skills, the skills' part of that pane is not there at all */
function lockSkills() { $('tab-skills').classList.toggle('hidden', !G.skillsOn()); }
/* What a run has for the first time ever is pointed out: a new pane flashes, and it, or a new button, then glows
   for a good while (GLOW_SECS). glow(key) is what a re-drawn element puts in its class to carry the glow on. */
const GLOW_SECS = 45;
UI.glows = {};
const glow = key => { const t0 = UI.glows[key], now = performance.now() / 1000; return t0 != null && now - t0 < GLOW_SECS ? ` newglow" style="--gd:-${((now - t0) % 1.8).toFixed(2)}s` : ''; };
function flashNew() {
  const S = G.S, now = G.features(), t = performance.now() / 1000, fresh = Object.keys(now).filter(k => !S.unl[k]);
  for (const k of fresh) { S.unl[k] = 1; UI.glows[k] = t; }
  const panes = [];
  if (fresh.includes('troops')) panes.push($('line'), $('shop'));
  if (fresh.includes('skills')) panes.push($('tab-skills'));
  lockSkills();
  for (const el of panes) {
    el.classList.remove('unlockflash', 'newglow'); void el.offsetWidth; el.classList.add('unlockflash', 'newglow');
    setTimeout(() => el.classList.remove('unlockflash'), 2600); setTimeout(() => el.classList.remove('newglow'), GLOW_SECS * 1000);
  }
  if (fresh.length) { UI.dirty = true; setTimeout(() => { UI.dirty = true; }, GLOW_SECS * 1000 + 100); }
}

UI.bind = function () {
  // While a button on the page is being pressed the panes are not redrawn, or the press would lose its target.
  // A press in the arena is different: that is how you fight, often held for minutes, and the panes must keep up.
  document.addEventListener('pointerdown', ev => { UI.down = !(ev.target.closest && ev.target.closest('#arena')); AU.unlock(); });
  const up = () => { UI.down = false; };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up); globalThis.addEventListener('blur', () => { up(); stopHold(); });

  document.addEventListener('click', ev => {
    const t = ev.target;
    if (t.id === 'modal') return closeModal();
    if (t.id === 'prestige') return showPrestige(false);
    const b = t.closest('[data-act]'); if (b) { if (!b.disabled) act(b.dataset.act, b, ev); return; }
    const sock = t.closest('[data-sock]'); if (sock) return clickSock(sock, ev);
    const gem = t.closest('[data-gem]'); if (gem) return clickGem(+gem.dataset.gem, ev);
  });
  document.addEventListener('contextmenu', ev => {
    const gem = ev.target.closest('[data-gem]'); if (!gem) return;
    ev.preventDefault();
    const id = +gem.dataset.gem, at = G.find(id); if (!at) return;
    if (ev.shiftKey) shiftSalvage(id); else useGem(id);
  });

  // dragging a skill onto a socket, or back to the bag
  document.addEventListener('dragstart', ev => {
    const gem = ev.target.closest && ev.target.closest('[data-gem]'); if (!gem) { ev.preventDefault(); return; }
    UI.dragging = +gem.dataset.gem; UI.down = false; hideTip();
    ev.dataTransfer.setData('text/plain', String(UI.dragging)); ev.dataTransfer.effectAllowed = 'move';
    for (const s of document.querySelectorAll('[data-sock]')) { const [p, i] = s.dataset.sock.split(':').map(Number); s.classList.toggle('ok', canPlace(UI.dragging, p, i)); }
  });
  document.addEventListener('dragover', ev => {
    if (UI.dragging == null) return;
    const s = ev.target.closest('[data-sock]');
    if (s) { const [p, i] = s.dataset.sock.split(':').map(Number); if (canPlace(UI.dragging, p, i)) { ev.preventDefault(); s.classList.add('over'); } return; }
    if (ev.target.closest('#tab-skills')) ev.preventDefault();
  });
  document.addEventListener('dragleave', ev => { const s = ev.target.closest && ev.target.closest('[data-sock]'); if (s) s.classList.remove('over'); });
  document.addEventListener('drop', ev => {
    if (UI.dragging == null) return;
    ev.preventDefault();
    const s = ev.target.closest('[data-sock]'), id = UI.dragging;
    if (s) { const [p, i] = s.dataset.sock.split(':').map(Number); if (G.socket(id, p, i)) AU.play('equip'); }
    else if (ev.target.closest('#tab-skills')) { if (G.unsocket(id)) AU.play('click'); }
  });
  document.addEventListener('dragend', () => { UI.dragging = null; UI.dirty = true; });

  // tooltips
  document.addEventListener('mousemove', ev => {
    mouse = { clientX: ev.clientX, clientY: ev.clientY };
    if (UI.dragging != null) return;
    tipFor(ev.target, ev);
  });
  document.addEventListener('mouseleave', () => { mouse = null; hideTip(); });

  // the arena: a click strikes where it lands; holding the button keeps striking wherever the pointer is
  const arena = $('arena');
  const at = ev => { const r = arena.getBoundingClientRect(); UI.hx = ev.clientX - r.left; UI.hy = ev.clientY - r.top; AR.hover(UI.hx, UI.hy); return AR.toArena(UI.hx, UI.hy); };
  function stopHold() { UI.hold = false; G.setHold(false); }
  UI.stopHold = stopHold;
  arena.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; const p = at(ev); G.click(p.x, p.y); UI.hold = true; G.setHold(true); });
  arena.addEventListener('pointermove', ev => { const p = at(ev); G.aim(p.x, p.y); });
  arena.addEventListener('pointerup', stopHold); arena.addEventListener('pointercancel', stopHold);
  arena.addEventListener('pointerleave', () => { stopHold(); AR.hover(null); });
  arena.addEventListener('contextmenu', ev => ev.preventDefault());

  $('lv-prev').addEventListener('click', () => { if (G.goto(G.S.level - 1)) AU.play('click'); });
  $('lv-next').addEventListener('click', ev => { if (G.goto(ev.shiftKey ? G.S.maxLevel : G.S.level + 1)) AU.play('click'); });      // Shift: straight to the deepest level open
  $('btn-menu').addEventListener('click', settings);
  const snd = $('btn-sound');
  const showSound = () => { AU.on = G.S.opts.sound; snd.classList.toggle('off', !AU.on); };
  snd.addEventListener('click', () => { G.S.opts.sound = !G.S.opts.sound; showSound(); });
  showSound();
  document.addEventListener('keydown', ev => {
    if (ev.target.tagName === 'TEXTAREA' || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'Escape') { if (!$('modal').classList.contains('hidden')) closeModal(); else if (UI.pres) showPrestige(false); else { UI.sel = null; UI.dirty = true; } }
    else if (ev.key === 'ArrowLeft') G.goto(G.S.level - 1);
    else if (ev.key === 'ArrowRight') G.goto(ev.shiftKey ? G.S.maxLevel : G.S.level + 1);
  });
  lockSkills();
};
})();
