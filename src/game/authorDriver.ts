// Author runs: pure-pursuit auto-driver plays every track through real physics,
// writes public/ghosts/<id>.kghost and prints author times (paste into TrackDefs).
import { FIXED_DT } from '../config';
import type { InputFrame } from '../core/input';
import { TrackCollider } from '../physics/collide';
import { buildSamples } from '../track/build';
import { TRACKS } from '../tracks/index';
import { Race } from './race';
import { quantizeInput } from './ghost';

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function driveInput(race: Race): InputFrame {
  const car = race.car;
  const samples = race.track.samples;
  const speed = Math.hypot(car.vx, car.vz);
  // On steep ribbon or anywhere inside a loop (inverted road): trust the
  // track — straight and full throttle.
  const steepAhead = samples[Math.min(samples.length - 1, car.sampleIndex + 10)];
  if (Math.abs(steepAhead.dy) > 0.45 || steepAhead.uy < 0.5) {
    return { steer: 0, throttle: 1, brake: 0, respawn: false, checkpoint: false };
  }
  // Lookahead grows with speed. Advance only while samples stay ahead of the
  // car (in its forward hemisphere) so folds (loops) don't confuse pursuit.
  const hx = Math.sin(car.yaw);
  const hz = Math.cos(car.yaw);
  const look = 8 + speed * 0.42;
  let acc = 0;
  let i = car.sampleIndex;
  let tx = samples[i].x;
  let tz = samples[i].z;
  while (acc < look && i < samples.length - 1) {
    const b = samples[i + 1];
    const nx = b.x - car.x;
    const nz = b.z - car.z;
    if (nx * hx + nz * hz < 1.0) break;
    const a = samples[i];
    acc += Math.hypot(b.x - a.x, b.z - a.z);
    i++;
    tx = b.x;
    tz = b.z;
  }
  const ang = Math.atan2(tx - car.x, tz - car.z);
  const d = wrapPi(ang - car.yaw);
  // Anti-U-turn: if the lookahead is behind us while moving, hold straight
  // and slow down (don't whip around). When slow/stopped, drive normally to
  // realign (a stationary car can't change facing with zero steer).
  if (Math.abs(d) > 2.2 && speed > 8) {
    return { steer: 0, throttle: 0, brake: 1, respawn: false, checkpoint: false };
  }
  const steer = Math.max(-1, Math.min(1, d * 3.0));
  // Corner radius from heading change ~45 m ahead -> target speed.
  const ahead = Math.min(samples.length - 1, car.sampleIndex + 30);
  const t0 = samples[car.sampleIndex];
  const t1 = samples[ahead];
  const dot = Math.max(-1, Math.min(1, t0.dx * t1.dx + t0.dz * t1.dz));
  const curve = Math.acos(dot);
  const dist = Math.max(5, ahead - car.sampleIndex) * 1.5;
  const radius = dist / Math.max(curve, 1e-3);
  let target = Math.sqrt(48 * Math.min(radius, 800));
  target = Math.max(13, Math.min(78, target));
  // Slow down for jumps: every gap must be clearable well below top speed.
  const carT = samples[car.sampleIndex]?.t ?? 0;
  const totalLen = race.track.totalLen;
  for (const gp of race.def.gaps) {
    const dist = (gp.from - carT) * totalLen;
    if (dist > 0 && dist < 130) {
      target = Math.min(target, 38);
      break;
    }
  }
  // Loops are auto-guided: carry speed in (braking bleeds the momentum the
  // climb needs). Detect steep/inverted ribbon ahead.
  let loopAhead = false;
  for (let k = 1; k <= 80 && car.sampleIndex + k < samples.length; k++) {
    const s = samples[car.sampleIndex + k];
    if (Math.abs(s.dy) > 0.6 || s.uy < 0.3) {
      loopAhead = true;
      break;
    }
  }
  if (loopAhead) target = Math.max(target, 55);
  // Slow down on ice: grip is quartered, so cornering speed halves.
  const surfAhead = samples[Math.min(samples.length - 1, car.sampleIndex + 30)]?.surface;
  if (surfAhead === 'ice') target = Math.min(target, 30);
  if (car.surface === 'ice') target = Math.min(target, 30);
  // Slow down on big banks (wall-rides): hold the line, don't fly off the top.
  const bankAhead = samples[Math.min(samples.length - 1, car.sampleIndex + 60)]?.bank ?? 0;
  if (Math.abs(bankAhead) > 50) target = Math.min(target, 22);
  // Extra caution when pointing far off the road direction.
  if (Math.abs(d) > 0.5) target = Math.min(target, 30);
  // Binary outputs (like a keyboard) so ghost quantization is lossless.
  let throttle = 0;
  let brake = 0;
  if (speed < target) throttle = 1;
  else if (speed > target + 2) brake = 1;
  return { steer, throttle, brake, respawn: false, checkpoint: false };
}

export function authorRun(trackId: string): { time: number | null; frames: InputFrame[]; maxT: number } {
  const def = TRACKS.find((t) => t.id === trackId)!;
  const { samples, totalLen } = buildSamples(def);
  const col = new TrackCollider();
  col.build(samples, totalLen, def.killY);
  const race = new Race(def, col);
  race.reset(null);
  const idle: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };
  for (let i = 0; i < 340; i++) race.step(idle);
  const frames: InputFrame[] = [];
  const maxTicks = Math.floor(150 / FIXED_DT);
  let maxT = 0;
  for (let i = 0; i < maxTicks; i++) {
    const inp = quantizeInput(driveInput(race));
    frames.push({ ...inp });
    race.step(inp);
    maxT = Math.max(maxT, samples[race.car.sampleIndex]?.t ?? 0);
    if (race.phase === 'finished') return { time: race.finishTime, frames, maxT: 1 };
  }
  return { time: null, frames, maxT };
}

