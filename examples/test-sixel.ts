// Minimal sixel test — 2x2 red square
// Sixel format: DCS q ... ST
// #0;2;100;0;0 = define color 0 as RGB(100%,0%,0%)
// #0!2~ = use color 0, repeat 2 pixels, sixel row data
const sixel = `\x1bPq
#0;2;100;0;0
#0!2~
#0!2~
\x1b\\`;

console.log('Before sixel image:');
process.stdout.write(sixel);
console.log('After sixel image.');
