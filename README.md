# Smeltworks Idle

An idle game in the Smeltworks world. You begin with the cursor and nothing else. Every level a run clears pays
**cores**; prestige banks them, and they buy nodes on the prestige tree. The tree gives first a weapon,
then its first socket and skills with it, or the means to upgrade it. You make weapons that strike by
themselves out of skills, which drop from what you kill and which gold buys. More weapons, more sockets and
higher tiers of skill are all on the tree, each dearer than the last: any run pays something towards them, a
deeper one pays more, and within a run skills and upgrades are what make you stronger.

Open `index.html` in a browser: there is nothing to build or install.
(If you prefer a server: `python -m http.server 8438` in this folder, then http://localhost:8438.)

It is a separate game from `../smeltworks` and shares nothing with it at run time. `js/sprites.js` and
`js/audio.js` are copies of that game's files; everything else is new.

## The game

- **The arena** is seen from above. Enemies **roam** it: an encounter drifts about the floor as one (a pack
  stays a pack), each member meanders a little round its own place in it, and each **stops where it stands to
  attack**, for most of a second before its swing and a moment after, then hurries to catch up. They swing at the
  air, and every swing takes Life. A stunned enemy does not move, and Chill slows its feet as well as its swings.
  So the cursor has to follow them. Your weapons stand round them on a ring. The hammer, axe, sword and dagger fight hand to hand: each walks to
  its target, swings and walks home. The bow and the staff shoot, and you can watch the shot fly.
- **Levels.** Each level is ten fights. The first nine are rolled as one tough monster, a **pack** of three to
  five, or a **swarm** of six to eight. A group appears well spread out. The tenth is a boss, and which kind goes by the level number: three
  Elders (levels ending 1, 6), one Elder (2, 3, 7, 8), an Elder with a warband of six (4, 9), or the act's own
  boss with four guards (5, 0), which slams on every fourth swing. The five acts come round again after level 25.
  **A level is ten fights on one bar of Life, and most of that Life goes in the nine ordinary fights.** On a level
  a line can only just clear, they take about half the bar between them (5 or 6% each) and the boss about a fifth,
  whichever kind of boss it is. A boss has two to four times an ordinary monster's life, not seven to twelve as it
  used to, and the act boss's slam is 1.6 times its swing, not 2.2. So a level that is too much is felt from its
  first fights, and one level is about as much harder than the last as any other: runs stop at level 6, 9, 11 or 13,
  not only at the act bosses. (Measured before this: the nine fights took 16% of a bar between them and an act
  boss 62%, and 99% of lost attempts ended on the boss, four in five of those on an act boss.)
  After the last fight of a level there is a short **interlude**, a little over two seconds: the arena dims and
  says the level is cleared, what it paid in cores and what the run has earned so far, and which level is next.
- **Overkill carries.** What a blow has left over when its enemy dies goes on to the nearest enemy still standing,
  and from that one to the next, until it is spent **or the blow has carried as far as its weapon can**: an axe to
  4 more enemies, a hammer 3, a sword or staff 2, a bow, a dagger or the cursor 1. That is one allowance for the
  whole blow, splash, arc and pierce included; a Shockwave carries nothing. Carried damage is damage and nothing
  else: it lays on no Chill, Stun, Brittle or Burn and takes no bonus. The slower the weapon the further it
  carries, so against small enemies every type clears about as fast as its power says, and no single blow clears a
  swarm: at level 2 a bare sword takes two or three blows to a swarm and one or two to a pack. (Measured: with
  everything dying in one blow and no carrying, an axe line killed at 0.52 of its power and a dagger line at
  1.30; with it, 1.15 and 1.11.)
- **Life.** The cursor and the weapons share one bar. You begin with 100, and a weapon brings none of its own:
  more Life is on the **prestige tree** (a node of +100 four steps north of the middle; four of +25 and
  another +100 in the south-east: 400 in all), plus up to 100 from Life affixes. It is **full at the start of a level and has
  to last all ten fights**: what is left carries from one fight to the next. There is no clock: the only thing
  that takes Life is an enemy's swing, and nothing soaks it. A group hits less hard in all than a lone monster
  does; what it costs is time. Weapons go on winding up between fights, so a blow that was nearly ready lands as
  the next fight opens. Run out on a boss and the
  level starts over; run out in any other fight and you fall back a level, and climb again from there. A cleared
  level always leads straight on to the next: there is no switch for it.
- **The cursor** is aimed. Inside the arena the system pointer is hidden and the cursor's circle is the pointer,
  so there is nothing for it to trail behind. A click lands on every enemy the circle touches; a click on empty
  floor does nothing. Each blow starts a one-second cooldown, and holding the button strikes the moment it is
  up. The cursor has **no sockets**: its blow is 6 from first to last. The line's two auras reach it (a Damage
  Aura adds to the blow, an Attack Speed Aura shortens the cooldown), and it gains from what your weapons have
  done to the enemy. It gets a new game started; after that the weapons do the work.
