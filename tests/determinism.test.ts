// Determinism: same input stream -> identical final position/velocity/time, 3 runs, every track.
import { describe, it, expect } from 'vitest';
import type { InputFrame } from '../src/core/input';
import { TrackCollider } from '../src/physics/collide';
import { buildSamples } from '../src/track/build';
import { TRACKS } from '../src/tracks/index';
import { Race } from '../src/game/race';
import { driveInput } from '../src/game/authorDriver';

function run(trackId: string): { x: number; y: number; z: number; vx: number; vy: number; vz: number; time: number; phase: string } {
  const def = TRACKS.find((t) => t.id === trackId)!;
  const { samples, totalLen } = buildSamples(def);
  const col = new TrackCollider();
  col.build(samples, totalLen, def.killY);
  const race = new Race(def, col);
  race.reset(null);
  const idle: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };
  for (let i = 0; i < 300; i++) race.step(idle);
  for (let i = 0; i < 1200; i++) {
    race.step(driveInput(race));
    if (race.phase === 'finished') break;
  }
  const c = race.car;
  return { x: c.x, y: c.y, z: c.z, vx: c.vx, vy: c.vy, vz: c.vz, time: race.time, phase: race.phase };
}

describe.each(TRACKS.map((t) => t.id))('determinism %s', (id) => {
  it('three identical runs match bit-for-bit', () => {
    const a = run(id);
    const b = run(id);
    const c = run(id);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)).toBe(true);
  });
});
