/* Smeltworks — pixel art. Every sprite is drawn here as a character grid and painted through a palette.
   m:1 means the rows are the left half and get mirrored. */
(function () {
'use strict';
const SW = globalThis.SW;
const SP = SW.sprites = {};

const BASE = { w: '#f1ede4', k: '#15111a', g: '#5b6170', h: '#a3abba', c: '#dfe5f0', y: '#ffd27a', s: '#e0b58a', r: '#ff4a3a', a: '#3a3a44', b: '#6e6e7c', d: '#5a3a28', e: '#9a6a44' };
SP.PAL = {
  // monsters
  ash:    { a: '#45404c', b: '#77717f', c: '#a8a2ad', s: '#e09aaa', r: '#ff5a4a' },
  soot:   { a: '#2b2f3c', b: '#535a6d', c: '#8189a2', r: '#ffd27a' },
  bandit: { a: '#3b2c26', b: '#6f5140', c: '#93745a', d: '#8a2f2f', r: '#ffd27a', g: '#8a909e' },
  boar:   { a: '#46291d', b: '#7c4d35', c: '#a66f4c', s: '#f0c8b0', r: '#ffb0a0' },
  kobold: { a: '#5a3c1a', b: '#b57b38', c: '#e0aa5e', r: '#fff07a', d: '#c94a3a', g: '#6a4a30', s: '#e0aa5e' },
  ember:  { a: '#5a1c12', b: '#b84228', c: '#ff7d3a', r: '#ffe07a' },
  slag:   { a: '#33262a', b: '#6a463c', c: '#ff8a3a', r: '#ffd27a', y: '#fff0a8' },
  bone:   { w: '#e8e4d8', k: '#18141e', r: '#7fe0ff' },
  boneb:  { w: '#bfd0c4', k: '#101a18', r: '#b6ff7a' },
  ghoul:  { a: '#2a4428', b: '#5c8857', c: '#8fbb88', r: '#e0ff5a', s: '#8fbb88' },
  wraith: { a: '#1b3646', b: '#3d788c', c: '#7fc6da', k: '#081016', r: '#b4f6ff' },
  necro:  { a: '#261a36', b: '#49306a', c: '#6d4a9a', d: '#8a7ad9', r: '#c79bff', g: '#6a5a50', s: '#c9b8a0', k: '#0c0812' },
  harpy:  { a: '#35456a', b: '#6c8dc2', c: '#a9caf2', r: '#fff07a' },
  storm:  { a: '#1b2c58', b: '#3a60b4', c: '#7fb6ff', d: '#ffd27a', r: '#b4f6ff', g: '#8a909e', s: '#d9c0a0', k: '#0a1020' },
  stone:  { a: '#3c3d44', b: '#74757e', c: '#a7a8b0', r: '#7fd4ff' },
  spark:  { b: '#3a8fd9', c: '#8fdcff', w: '#ffffff' },
  wyrm:   { a: '#1b4a2c', b: '#3f9c5a', c: '#93e29c', r: '#ffd27a' },
  hell:   { a: '#4c0e14', b: '#a6282a', c: '#e6543a', d: '#ffb03a', e: '#5a3a3a', r: '#ffe07a', g: '#2c2630', h: '#6c5866', y: '#ff8a2a', s: '#e6543a', k: '#12080c' },
  gold:   { a: '#34562a', b: '#6da248', c: '#9fd06a', r: '#ff4a3a', d: '#8a5a1e', e: '#d9a53a', y: '#ffe07a' },
  ogre:   { a: '#56481f', b: '#9a8542', c: '#cbb66a', r: '#ff4a3a', d: '#6c3a22', s: '#8a6a44', y: '#ffd27a' },
  lich:   { a: '#1a2748', b: '#33508c', c: '#5a86dc', d: '#221a34', y: '#ffd27a', r: '#6ff0ff', w: '#e8e4d8', k: '#0c0a14' },
  // the hero
  hero:   { g: '#3e4454', h: '#8891a6', c: '#cfd6e4', d: '#8c2a1c', e: '#c9422c', a: '#3a2a1e', b: '#7a5a3c', y: '#ffb347', r: '#ff7a2a', s: '#e0b58a', k: '#14121a' },
  // gear materials: g/h/c metal, y trim, d grip, r gem
  rust:   { g: '#553525', h: '#96603d', c: '#c58f62', y: '#b38c4a', d: '#4d3628', r: '#c94a3a' },
  iron:   { g: '#444955', h: '#878d9c', c: '#c4cad6', y: '#c9a24d', d: '#684830', r: '#e04a4a' },
  steel:  { g: '#55657c', h: '#a2b6cf', c: '#e6f1ff', y: '#ffd27a', d: '#553726', r: '#4a8cff' },
  dark:   { g: '#211f2d', h: '#4b4760', c: '#8d87ab', y: '#b98aff', d: '#34263a', r: '#c04aff' },
  rune:   { g: '#1b3848', h: '#3f8090', c: '#93e2ea', y: '#ffd27a', d: '#48382a', r: '#5affd9' },
  ember:  { g: '#5a1c12', h: '#c24a22', c: '#ffb25a', y: '#ffe07a', d: '#38221e', r: '#fff07a', a: '#5a1c12', b: '#b84228' },
  star:   { g: '#38488c', h: '#8aa6f2', c: '#f2f7ff', y: '#fff0a8', d: '#38385a', r: '#ff7ad9' },
  void:   { g: '#190e2a', h: '#5c2a8c', c: '#c47dff', y: '#ff5ad9', d: '#281a3a', r: '#5affb0' },
  u_fire: { g: '#6a1408', h: '#e0481a', c: '#ffd05a', y: '#fff0a8', d: '#2a1410', r: '#ffffff' },
  u_stone:{ g: '#3a3428', h: '#8a7c5e', c: '#e0d2a8', y: '#ff8a2a', d: '#2a2218', r: '#ff5a2a' },
  u_storm:{ g: '#123a6a', h: '#2f8ae0', c: '#b4f0ff', y: '#f0f6ff', d: '#1a2440', r: '#ffffff' },
  u_gold: { g: '#7a5210', h: '#e0a52a', c: '#fff0a0', y: '#ffffff', d: '#4a2a14', r: '#ff4a6a' },
  orb_add:    { g: '#8a3408', h: '#ff8a2a', c: '#ffd27a', w: '#fff6d8' },
  orb_remove: { g: '#123e6a', h: '#3a9ae0', c: '#b4f0ff', w: '#ffffff' },
  orb_chaos:  { g: '#36105c', h: '#9a3ae0', c: '#e0a8ff', w: '#ffffff' },
  orb_divine: { g: '#7a6210', h: '#e8cf5a', c: '#fffbe0', w: '#ffffff' },
  // map / ui icons
  icon:   { h: '#c9ccd6', c: '#f1ede4', y: '#ffd27a', d: '#7a5230', e: '#b9823f', g: '#5b6170', r: '#ff7a2a', w: '#f1ede4', k: '#15111a' },
  shrine: { g: '#4a4f66', h: '#8a90b0', r: '#7fe0ff' },
  boss:   { w: '#f1ede4', k: '#15111a', r: '#ff3a2a' },
  glyph:  { b: '#ffffff', c: '#ffffff', a: '#ffffff' },
};

const S = SP.DEF = {};
const def = (name, o, rows) => { S[name] = Object.assign({ rows }, o); };

/* ------------------------------------------------------------ monsters */
def('rat', {}, [
'................',
'................',
'................',
'................',
'................',
'...a..a.........',
'..aca.aca.......',
'..abbabbaaaa....',
'.abbbbbbbbbbaa..',
'abkbbbbbbbbbbba.',
'sbbbbbcbbbbbbbba',
'.abbbbbbbbbbbba.',
'..aabbabbbabba..',
'...a.a.a.a.a.as.',
'..............ss',
'.............ss.']);
def('wolf', {}, [
'................',
'................',
'.a..a...........',
'.aa.aa..........',
'.abaaba.........',
'abbbbbaa......a.',
'brbbbbbbaaaaa.ba',
'bbbbbbbcccbbbaba',
'kbbbbbbbbbbbbbba',
'.wwabbbbbbbbbbb.',
'..aabbbbbbbbbbb.',
'...abbbaaaabbba.',
'...aba.a...aba..',
'...ab..a...ab.a.',
'..aab.aa..aab.a.',
'................']);
def('boar', {}, [
'................',
'................',
'................',
'......aaaaaa....',
'....aabbbbbbaa..',
'.a.abbccccbbbba.',
'.aabbbbbbbbbbbba',
'abbbbbbbbbbbbbba',
'abrbbbbbbbbbbbba',
'sbbbbbbbbbbbbbba',
'ssbwbbbbbbbbbba.',
'.sww.abbbbbbbba.',
'..w..abaaaaaba..',
'.....ab.a..ab.a.',
'....aab.a.aab.a.',
'................']);
def('wyrm', {}, [
'................',
'..aaa...........',
'.abbba..........',
'abrbbba.........',
'abbbbbba....aa..',
'wabbccba...abba.',
'.w.abcba...abba.',
'...abcba..abba..',
'..abbcba.abbba..',
'.abbcbbaabbba...',
'.abccbbabbba....',
'.abbcccbbba.....',
'..abbbbbba......',
'...aaaaaa.......',
'................',
'................']);
def('goblin', {}, [
'................',
'.........dd.....',
'........deed....',
'a.a....deeeed...',
'aaaa..deeeeeed..',
'.abbbadeeyeeeed.',
'abrbbadeyyyeeed.',
'abbbbadeeyeeeed.',
'.awbba.deeeeed..',
'..abbbaadddddd..',
'.aabbbbba.......',
'abbabbbba.......',
'aa.abbbba.......',
'...ab..ab.......',
'...ab..ab.......',
'..aab.aab.......']);
def('caster', {}, [
'.r..............',
'rwr....aaaa.....',
'.r....abbbba....',
'.g...abbbbbba...',
'.g...abkkkkba...',
'.g...abrkkrba...',
'.g...abkkkkba...',
'.g..aabbbbbbaa..',
'.gsabbbbddbbbba.',
'.g.abbbbddbbbsa.',
'.g..abbbddbba...',
'.g..abbbddbba...',
'.g..abbbbbbba...',
'.g.abbbbbbbbba..',
'.g.abbbbbbbbba..',
'...aaaaaaaaaaa..']);
def('bat', { m: 1 }, [
'........',
'........',
'a.......',
'ba......',
'bba...a.',
'bbba..ba',
'bcbba.bb',
'bcbbbabb',
'bbcbbbrb',
'abbbbbbb',
'.abbbbbw',
'..abaabb',
'..aa..ab',
'.......a',
'........',
'........']);
def('slime', { m: 1 }, [
'........',
'........',
'........',
'........',
'......aa',
'....aabb',
'...abbcc',
'..abbccb',
'.abbcbbb',
'.abbbbbb',
'abbbkkbb',
'abbbkkbb',
'abbbbbbk',
'abbbbbbb',
'.aabbbbb',
'...aaaaa']);
def('imp', { m: 1 }, [
'........',
'.a......',
'.ba.....',
'..ba..aa',
'..aba.ab',
'a..abbbb',
'baabbrbb',
'.babbbbb',
'..abbwbw',
'...abbbb',
'..aabbbb',
'.abbabcb',
'.ab.abbb',
'.a..abba',
'...abb..',
'..aabb..']);
def('golem', { m: 1 }, [
'........',
'.....aaa',
'....abbb',
'....abrb',
'....abbb',
'.aaaaabb',
'abbbabbb',
'abcbabcb',
'abbbabcc',
'abbbaabb',
'abba.abb',
'abba.abb',
'.aa..abb',
'....abba',
'....abba',
'...aabba']);
def('skeleton', { m: 1 }, [
'........',
'.....www',
'....wwww',
'....wkkw',
'....wkrw',
'.....www',
'......wk',
'...ww.ww',
'..ww.wkw',
'..w..www',
'..w..wkw',
'..w...ww',
'.....www',
'....ww..',
'....w...',
'...ww...']);
def('ghoul', { m: 1 }, [
'........',
'.....aaa',
'....abbb',
'....arbb',
'....abbw',
'..aaabbb',
'.abbbbbb',
'abbabbcb',
'ab.abbcb',
'ab.abbbb',
'ab..abbb',
'ss..abbb',
's...abab',
'....ab..',
'....ab..',
'...aab..']);
def('wraith', { m: 1 }, [
'........',
'.....aaa',
'....abbb',
'...abbbb',
'...abkkk',
'...abkrk',
'...abkkk',
'..abbbbb',
'.abbcbbb',
'abbbcbbb',
'ab.abcbb',
'a..abbbb',
'...abbab',
'....ab.a',
'....a...',
'........']);
def('wisp', { m: 1 }, [
'........',
'...c....',
'........',
'.c...bbb',
'....bccc',
'...bccww',
'c..bcwww',
'...bcwww',
'...bccww',
'....bccc',
'.c...bbb',
'........',
'...c....',
'......c.',
'........',
'........']);
def('knight', { m: 1 }, [
'.......d',
'......dd',
'.....ggg',
'....ghhh',
'....ghkk',
'....ghhh',
'..gggghh',
'.ghhgghh',
'.ghhgghy',
'.gh.gghh',
'.gh.gghh',
'.gs..ggg',
'....gh.g',
'....gh..',
'....gh..',
'...ggh..']);
def('bandit', { m: 1 }, [
'........',
'.....aaa',
'....abbb',
'....asss',
'....adkd',
'....adds',
'..aaabbb',
'.abbabbc',
'.ab.abbc',
'.as.abbb',
'.g..addd',
'.g..abbb',
'.g..ab.a',
'....ab..',
'....ab..',
'...kkb..']);

/* --------------------------------------------------------------- bosses (24×24) */
def('ogre', { m: 1 }, [
'............',
'............',
'........aaaa',
'......aabbbb',
'.....abbbbbb',
'.....abbrrbb',
'.....abbbbbb',
'.....abwbbbb',
'....aabwbbkk',
'..aaabbbbbbb',
'.abbbbbbbbbb',
'abbbbabbbbcc',
'abbbbabbbccc',
'abbba.abbccc',
'abbba.abbccc',
'abba..abbbcc',
'abba..abbbbb',
'.sss..abbbbb',
'.sss..addddd',
'......adddyd',
'......abba..',
'.....abba...',
'.....abba...',
'....aabba...']);
def('bgolem', { m: 1 }, [
'............',
'............',
'.......aaaaa',
'......abbbbb',
'......abrrbb',
'......abbbbb',
'......abkckc',
'...aaaaabbbb',
'..abbbbaabbb',
'.abbcbbbabbb',
'abbcbbbbabcy',
'abbbbbbbabyy',
'abbbbbbbabcy',
'abbbbbba.abb',
'.abbbba..abb',
'.abbbba..abb',
'.abbba...abb',
'.abbba..aabb',
'abbbbba.abbb',
'abbcbba.abba',
'abbbbba.abba',
'.aaaaa..abba',
'.......aabba',
'......aaabba']);
def('lich', { m: 1 }, [
'.....y.....y',
'.....yy...yy',
'.....yyyyyyy',
'.....yryyyyr',
'......wwwwww',
'.....wwwwwww',
'.....wwkkwww',
'.....wwkrwww',
'.....wwwwwwk',
'......wwwwww',
'......wkwkwk',
'..aa...wwwww',
'.abbaaaadddd',
'abbbbbbadddd',
'abcbbbbbaddd',
'abcbbbbbaddy',
'abbbabbbbadd',
'abba.abbbbad',
'aba..abbcbbb',
'ww...abbcbbb',
'w.w..abbbcbb',
'.....abbbbbb',
'....abbbbbbb',
'....aaaaaaaa']);
def('dragon', { m: 1 }, [
'............',
'a...........',
'ba..........',
'bba......a..',
'bbba....aba.',
'bbbba...abba',
'bcbbba..abbb',
'bcbbbba.abbb',
'bccbbbbaabbb',
'bcbcbbbbabrb',
'bcbbcbbbabbb',
'bcbbbcbbbabb',
'acbbbbcbbabb',
'.abbbbbbbabk',
'..abbbbbbbab',
'...aabbbbbbw',
'.....abbbbww',
'......abbbbb',
'......abcccc',
'.....abbcccc',
'.....abbcccc',
'....abbabccc',
'...abba.abcc',
'...www..aaaa']);
def('demon', { m: 1 }, [
'..a.........',
'..ba........',
'..bba.......',
'..abba...aaa',
'...abbaaabbb',
'....abbbbbbb',
'.....abbrrbb',
'.....abbbbbb',
'.....abbwkwk',
'..ggg.abbbbb',
'.ghhhgaabbbb',
'ghhdhhgabbcc',
'ghhhhhgabccc',
'.ggggg.abccc',
'.abbba.abbcd',
'abbba..abbbd',
'abba...gggdd',
'abba..ghhhgg',
'.ddd..ghhhg.',
'.drd..ghhg..',
'......abba..',
'.....abba...',
'.....abba...',
'....kkkka...']);

/* ------------------------------------------------------------- the hero */
def('hero', {}, [
'......dd........',
'.....ddgggg.....',
'....ddghhhhg....',
'....d.ghcchhg...',
'......gkkryrg...',
'......ghhhhhg...',
'.....agggggga...',
'...eeghhhhhhhg..',
'..eedghcchhhhgs.',
'..eedghchhyhhgs.',
'.eeed.gbbbbbg...',
'.eedd.ghhghhg...',
'.eed..ghg.ghg...',
'.ed...ghg.ghg...',
'......ghg.ghg...',
'.....kkkk.kkkk..']);

/* ----------------------------------------------------------------- gear */
def('sword', {}, [
'.............ch.',
'............chg.',
'...........chg..',
'..........chg...',
'.........chg....',
'........chg.....',
'.......chg......',
'......chg.......',
'.y...chg........',
'.yy.chg.........',
'..yyhg..........',
'...yyy..........',
'..dd.yy.........',
'.dd...y.........',
'rd..............',
'................']);
def('axe', {}, [
'................',
'......ggg.......',
'.....ghhhgg.d...',
'....ghcchhhgd...',
'....gcchhhhhd...',
'....ghhhhhhdg...',
'.....ghhhhdg....',
'......ggghdg....',
'.........d.g....',
'........d.......',
'.......d........',
'......d.........',
'.....d..........',
'....d...........',
'...yd...........',
'...y............']);
def('hammer', {}, [
'................',
'.........ggg....',
'........ghhhg...',
'.......ghcchhg..',
'......ghcchhhhg.',
'.....ghhhhhhhg..',
'.....ghhhhhhdg..',
'......ghhhhdd...',
'.......ghgdd....',
'........gdd.....',
'........dd......',
'.......dd.......',
'......dd........',
'.....dd.........',
'....yd..........',
'....y...........']);
def('shield', { m: 1 }, [
'........',
'.ggggggg',
'ghhhhhhh',
'ghcchhhy',
'ghchhhyy',
'ghhhhyyr',
'ghhhhyyr',
'ghhhhhyy',
'ghhhhhhy',
'.ghhhhhh',
'.ghhhhhh',
'..ghhhhh',
'...ghhhh',
'....gghh',
'......gg',
'........']);
def('lantern', { m: 1 }, [
'......gg',
'.....g..',
'.....g..',
'....gggg',
'...ghhhh',
'...gyyyy',
'...gyrry',
'..ggyrwr',
'..ggyrwr',
'...gyrry',
'...gyyyy',
'...ghhhh',
'....gggg',
'...ggggg',
'........',
'........']);
def('helm', { m: 1 }, [
'.......r',
'.....ggr',
'...gghhh',
'..ghhcch',
'.ghhchhh',
'.ghhhhhy',
'.ghhhhhy',
'.gkkkkhy',
'.ghkkkhy',
'.ghhhkhy',
'.ghhhkhh',
'.ghh.khh',
'..gh..gh',
'..gg..gg',
'........',
'........']);
def('chest', { m: 1 }, [
'........',
'.gg...gg',
'ghhg.ghh',
'ghhhghhh',
'ghchhhhy',
'.ghchhhy',
'.ghhhhyy',
'.ghhhhhy',
'.ghhhhhy',
'..ghhhhy',
'..ghhhhh',
'..gddddd',
'..gyyydr',
'..ghhhhh',
'...ggggg',
'........']);
def('gloves', {}, [
'................',
'.....g.g.g......',
'....ghghghg.....',
'....ghghghg.g...',
'....ghghghgghg..',
'....ghhhhhgghg..',
'....ghcchhhhhg..',
'....ghchhhhhg...',
'....ghhhhhhg....',
'.....ghhhhg.....',
'.....gyyyyg.....',
'.....ghhhhg.....',
'....ghhhhhhg....',
'....ghcchhhg....',
'....gggggggg....',
'................']);
def('pants', { m: 1 }, [
'........',
'..dddddd',
'..dyydyr',
'..ghhhhh',
'..ghchhh',
'..ghchhh',
'..ghhhhg',
'..ghhhg.',
'..ghhhg.',
'..gyyyg.',
'..ghhhg.',
'..ghchg.',
'..ghhhg.',
'..ghhhg.',
'..gggg..',
'........']);
def('boots', {}, [
'................',
'....gggggg......',
'....ghhhhg......',
'....ghchhg......',
'....ghchhg......',
'....gyyyyg......',
'....ghhhhg......',
'....ghchhg......',
'....ghhhhgg.....',
'....ghhhhhhgg...',
'....ghhhhhhhhg..',
'....ghchhhhhhhg.',
'....ghhhhhhhhhg.',
'....dddddddddddd',
'....dddddddddddd',
'................']);
def('amulet', { m: 1 }, [
'....yyyy',
'...y....',
'..y.....',
'..y.....',
'..y.....',
'...y....',
'....y...',
'.....y..',
'......yy',
'.....ygg',
'....ygrr',
'....ygrw',
'....ygrr',
'.....ygg',
'......yy',
'........']);
def('ring', { m: 1 }, [
'........',
'........',
'......gg',
'.....grr',
'.....grw',
'......gg',
'....yyyy',
'...yy...',
'..yy....',
'..y.....',
'..y.....',
'..yy....',
'...yy...',
'....yyyy',
'........',
'........']);

/* ------------------------------------------------------------ map icons */
def('i_fight', { m: 1 }, [
'........',
'c.......',
'ch......',
'.ch.....',
'..ch....',
'...ch...',
'....ch..',
'.....ch.',
'..y...ch',
'..yy.ych',
'...yyy.c',
'..ddyy..',
'.dd..y..',
'dd......',
'........',
'........']);
def('i_elite', { m: 1 }, [
'........',
'........',
'....wwww',
'...wwwww',
'..wwwwww',
'..wwkkww',
'..wwkkww',
'..wwwwwk',
'...wwwww',
'....wkwk',
'....wwww',
'........',
'........',
'........',
'........',
'........']);
def('i_boss', { m: 1 }, [
'r.......',
'rr......',
'.rr.....',
'.rrr.www',
'..rrwwww',
'...wwwww',
'..wwkkww',
'..wwrkww',
'..wwwwwk',
'...wwwww',
'....wkwk',
'....wwww',
'.....www',
'........',
'........',
'........']);
/* impassable rock on the map: a pile of boulders, painted with the 'stone' palette */
def('i_rock', {}, [
'................',
'................',
'......kkkk......',
'.....kccbbk.....',
'....kccbbbbk....',
'...kccbbbbbak...',
'...kcbbbbbaak...',
'..kkbbbbbaaakk..',
'.kcckbbbaaakbbk.',
'kccbbkaaakkcbbak',
'kcbbbbkkkccbbbak',
'kcbbbbakcbbbbaak',
'kbbbbaakbbbbaaak',
'kbbaaaakbbaaaaak',
'.kkkkkkkkkkkkkk.',
'................']);
def('i_chest', { m: 1 }, [
'........',
'........',
'........',
'..dddddd',
'.deeeeee',
'.deeeeee',
'.dyyyyyy',
'.deeeeyk',
'.deeeeyy',
'.deeeeee',
'.deeeeee',
'.ddddddd',
'........',
'........',
'........',
'........']);
def('i_shrine', { m: 1 }, [
'........',
'.......g',
'......gh',
'......gh',
'.....ghr',
'.....grr',
'.....ghr',
'....ghhh',
'....ghrh',
'....ghhr',
'....ghhh',
'...ghhhh',
'..gggggg',
'.ggggggg',
'........',
'........']);
def('i_start', { m: 1 }, [
'........',
'........',
'.......r',
'......rr',
'.....ryr',
'.....ryy',
'....ryyw',
'....ryww',
'....ryyw',
'.....ryy',
'..d..dry',
'...dddyd',
'....dddd',
'..ddd.dd',
'........',
'........']);
def('i_flask', { m: 1 }, [
'........',
'.....ddd',
'.....ddd',
'......hh',
'......hc',
'.....hcc',
'....hccc',
'...hrrrr',
'...hrrwr',
'...hrrrr',
'...hrrrr',
'....hrrr',
'.....hhh',
'........',
'........',
'........']);

def('orb', { m: 1 }, [
'........',
'........',
'.....ggg',
'...gghhh',
'..ghhhcc',
'..ghhccw',
'.ghhhccw',
'.ghhhhcc',
'.ghhhhhc',
'.ghhhhhh',
'..ghhhhh',
'..gghhhh',
'...ggghh',
'.....ggg',
'........',
'........']);

/* -------------------------------------------------- skill glyphs (12×12, one colour) */
const gl = (name, rows, full) => def('g_' + name, { m: full ? 0 : 1, glyph: 1 }, rows);
gl('strike', ['..bbbb', '.bbbbb', '.bbbbb', '.bbbbb', '..bbbb', '.....b', '.....b', '.....b', '.....b', '.....b', '.....b', '....bb']);
gl('sunder', ['b.....', 'bb....', '.bb...', '.bbb..', '..bbb.', '..bbbb', '...bbb', '...bb.', '....bb', '....b.', '.....b', '.....b']);
gl('quake', ['......', '.....b', '....bb', '....bb', '...bb.', '..bb..', '.bb..b', 'bb..bb', 'b..bb.', '..bb..', '.bb..b', 'bb..bb']);
gl('ironskin', ['......', '.bbbbb', '.b....', '.b.bbb', '.b.bbb', '.b.bbb', '.b..bb', '..b.bb', '..b..b', '...b..', '....bb', '......']);
gl('meteor', ['.b....', '..b..b', '..b..b', '...b.b', '...b.b', '....bb', '...bbb', '..bbbb', '..bbbb', '..bbbb', '...bbb', '....bb']);
gl('heavy', ['......', '....bb', '...b..', '...b..', '..bbbb', '.bbbbb', '.bbbbb', 'bbbbbb', 'bbbbbb', 'bbbbbb', '.bbbbb', '......']);
gl('tempered', ['......', '......', 'bbbbbb', 'bbbbbb', '.bbbbb', '...bbb', '....bb', '....bb', '...bbb', '..bbbb', '.bbbbb', '.bbbbb']);
gl('crush', ['.....b', '.....b', '.....b', '.b...b', '.bb..b', '..bb.b', '...bbb', '....bb', '......', 'bb.bb.', 'b.bb.b', '.bb.bb']);
gl('cinder', ['........b...', '.......bb...', '......bbb...', '.....bbb....', '....bbbb.b..', '...bbbb.bb..', '..bbbbbbbb..', '..bbbbbbbb..', '..bbb.bbbb..', '..bb...bb...', '...b...b....', '............'], 1);
gl('wave', ['......', '..bb..', '.bbbb.', 'bb..bb', 'b....b', '......', '..bb..', '.bbbb.', 'bb..bb', 'b....b', '......', '......']);
gl('brand', ['....bb', '..bb..', '.b....', '.b...b', 'b...bb', 'b..bbb', 'b..bbb', 'b...bb', '.b...b', '.b....', '..bb..', '....bb']);
gl('forgeheart', ['......', '.bbb..', 'bbbbb.', 'bbbbbb', 'bbbbbb', 'bbbbbb', '.bbbbb', '..bbbb', '...bbb', '....bb', '.....b', '......']);
gl('eruption', ['.b...b', '..b..b', '.....b', '..b..b', '...b.b', '.....b', '....bb', '...bbb', '..bbbb', '.bbbbb', 'bbbbbb', 'bbbbbb']);
gl('kindling', ['......', '.....b', '....bb', '....bb', '...bbb', '..bbbb', '..bbbb', '..bb.b', '..bb..', '...b..', '....bb', '......']);
gl('backdraft', ['.bbbbb', '.b....', '.b...b', '.b..bb', '.b..bb', '.b.bbb', '..b.bb', '..b..b', '...b..', '....b.', '.....b', '......']);
gl('combust', ['.....b', '.b...b', '..b..b', '...b..', '....bb', 'bbb.bb', 'bbb.bb', '....bb', '...b..', '..b..b', '.b...b', '.....b']);
gl('jab', ['.......bbb..', '......bbb...', '.....bbb....', '....bbb.....', '...bbbbbbb..', '..bbbbbbb...', '.....bbb....', '....bbb.....', '...bbb......', '..bbb.......', '..bb........', '..b.........'], 1);
gl('chain', ['bb..........', 'bbb.........', '.bbb..bb....', '..bbbbbbb...', '...bbb.bbb..', '........bbb.', '.bb......bb.', '.bbb..bb.bb.', '..bbbbbbbb..', '...bbb.bb...', '............', '............'], 1);
gl('lance', ['.....b', '....bb', '....bb', '....bb', '.b..bb', '..b.bb', '....bb', '..b.bb', '.b..bb', '....bb', '...bbb', '.....b']);
gl('overcharge', ['.....b', '....bb', '...bbb', '..bb.b', '.bb...', '.....b', '....bb', '...bbb', '..bb.b', '.bb...', '......', '......']);
gl('tempest', ['...bbb', '.bbbbb', 'bbbbbb', 'bbbbbb', '.bbbbb', '......', '.b...b', '.b..b.', 'b...b.', 'b..b..', '...b..', '......']);
gl('conduct', ['.....b', '.....b', '...bbb', '..b...', '.b...b', '.b..bb', 'bbb.bb', '.b...b', '.b....', '..b...', '...bbb', '.....b']);
gl('aftershock', ['....bb', '..bb..', '.b....', '.b..bb', 'b..b..', 'b.b..b', 'b.b..b', 'b..b..', '.b..bb', '.b....', '..bb..', '....bb']);
gl('quicken', ['bbbbbb', '.b....', '.bb...', '..bbbb', '...bbb', '....bb', '....bb', '...b..', '..b...', '.b...b', '.b.bbb', 'bbbbbb']);
gl('punch', ['......', '..bbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '..bbbb', '...bbb', '...bbb', '...bbb', '......', '......']);

/* ------------------------------------------------------------- painting */
const cache = new Map();
function grid(name) {
  const d = S[name];
  if (d.grid) return d.grid;
  const rows = d.m ? d.rows.map(r => r + r.split('').reverse().join('')) : d.rows;
  return (d.grid = rows);
}
SP.size = name => { const g = grid(name); return { w: g[0].length + 2, h: g.length + 2 }; };
/* returns a canvas with the sprite at 1px per cell, plus a dark outline. opts: flash (all white), tint */
SP.canvas = function (name, pal, mode) {
  const key = name + '|' + pal + '|' + (mode || '');
  let c = cache.get(key);
  if (c) return c;
  const g = grid(name), w = g[0].length, h = g.length, P = Object.assign({}, BASE, SP.PAL[pal] || {});
  c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2;
  const x = c.getContext('2d');
  const solid = (i, j) => i >= 0 && j >= 0 && j < h && i < w && g[j][i] !== '.';
  if (!S[name].glyph) {
    x.fillStyle = mode === 'flash' ? '#ffffff' : '#0a0810';
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
      if (!solid(i, j) && (solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1))) x.fillRect(i + 1, j + 1, 1, 1);
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = g[j][i]; if (ch === '.') continue;
    x.fillStyle = mode === 'flash' ? '#ffffff' : mode === 'shade' ? '#000000' : (P[ch] || '#ff00ff');
    x.fillRect(i + 1, j + 1, 1, 1);
  }
  cache.set(key, c);
  return c;
};
const urls = new Map();
SP.url = function (name, pal, scale) {
  scale = scale || 3;
  const key = name + '|' + pal + '|' + scale;
  let u = urls.get(key);
  if (u) return u;
  const src = SP.canvas(name, pal), c = document.createElement('canvas');
  c.width = src.width * scale; c.height = src.height * scale;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, c.width, c.height);
  u = c.toDataURL(); urls.set(key, u);
  return u;
};
SP.draw = function (ctx, name, pal, x, y, scale, o) {
  const c = SP.canvas(name, pal, o && o.mode);
  const w = c.width * scale, h = c.height * scale;
  ctx.save();
  ctx.translate(x, y);
  if (o && o.rot) ctx.rotate(o.rot);
  ctx.scale((o && o.flip ? -1 : 1) * (o && o.sx || 1), o && o.sy || 1);
  if (o && o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.imageSmoothingEnabled = false;
  // anchor: bottom centre unless told otherwise
  const ax = o && o.ax != null ? o.ax : 0.5, ay = o && o.ay != null ? o.ay : 1;
  ctx.drawImage(c, -w * ax, -h * ay, w, h);
  ctx.restore();
};
})();