- **Weapons.** A weapon is its type and the skills that went into it: there is no quality roll, and every
  sword is the same sword. Nothing is levelled
  up, and a weapon never changes once made.

  | Weapon | Reach |
  | --- | --- |
  | Hammer | Splashes round its target for 40% |
  | Staff | Arcs on to a second enemy for 50% |
  | Bow | Pierces everything in its line for 50% |
  | Axe, sword, dagger | One target, and about a quarter more damage to it |

- **The Forge**, at the top of the right-hand pane, is an anvil and a bench (it is "the crafter" in what follows, and in the code). **Forge weapon** costs gold and puts a new
  weapon on the bench: a random type, and a roll of sockets: 30% of the time every socket the tree has unlocked (up to six), 55% one short, 15% two short, never fewer than one. Sockets it missed show as faint outlines. Set skills in its
  sockets; they go in and out freely. With the tree's **Rerolls** node you can reroll its **type** alone or its
  **sockets** alone (their colours, never how many: a weapon that rolled short stays short), for gold, with the same second and a half at the anvil and the same three blows as a new weapon, and the same ring and shine when it is done. Either costs 1.6 times a new weapon (8 kills' gold against 5), since it keeps the half you liked; the whole weapon again is **New** (the same price as Make: a different weapon,
  and the skills in the old one back in your bag). **Equip** is free, needs an empty weapon slot (with none, the button is greyed out, and its tooltip and the toast on a click both say to scrap one weapon first), and is final: the
  skills in it become its stats (each effect a tag in its colour, the secondary affixes a list underneath,
  added together), nothing in it can be reached again, and the bench is bare until you make another. To
  improve a weapon, make its successor, scrap the old one with the ✕ on its card (its skills are salvaged for
  gold), and equip.
