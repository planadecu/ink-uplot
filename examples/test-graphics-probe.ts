// Graphics-protocol capability probe.
// Emits the SAME 80x40 image three ways — kitty, iTerm2, sixel — each labeled.
// Run in a terminal and see which label is followed by a colored square:
//   npx tsx examples/test-graphics-probe.ts
// Whichever protocol(s) render tell us what this terminal actually supports.

import { deflateSync } from 'node:zlib';

const W = 80, H = 40;

// Solid cyan RGBA buffer (matches the live-trading stroke color).
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = 0;        // R
  rgba[i * 4 + 1] = 220;  // G
  rgba[i * 4 + 2] = 255;  // B
  rgba[i * 4 + 3] = 255;  // A
}

// ---- kitty: transmit+display raw RGBA (f=32), chunked at 4096 base64 chars ----
function kittySeq(): string {
  const b64 = rgba.toString('base64');
  const CHUNK = 4096;
  let out = '';
  for (let i = 0; i < b64.length; i += CHUNK) {
    const slice = b64.slice(i, i + CHUNK);
    const last = i + CHUNK >= b64.length;
    if (i === 0) out += `\x1b_Gf=32,s=${W},v=${H},a=T,m=${last ? 0 : 1};${slice}\x1b\\`;
    else out += `\x1b_Gm=${last ? 0 : 1};${slice}\x1b\\`;
  }
  return out;
}

// ---- iterm2: build a real PNG from the RGBA buffer, wrap in the IIP OSC ----
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tp = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tp, data])), 0);
  return Buffer.concat([len, tp, data, crc]);
}
function iterm2Seq(): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = 1 + W * 4;
  const raw = Buffer.alloc(H * stride);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0; // filter none
    rgba.copy(raw, y * stride + 1, y * W * 4, (y + 1) * W * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `\x1b]1337;File=inline=1;width=${W}px;height=${H}px:${png.toString('base64')}\x07`;
}

// ---- sixel: solid block, one color band 6px tall repeated H/6 times ----
function sixelSeq(): string {
  const bands = Math.ceil(H / 6);
  // color 0 = cyan (sixel uses 0-100 scale): 0,86,100
  let s = '\x1bPq#0;2;0;86;100';
  for (let b = 0; b < bands; b++) {
    s += `#0!${W}~`;   // color 0, repeat W times, all-6-dots sixel (~)
    s += '-';          // graphics newline (next band)
  }
  s += '\x1b\\';
  return s;
}

process.stdout.write('\n=== GRAPHICS PROTOCOL PROBE ===\n');
process.stdout.write('A cyan square under a label means this terminal supports that protocol.\n\n');

process.stdout.write('[1] kitty:\n');
process.stdout.write(kittySeq());
process.stdout.write('\n\n[2] iterm2 (inline PNG):\n');
process.stdout.write(iterm2Seq());
process.stdout.write('\n\n[3] sixel:\n');
process.stdout.write(sixelSeq());
process.stdout.write('\n\n=== end of probe ===\n');
