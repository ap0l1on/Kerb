// Ghosts: record one InputFrame per tick, RLE + base64url encode.
// A 60 s run (7200 ticks) is ~1-3 KB. Times are always re-simulated, never trusted.
import type { InputFrame } from '../core/input';

export const GHOST_VERSION = 2;
const MAX_TICKS = 60 * 120 + 120 * 10; // 70 s cap
const MAX_CODE_LEN = 32768;

export function packInput(f: InputFrame): number {
  // Full int8 steer (spec): -1..1 -> 0..255.
  const steer = Math.max(-1, Math.min(1, f.steer));
  return Math.round((steer * 0.5 + 0.5) * 255) & 0xff;
}

export function packFlags(f: InputFrame): number {
  const th = f.throttle > 0.5 ? 1 : 0;
  const br = f.brake > 0.5 ? 1 : 0;
  const rs = f.respawn ? 1 : 0;
  const cp = f.checkpoint ? 1 : 0;
  return ((th << 3) | (br << 2) | (rs << 1) | cp) & 0xf;
}

export function unpackInput(steer8: number, flags: number): InputFrame {
  return {
    steer: ((steer8 & 0xff) / 255) * 2 - 1,
    throttle: (flags & 8) !== 0 ? 1 : 0,
    brake: (flags & 4) !== 0 ? 1 : 0,
    respawn: (flags & 2) !== 0,
    checkpoint: (flags & 1) !== 0,
  };
}

/** Quantize to codec precision so live runs and ghost playback agree bit-for-bit. */
export function quantizeInput(f: InputFrame): InputFrame {
  return unpackInput(packInput(f), packFlags(f));
}

function checksum(bytes: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] as number;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64urlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1] as number;
    const c = bytes[i + 2] as number;
    out += B64[(a >> 2) & 63] + B64[((a << 4) | (b >> 4)) & 63] + B64[((b << 2) | (c >> 6)) & 63] + B64[c & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const a = bytes[i] as number;
    out += B64[(a >> 2) & 63] + B64[(a << 4) & 63];
  } else if (rem === 2) {
    const a = bytes[i] as number;
    const b = bytes[i + 1] as number;
    out += B64[(a >> 2) & 63] + B64[((a << 4) | (b >> 4)) & 63] + B64[(b << 2) & 63];
  }
  return out;
}

function b64urlDecode(s: string): Uint8Array | null {
  const rev = new Map<string, number>();
  for (let i = 0; i < 64; i++) rev.set(B64[i] as string, i);
  if (!/^[A-Za-z0-9\-_]*$/.test(s)) return null;
  const out: number[] = [];
  let i = 0;
  for (; i + 4 <= s.length; i += 4) {
    const a = rev.get(s[i] as string)!;
    const b = rev.get(s[i + 1] as string)!;
    const c = rev.get(s[i + 2] as string)!;
    const d = rev.get(s[i + 3] as string)!;
    out.push((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d);
  }
  const rem = s.length - i;
  if (rem === 2) {
    const a = rev.get(s[i] as string)!;
    const b = rev.get(s[i + 1] as string)!;
    out.push((a << 2) | (b >> 4));
  } else if (rem === 3) {
    const a = rev.get(s[i] as string)!;
    const b = rev.get(s[i + 1] as string)!;
    const c = rev.get(s[i + 2] as string)!;
    out.push((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2));
  } else if (rem === 1) {
    return null;
  }
  return new Uint8Array(out);
}

/** Encode frames -> code. Layout: [version u8][tickCount u16 LE][(steer8,flags,run)...][checksum u32 LE]. */
export function encodeGhost(frames: InputFrame[]): string {
  const ticks = Math.min(frames.length, MAX_TICKS);
  const rle: number[] = [];
  let i = 0;
  while (i < ticks) {
    const f = frames[i] as InputFrame;
    const st = packInput(f);
    const fl = packFlags(f);
    let run = 1;
    while (i + run < ticks && run < 255) {
      const g = frames[i + run] as InputFrame;
      if (packInput(g) !== st || packFlags(g) !== fl) break;
      run++;
    }
    rle.push(st, fl, run);
    i += run;
  }
  const body = new Uint8Array(3 + rle.length + 4);
  body[0] = GHOST_VERSION;
  body[1] = ticks & 0xff;
  body[2] = (ticks >> 8) & 0xff;
  for (let k = 0; k < rle.length; k++) body[3 + k] = rle[k] as number;
  const hash = checksum(body.subarray(0, 3 + rle.length));
  body[3 + rle.length] = hash & 0xff;
  body[3 + rle.length + 1] = (hash >> 8) & 0xff;
  body[3 + rle.length + 2] = (hash >> 16) & 0xff;
  body[3 + rle.length + 3] = (hash >> 24) & 0xff;
  return b64urlEncode(body);
}

export interface DecodedGhost {
  ticks: number;
  frames: InputFrame[];
}

/** Strict decode: version byte, length cap, checksum. Returns null on any garbage. */
export function decodeGhost(code: string): DecodedGhost | null {
  if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_LEN) return null;
  const bytes = b64urlDecode(code);
  if (!bytes || bytes.length < 7) return null;
  if (bytes[0] !== GHOST_VERSION) return null;
  const ticks = (bytes[1] as number) | ((bytes[2] as number) << 8);
  if (ticks <= 0 || ticks > MAX_TICKS) return null;
  const hash = (bytes[bytes.length - 4] as number) | ((bytes[bytes.length - 3] as number) << 8) |
    ((bytes[bytes.length - 2] as number) << 16) | ((bytes[bytes.length - 1] as number) << 24);
  const stored = hash >>> 0;
  if (checksum(bytes.subarray(0, bytes.length - 4)) !== stored) return null;
  const rle = bytes.subarray(3, bytes.length - 4);
  if (rle.length % 3 !== 0) return null;
  const frames: InputFrame[] = [];
  for (let k = 0; k < rle.length; k += 3) {
    const st = rle[k] as number;
    const fl = rle[k + 1] as number;
    const run = rle[k + 2] as number;
    if (run === 0 || (fl & 0xf0) !== 0) return null;
    for (let r = 0; r < run; r++) {
      frames.push(unpackInput(st, fl));
      if (frames.length > ticks) return null;
    }
  }
  if (frames.length !== ticks) return null;
  return { ticks, frames };
}

export class GhostRecorder {
  frames: InputFrame[] = [];
  record(f: InputFrame): void {
    if (this.frames.length < MAX_TICKS) {
      // Store the quantized form so live runs and ghost playback agree
      // bit-for-bit (ghosts replay decoded inputs through the same physics).
      this.frames.push(unpackInput(packInput(f), packFlags(f)));
    }
  }
  reset(): void {
    this.frames.length = 0;
  }
  encode(): string {
    return encodeGhost(this.frames);
  }
}
