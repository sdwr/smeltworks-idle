/* Smeltworks Idle — patch notes.

   What a returning player is told, once, when they open the game after an update. A new player never sees any of
   this: a new save starts with every note here already counted as read.

   HOW TO WRITE ONE
   Add an entry to the list below, newest LAST, with the next number as its id:

       { id: 1, title: 'Version 0.100', lines: [
         'First thing that changed.',
         'Second thing that changed.',
       ] },

   - id      a whole number, one more than the entry before it. Never reuse or change one: it is how a save knows
             what it has read.
   - title   the heading over the entry (a version number, a name, a date: whatever you like).
   - lines   plain text, one bullet each. No HTML.

   A player who has missed several updates sees the newest three, newest first, in one window. An entry with no
   lines is ignored, and while the list is empty no window is ever shown.

   TO SEE IT without an old save: open the game with ?notes on the end of the address (index.html?notes). */
(function () {
'use strict';
const SW = globalThis.SW = globalThis.SW || {};
SW.notes = [
  { id: 1, title: 'Version 0.100', lines: [
    'Removed inflation from the gold economy. Prices no longer increase with the deepest level reached.',
    'Changed all Head Start nodes on the prestige tree to the new Tailwind passive, with the same goal of speeding up early levels. All purchased Head Start nodes have been refunded.',
    'Provisions node has been removed from the prestige tree.',
    'Purse node has been increased to +125 starting gold.',
    'Modified how the prestige tree gets revealed during play.',
  ] },
];
})();
