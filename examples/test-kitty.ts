// Minimal kitty image protocol test — 2x2 red square
// https://sw.kovidgoyal.net/kitty/graphics-protocol/

// 2x2 RGBA pixels: all red
const pixels = Buffer.from([
  255, 0, 0, 255,  255, 0, 0, 255,
  255, 0, 0, 255,  255, 0, 0, 255,
]);

const b64 = pixels.toString('base64');

// a=T (transmit+display), f=32 (RGBA), s=2 (width), v=2 (height)
const seq = `\x1b_Gf=32,s=2,v=2,a=T;${b64}\x1b\\`;

console.log('Before kitty image:');
process.stdout.write(seq);
console.log('\nAfter kitty image.');
