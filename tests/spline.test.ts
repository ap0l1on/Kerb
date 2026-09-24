import { describe, it, expect } from 'vitest';
import { buildSamples } from '../src/track/build';
import { TRACKS } from '../src/tracks/index';

describe('spline sampling', () => {
  for (const def of TRACKS) {
    it(`${def.id}: no NaNs, finite frames`, () => {
      const { samples, totalLen } = buildSamples(def);
      expect(samples.length).toBeGreaterThan(50);
      expect(Number.isFinite(totalLen) && totalLen > 100).toBe(true);
      for (const s of samples) {
        for (const v of [s.x, s.y, s.z, s.dx, s.dy, s.dz, s.sx, s.sy, s.sz, s.ux, s.uy, s.uz, s.width, s.t]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        const sideLen = Math.hypot(s.sx, s.sy, s.sz);
        expect(Math.abs(sideLen - 1)).toBeLessThan(0.05);
        expect(s.width).toBeGreaterThan(5);
      }
      // t monotonic
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i].t).toBeGreaterThanOrEqual(samples[i - 1].t);
      }
    });
  }

  it('loop tracks have inverted road (up vector flips)', () => {
    for (const id of ['neon-2', 'neon-3']) {
      const def = TRACKS.find((t) => t.id === id)!;
      const { samples } = buildSamples(def);
      const minUp = Math.min(...samples.map((s) => s.uy));
      expect(minUp).toBeLessThan(0.4); // loop goes upside down
    }
  });
});
