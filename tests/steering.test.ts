// Steering direction integration check: from the Sandline start (facing -z,
// screen-right is world +X), pressing D must move the car toward +X.
import { describe, it, expect } from 'vitest';
import type { InputFrame } from '../src/core/input';
import { freshCar, stepCar } from '../src/physics/car';
import { TrackCollider } from '../src/physics/collide';
import { buildSamples } from '../src/track/build';
import { getTrack } from '../src/tracks/index';
import { FIXED_DT } from '../src/config';

function drive(steer: number, ticks = 120): { dx: number; dz: number } {
  const def = getTrack('canyon-1')!;
  const { samples, totalLen } = buildSamples(def);
  const col = new TrackCollider();
  col.build(samples, totalLen, def.killY);
  const st = freshCar();
  const pose = col.startPose(def.start);
  st.x = pose.x;
  st.y = pose.y;
  st.z = pose.z;
  st.yaw = pose.yaw;
  st.sampleIndex = Math.max(0, Math.floor(def.start * (col.samples.length - 1)));
  const x0 = st.x;
  const z0 = st.z;
  const inp: InputFrame = { steer, throttle: 1, brake: 0, respawn: false, checkpoint: false };
  for (let i = 0; i < ticks; i++) stepCar(st, inp, FIXED_DT, col);
  return { dx: st.x - x0, dz: st.z - z0 };
}

describe('steering direction on screen', () => {
  it('D (physics steer -1) moves screen-right (+X at Sandline start)', () => {
    const { dx } = drive(-1);
    expect(dx).toBeGreaterThan(0.5);
  });
  it('A (physics steer +1) moves screen-left (-X at Sandline start)', () => {
    const { dx } = drive(1);
    expect(dx).toBeLessThan(-0.5);
  });
});