- **Skills are the only thing that makes you stronger.** They drop from fights (seldom: under two a level; an act's boss
  always, any other boss every second time; the first three fights of every run always, chosen to fit the weapon on the bench), and with the
  tree's **Market** node **gold buys them**: Buy a random skill, above the bag, gives one as your deepest level drops them, for eight kills' worth
  of that level's gold.

  A skill is one **primary affix**, which is its effect and sets its colour, and one or two **secondary
  affixes**, which are plain stats.

  **Each colour's skills are unlocked on the prestige tree** (Might, Hex, Aid: a node each). Until you hold a
  colour's node, a skill of that colour comes as a **plain** one (named for its colour: Might, Hex or Aid): it has the
  colour, so it fits that colour's socket, and its secondary affixes, and no effect of its own. Once you hold
  the node that colour drops, and is bought, as its real skills; plain ones you already have stay as they are.
  **Skills drop more often the more kinds there are to drop**: a new game has three (the plain ones), each colour's node opens its real ones, and with all ten open drops come 10/3 as often, so any one kind comes as often as it did before. A boss's drops do not grow: an act's boss drops one, any other boss one every second time. **Skills are scarce**: an ordinary fight's chance of a drop is about 4% with no colour open (it was 11%), so a level drops about one skill with no colour open and under two with all of them (it was four to six). The bag is filled by buying and crafting more than by luck.
  **The fuller the bag, the slower skills drop.** Every drop's chance, a boss's too, is divided by one plus an eighth of the skills lying loose in the bag: half as often with eight held, a third with sixteen. Salvage or socket what you have and they come at the full rate again.
  **Drops are evened out a little.** The run keeps count of how far its drops are behind (or ahead of) what the odds owed, and half of that goes onto the next fight's chance, so there are no long dry spells; **Which skill drops goes by the bag: empty rows first.** Each copy of a kind already in its row makes that kind thirty times less likely, so with one row empty and a copy in each of the other nine, three drops in four are for the empty row; among rows as empty as each other, the kind that came last is passed over three times in four. A skill bought at the Market is chosen the same way.

  | Colour | Its skills (the primary affix is flat: always this, at any tier) |
  | --- | --- |
  | Red, Might | Twin Strike (25% chance to strike twice), Shockwave (every 6s, everything for 200%), Deathblow (criticals deal +100% damage: triple, not double) |
  | Blue, Hex: every hit afflicts | Frostbite (Chill: attacks 30% slower, 4s), Concuss (Stun 0.5s; a boss half), Shatter (Brittle: +3% damage taken a stack, to ten), Ignite (Burn for 60% of the hit) |
  | Green, Aid: for the whole line and the cursor | Damage Aura (+25%), Attack Speed Aura (+15%), Defense Aura (enemies deal 20% less damage). One of each counts; a second does nothing, and its tag is struck through |

  **One of each to a weapon.** A weapon takes a skill once: a second Twin Strike (or Ignite, or any other) will not go into a socket beside the first, though it can take the first one's place. The plain skills, Might, Hex and Aid, go in as many times as there are sockets, so a weapon with three red sockets holds Twin Strike, Shockwave and a plain Might. The skills a run starts with, and the ones the first fights owe an empty weapon, are dealt so that all of them fit. An old save's second copies go back to the bag.

  **Tiers.** There are **five**. A skill's tier is the number on its icon, and it is rolled as the skill drops
  or is bought: which tier is luck, and **every tier node on the tree tilts the odds towards the top**. Nothing
  else comes of a tier node: no multiplier, only more tier 4s and 5s and fewer tier 1s.

  | Tier points held | T1 | T2 | T3 | T4 | T5 |
  | --- | --- | --- | --- | --- | --- |
  | none | 77% | 23% | none | none | none |
  | 3 | 68% | 30% | 2% | none | none |
  | 6 | 50% | 33% | 14% | 2% | none |
  | 10 | 21% | 24% | 26% | 24% | 5% |
  | 15 | 3% | 6% | 12% | 26% | 54% |
  | all 19 | under 1% | 2% | 6% | 20% | 72% |

  **The upper tiers are not there to begin with.** Tier 3 is first seen with three tier points, tier 4 with six and tier 5 with ten: each is rare when it first appears and comes into its full share six points later.

  **Each tier has its own colour**, the same wherever a tier is shown (an affix's tag, a skill's badge, its crafting): T1 dim grey, T2 pale, T3 cream, T4 gold, T5 gold filled in. A tier 2 affix looks the same on every skill, whether or not it is the best that skill could roll.

  Each secondary affix rolls a tier of its own, anywhere from T1 up to the skill's tier (every tier as likely as
  another), so a tier 4 skill can still roll a tier 1 affix. An affix at a tier is always worth the same, and the
  tiers **flatten towards the top**: T5 is twice T1, and only a little more than T4. There are no ranges.

  | Secondary affix | T1 | T2 | T3 | T4 | T5 |
  | --- | --- | --- | --- | --- | --- |
  | Damage | +25% | +35% | +43% | +48% | +50% |
  | Attack speed | +12% | +17% | +20% | +23% | +24% |
  | Critical chance (a critical is double; triple with Deathblow) | +6% | +8% | +10% | +11% | +12% |
  | Boss damage | +35% | +49% | +60% | +67% | +70% |
  | Gold, for the whole line | +12% | +17% | +20% | +23% | +24% |
  | Life, for the whole line (+200 at most) | +20 | +28 | +34 | +38 | +40 |
  | Cursor damage: the cursor only, from any weapon on the line | +40% | +56% | +68% | +76% | +80% |
  | Life on kill, for the whole line (+5 a kill at most) | +1 | +1.4 | +1.7 | +1.9 | +2 |

  The last two are there to be passed over as often as wanted: Cursor damage does nothing for a line left to fight alone, and Life on kill gives little against a boss. With them, damage, attack speed and criticals are under half of what an affix rolls as (25 in 52; it was 25 in 40).

  A craft costs by how deep the run has been (as a new weapon and a bought skill do), not by the skill's tier, and so does what a salvaged skill pays.

  A skill drops with **one or two** secondary affixes, never none, and the bright pips on its icon show how
  many. From level 5 a skill has a growing chance of a second, and from level 29 they all have two. A boss's
  skill is twice as likely to have it. A third only ever comes from crafting.
