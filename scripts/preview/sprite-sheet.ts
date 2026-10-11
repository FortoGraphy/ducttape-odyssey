// Dumps the procedural sprite sheet (base with the lights composited on top) to a PNG for review.
//   npx tsx scripts/preview/sprite-sheet.ts <out.png> [scale] [paint]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { getSpriteSet, packSheet } from "../../src/render/lite/common/sprites";

const [out = ".scratch/render/sheet.png", scaleArg = "4", paint = ""] = process.argv.slice(2);
const scale = Number(scaleArg);
const sheet = packSheet(getSpriteSet(paint));

let maxY = 0;
for (let i = 0; i < sheet.rects.length; i += 4) maxY = Math.max(maxY, sheet.rects[i + 1] + sheet.rects[i + 3] + 1);
const W = sheet.width * scale;
const H = maxY * scale;
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  const row = y * (W * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < W; x++) {
    const s = (Math.floor(y / scale) * sheet.width + Math.floor(x / scale)) * 4;
    const lit = sheet.emissive[s + 3] > 0;
    const src = lit ? sheet.emissive : sheet.base;
    const o = row + 1 + x * 4;
    if (src[s + 3]) {
      raw[o] = src[s];
      raw[o + 1] = src[s + 1];
      raw[o + 2] = src[s + 2];
    } else {
      raw[o] = 17;
      raw[o + 1] = 23;
      raw[o + 2] = 38;
    }
    raw[o + 3] = 255;
  }
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
);
console.log(`saved ${out} (${W}x${H})`);
