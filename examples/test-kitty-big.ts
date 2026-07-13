// Bigger kitty test — 100x100 red square via raw RGBA
const width = 100, height = 100;
const pixels = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i++) {
  pixels[i * 4] = 255;     // R
  pixels[i * 4 + 1] = 0;   // G
  pixels[i * 4 + 2] = 0;   // B
  pixels[i * 4 + 3] = 255; // A
}

const b64 = pixels.toString('base64');

// Kitty protocol supports chunked transmission for large payloads
// m=1 means more chunks follow, m=0 means last chunk
const CHUNK = 4096;
const chunks: string[] = [];
for (let i = 0; i < b64.length; i += CHUNK) {
  const slice = b64.slice(i, i + CHUNK);
  const isFirst = i === 0;
  const isLast = i + CHUNK >= b64.length;
  if (isFirst) {
    chunks.push(`\x1b_Gf=32,s=${width},v=${height},a=T,m=${isLast ? 0 : 1};${slice}\x1b\\`);
  } else {
    chunks.push(`\x1b_Gm=${isLast ? 0 : 1};${slice}\x1b\\`);
  }
}

console.log('Before kitty image:');
process.stdout.write(chunks.join(''));
console.log('\nAfter kitty image.');
