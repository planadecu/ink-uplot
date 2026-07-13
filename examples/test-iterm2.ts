// Minimal iTerm2 inline image test — tiny 1x1 red PNG (hardcoded)
// Smallest valid PNG: 1x1 red pixel
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

const b64 = png.toString('base64');
const seq = `\x1b]1337;File=inline=1;width=4;height=2:${b64}\x07`;

console.log('Before iterm2 image:');
process.stdout.write(seq);
console.log('\nAfter iterm2 image.');
