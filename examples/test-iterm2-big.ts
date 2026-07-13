// Bigger iTerm2 test — 100x100 red square PNG
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';

// Build a minimal PNG manually: 100x100 solid red
const width = 100, height = 100;

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// IDAT: rows of [filter=0, R, G, B, ...]
const row = Buffer.alloc(1 + width * 3);
row[0] = 0; // no filter
for (let x = 0; x < width; x++) {
  row[1 + x * 3] = 255;     // R
  row[1 + x * 3 + 1] = 0;   // G
  row[1 + x * 3 + 2] = 0;   // B
}
const raw = Buffer.concat(Array.from({ length: height }, () => row));
const compressed = deflateSync(raw);

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tp = Buffer.from(type, 'ascii');
  const crc32buf = Buffer.concat([tp, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crc32buf), 0);
  return Buffer.concat([len, tp, data, crc]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);

const b64 = png.toString('base64');
const seq = `\x1b]1337;File=inline=1;width=20;height=10:${b64}\x07`;

console.log('Before iterm2 image:');
process.stdout.write(seq);
console.log('\nAfter iterm2 image.');
