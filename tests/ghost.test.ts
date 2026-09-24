import { describe, it, expect } from 'vitest';
import type { InputFrame } from '../src/core/input';
import { encodeGhost, decodeGhost } from '../src/game/ghost';

// Realistic run: long constant stints (throttle pinned, steer held) + ramps.
function frames(n: number): InputFrame[] {
  const out: InputFrame[] = [];
  let steer = 0;
  for (let i = 0; i < n; i++) {
    const phase = Math.floor(i / 600) % 4;
    const target = phase === 0 ? 0 : phase === 1 ? 1 : phase === 2 ? 0 : -1;
    steer += Math.max(-0.1, Math.min(0.1, target - steer));
    out.push({
      steer,
      throttle: 1,
      brake: phase === 3 && i % 600 > 500 ? 1 : 0,
      respawn: false,
      checkpoint: false,
    });
  }
  return out;
}

describe('ghost codec', () => {
  it('round-trips inputs', () => {
    const f = frames(7200); // 60 s
    const code = encodeGhost(f);
    const d = decodeGhost(code);
    expect(d).not.toBeNull();
    expect(d!.ticks).toBe(7200);
    for (let i = 0; i < 7200; i += 37) {
      expect(d!.frames[i]!.throttle).toBe(f[i]!.throttle);
      expect(d!.frames[i]!.brake).toBe(f[i]!.brake);
      expect(Math.abs(d!.frames[i]!.steer - f[i]!.steer)).toBeLessThan(0.08);
    }
  });

  it('a 60 s run is about 1–3 KB and capped', () => {
    const code = encodeGhost(frames(7200));
    expect(code.length).toBeLessThanOrEqual(16384);
    expect(code.length).toBeLessThan(4 * 1024);
  });

  it('rejects hostile or garbled codes', () => {
    expect(decodeGhost('')).toBeNull();
    expect(decodeGhost('!!!not-base64!!!')).toBeNull();
    expect(decodeGhost('A'.repeat(20000))).toBeNull();
    // wrong version byte
    const good = encodeGhost(frames(120));
    const badVer = 'B' + good.slice(1);
    expect(decodeGhost(badVer)).toBeNull();
    // truncated
    expect(decodeGhost(good.slice(0, 10))).toBeNull();
    // flipped char breaks checksum
    const flip = good.slice(0, 6) + (good[6] === 'A' ? 'B' : 'A') + good.slice(7);
    expect(decodeGhost(flip)).toBeNull();
  });
});
