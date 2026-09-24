// Checkpoints are t-based: crossing a checkpoint's t collects it (in order).
// The finish only counts once every checkpoint t has been crossed —
// teleporting to the finish still collects everything, so there is no skip.
import { describe, it, expect } from 'vitest';
import type { InputFrame } from '../src/core/input';
import { TrackCollider } from '../src/physics/collide';
import { buildSamples } from '../src/track/build';
import { getTrack } from '../src/tracks/index';
import { Race } from '../src/game/race';

const IDLE: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };

function setup(id = 'canyon-1'): Race {
  const def = getTrack(id)!;
  const { samples, totalLen } = buildSamples(def);
  const col = new TrackCollider();
  col.build(samples, totalLen, def.killY);
  const race = new Race(def, col);
  race.reset(null);
  // Skip sweep (1.2 s) + countdown (1.5 s) = 324 ticks.
  for (let i = 0; i < 400; i++) race.step(IDLE);
  expect(race.phase).toBe('racing');
  return race;
}

function teleportPast(race: Race, t: number): void {
  const i = Math.round(t * (race.track.samples.length - 1));
  const s = race.track.samples[i];
  race.car.x = s.x;
  race.car.y = s.y + 0.6;
  race.car.z = s.z;
  race.car.vx = 0;
  race.car.vy = 0;
  race.car.vz = 0;
  race.car.sampleIndex = i;
}

describe('race rules', () => {
  it('teleporting to the finish collects every checkpoint (no skipping possible)', () => {
    const race = setup();
    teleportPast(race, 0.995);
    for (let i = 0; i < 40; i++) race.step(IDLE);
    expect(race.nextCp).toBe(race.def.checkpoints.length + 1);
    expect(race.finished).toBe(true);
    expect(race.phase).toBe('finished');
    expect(race.splits.every((s) => s != null)).toBe(true);
  });

  it('checkpoints in order then finish completes the run', () => {
    const race = setup();
    const targets = [...race.def.checkpoints, race.def.finish];
    for (const t of targets) {
      teleportPast(race, Math.min(0.999, t + 0.002));
      for (let i = 0; i < 5; i++) race.step(IDLE);
    }
    expect(race.finished).toBe(true);
    expect(race.finishTime).toBeGreaterThan(0);
  });

  it('being before the finish does not finish the run', () => {
    const race = setup();
    teleportPast(race, 0.5);
    for (let i = 0; i < 10; i++) race.step(IDLE);
    expect(race.finished).toBe(false);
  });

  it('split delta compares against reference splits', () => {
    const race = setup();
    race.refSplits = [10, 20, 30, 40];
    teleportPast(race, (race.def.checkpoints[0] as number) + 0.002);
    for (let i = 0; i < 5; i++) race.step(IDLE);
    expect(race.lastSplit).not.toBeNull();
    expect(race.lastSplit!.index).toBe(0);
    expect(race.lastSplit!.delta).toBeCloseTo(race.lastSplit!.time - 10, 6);
  });

  it('respawn returns the car to the last checkpoint snapshot', () => {
    const race = setup();
    teleportPast(race, (race.def.checkpoints[0] as number) + 0.002);
    for (let i = 0; i < 5; i++) race.step(IDLE);
    expect(race.nextCp).toBe(1);
    race.car.x += 50;
    race.car.y = -500; // fell off
    race.step({ ...IDLE, respawn: true });
    expect(race.car.y).toBeGreaterThan(-100);
  });
});
