// Race state machine: countdown, checkpoints, splits, finish, respawn.
// Deterministic: time accumulates in fixed steps; splits recorded per checkpoint.
import { FIXED_DT } from '../config';
import type { InputFrame } from '../core/input';
import { freshCar, stepCar, type CarState } from '../physics/car';
import type { TrackCollider } from '../physics/collide';
import type { TrackDef } from '../track/types';

export type RacePhase = 'sweep' | 'countdown' | 'racing' | 'finished' | 'paused';

export interface SplitEvent {
  index: number; // checkpoint index (finish = checkpoints.length)
  time: number;
  delta: number | null; // vs reference splits
}

export class Race {
  car: CarState = freshCar();
  phase: RacePhase = 'sweep';
  phaseT = 0;
  time = 0;
  nextCp = 0;
  splits: (number | null)[] = [];
  cpTimes: number[] = [];
  lastSplit: SplitEvent | null = null;
  finished = false;
  finishTime = 0;
  countdownStep = -1;
  respawnCp = 0;
  respawnSnapshot: { x: number; y: number; z: number; yaw: number; vx: number; vy: number; vz: number } | null = null;
  stuckT = 0;
  refSplits: (number | null)[] | null = null;
  onSplit: ((e: SplitEvent) => void) | null = null;
  onCountdown: ((step: number) => void) | null = null;
  onFinish: ((time: number) => void) | null = null;

  constructor(
    public def: TrackDef,
    public track: TrackCollider,
  ) {
    this.splits = new Array(def.checkpoints.length + 1).fill(null);
  }

  reset(refSplits: (number | null)[] | null = null): void {
    this.car = freshCar();
    const pose = this.track.startPose(this.def.start);
    this.car.x = pose.x;
    this.car.y = pose.y;
    this.car.z = pose.z;
    this.car.yaw = pose.yaw;
    this.car.sampleIndex = Math.max(0, Math.floor(this.def.start * (this.track.samples.length - 1)));
    this.phase = 'sweep';
    this.phaseT = 0;
    this.time = 0;
    this.nextCp = 0;
    this.splits = new Array(this.def.checkpoints.length + 1).fill(null);
    this.cpTimes = [];
    this.lastSplit = null;
    this.finished = false;
    this.finishTime = 0;
    this.countdownStep = -1;
    this.refSplits = refSplits;
    this.respawnSnapshot = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, vx: 0, vy: 0, vz: 0 };
    this.respawnCp = 0;
    this.stuckT = 0;
  }

  /** Checkpoint t for index (finish = last). */
  cpT(i: number): number {
    if (i < this.def.checkpoints.length) return this.def.checkpoints[i] as number;
    return this.def.finish;
  }

  step(inp: InputFrame): void {
    const dt = FIXED_DT;
    if (this.phase === 'paused') return;
    if (this.phase === 'sweep') {
      this.phaseT += dt;
      if (this.phaseT >= 1.2) {
        this.phase = 'countdown';
        this.phaseT = 0;
      }
      return;
    }
    if (this.phase === 'countdown') {
      this.phaseT += dt;
      const stepIdx = Math.floor(this.phaseT / 0.375); // 3,2,1,GO over 1.5s
      if (stepIdx !== this.countdownStep) {
        this.countdownStep = stepIdx;
        this.onCountdown?.(stepIdx);
      }
      if (this.phaseT >= 1.5) {
        this.phase = 'racing';
        this.phaseT = 0;
      }
      return; // car held during countdown
    }
    if (this.phase === 'finished') {
      // Autopilot braking: coast to stop.
      const coast: InputFrame = { steer: 0, throttle: 0, brake: 0.4, respawn: false, checkpoint: false };
      stepCar(this.car, coast, dt, this.track);
      this.phaseT += dt;
      return;
    }
    // racing
    if (inp.respawn) {
      this.respawnToCheckpoint();
      return;
    }
    if (inp.checkpoint) {
      this.respawnToCheckpoint();
      return;
    }
    stepCar(this.car, inp, dt, this.track);
    this.time += dt;

    // Checkpoint detection: sample t crossing.
    const curT = (this.track.samples[this.car.sampleIndex]?.t ?? 0) as number;
    const target = this.cpT(this.nextCp);
    // Must cross in order; allow small wrap tolerance by comparing t directly.
    if (this.nextCp <= this.def.checkpoints.length && curT >= target) {
      const e: SplitEvent = {
        index: this.nextCp,
        time: this.time,
        delta: this.refSplits?.[this.nextCp] != null ? this.time - (this.refSplits as number[])[this.nextCp]! : null,
      };
      this.splits[this.nextCp] = this.time;
      this.cpTimes.push(this.time);
      this.lastSplit = e;
      // Snapshot for respawn (only for real checkpoints, not finish).
      if (this.nextCp < this.def.checkpoints.length) {
        this.respawnSnapshot = {
          x: this.car.x, y: this.car.y + 0.4, z: this.car.z, yaw: this.car.yaw,
          vx: this.car.vx, vy: this.car.vy, vz: this.car.vz,
        };
        this.respawnCp = this.nextCp + 1;
      }
      this.nextCp++;
      this.onSplit?.(e);
      if (this.nextCp > this.def.checkpoints.length) {
        this.finished = true;
        this.finishTime = this.time;
        this.phase = 'finished';
        this.phaseT = 0;
        this.onFinish?.(this.finishTime);
      }
    }

    // Fell below kill height / upside down / stuck.
    if (this.car.y < this.track.killY || this.car.upsideDownTime > 1.5) {
      this.respawnToCheckpoint();
    }
    if (this.car.speedKmh < 3) this.stuckT += dt;
    else this.stuckT = 0;
  }

  respawnToCheckpoint(): void {
    const s = this.respawnSnapshot;
    if (!s) return;
    if ((globalThis as unknown as { KERB_TRACE?: boolean }).KERB_TRACE) {
      // eslint-disable-next-line no-console
      console.log('RESPAWN', {
        from: [this.car.x.toFixed(1), this.car.y.toFixed(1), this.car.z.toFixed(1)],
        to: [s.x.toFixed(1), s.y.toFixed(1), s.z.toFixed(1)],
        y: this.car.y.toFixed(1),
        killY: this.track.killY,
        upside: this.car.upsideDownTime.toFixed(2),
        roll: this.car.roll.toFixed(2),
      });
    }
    this.car.x = s.x;
    this.car.y = s.y;
    this.car.z = s.z;
    this.car.yaw = s.yaw;
    this.car.vx = s.vx * 0.6;
    this.car.vy = 0;
    this.car.vz = s.vz * 0.6;
    this.car.roll = 0;
    this.car.pitch = 0;
    this.car.yawRate = 0;
    this.car.upsideDownTime = 0;
    this.car.drift = 0;
    this.stuckT = 0;
  }

  restart(): void {
    this.reset(this.refSplits);
  }

  get checkpointCount(): number {
    return this.def.checkpoints.length;
  }
  get checkpointsPassed(): number {
    return Math.min(this.nextCp, this.def.checkpoints.length);
  }
}