- **The bag** is a box that scrolls inside itself, with a row for each skill that can come to you now (and any
  other you still hold) holding up to five of it, the
  ones with the most secondary affixes first (then the highest tier), across the whole width of the pane. When
  a sixth drops, one is salvaged: one with no affix before any other (never a locked one; only an old save has
  such skills now), and otherwise the newest, which is the drop itself. A new skill glows, steadily, until the mouse has been over it. **Shift-click** salvages a skill for gold; the next one in its row slides under the pointer and its tooltip opens at once (and if the salvaged skill's crafting was open, that moves to the next one too), so a row can be read and cleared without moving the mouse.
- **Crafting a skill.** Click a skill and the bag gives way to its crafting (Back, or Esc, or a second click, returns). Two ways
  are always there, for gold: remove one affix, at random (which one goes is not yours to choose, and what is left keeps its tier), or reroll the affixes themselves, as many as it had. **An affix's tier cannot be rerolled**: it is what it dropped (or was added) as. Three
  more are unlocked by notables on the prestige tree, and are not shown until you hold them:

  | Unlocked by | What it does |
  | --- | --- |
  | Second line | Add an affix to a skill with none or one |
  | Third line | Add a third affix to a skill with two |
  | Transmuting | Turn it into a different skill, keeping its tier and affixes |

  The primary affix is never rolled.
- **Afflictions show on the enemy.** Chilled turns it frost-blue on a patch of ice, with snow drifting past;
  Burning flickers orange with flames climbing off it; Stunned has stars wheeling over its head; Brittle is
  cracks across it, more as the stacks build. Over its head is a row of badges in the same colours (a
  snowflake, a flame, a star, and Brittle's count of stacks).
- **Opening the prestige page.** The tree ripples out from its centre, twice, slowly and quietly: a faint ring spreads from the first node and each path and node comes up softly as it passes, then a second ring follows and they brighten a little once more (under three seconds in all; not at all for a reader who has asked for reduced motion).
- **Crafting shows what it did.** An affix put on a skill slides in lit gold and settles; one taken off turns red, is struck through and closes up; rerolled affixes all come in as new.
- **Losing a fight** puts words across the arena for four and a half seconds (a run's opening words are up for two): "Driven back: Back to level 6" after an ordinary fight, "Overrun: Level 7 restarts" after a boss. It is shown on every loss, not only at the start of a run.
- **An enemy's blow can be heard.** It was a faint low hum, lost under a line of weapons and below what small speakers play; it is a dull knock now, and a slam a heavier one.
- **The left-hand pane.** The cursor's card and the Weapons heading stay where they are; the weapons scroll beneath them in a box of their own, which keeps its place when the pane is drawn again.
- **Gold is for getting deeper.** A fight pays **double** its gold the first time it is won in a run, and **half** whenever it is won again: a four-fold difference, for every fight, bosses and the rest alike. The run remembers the furthest fight it has won, so going back over cleared levels, or over the first fights of a level that keeps beating you, pays half. A whole level is worth about 39 kills of gold the first time (it was 19) and under 10 when it is fought again.
- **Gold** is shown large across the top of the right-hand pane, over the crafter and the skills it is spent on.
  It glints, and the amount floats up beside it, as gold comes in.
  **Making a weapon costs gold**: five kills' worth at your deepest level (16 at level 1), and takes a second
  and a half at the anvil (three blows of the hammer, each a tink and a burst of sparks; the bench is busy
  until the new weapon is on it). Equipping is free and immediate. So a run's first
  weapon has to be earned with the cursor, unless the tree's four **Purse** nodes (on the bridges) start the run
  with gold for a weapon each.
- **The tree is seen only by prestiging.** Your banked cores sit beside the Prestige button; there is no way
  to open the tree during a run.
- **Locked things are not shown.** Until you hold the first weapon node there is no Weapons heading and no crafter; until
  weapons have a socket there is no Skills part to the right-hand pane at all (that pane has no tabs: the in-game guide is gone, and the welcome box on a first visit, the hint line under the bag and the tooltips are what explain things); until their nodes are held, no reroll buttons and no Buy button.
  The first run ever to have a pane opens with that pane **flashing**, and it, or any button that is new to
  you (rerolls, Buy, a way to craft), then **glows for 45 seconds**. The Prestige button reads plain
  "Prestige", greyed out, until it can be pressed; then **Prestige for N**, the cores this run has earned so far.
  It glows once those would buy a node the bank alone could not. The top bar shows the **deepest level** you have ever reached. Each weapon's card has a **cooldown bar** like the cursor's, filling towards its
  next blow, and a Shockwave's tag on a card has a **charge bar** filling towards its next strike.
- **Power and dps.** Power is an estimate of a weapon's damage per second against one enemy from its own blows;
  dps is what it actually dealt over the last half minute, read every two and a half seconds.
- **Prestige** is a tree, bought with **cores**. A level pays the first time a run clears it: 1 core for each of
  levels 1 and 2, 2 for 3 and 4, 3 for 5 to 7, and so on, two more for every five levels (level 50 pays 21, level 90 pays 37). So
  a run to level 10 earns 23, to 20 earns 87, to 50 earns 519, to 90 about 1,650, and the same run made again pays the same
  again. Prestige banks them. **Every node has a price** and can be bought only if it touches one you hold, and
  **a node can be unspecced**: while the tree is open, click one you hold and its price returns to you (its tooltip reads "Unspec for ◆N"). Any node, whenever it was bought, one at a time, as long as everything else you hold still reaches the centre without it, so a branch comes apart from its tip inwards. There is no button that clears the whole tree.

  | Node | Price in cores |
  | --- | --- |
  | The first weapon; the socket and Upgrade beside it | 1; 2 each |
  | The other unlocks | Rerolls 2; Might, Hex and Aid 4 each; Market 5; Life 5 |
  | A Purse or a Head start | 3, wherever it is |
  | A small node | 2, and a half more for each step out from the middle: 3 near it, 12 at the tips |
  | A notable | five times a small node at the same distance: 18 to 60 |
  | A weapon | by how far out it is: 8 for the nearest, then 25 and 25, and 122 and 122 for the last two |
  | A socket | by how far out: 14, then 66 and 66, 257, 378 |
  | A tier node | by how far out: 5 beside the socket, 15 and 23 for the next ring, 53 and 82 further on, up to 298 for the deepest; a Deep veins (two points) is 117 |
  | The second bench | 60 |

  **Every price is the node's own and never moves**: buying one thing makes nothing else dearer. It is distance that costs: the two sides mirror each other, and the far hubs are the dear ones. The whole tree is about 3,940 cores. Prices are all in `D.PRICE`.

  **The first node is the one in the middle: the first weapon.** A new game has none: no weapon can be made.
  The cursor clears level 1 by itself in about half a minute: that is one core, and the first prestige
  spends it there. **Two nodes lead out of it**, two cores each: the **first socket**
  to the east (skills with it: from then on enemies drop them) or **Upgrade** to the west. Everything else on
  the tree hangs from those two. With no socket there are no skills (nothing drops one and gold buys none).

  **Upgrade** lets gold strike at a weapon on the line: the **Upgrade** button on its card. Each strike adds
  **one to three ranks**, as it falls (the whole card flashes gold as the hammer lands), up to **+25**, and a rank is 3% more damage (+75% at the top). The rank
  shows beside its name, as in Sword +7, and on a bar across the card. A strike costs six kills' gold at your
  deepest level, and a quarter more for each rank the weapon already has: 18 kills' worth at +5, 56 at +10,
  about 170 at +15, 520 at +20. So the first dozen ranks are cheap and the last few are a deep run's spare gold.
  Scrapping the weapon gives half of what went in back.

  **Level 3 is the wall.** The first two levels' enemies pull their blows (level 1 hits for two fifths; level 2 does not), so the cursor alone clears level 1 easily and level 2 with some Life to spare (aimed perfectly,
  about three fifths of it). From level 3 everything has ten times the life, and
  the cursor runs out of Life in its first few fights, however well you aim. A weapon deals sixteen
  times what the cursor's measure would give it. The first line of one weapon still wants the cursor's help:
  it is the Life node, four steps north (16 cores with the three Whetstones on the way), that lets a line stand by itself.

  **Weapons, sockets and tiers are the tree's.** The middle node is one weapon and the node east of it one socket. **A line is six weapons at the most**: five more
  weapons are hubs in the west and five more sockets hubs in the east, and a run begins with as many as the tree
  holds. Fifteen **skill tier** nodes, drawn as gold diamonds, sit one or two to a path in every quarter, so
  whichever way you grow tilts the tiers a little; nothing in a run does.

  Two more things have to be unlocked, each one step off those two: **Rerolls** (off Upgrade)
  lets the crafter reroll the weapon on its bench, and **Market** (off the first socket) lets gold buy skills.
  Until you hold them their buttons are not shown. And the three colours of skill are a node each: **Might**
  (off Upgrade), **Aid** (off the first socket) and **Hex** (south). Hex, and the first step north, each hang between Upgrade and the socket, and can be reached from
  either. **Life** (+100) is four steps north, by way of three Whetstones; **Cull** (enemies at 15% life or less die) is the same distance south, past Hex.

  There is no filler on it. **Hubs** (weapons, sockets, a second bench) sit where paths meet. The **small
  nodes** between them each belong to a theme, so to reach a weapon hub you walk through a weapon type's nodes, and past a skill
  tier. Each theme leads to a **notable**, one step off the path, that changes a rule.

  | Where | Small nodes | Notable |
  | --- | --- | --- |
  | West, from Upgrade: the other five **weapons**, and two Battle lines on the spine where a seventh and eighth used to be | Swords attack 25% faster | Riposte: swords have a 20% chance to strike twice |
  | | Hammer splash +18% | Wide swing: the splash reaches 60% farther |
  | | Axes +20% to bosses | Cleaver: axes splash for 30% |
  | | Daggers +6% critical chance | Lacerate: a dagger's critical is triple |
  | | Bow pierce +14% | Heavy arrows: the line is twice as wide |
  | | Staff arc +14% | Chain: the bolt arcs to two more enemies |
  | East, from the first socket: the other five **sockets**, and the **second bench** | Skill crafting 5% cheaper, bench rerolls 8% cheaper, skills 4% cheaper, +12% skill drops, +10% gold | The three ways to craft a skill that the tree unlocks (see Crafting a skill) |
  | North, up to Life and on from it | **Whetstone**: +5% weapon damage | Life: +100. Over it, Frostbitten: Chilled enemies take 15% more damage |
  | | Whetstone | No respite: an enemy can be Stunned again after 1s, not 2s |
  | | Whetstone | Aftershock: a Shockwave strikes every 4s, not 6s |
  | South, from Hex down to Cull and on from it | Whetstone | Cull: enemies at 15% life or less die. Under it, Wildfire: a dying enemy's burn passes to the nearest |
  | | Whetstone | Shattering: Brittle is +4% a stack, not +3% |
  | | +25 Life | +100 Life |

  The north and south no longer have small nodes for one affliction each: those asked you to pick a skill before you had seen any. The fourteen small nodes there are Whetstones, plain weapon damage (+70% in all, added to the Battle lines' 60%), and the afflictions keep one notable each.

  Cheap conveniences sit beside the middle, 3 cores each (as every Purse and Head start is, wherever it sits): a **Purse** (gold for a weapon at the start of a run) over Rerolls and another under Might, and beyond each Purse two **Head starts** (five levels each: four here, +20 levels).
  On the other side, under Aid, is the **Full kit** (3 cores too): a run begins with one of every kind of skill there is to drop, the three plain ones or up to all ten.
  A Head start always hangs from a Purse, here and on the bridges: a run that begins deep with no gold for a weapon cannot clear anything.
  Four bridges (gold for a weapon, a starting skill, or five levels' head start, a node; eight Purses and eight Head starts on the tree in all, so a run can begin 40 levels in) join the ends of north
  and south to the arms, and each carries one notable for the long run: two **Deep veins** (two tier points each) and two **Battle line** (+15% damage for every weapon; there are four of those on the tree in all). The second bench lets the
  crafter set one weapon aside, skills and all, and work on another. The whole tree is 138 nodes.
  A weapon's nodes help only that type of weapon.

  The tree can be changed **only when you prestige**. The **Prestige** button beside the level does it at once,
  with one click and no second question: your levels, gold, weapons and every skill go, the battle stops (nothing moves and nothing is drawn), the game behind is blacked out, and the tree
  has the screen, with what the run earned added to your cores. Nodes that touch what you hold show their
  price, and the ones you can afford pulse. Buy what you like and begin the next run, with the weapons,
  sockets and tier the tree gives; the tree is fixed until you prestige again. Cores you do not spend keep.

  Your first run has to reach level 2 before it can be ended. After that any run can be ended at any time,
  even at level 1 and for nothing.

  **How it is drawn.** The tree has the whole window. The two sides mirror each other, a kite each, with their
  deepest hubs on a spine running back in from the tip; north and south are a fork each; and the middle is a
  block of nine: the first weapon in the centre, Upgrade to its west and the socket to its east with what
  they unlock above and below, Life over the centre and Hex under it. A
  **hexagon** is a hub (a weapon, a socket, the second bench), a **diamond** on a path is a skill tier, a **rounded square** unlocks something (rerolls,
  the market, a colour of skill), a **ringed circle** is a notable, and small nodes are beads on the paths. Every big node
  carries an icon and no word (`D.TREE_ICON`, one line-drawn path each); its name is in the tooltip. The hexagons are the largest nodes on the tree, a quarter again the size of a notable, because they matter most. A
  path you hold glows in its theme's colour; the steps you could take next are lit, and between runs they pulse.
  The background is plain black, with each quarter's name on it: Arsenal, Workshop, Control, Attrition.

  Mousing over a node shows its name and what it gives, and between runs whether a click will take it.

  A **Head start** begins the run that many levels in (never deeper than you have cleared). **A level pays in full the first
  time the run clears it, and with it, at half their worth, any levels under it the run was never paid for**: so
  the levels a Head start passes over pay half (a start at level 6 pays 7 cores for clearing it, where fighting up
  from level 1 pays 12), and a run that begins too deep for its line is no trap. Each lost fight drops it back a
  level, and whatever level it does clear pays for itself and half of those below.
  Then prestige and buy more. If the next node is out of reach, the same run again pays the same again. A head start skips the cheap levels for half of what they pay.
- **Away.** With the tab in the background the fight goes on. With the game shut you earn half your recent gold
  rate for up to eight hours; skills only drop while it is open.
- **Old saves** load. Skills and affixes that have been cut become ones that exist (of the same colour where
  there is one), rolled numbers become tiers, and skills that were in the cursor go to the bag. A save from
  before the tree loses its cores and perks, keeps the
  weapon slots and sockets it has until it next prestiges, when the tree decides them. A save from when a level was a point and a node cost one keeps its tree, and the points it had not spent become cores.

Mouse: click a skill for its crafting; right-click it to socket it on the bench (the first empty socket that fits), and right-click it there to take it
out; drag it to choose the socket; Shift-click to salvage, Alt-click to lock.
Keys: `←` `→` change level, `Shift`+`→` the deepest level,
`Esc` back (or close the Prestige window, during a run).

## The code

| File | Holds |
| --- | --- |
| `js/data.js` | Every number: curves, encounters (`D.ENC`), area sizes (`D.AOE`), weapons, skills, affixes, monsters, forge prices |
| `js/game.js` | The rules. No DOM, so the tests and the sim load it alone |
| `js/arena.js` | The canvas, top-down: the floor, enemies and their swings, the ring of weapons, blows in flight, the cursor's circle |
| `js/ui.js` | The panes, tooltips, drag and drop, dialogs |
| `js/main.js` | Boot and the frame loop |
| `js/sprites2.js` | Art added for this version: bow, staff, dagger, pointer, five skill glyphs |

The save is one JSON object in local storage under `smeltworks-idle-v1`. Settings (the gear) copies it out as
text, loads one back in, or wipes it.

## Tests

```
node tests/logic.test.cjs      # the rules, 65 checks
node tests/sim.cjs 8           # a bot plays 8 hours, idle and with the cursor striking on cooldown, on 3 seeds
```

The sim prints each run the bot finished (how long, how deep, the cores it earned, and the nodes, weapons, sockets
and tier it went on to the next with) and where it stood at the end. Its bot spends gold on skills and, once it
holds Upgrade, on the cheapest rank on its line, keeps the bench filled with the best of them, makes a weapon
again if it rolled two sockets short and gold is easy, scraps its weakest weapon when the one on the bench is
clearly better, and prestiges when ten minutes pass without a new level. At the tree it buys and keeps: the
weapon, a socket and the Market in that order, saving for each; then whichever of a weapon, a socket, a
tier, Upgrade, Life, Cull, a colour's skills, a Whetstone or a Battle line adds the most to a rough measure of the line's power for the
cores it takes to reach, and if that one is beyond its means it saves; then, with nothing left that adds power,
the rest of the tree, cheapest first. It never touches skill crafting or rerolls the bench.

With the numbers as they are the first run is the cursor alone: level 1 falls in about half a minute and the bot
prestiges at once, with its one core, for the weapon. (The cursor can clear level 2 as well, but never level 3.)
The second run, a weapon with no socket and the cursor, clears level 2 in under a minute: two cores, the socket.
The third, one weapon of one socket at tier 1, stops at level 5 or 6. From then each run goes a little further
than the last, and stops wherever its Life runs out: about 6, 6, 9, 11, 13, 15, 19, 22, 24, 25, 39, 50, 60, 70,
85, earning from 9 cores to about 1,600: level 10 after an hour and a quarter, 20 after two and a half, 50 after
five, and the whole tree, with the deepest run near level 90, after about eight hours and eighteen runs. Ten
minutes of every one of those runs is the bot waiting to be sure it has stalled, so a person, who also crafts
and chooses weapons to suit the tree, will be a good deal quicker.

Monster life climbs steeply at first and more gently later (about 2.6 times every five levels near level 10, 1.4 times near 50, 1.2 times near 90: flatter than it was when a skill's tier ran to twenty and multiplied its affixes), so that early on each new weapon, socket or tier is worth two to five levels and not ten.
`D.HP0`, `D.HP_P` and `D.DEPTH` (monster life, and how steeply it climbs) set all of this, and they are touchy: see the note
beside them in `js/data.js`.

## Not built yet

- The cursor is 6 damage for good. It starts a new game and then stops mattering.
- Green has only the two auras, and one of each is all a line can use: a green socket beyond those is worth only
  its skill's secondary affixes. Red has two skills. Weapons still roll socket colours by their old odds.
- Weapon nodes reward a line of one type, but the only way to get a type is to reroll the bench until it comes.
- Once the tree is bought, about 3,840 cores, there is nothing left to spend them on.
- Skills cannot be moved between weapons: a made weapon is final.
- A made weapon cannot be moved to another slot from the page (the rules can swap two; nothing calls it).
- Enemies stay where they spawn, and weapons cannot be told whom to attack.
- Power, the estimate on each weapon, ignores afflictions, auras and area damage.
- With no Auto-advance switch you cannot sit on an easier level to farm it: a cleared level always leads on.
- Balance has only been played by the bot; a person will go faster.
