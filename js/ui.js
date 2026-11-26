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
  const there = G.sockGem(post, i);
  return at.bag != null || !there || UI.dragging != null;       // a socketed skill only moves to an empty socket by clicking
}
function sockHTML(post, i, lit) {      // lit: a glow for it (a socket the tree has just given: see glow)
  const c = G.sockColor(post, i), gem = G.sockGem(post, i);
  return `<div class="sock c-${c || 'n'}${canPlace(UI.sel, post, i) ? ' ok' : ''}${lit || ''}" data-sock="${post}:${i}"${gem ? '' : ` data-tip-text="Takes ${c ? D.COLORS[c].name + ' skills' : 'any skill'}. Right-click a skill to socket it."`}>${gem ? gemHTML(gem) : ''}</div>`;
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
let curHit = null, curAt = -9;      // the enemy your own blow last struck, and when: a kill that comes with it is yours
function readDps(force) {
  const now = performance.now() / 1000; if (!force && now - dpsAt < DPS_EVERY) return;
  dpsAt = now;
  shownDps[-1] = fmt1(G.actual(-1)); G.S.posts.forEach((P, p) => { shownDps[p] = fmt1(P.unit ? G.actual(p) : 0); });
  for (const el of document.querySelectorAll('[data-dps]')) setText(el, shownDps[el.dataset.dps] || '0');
}

/* ------------------------------------------------------------------ the line (left) */
const UP_SECS = 0.9;                            // and how long a weapon's whole card flashes when it is upgraded
const ENTER_SECS = 0.45;                        // a beat between equipping a weapon and its card landing in the list
const SCRAP_SECS = 0.7;                         // how long a scrapped weapon's card takes to break up and go
const NEW_SECS = 3.2;                           // how long a newly made weapon's card and post glow
/* the cursor: the player's own hand, above the forge. Its sockets take any skill, and a skill comes back out of them
   whenever you like; with Cursor upgrade on the tree, gold makes it hit harder for the run. */
function renderCursor() {
  const S = G.S, X = G.X, C = X.cursor, up = S.cur.up || 0, socks = S.cur.sockets;
  $('cursor').innerHTML = `<div class="card cursor"><div class="pic" data-tip-text="Click or hold on an enemy. Auras affect it."><img src="${SP.url('pointer', 'ember', 3)}" alt=""><div class="cdbar"><i id="cd-fill"></i></div></div>
    <div class="who"><b>Cursor${up ? ` <i class="rank" data-tip-text="Upgraded: +${up * D.CUP.dmg}% damage">+${up}</i>` : ''}</b><span class="dps"><span class="pw" data-tip-text="${POWER_TIP}"><b>${fmt1(C.power)}</b> power</span><span class="real" data-tip-text="${DPS_TIP}"><b data-dps="-1">${shownDps[-1] || '0'}</b> dps</span></span></div>
    <div class="stats">${fmt1(C.dmg)} dmg · every ${X.cooldown.toFixed(1)}s · ${Math.round(C.crit)}% crit${aoeText(C, true)}${up ? ` · <span class="upstat" data-tip-text="From its ${up} upgrade rank${up > 1 ? 's' : ''}">+${up * D.CUP.dmg}% upgraded</span>` : ''}</div>
    ${socks.length ? `<div class="bsocks csocks">${socks.map((s, i) => sockHTML(G.CURSOR, i, i === socks.length - 1 ? glow('csocks' + socks.length) : '')).join('')}</div>` : ''}
    ${socks.some(k => k.gem) ? statHTML({ sockets: socks }, G.CURSOR) : ''}
    ${G.treeVal('uClick') ? `<div class="uprow"><div class="upbar${up >= D.CUP.max ? ' max' : ''}" data-tip-text="+${D.CUP.dmg}% damage a rank"><i style="width:${100 * up / D.CUP.max}%"></i></div><span class="upn"><b>+${up}</b> / ${D.CUP.max}</span>
      ${up < D.CUP.max ? `<button class="small uprank${glow('upcursor')}" data-act="upgrade-cursor" data-cost="${G.curUpCost()}" data-cur="gold" data-tip-text="+${D.UP.gain[0]} to +${D.UP.gain[1]} ranks">Upgrade · ${ci('gold')}${fmt(G.curUpCost())}</button>` : ''}</div>` : ''}
    </div>`;
}
function renderLine() {
  const S = G.S, X = G.X, now = performance.now() / 1000;
  let h = '';
  $('line').classList.toggle('bare', !S.posts.length);
  const pws = S.posts.map((P, p) => P.unit ? X.units[p].power : null), have = pws.filter(v => v != null);
  if (S.posts.length) h += `<div class="linehead"><h4>Weapons - ${have.length}/${S.posts.length}</h4>${have.length ? `<span class="linepw" data-tip-text="All your weapons' power together"><b>${fmt1(have.reduce((a, b) => a + b, 0))}</b> power</span>` : ''}</div>`;       // how many are equipped, of the slots there are       // nothing about troops until there is a post
  // the cursor and that heading stay put; the weapons scroll beneath them, in a box of their own
  h += '<div class="posts">';
  S.posts.forEach((P, p) => {
    const coming = P.unit && UI.born[P.unit.id] != null && now - UI.born[P.unit.id] < ENTER_SECS;      // equipped a moment ago: its slot waits, lit, and then the card lands
    const ghost = !P.unit && UI.gone && UI.gone[p] && now - UI.gone[p].at < SCRAP_SECS ? UI.gone[p] : null;      // scrapped a moment ago: what it was, breaking up
    if (ghost) { h += ghost.html.replace('class="card post', `style="animation-delay:-${(now - ghost.at).toFixed(2)}s" class="card post scrapped`); return; }
    if (!P.unit || coming) { h += `<div class="card empty${coming ? ' coming' : p === S.posts.length - 1 ? glow('slots' + S.posts.length) : ''}" data-post="${p}"><div class="pic"></div><div class="who"><b>${coming ? '&nbsp;' : 'Empty weapon slot'}</b></div><div class="stats">&nbsp;</div><div class="statlist"><span class="none">&nbsp;</span></div>${G.treeVal('uUp') ? '<div class="uprow"></div>' : ''}</div>`; return; }      // laid out like a weapon with no skills, so the line does not jump when one is equipped
    const u = P.unit, W = X.units[p], wd = D.WEAPONS[u.type], age = UI.born[u.id] != null ? now - UI.born[u.id] - ENTER_SECS : 99, upAge = UI.upAt[u.id] != null ? now - UI.upAt[u.id] : 99, scrap = G.scrapValue(u);
    const lit = upAge < UP_SECS ? ['upglow', upAge] : age < NEW_SECS ? ['isnew', age] : null;      // an upgrade's flash, or a new weapon's glow: whichever is the more recent
    h += `<div class="card post${lit ? ' ' + lit[0] : ''}" data-post="${p}"${lit ? ` style="animation-delay:-${lit[1].toFixed(2)}s"` : ''}><div class="pic" data-tip-text="${esc(G.unitName(u))}: ${wd.note} Overkill carries to ${wd.carry} more."><img src="${SP.url(wd.spr, palOf(u), 3)}" alt=""><div class="cdbar"><i data-cd="${p}"></i></div></div>
      <div class="who"><b>${esc(G.unitName(u))}${u.up ? ` <i class="rank" data-tip-text="Upgraded: +${u.up * D.UP.dmg}% damage">+${u.up}</i>` : ''}</b><span class="dps"><span class="pw" data-tip-text="${POWER_TIP}"><b>${fmt1(W.power)}</b> power</span><span class="real" data-tip-text="${DPS_TIP}"><b data-dps="${p}">${shownDps[p] || '0'}</b> dps</span></span>
        <button class="x" data-act="sell" data-post="${p}" data-tip-text="Scrap${scrap ? ' for ' + fmt(scrap) + ' gold' : ''}">✕</button></div>
      <div class="stats">${fmt1(W.dmg)} dmg · every ${(1 / W.aps).toFixed(1)}s · ${Math.round(W.crit)}% crit${aoeText(W, false)}${u.up ? ` · <span class="upstat" data-tip-text="From its ${u.up} upgrade rank${u.up > 1 ? 's' : ''}">+${u.up * D.UP.dmg}% upgraded</span>` : ''}</div>
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
/* how the bench's weapon stands against the weakest one equipped (the one it would replace): an arrow beside its power, with the numbers on hover */
function benchArrow() {
  const X = G.X, on = G.S.posts.map((P, p) => P.unit ? { u: P.unit, pw: X.units[p].power } : null).filter(Boolean); if (!on.length) return '';
  const pw = X.bench.power, low = on.reduce((a, b) => b.pw < a.pw ? b : a), d = pw - low.pw, name = esc(G.unitName(low.u));
  if (d > 0) return `<i class="cmp up" data-tip-text="${fmt1(d)} power over your weakest, ${name} (${fmt1(low.pw)})">▲</i>`;
  if (d < 0) return `<i class="cmp down" data-tip-text="${fmt1(-d)} power under your weakest, ${name} (${fmt1(low.pw)})">▼</i>`;
  return '';
}
/* ------------------------------------------------------------------ the Forge (top right, above the skills): the weapon crafter, as the code still calls it */
function renderBench() {
  const S = G.S, X = G.X, B = S.bench, wd = D.WEAPONS[B.type], free = G.emptyPost() >= 0, n = G.craftSockets();
  $('shop').classList.toggle('hidden', !S.posts.length); if (!S.posts.length) { $('shop').innerHTML = ''; return; }       // locked: not shown at all
  const part = G.benchCost(), empty = B.sockets.filter(s => !s.gem).length, cost = G.makeCost();
  const head = `<div class="shophead"><h4>Forge</h4></div>`;
  // sockets the tree has unlocked that this weapon did not roll: faint outlines after its own
  const newSock = i => i === n - 1 ? glow('socks' + n) : '';      // the socket the tree has just added is the last of them, rolled on this weapon or not
  const lost = B.made ? Array.from({ length: Math.max(0, n - B.sockets.length) }, (_, k) => `<div class="sock ghost${newSock(B.sockets.length + k)}" data-tip-text="Not rolled"></div>`).join('') : '';
  const forge = `<div class="forgebar"><i data-forge></i><span>Forging</span></div>`;
  const make = cls => `<button class="${cls}" data-act="make" data-cost="${cost}" data-cur="gold" data-tip-text="${B.made ? 'Forge a new weapon' : ''}">${B.made ? 'New' : 'Forge weapon'} · ${ci('gold')}${fmt(cost)}</button>`;
  // nothing on the bench: the anvil, and Make
  if (!B.made) { $('shop').innerHTML = head + `<div class="bench blank${S.forge ? ' forging' : ''}"><div class="pic"><span class="anvil"></span></div><div class="what"><span class="dim">${S.forge ? '' : 'No weapon'}</span></div>${S.forge ? forge : make('big')}</div>`; return; }
  $('shop').innerHTML = head + `
    <div class="bench${S.forge ? ' forging' : ''}">
      <div class="pic"><img src="${SP.url(wd.spr, D.PALS[U.clamp(B.sockets.length, 1, D.PALS.length) - 1], 3)}" alt=""></div>
      <div class="what"><div class="who"><b>${esc(G.unitName(B))}</b><span class="dps pw" data-tip-text="${POWER_TIP}"><b>${fmt1(X.bench.power)}</b> power</span>${benchArrow()}</div>
        <div class="stats"><span>${fmt1(X.bench.dmg)} dmg every ${(1 / X.bench.aps).toFixed(1)}s · ${Math.round(X.bench.crit)}% crit${aoeText(X.bench, false)}</span></div></div>
      <div class="bsocks">${B.sockets.map((s, i) => sockHTML(G.BENCH, i, newSock(i))).join('')}${lost}</div>
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
    // (crafting: the way back, every skill you have in a strip to pick from, and the one picked below it)
    const all = S.bag.concat(S.bench.sockets.map(k => k.gem), S.cur.sockets.map(k => k.gem)).filter(Boolean);
    el.innerHTML = `<div class="baghead"><button class="backbtn" data-act="back">◀ All skills</button><h4 class="crafthead">Crafting</h4></div>
      <div class="craftpick">${all.map(gemHTML).join('')}</div>` + detailHTML();
    return;
  }
  if (!G.skillsOn()) { el.innerHTML = ''; return; }       // locked: not shown at all (see lockSkills)
  const now = G.dropping(), full = !now.some(k => G.hasRoom(k.id));
  let h = `<div class="baghead"><h4>Skills</h4><span>${S.bag.length}${full ? ' · <b class="bad">full</b>' : ''}</span><button class="small" data-act="salvage-loose">Salvage all</button></div>
    ${G.skillsOn() ? `<button class="buyskill${glow('market')}" data-act="buy-skill" ${full ? 'data-off' : `data-cost="${G.buyCost()}" data-cur="gold"`} data-tip-text="${full ? 'Bag full' : ''}">Buy a skill · ${ci('gold')}${fmt(G.buyCost())}</button>` : ''}
    <button class="craftbtn" data-act="craft-open" ${S.bag.length || S.bench.sockets.some(k => k.gem) || S.cur.sockets.some(k => k.gem) ? '' : 'data-off'} data-tip-text="Change a skill's affixes with gold. (Clicking a skill opens it too.)">Craft skills</button>
    <div id="bag">`;
  // (skills that have just become ones you can find: the rows of them that stand together are ringed, as one, with the glow a new pane gets)
  const lit = id => { const t0 = UI.glows['sk-' + id]; return t0 != null && performance.now() / 1000 - t0 < GLOW_SECS; }; let open = false;
  for (const sk of D.ALL_SKILLS) {         // a row for each skill that can come to you now, and for any other you still hold
    const mine = S.bag.filter(g => g.sk === sk.id), n = Math.max(D.ROW, mine.length);
    if (!mine.length && !now.includes(sk)) continue;
    if (lit(sk.id) !== open) { open = !open; h += open ? `<div class="newrows${glow('sk-' + sk.id)}">` : '</div>'; }
    h += `<div class="brow c-${sk.c}"><span class="bname t-${sk.c}${nameGlow('sk-' + sk.id)}" ${sk.plain ? '' : `data-tip-text="${esc(sk.name + ': ' + sk.text.replace('{v}', sk.v).replace('{d}', D.HEX_DUR).replace('{p}', D.BRITTLE.per).replace('{m}', D.BRITTLE.max))}"`}>${sk.name}</span>`;
    for (let i = 0; i < n; i++) h += `<div class="slot">${mine[i] ? gemHTML(mine[i]) : ''}</div>`;
    h += '</div>';
  }
  if (open) h += '</div>';
  el.innerHTML = h + `</div><div class="hint keys"><kbd>Click</kbd> craft &nbsp; <kbd>Right-click</kbd> socket<br><kbd>Shift-click</kbd> salvage &nbsp; <kbd>Alt-click</kbd> lock</div>`;
  $('bag').scrollTop = UI.bagScroll || 0;
}
/* the Prestige window: a popup of its own, opened from beside the level. It holds the tree. During a run the tree
   is only shown, and the one button ends the run; between runs every node can be taken or given back, and the one
   way out is to begin the next run. It is redrawn only while it is open. */
/* the popup for a node of the tree: what it is, what it gives, what you would have of it, and whether it can be taken */
function nodeTip(n) {
  const S = G.S, E = D.TREE_EFF[n.eff], held = G.has(n.id);
  let h = `<div class="tn" style="color:${E.col}">${E.name}</div><div class="tp">${n.eff === 'tail' && D.TREE.some(o => o.eff === 'tail' && o.id !== n.id && G.has(o.id)) ? (!G.has(n.id) && G.treeVal('tail') * D.TAIL.per >= D.TAIL.max ? E.full : E.more) : E.text(n.amt)}</div>`;
  if (held) return h + (!S.alloc ? '' : G.canRemove(n.id) ? `<div class="tk">Unspec for ${ci('core')}${fmt(G.nodeCost(n.id))}</div>` : `<div class="tk">${D.TREE_GATE.includes(n.id) || D.TREE_FIRST.includes(n.id) ? 'Always kept' : 'Other nodes hang from it'}</div>`);
  const c = G.nodeCost(n.id), poor = c - G.cores();
  h += `<div class="tc${poor > 0 ? ' poor' : ''}">${ci('core')}${fmt(c)}</div>`;
  if (!S.alloc) return h;
  const ok = G.canAllocate(n.id);
  return h + `<div class="${ok ? 'tk' : 'tf'}">${ok ? 'Click to buy' : G.gated(n.id) ? 'Weapon and Skills first' : !G.touches(n.id) ? 'Not connected' : `${fmt(poor)} short`}</div>`;
}
/* The tree, drawn. Three shapes of big node, so that what a node is can be read from across the room: a hexagon is a
   hub (a troop post, a socket, the second bench), a rounded square unlocks something (rerolls, the market, a colour
   of skill), and a ringed circle is a notable. Small nodes are beads on the paths between them. A path you hold
   glows in its theme's colour; the ones you could take next are lit and pulse. The background is plain black, with
   each quarter's name on it. */
const HEXPTS = r => [0, 1, 2, 3, 4, 5].map(i => (Math.cos(Math.PI / 3 * i + Math.PI / 6) * r).toFixed(1) + ',' + (Math.sin(Math.PI / 3 * i + Math.PI / 6) * r).toFixed(1)).join(' ');
/* how far a node's outline is from its middle, going in a given direction: where a path to it stops (the start has no shape of its own) */
function edgeAt(id, ux, uy) {
  if (id === 'start') return 0;
  const n = D.NODE[id], shape = nodeShape(n), ax = Math.abs(ux), ay = Math.abs(uy);
  if (shape === 'bead') return D.TREE_DIAMOND.includes(n.eff) ? 10.6 / (ax + ay) : 7.5;       // a diamond, or a small circle
  if (shape === 'hub') return 27 * 0.866;                                       // a hexagon: its flat sides
  if (shape === 'key') return 20 / Math.max(ax, ay);                            // a square
  return 21;
}
const nodeShape = n => !n.big ? 'bead' : /^(post|sock)2?$/.test(n.eff) || n.eff === 'bench2' ? 'hub' : D.TREE_KEYS.includes(n.id) ? 'key' : 'notable';      // the block round the start is squares; Rerolls and the Market, beside it, are round
/* When the page opens the tree ripples out from its centre, twice: a faint ring spreads from the first node and each
   path and node comes up softly as it passes, then a second ring follows and they brighten a little once more. It is
   slow and quiet. The page is drawn again while that plays (and it must not start over), so every delay is counted
   from when the page opened. */
const RIPPLE = { spread: 1.5, reach: 640, fade: 1.3, gap: 0.62, dark: 0.5, hold: 3.2 };      // (dark: the tree is black this long as the page opens, then what is held fades in, and at `hold` the ripple starts)      // seconds for a ripple to get from the centre to `reach` (the tree's far edge); how long a node's two swells take; and how far the second ripple is behind the first
/* (hold: when the page is opened the ripple waits this long first, with only what is held standing there: the tree you
   have is seen by itself for a moment before the rest of it comes up round it) */
/* The tree opens in steps: the first weapon alone (0); Upgrade and the socket beside it (1); the square of nine round
   the middle (2); when six of the nine are held (D.TREE_SQUARE_NEED), the inner tree, out to the first big thing each way (3); and when one of
   those four is held, all of it, rippling out from the middle (4, TREE_WHOLE). See D.TREE_SQUARE. A save that holds
   something further out than its step would show is at the step that shows it. */
const TREE_PAUSE = 1.05;                        // seconds between buying the node that opens the whole tree and the tree rippling out
const TREE_WHOLE = 4;
const REVEAL = { spread: 2.5, fade: 1.6, gap: 0.62 };     // a reveal's ripple: how long it takes to cross, how long a node takes to settle, and the second ring's delay (which is the music's second run: audio.js unlock)
function treeStage() {
  const held = Object.keys(G.S.tree), core = id => D.TREE_GATE.includes(id) || D.TREE_FIRST.includes(id);
  if (D.TREE_POINTS.filter(G.has).length >= D.TREE_POINTS_NEED || held.some(id => !D.TREE_INNER.includes(id))) return TREE_WHOLE;
  if (D.TREE_SQUARE.filter(G.has).length >= D.TREE_SQUARE_NEED || held.some(id => !D.TREE_SQUARE.includes(id))) return 3;
  if (G.firstHeld() || held.some(id => !core(id))) return 2;
  return D.TREE_GATE.every(G.has) ? 1 : 0;
}
function treeSVG() {
  const at = id => id === 'start' ? { x: 0, y: 0 } : D.NODE[id];
  let stage = treeStage(); const now = performance.now() / 1000;
  if (stage < 2 || !UI.pres) UI.treeWait = null;
  if (UI.treeStage != null && stage > UI.treeStage && UI.pres) {      // a step opened while the page is up: what is new ripples out
    if (stage >= 2) {                                                 // the square, the inner tree, or the whole of it: a beat first, with what was just bought standing lit, and then it comes (the square fades in; the other two ripple out). The music grows with them: its first run, then both short of the last note, then all of it
      if (UI.treeWait == null) { UI.treeWait = now + TREE_PAUSE; setTimeout(() => { UI.dirty = true; }, TREE_PAUSE * 1000 + 30); }
      if (now < UI.treeWait) stage = UI.treeStage; else { UI.treeWait = null; UI.presAt = now; UI.ripMid = stage === 3; UI.ripFrom = UI.treeStage; AU.play('unlock', null, { part: stage - 1 }); }
    } else UI.presAt = now;
  }
  UI.treeStage = stage;
  const shownAt = (stage, id) => id === 'start' || stage === TREE_WHOLE || D.TREE_GATE.includes(id) || (stage >= 1 && D.TREE_FIRST.includes(id) && !(D.TREE_WITH[id] && !G.has(D.TREE_WITH[id]))) || (stage >= 1 && D.TREE_WITH[id] && G.has(D.TREE_WITH[id])) || (stage >= 2 && D.TREE_SQUARE.includes(id)) || (stage >= 3 && D.TREE_INNER.includes(id));
  const shown = id => shownAt(stage, id);
  // (R: the timings in force. A reveal, when more of the tree is first shown, is slower than the page's opening: it is an event, and it was over too soon)
  const R = UI.ripFrom != null ? REVEAL : RIPPLE;
  const rt = performance.now() / 1000 - (UI.presAt == null ? -99 : UI.presAt), rip = rt < R.spread + R.fade + 0.4;
  // (full: the ripple proper, rings and all. It is the whole tree's, and the inner tree's at the moment it is first shown: that one is a third the size, so its ripple goes a third as far in the same time)
  const full = stage === TREE_WHOLE || (UI.ripMid && rip), reach = stage === TREE_WHOLE ? RIPPLE.reach : 350, ring = R.spread * 740 / reach;      // (a ring is drawn out to 740, at the ripple's own pace)
  // (the page just opened: what is held comes up out of the dark first, by itself, and that is counted from the opening, not from the ripple)
  const opening = rip && UI.presOpen != null && UI.presAt === UI.presOpen + RIPPLE.hold, od = opening ? (UI.presOpen + RIPPLE.dark - performance.now() / 1000).toFixed(2) + 's' : '';
  // (one of the two beside the first weapon taken and the other not: they come up together, as a pair, with what is held, and neither waits for the ripple)
  // (kept: what was already on show when a wider tree is revealed stays as it is, bought or not. Only what is new comes in with the ripple)
  const kept = id => full && rip && UI.ripFrom != null && shownAt(UI.ripFrom, id);
  const early = id => opening && !full && id !== 'start' && !G.has(id);      // (and so does everything else there is to see before the whole tree has opened: there is no ripple until then, only the fade)
  const rd = (x, y, held) => rip ? `animation-delay:${held && opening ? od + ',' : ''}${((!full ? 0 : Math.hypot(x, y) / reach * R.spread) - rt).toFixed(2)}s;` : '';
  // (when each node comes into view, so that one the ripple has not reached yet cannot be clicked or pointed at: see nodeUp)
  const upAt = (n, held) => !rip || kept(n.id) ? 0 : held || early(n.id) ? (opening ? UI.presOpen + RIPPLE.dark + 1.5 : 0) : UI.presAt + (full ? Math.hypot(n.x, n.y) / reach * R.spread : 0) + R.fade * 0.5;      // (a node is 'up' once it has mostly faded in, not as its fade begins)
  UI.nodeAt = {}; let waiting = false;
  const rgd = rip ? `animation-delay:${(0.5 - rt).toFixed(2)}s` : '';      // the four names come up with the ripple too, not before it
  let h = `<svg id="tree"${rip ? ` class="ripple${!full ? ' one' : ''}${UI.ripFrom != null ? ' slow' : ''}${opening ? ' opening' : ''}"${opening ? ` style="--od:${od}"` : ''}` : ''} viewBox="-615 -372 1230 744" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="gorb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
    </defs>
    <g class="bg">${stage < TREE_WHOLE ? '' : `
      <text class="region" x="-575" y="-318" style="--c:#ff9a4a;${rgd}">ARSENAL</text><text class="region" x="575" y="-318" text-anchor="end" style="--c:#b48cff;${rgd}">WORKSHOP</text>
      <text class="region" x="0" y="-348" text-anchor="middle" style="--c:#5aa8ff;${rgd}">CONTROL</text><text class="region" x="0" y="360" text-anchor="middle" style="--c:#ff5a48;${rgd}">ATTRITION</text>`}
    </g>${rip ? (!full ? [] : [0.12, 0.12 + R.gap]).map(d => `<circle class="ripwave${stage < TREE_WHOLE ? ' mid' : ''}" r="100" style="animation-duration:${(stage < TREE_WHOLE ? R.spread * 355 / reach : ring).toFixed(2)}s;animation-delay:${(d - rt).toFixed(2)}s"/>`).join('') : ''}<g class="links">`;
  for (const n of D.TREE) for (const l of n.links) {
    if (!shown(n.id) || !shown(l)) continue;
    const a = at(l), on = G.has(n.id) && G.has(l), next = !on && ((G.has(l) && G.canAllocate(n.id)) || (G.has(n.id) && l !== 'start' && G.canAllocate(l)));
    // a path stops at the edge of each node it joins, and does not run on to its middle: a node that is fading in is half clear, and the path showed through it
    const len = Math.hypot(n.x - a.x, n.y - a.y) || 1, ux = (n.x - a.x) / len, uy = (n.y - a.y) / len, ta = Math.max(0, edgeAt(l, ux, uy) - 0.6), tn = Math.max(0, edgeAt(n.id, ux, uy) - 0.6), cut = ta + tn < len - 1;
    const f = v => +v.toFixed(1), x1 = cut ? f(a.x + ux * ta) : a.x, y1 = cut ? f(a.y + uy * ta) : a.y, x2 = cut ? f(n.x - ux * tn) : n.x, y2 = cut ? f(n.y - uy * tn) : n.y;
    const el = early(n.id) || early(l);
    h += `<line class="link${on ? ' on' : next ? ' next' : ''}${el ? ' early' : ''}${kept(n.id) && kept(l) ? ' kept' : ''}" style="--c:${D.TREE_EFF[n.eff].col};${rd((a.x + n.x) / 2, (a.y + n.y) / 2, on || el)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  h += `</g><g class="startnode"><circle r="35" class="halo"/></g>`;
  for (const n of D.TREE) {
    if (!shown(n.id)) continue;
    UI.nodeAt[n.id] = upAt(n, G.has(n.id)); if (!nodeUp(n.id)) waiting = true;
    const E = D.TREE_EFF[n.eff], held = G.has(n.id), edge = !held && G.touches(n.id), open = edge && G.canAllocate(n.id), shape = nodeShape(n), R = shape === 'hub' ? 27 : n.big ? 21 : 7.5;      // a hub is the biggest thing on the tree: it matters most
    h += `<g class="node ${shape}${nodeUp(n.id) ? '' : ' wait'}${D.TREE_DIAMOND.includes(n.eff) ? ' tier' : ''}${n.big ? ' big' : ''}${held ? ' held' : open ? ' open' : edge ? ' edge locked' : ' locked'}${early(n.id) ? ' early' : ''}${kept(n.id) ? ' kept' : ''}" style="--c:${E.col};${rd(n.x, n.y, held || early(n.id))}" data-act="node" data-node="${n.id}" transform="translate(${n.x} ${n.y})"><circle class="hit" r="${R + 7}"/>`;
    if (shape === 'bead' && D.TREE_DIAMOND.includes(n.eff)) h += `<rect class="ring" x="-7.5" y="-7.5" width="15" height="15" rx="1.5" transform="rotate(45)"/>${held ? '' : '<circle class="pip" r="2.6"/>'}`;      // a skill tier: a diamond, to be found at a glance
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
  // (nodes still to come up are dead to the pointer: drawn again every so often until all of them are up, so that each wakes as it arrives)
  clearTimeout(UI.nodeTick); if (waiting) UI.nodeTick = setTimeout(() => { UI.dirty = true; }, 200);
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
  lockSkills(); renderLine(); renderCursor(); renderBench(); renderSkills(); renderCores();
  UI.fresh.clear(); retip();
  lastCosts = ''; patch(true);
};
UI.redraw = () => { UI.dirty = true; };

/* ------------------------------------------------------------------ what moves every frame */
let lastCosts = '', patchT = 0, pipKey = '', statKey = '', pipWas = null, barT = 0;
/* the chunk a bar has just lost: a paler bar behind the fill that stays where the fill was for a moment, then closes up
   to it. `o` is that bar's own state ({ g: where the pale bar stands, hold: how long it still waits }). A bar that
   grows (a new encounter, Life refilled) takes its pale bar with it at once. */
const GHOST = { hold: 0.28, min: 2.4, pull: 16 };      // seconds held; then closing at `min` of the bar a second, faster the wider the gap
function ghost(o, el, frac, dt) {
  if (o.g == null || frac >= o.g) { o.g = frac; o.hold = 0; }
  else { if (o.hold === 0) o.hold = GHOST.hold; if (o.hold > 0) { o.hold -= dt; if (o.hold <= 0) o.hold = -1; } else { o.g = Math.max(frac, o.g - dt * Math.max(GHOST.min, (o.g - frac) * GHOST.pull)); if (o.g <= frac) o.hold = 0; } }
  if (el) el.style.transform = `scaleX(${o.g})`;
}
const hpGhost = {}; let lifeShown = null;
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
  const frac = U.clamp(F.life / X.lifeMax, 0, 1), lf = $('life-fill'), nowT = performance.now(), bdt = Math.min(0.1, (nowT - (barT || nowT)) / 1000); barT = nowT;
  // Life goes down as a slide, not in steps: the bar closes on what is left, faster the further it has to go. (Going up, it is there at once.)
  lifeShown = lifeShown == null || frac >= lifeShown ? frac : Math.max(frac, lifeShown - bdt * Math.max(0.25, (lifeShown - frac) * 7));
  lf.style.transform = `scaleX(${lifeShown})`;      // (green all the way down: red is the enemy's bar)
  setText($('life-txt'), 'Life ' + Math.max(0, Math.ceil(F.life)) + ' / ' + Math.round(X.lifeMax));
  const cd = $('cd-fill'); if (cd) { const r = G.ready(); cd.style.transform = `scaleX(${r})`; cd.classList.toggle('ready', r >= 1); }
  { const fb = document.querySelector('#shop [data-forge]'); if (fb && S.forge) fb.style.transform = `scaleX(${U.clamp(1 - S.forge.left / D.FORGE_SECS, 0, 1)})`; }
  // each weapon's own bar fills towards its next blow, and a Shockwave's towards its next strike
  for (const el of document.querySelectorAll('#line [data-nova], #cursor [data-nova]')) el.style.transform = `scaleX(${U.clamp((G.F.nova[+el.dataset.nova < 0 ? 'c' : +el.dataset.nova] || 0) / G.X.novaEvery, 0, 1)})`;      // (the cursor's is kept under 'c')
  for (const el of document.querySelectorAll('#line [data-cd]')) el.style.transform = `scaleX(${U.clamp(G.F.cd[+el.dataset.cd] || 0, 0, 1)})`;
  // the encounter: its name, how many are left, and their life added together
  if (enc) {
    let hp = 0, left = 0, lead = null;
    for (const e of F.es) if (!e.dead) { hp += e.hp; left++; if (!lead || e.max > lead.max) lead = e; }
    const en = $('e-name'); setText(en, enc.name + (enc.n > 1 ? '  ·  ' + left + ' left' : '')); en.classList.toggle('boss', !!enc.boss);
    $('hp-fill').style.transform = `scaleX(${U.clamp(hp / enc.max, 0, 1)})`;
    ghost(hpGhost, $('hp-ghost'), U.clamp(hp / enc.max, 0, 1), bdt);
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
    // a fight won within the level: the circles just filled pop, one after another if several were skipped, and the new one arrives
    const from = pipWas && pipWas.level === S.level && S.fight > pipWas.fight && !force ? pipWas.fight : -1; pipWas = { level: S.level, fight: S.fight };
    let h = ''; for (let i = 0; i < D.FIGHTS; i++) {
      const just = from >= 0 && i >= from && i < S.fight, arrive = from >= 0 && i === S.fight;
      h += `<i class="${i < S.fight ? 'done' : i === S.fight ? 'now' : ''}${G.isBoss(i) ? ' boss' : ''}${just ? ' just' : arrive ? ' arrive' : ''}"${just || arrive ? ` style="animation-delay:${(i - from) * 70}ms"` : ''}></i>`;
    }
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
  if (S.alloc && !UI.pres) showPrestige(true, true);     // between runs the tree is all there is (and here it is being put back, not opened: see showPrestige)
  readDps(false);
}
/* the count after a lost fight: grey over the arena, the seconds left in the middle */
let deadN = -1;
function deadTick() {
  const left = G.S.alloc ? 0 : G.deadLeft(), n = left > 0 ? Math.ceil(left) : 0;
  if (n === deadN) return; deadN = n;
  $('dead').classList.toggle('hidden', !n); if (n) $('dead-n').textContent = n;
}
/* a run's opening count: 3, 2, 1, and nothing else */
let openN = -1;
function openTick() {
  const left = G.S.alloc ? 0 : G.openLeft(), n = left > 0 ? Math.ceil(left) : 0;
  if (n === openN) return; openN = n;
  $('count').classList.toggle('hidden', !n); if (n) $('count').innerHTML = `<span>${n}</span>`;
}
UI.frame = function () { patch(false); deadTick(); openTick(); };

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
    ${ev.pay || ev.again ? `<span class="ipay">${ci('core')}+${fmt(ev.pay || 0)}<i>${fmt(G.runCores())} this run</i>${ev.deeper && S.runs ? `<em class="deeper">First clear bonus: +${D.coreBonus()}% cores</em>` : ''}</span>` : ''}
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
/* an event's target is not always an element (the document itself, a text node): the element to look from, or null */
function asEl(n) { if (n && n.nodeType === 3) n = n.parentElement; return n && typeof n.closest === 'function' ? n : null; }
/* has this node come into view yet? (the tree opens from black and ripples out: a node is not there until the ripple reaches it) */
const nodeUp = id => !UI.nodeAt || (UI.nodeAt[id] || 0) <= performance.now() / 1000;
function tipFor(el, ev) {
  el = asEl(el);
  if (!el || UI.dragging != null) return hideTip();
  const g = el.closest('[data-gem]');
  if (g) { const at = G.find(+g.dataset.gem); if (at) { if (G.inspect(at.gem.id)) g.classList.remove('fresh'); return showTip(gemTip(at.gem), ev); } }
  const nd = el.closest('[data-node]');
  if (nd && !nodeUp(nd.dataset.node)) return hideTip();
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
function closeModal() { UI.waiting = false; const c = $('tele-on'); if (c && !$('modal').classList.contains('hidden')) SW.telemetry.setEnabled(c.checked); $('modal').classList.add('hidden'); }
/* The play-data switch. Only on the hosted game; it starts on, and nothing is sent until a box with it in has been closed. */
function playDataLine() {      // the box and its label, and nothing more (what is sent is set out in the README)
  const T = SW.telemetry; if (!T.hosted()) return '';
  return `<label class="teleopt"><input type="checkbox" id="tele-on" ${T.wanted() ? 'checked' : ''}><span><b>Send anonymous play data</b></span></label>`;
}
/* for a save from before there was any: the switch, once, in a box of its own */
UI.playDataNotice = function () {
  const T = SW.telemetry; if (!T.hosted() || T.asked() || !$('modal').classList.contains('hidden')) return;
  modal(`<h3>One new thing</h3><p>This test build can send anonymous notes on how your runs go, to help balance the game.</p>${playDataLine()}
    <div class="btns"><button class="big" data-act="close">Continue</button></div>`);
};
/* (quiet: the page is only being put back, as on a reload while the tree was open. Nothing was prestiged just now, so it is simply there: no dark, no fade, no ripple) */
function showPrestige(on, quiet) { if (!on && G.S.alloc) return; if (on && !UI.pres) { UI.presOpen = quiet ? null : performance.now() / 1000; UI.presAt = quiet ? null : UI.presOpen + RIPPLE.hold; UI.ripMid = false; UI.ripFrom = null; } UI.pres = !!on; $('prestige').classList.toggle('hidden', !on); if (on) renderCores(); hideTip(); }
UI.welcome = function () {
  const line = playDataLine();
  UI.waiting = true;      // nothing fights behind this box: the game begins when Begin is pressed (see advance, in main.js)
  modal(`<div class="plain"><h3>Smeltworks Idle</h3>
    <p>Click and hold to attack enemies.</p>
    <p>Complete a full level before your life runs out to gain cores, then prestige to unlock new abilities.</p>
    ${line ? `<div class="telesec"><p>Anonymous play data helps us improve the game for new players.</p>${line}</div>` : ''}
    <div class="btns"><button class="big" data-act="close">Begin</button></div></div>`);
};
/* Patch notes for a player who has come back (js/notes.js): the newest three they have not been shown, newest first.
   Showing them counts them as read. `all`: every note, read or not, for looking at the window (?notes on the address). */
const noteEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function notesBlock(all) {
  const list = (all ? (SW.notes || []).filter(n => n && n.lines && n.lines.length).sort((a, b) => b.id - a.id) : G.unseenNotes()).slice(0, 3);
  if (!list.length) return '';
  if (!all) { G.seeNotes(); G.save(); }
  return `<div class="notes">${list.map(n => `${n.title ? `<h4>${noteEsc(n.title)}</h4>` : ''}<ul>${n.lines.map(l => l === '' ? '</ul><ul>' : `<li>${noteEsc(l)}</li>`).join('')}</ul>`).join('')}</div>`;
}
UI.whatsNew = function (all) {
  const b = notesBlock(all); if (!b) return false;
  modal(`<h3>What's new</h3>${b}${SW.telemetry.asked() ? '' : playDataLine()}
    <div class="btns"><button class="big" data-act="close">Continue</button></div>`);
  return true;
};
UI.offline = function (o) {
  const h = Math.floor(o.secs / 3600), m = Math.floor(o.secs % 3600 / 60);
  modal(`<h3>While you were away</h3><p><b>${h ? h + 'h ' : ''}${m}m</b> · <b class="hot">${fmt(o.gold)} gold</b></p>${(b => b ? `<h3 class="sub">What's new</h3>${b}` : '')(notesBlock())}${SW.telemetry.asked() ? '' : playDataLine()}
    <div class="btns"><button class="big" data-act="close">Continue</button></div>`);
};
function settings() {
  modal(`<h3>Settings <span class="ver">v${D.VERSION}</span></h3>
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
  if (ev.t === 'buy') { const P = G.S.posts[ev.post], u = P && P.unit; if (u) { UI.born[u.id] = performance.now() / 1000; setTimeout(() => { UI.dirty = true; AU.play('seat'); }, ENTER_SECS * 1000 + 20); } AU.play('equip'); }      // (it may be gone again already)
  // on the anvil: three blows of the hammer, a tink and a burst of sparks each, and then it is done
  if (ev.t === 'forging') for (let i = 0; i < 3; i++) setTimeout(tink, i * ev.secs * 1000 / 3 + 40);
  // and the new weapon is on the bench: it rings, and shines for a moment. A reroll of its type or its sockets ends the same way
  if (ev.t === 'made' || (ev.t === 'bench' && ev.kind && ev.kind !== 'swap')) { AU.play('forge'); UI.madeAt = performance.now(); setTimeout(() => { const b = document.querySelector('#shop .bench'); if (b) { b.classList.remove('fresh'); void b.offsetWidth; b.classList.add('fresh'); } }, 30); }
  switch (ev.t) {
    // the fight is quiet: soft sounds, and not one for every blow of a full line
    case 'hit': if (ev.who < 0) { if (ev.kind === 'main') { curHit = ev.id; curAt = performance.now(); } AU.play(ev.crit ? 'tapCrit' : 'tap', 0.05, { rate: 0.88 + Math.random() * 0.26 }); } else AU.play(ev.crit ? 'softCrit' : 'soft', ev.crit ? 0.3 : 0.22); break;
    case 'hurt': { AU.play(ev.slam ? 'ouchBig' : 'ouch', 0.18); const c = document.querySelector('.lifebar'); c.classList.remove('hurt'); void c.offsetWidth; c.classList.add('hurt'); break; }
    case 'kill': { const mine = ev.id === curHit && performance.now() - curAt < 60; if (mine) curHit = null;      // (felled by your own blow: its thump takes the place of the ordinary kill sound, and is not laid over it)
      AU.play(ev.boss ? 'win' : mine ? 'pop' : 'fall', mine ? 0.05 : 0.15); AU.play('chink', 0.25); break; }
    case 'tailwind': AU.play('tailwind', 0.2); break;
    case 'spawn': if (G.F.enc && G.F.enc.actBoss) AU.play('boss'); break;
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
    case 'prestige': AU.play('treeOpen', null, Object.assign({ arp: treeStage() === TREE_WHOLE }, RIPPLE)); $('interlude').classList.add('hidden'); UI.sel = null; UI.fresh.clear(); UI.glows = {}; for (const el of document.querySelectorAll('.newglow')) el.classList.remove('newglow'); showPrestige(true); break;      // (the runs of notes are for the whole tree: before it has opened there is only the chord)
    case 'run': UI.pres = false; $('prestige').classList.add('hidden'); $('banner').innerHTML = ''; openTick(); AU.play('level'); UI.dirty = true; UI.render(); flashNew(); break;
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
    case 'craft-open': {      // into crafting by its button: the skill last crafted if you still have it, or the first in the bag
      const last = UI.lastCraft != null && G.find(UI.lastCraft), first = S.bag[0] || (S.bench.sockets.find(k => k.gem) || S.cur.sockets.find(k => k.gem) || {}).gem;
      const g = last ? last.gem : first; if (!g) { ok = false; toast('No skills yet'); break; }
      craftGem(g.id); break;
    }
    case 'bench-type': ok = G.benchReroll('type'); break;        // (the anvil makes its own noise: see 'forging')
    case 'bench-socks': ok = G.benchReroll('socks'); break;
    case 'buy-skill': ok = !!G.buySkill(); break;
    case 'make':      // a new weapon on the bench, for gold (the anvil makes its own noise: see 'forging')
      if (G.S.gold < G.makeCost()) { ok = false; toast('Not enough gold'); break; }
      ok = G.make();
      break;
    case 'equip': case 'equip-yes':     // free and at once, empty sockets or not: the button's own tip says what an empty one costs. With no free slot it is greyed out
      // but still answers a click and a hover (a truly disabled button does neither), so the toast and the tooltip can say what to do
      if (G.emptyPost() < 0) { ok = false; toast('Scrap one weapon first (✕)'); break; }
      // an empty socket is lost for good when the weapon is equipped: if a skill in the bag would go in one, ask first
      if (name === 'equip') {
        const B = G.S.bench, empty = B.sockets.map((k, i) => (k.gem ? -1 : i)).filter(i => i >= 0), fit = empty.filter(i => G.S.bag.some(g => G.fits(g, G.BENCH, i))).length;
        if (fit) { ok = false; modal(`<h3>Equip with ${empty.length === 1 ? 'an empty socket' : empty.length + ' empty sockets'}?</h3><p>Empty sockets are lost when a weapon is equipped. You have ${fit === 1 ? 'a skill that fits' : 'skills that fit'}: right-click a skill to socket it.</p>
          <div class="btns"><button data-act="equip-yes">Equip anyway</button><button class="big" data-act="close">Back</button></div>`); break; }
      } else closeModal();
      ok = G.equip();
      break;
    case 'sell': {      // the card is kept a moment after the weapon is gone, to be seen breaking
      const card = document.querySelector(`#line .card.post[data-post="${+d.post}"]`), html = card ? card.outerHTML.replace(/ style="[^"]*"/, '').replace(/class="card post[^"]*"/, 'class="card post"').replace(/data-act="[^"]*"/g, '') : '';
      ok = G.sell(+d.post);
      if (ok) { AU.play('scrap'); if (html) { (UI.gone || (UI.gone = {}))[+d.post] = { html, at: performance.now() / 1000 }; setTimeout(() => { UI.dirty = true; }, SCRAP_SECS * 1000 + 30); } }
      break; }
    case 'upgrade-cursor': ok = G.upCursor(); if (ok) setTimeout(() => tink('#cursor .card .pic'), 40); break;
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
      if (!nodeUp(id)) { ok = null; break; }      // the ripple has not reached it: there is nothing there to click yet
      if (!S.alloc) { ok = false; toast('Prestige to change the tree'); break; }
      if (G.has(id)) { ok = G.unallocate(id); if (ok) AU.play('click'); }       // any node comes back, for its price, unless others hang from it
      else { ok = G.allocate(id); if (ok) AU.play(D.NODE[id].big ? 'nodeBig' : 'node'); else toast(G.gated(id) ? 'Buy Weapon and Skills first' : !G.touches(id) ? 'Not connected' : `${fmt(G.nodeCost(id) - G.cores())} cores short`); }
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
  else if (UI.sel != null) { const at = G.find(UI.sel); AU.play('deny'); toast(at && G.dupe(at.gem, i, post) && (post === G.CURSOR || G.sockColor(post, i) === G.color(at.gem)) ? (post === G.CURSOR ? 'Already on the cursor' : 'Already on this weapon') : 'Wrong colour'); }
}
/* right click on a skill: socket it (into the first empty socket on the bench that fits), or take it out if it is in one */
function useGem(id) {
  const at = G.find(id); if (!at) return;
  if (at.bag != null) { if (G.autoSocket(id)) AU.play('equip'); else { AU.play('deny'); toast(G.S.bench.sockets.some((s, i) => !s.gem && G.dupe(at.gem, i, G.BENCH) && G.sockColor(G.BENCH, i) === G.color(at.gem)) ? 'Already on this weapon' : G.S.cur.sockets.some((s, i) => !s.gem && G.dupe(at.gem, i, G.CURSOR)) ? 'Already on the cursor' : 'No socket fits'); } }
  else if (G.unsocket(id)) AU.play('click');
}
/* left click on a skill: its crafting, in place of the bag (again, or Back, to close it) */
function craftGem(id) { UI.sel = UI.sel === id ? null : id; if (UI.sel != null) UI.lastCraft = UI.sel; UI.dirty = true; AU.play('click'); }
function clickGem(id, ev) {
  if (ev.altKey) { G.lock(id); UI.dirty = true; return; }
  if (ev.shiftKey) return shiftSalvage(id);
  craftGem(id);
}
/* until there are skills, the skills' part of that pane is not there at all */
function lockSkills() { $('tab-skills').classList.toggle('hidden', !G.skillsOn()); $('left').classList.toggle('bare', !G.skillsOn() && !G.S.posts.length); }
/* What a run has for the first time ever is pointed out: a new pane flashes, and it, or a new button, then glows
   for a good while (GLOW_SECS). glow(key) is what a re-drawn element puts in its class to carry the glow on. */
const GLOW_SECS = 45;
UI.glows = {};
const glow = key => { const t0 = UI.glows[key], now = performance.now() / 1000; return t0 != null && now - t0 < GLOW_SECS ? ` newglow" style="--gd:-${((now - t0) % 1.8).toFixed(2)}s` : ''; };
/* a skill's name in the list, lit for a while the first time that skill can come to you */
const nameGlow = key => { const t0 = UI.glows[key], now = performance.now() / 1000; return t0 != null && now - t0 < GLOW_SECS ? ` newname" style="--gd:-${((now - t0) % 1.8).toFixed(2)}s` : ''; };
function flashNew() {
  const S = G.S, now = G.features(), t = performance.now() / 1000;
  // (a save from before skill names were lit has seen the skills it has: they are not news to it)
  if (!S.unl.skn) { if (S.unl.skills) for (const k in now) if (k.startsWith('sk-')) S.unl[k] = 1; S.unl.skn = 1; }
  if (!S.unl.sln) { if (S.unl.troops) for (const k in now) if (/^(slots|socks|csocks)\d/.test(k)) S.unl[k] = 1; S.unl.sln = 1; }
  const fresh = Object.keys(now).filter(k => !S.unl[k]);
  for (const k of fresh) { S.unl[k] = 1; UI.glows[k] = t; }
  const panes = [];
  if (fresh.includes('troops')) panes.push($('line'), $('shop'));
  if (fresh.includes('skills')) panes.push($('tab-skills'));      // (skills new to find later are lit in the list itself, as a group: see renderSkills)
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
    const t = asEl(ev.target); if (!t) return;
    if (t.id === 'modal') return closeModal();
    if (t.id === 'prestige') return showPrestige(false);
    const b = t.closest('[data-act]'); if (b) { if (!b.disabled) act(b.dataset.act, b, ev); return; }
    const sock = t.closest('[data-sock]'); if (sock) return clickSock(sock, ev);
    const gem = t.closest('[data-gem]'); if (gem) return clickGem(+gem.dataset.gem, ev);
  });
  document.addEventListener('contextmenu', ev => {
    const el = asEl(ev.target), gem = el && el.closest('[data-gem]'); if (!gem) return;
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
    const t = asEl(ev.target); if (!t) return;
    const s = t.closest('[data-sock]');
    if (s) { const [p, i] = s.dataset.sock.split(':').map(Number); if (canPlace(UI.dragging, p, i)) { ev.preventDefault(); s.classList.add('over'); } return; }
    if (t.closest('#tab-skills')) ev.preventDefault();
  });
  document.addEventListener('dragleave', ev => { const s = ev.target.closest && ev.target.closest('[data-sock]'); if (s) s.classList.remove('over'); });
  document.addEventListener('drop', ev => {
    if (UI.dragging == null) return;
    ev.preventDefault();
    const t = asEl(ev.target), s = t && t.closest('[data-sock]'), id = UI.dragging;
    if (s) { const [p, i] = s.dataset.sock.split(':').map(Number); if (G.socket(id, p, i)) AU.play('equip'); }
    else if (t && t.closest('#tab-skills')) { if (G.unsocket(id)) AU.play('click'); }
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
