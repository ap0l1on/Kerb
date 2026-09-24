// Build-time track thumbnails: top-down minimaps rendered to PNG (no deps).
// public/thumbs/<id>.png — used by the track select cards.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSamples } from '../src/track/build';
import { TRACKS } from '../src/tracks/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 320;
const H = 180;

const ROAD: Record<string, [number, number, number]> = {
  canyon: [58, 58, 64],
  coast: [52, 56, 63],
  alpine: [59, 65, 80],
  neon: [21, 22, 30],
};
const KERB: Record<string, [number, number, number]> = {
  canyon: [217, 72, 43],
  coast: [31, 143, 214],
  alpine: [47, 107, 219],
  neon: [255, 63, 164],
};

function crc32(buf: Buffer): number {
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as unknown as { t: Int32Array }).t = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([td, data])));
  return Buffer.concat([len, td, data, crc]);
}

function writePng(path: string, px: Buffer): void {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const idat = deflateSync(px);
  writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

function draw(): void {
  mkdirSync(join(root, 'public', 'thumbs'), { recursive: true });
  for (const def of TRACKS) {
    const { samples } = buildSamples(def);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.x - s.width);
      maxX = Math.max(maxX, s.x + s.width);
      minZ = Math.min(minZ, s.z - s.width);
      maxZ = Math.max(maxZ, s.z + s.width);
    }
    const sc = Math.min((W - 24) / Math.max(1, maxX - minX), (H - 24) / Math.max(1, maxZ - minZ));
    const ox = (W - (maxX - minX) * sc) / 2;
    const oz = (H - (maxZ - minZ) * sc) / 2;
    const px = Buffer.alloc(W * H * 3, 12);
    const set = (x: number, y: number, c: [number, number, number]) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 3;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
    };
    const X = (wx: number) => Math.round(ox + (wx - minX) * sc);
    const Y = (wz: number) => Math.round(oz + (wz - minZ) * sc);
    const road = ROAD[def.theme]!;
    const kerb = KERB[def.theme]!;
    // Draw ribbon segment by segment (kerb edge, then road).
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      if (a.gap) continue;
      const steps = 6;
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        const cx = a.x + (b.x - a.x) * f;
        const cz = a.z + (b.z - a.z) * f;
        const sx = a.sx + (b.sx - a.sx) * f;
        const sz = a.sz + (b.sz - a.sz) * f;
        const hw = (a.width + (b.width - a.width) * f) / 2;
        const pxX = X(cx);
        const pxY = Y(cz);
        const wpx = Math.max(2, Math.round(hw * sc));
        for (let o = -wpx - 1; o <= wpx + 1; o++) {
          const edge = Math.abs(o) > wpx - 1;
          set(pxX + Math.round((sx * o) / Math.max(0.5, hw) * wpx * 0.5 + o * 0), pxY, edge ? kerb : road);
        }
        void sx;
        void sz;
      }
    }
    // Start dot (green) + finish dot (orange).
    const dot = (t: number, c: [number, number, number]) => {
      const i = Math.round(t * (samples.length - 1));
      const s = samples[i];
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) set(X(s.x) + a, Y(s.z) + b, c);
    };
    dot(def.start, [43, 213, 118]);
    dot(def.finish, [255, 90, 31]);
    // Scanlines -> PNG rows with filter 0.
    const raw = Buffer.alloc((W * 3 + 1) * H);
    for (let y = 0; y < H; y++) {
      raw[y * (W * 3 + 1)] = 0;
      px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
    }
    writePng(join(root, 'public', 'thumbs', `${def.id}.png`), raw);
    console.log(`thumb: ${def.id}.png`);
  }
}

draw();
