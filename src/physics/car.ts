// Custom deterministic raycast car physics (no physics engine).
// Fixed dt = 1/120. Same inputs -> same trajectory. No Math.random.
import { KMH } from '../config';
import type { InputFrame } from '../core/input';
import { TUNING } from './tuning';
import { SURFACES, type SurfaceType } from './surfaces';
import type { TrackCollider, GroundHit } from './collide';
import { KERB_WIDTH } from '../track/types';

export interface CarState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number; roll: number;
  yawRate: number; pitchRate: number; rollRate: number;
  grounded: number; // wheels on ground 0..4
  airTime: number;
  upsideDownTime: number;
  surface: SurfaceType;
  zone: 'boost' | 'turbo' | 'engineOff' | 'reset' | null;
  boostT: number; // remaining boost seconds
  boostKind: 'boost' | 'turbo' | null;
  engineOffT: number;
  drift: number; // 0..1 drift blend
  drifting: boolean;
  speedKmh: number;
  sampleIndex: number;
  wallImpact: number;
  landingShake: number;
  /** True while driving inverted (loop top): renderer flips the car body. */
  loopFlip: boolean;
}

export function freshCar(): CarState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0, roll: 0, yawRate: 0, pitchRate: 0, rollRate: 0,
    grounded: 0, airTime: 0, upsideDownTime: 0,
    surface: 'road', zone: null, boostT: 0, boostKind: null, engineOffT: 0,
    drift: 0, drifting: false, speedKmh: 0, sampleIndex: 0,
    wallImpact: 0, landingShake: 0, loopFlip: false,
  };
}

// ---- Steering curve (lookup table, linear interpolation) ----
// Target: 30° at 0–40 km/h → 16° at 120 → 9° at 200 → 7° at 280.
// Endpoints follow TUNING.steerLockLow/High so the F2 panel stays live.
function steerTable(): [number, number][] {
  return [
    [0, TUNING.steerLockLow],
    [40, TUNING.steerLockLow],
    [120, 16],
    [200, 9],
    [280, TUNING.steerLockHigh],
  ];
}

export function maxSteerDeg(speedKmh: number): number {
  const LUT = steerTable();
  const s = Math.max(0, speedKmh);
  if (s <= LUT[0]![0]) return LUT[0]![1];
  for (let i = 1; i < LUT.length; i++) {
    const s0 = LUT[i - 1]![0];
    const d0 = LUT[i - 1]![1];
    const s1 = LUT[i]![0];
    const d1 = LUT[i]![1];
    if (s <= s1) {
      const f = (s - s0) / (s1 - s0);
      return d0 + (d1 - d0) * f;
    }
  }
  return LUT[LUT.length - 1]![1];
}

/** Back-compat wrapper (old linear name). */
export function steerLockDeg(speedKmh: number): number {
  return maxSteerDeg(speedKmh);
}

/** Signed slip angle in degrees: atan2(lateral, |forward|). */
export function slipAngleDeg(vF: number, vL: number): number {
  return (Math.atan2(vL, Math.max(5, Math.abs(vF))) * 180) / Math.PI;
}

/** Smooth tyre curve: linear to 1 at peak, gently falling to 0.85 after.
 *  No hard clamp — avoids grip/plough snapping. */
export function tyreCurve(slipDegAbs: number, peak = 8): number {
  const s = Math.abs(slipDegAbs);
  if (s <= peak) return peak <= 0 ? 1 : s / peak;
  const over = Math.min(1, (s - peak) / 17);
  return 1 - 0.15 * over;
}

// Suspension / collision constants (derived from tuning).
export const MIN_CLEAR = 0.1; // hard floor: body never closer than this to road

export interface WheelDebug {
  hit: boolean;
  compression: number; // 0..~1.5 (1 = full travel)
  surface: SurfaceType;
  slipDeg: number;
  groundY: number;
}

export interface CarTelemetry {
  speedKmh: number;
  steerAngleDeg: number;
  wheels: [WheelDebug, WheelDebug, WheelDebug, WheelDebug];
  bodyClear: number;
  pitchDeg: number;
  rollDeg: number;
  downforceN: number;
  slipDeg: number;
}

/** On-demand telemetry (no mutation, safe for overlay/CSV). */
export function carTelemetry(
  st: CarState,
  inp: InputFrame,
  track: TrackCollider,
): CarTelemetry {
  const T = TUNING;
  const sy = Math.sin(st.yaw);
  const cy = Math.cos(st.yaw);
  const fwdX = sy;
  const fwdZ = cy;
  const rgtX = cy;
  const rgtZ = -sy;
  const halfW = 0.85;
  const halfL = 1.5;
  const rayLen = T.suspRest + T.suspTravel + T.wheelRadius + 0.2;
  const vF = st.vx * fwdX + st.vz * fwdZ;
  const vL = st.vx * rgtX + st.vz * rgtZ;
  const slip = slipAngleDeg(vF, vL);
  const lock = maxSteerDeg(st.speedKmh);
  const steerAngle = inp.steer * lock;
  const offs: [number, number][] = [[halfW, halfL], [-halfW, halfL], [halfW, -halfL], [-halfW, -halfL]];
  const wheels = [] as unknown as [WheelDebug, WheelDebug, WheelDebug, WheelDebug];
  let groundY = -Infinity;
  for (let w = 0; w < 4; w++) {
    const o = offs[w]!;
    const wx = st.x + rgtX * o[0] + fwdX * o[1];
    const wz = st.z + rgtZ * o[0] + fwdZ * o[1];
    const originY = st.y + T.rayOriginH;
    const g = track.ground(wx, st.y, wz, st.sampleIndex);
    if (!g || g.gap) {
      wheels.push({ hit: false, compression: 0, surface: 'road', slipDeg: slip, groundY: NaN });
      continue;
    }
    const dist = originY - g.y;
    const hit = dist >= 0 && dist <= rayLen;
    // Compression fraction: 0 at ride height, 1 at full bump (body on floor).
    const clearance = st.y - g.y;
    const compression = (T.rideHeight - clearance) / T.suspTravel;
    if (g.y > groundY) groundY = g.y;
    wheels.push({
      hit,
      compression: Math.max(0, compression),
      surface: (g.surface === 'grass' ? 'grass' : g.surface) as SurfaceType,
      slipDeg: slip,
      groundY: g.y,
    });
  }
  const bodyClear = groundY === -Infinity ? NaN : st.y - groundY;
  // Downforce accel capped at 1.5x weight, reported as N for a 1000 kg car.
  const weight = 9.81 * T.gravityScale * 1000;
  const dfAccel = Math.min(vF * vF * T.downforce * 10, T.downforceCap * 9.81 * T.gravityScale);
  void weight;
  return {
    speedKmh: Math.hypot(st.vx, st.vz) * 3.6,
    steerAngleDeg: steerAngle,
    wheels,
    bodyClear,
    pitchDeg: (st.pitch * 180) / Math.PI,
    rollDeg: (st.roll * 180) / Math.PI,
    downforceN: dfAccel * 1000,
    slipDeg: slip,
  };
}

/** One fixed physics step. Mutates state. Sub-steps at speed > 150 km/h. */
export function stepCar(
  st: CarState,
  inp: InputFrame,
  dt: number,
  track: TrackCollider,
): void {
  const speedKmh = Math.hypot(st.vx, st.vz) * 3.6;
  if (speedKmh > 150 && dt > 1 / 240) {
    // 2 sub-steps per tick at speed (anti-tunnelling), deterministic:
    // split is a pure function of speed, not frame rate.
    const h = dt / 2;
    stepCarInner(st, inp, h, track);
    stepCarInner(st, inp, h, track);
    return;
  }
  stepCarInner(st, inp, dt, track);
}

function stepCarInner(
  st: CarState,
  inp: InputFrame,
  dt: number,
  track: TrackCollider,
): void {
  const T = TUNING;
  const f = Math.fround;
  // Basis from yaw.
  const sy = Math.sin(st.yaw);
  const cy = Math.cos(st.yaw);
  const fwdX = f(sy);
  const fwdZ = f(cy);
  const rgtX = f(cy);
  const rgtZ = f(-sy);

  // Sample ground under each wheel (ray origin ABOVE chassis bottom).
  // Origin = body + 0.5 m up; length = rest + travel + radius + 0.2 margin.
  const halfW = 0.85;
  const halfL = 1.5;
  const rayLen = T.suspRest + T.suspTravel + T.wheelRadius + 0.2;
  const originH = T.rayOriginH;
  let grounded = 0;
  let sumN = 0;
  let surf: SurfaceType = 'road';
  let zone: CarState['zone'] = null;
  let groundY = -Infinity;
  let gnx = 0;
  let gny = 1;
  let gnz = 0;
  let surfGrip = 1;
  let surfDrag = 1;
  const offs = [[halfW, halfL], [-halfW, halfL], [halfW, -halfL], [-halfW, -halfL]];
  let roadPitch = 0;
  let roadDy = 0;
  let roadDx = fwdX;
  let roadDz = fwdZ;
  for (let w = 0; w < 4; w++) {
    const o = offs[w] as number[];
    const wx = st.x + rgtX * (o[0] as number) + fwdX * (o[1] as number);
    const wz = st.z + rgtZ * (o[0] as number) + fwdZ * (o[1] as number);
    const g: GroundHit | null = track.ground(wx, st.y, wz, st.sampleIndex);
    if (!g || g.gap) continue;
    const originY = st.y + originH;
    const dist = originY - g.y;
    if (dist < 0) {
      // Ray starts BELOW the surface: the body is already clipping.
      // Do not count as a hit — the hard floor constraint below will push
      // the body back out. (This is the clipping cause when downforce wins.)
      // Steep/inverted magnet path still applies so loops stay stuck.
      const steep = g.ny < 0.4 || Math.abs(g.dy) > 0.45;
      if (steep && st.y - g.y < 6 && g.y - st.y < 6) {
        grounded++;
        sumN++;
        if (g.y > groundY) {
          groundY = g.y;
          gnx = g.nx;
          gny = g.ny;
          gnz = g.nz;
        }
        const key = g.surface === 'grass' ? 'grass' : g.surface;
        surf = key as SurfaceType;
        if (g.zone) zone = g.zone;
        roadPitch = g.roadPitch;
        roadDy = g.dy;
        roadDx = g.dx;
        roadDz = g.dz;
      }
      continue;
    }
    if (dist > rayLen) continue; // out of reach
    grounded++;
    sumN++;
    if (g.y > groundY) {
      groundY = g.y;
      gnx = g.nx;
      gny = g.ny;
      gnz = g.nz;
    }
    if (w === 0 || g.y >= groundY - 0.01) {
      // Off-road: beyond the kerb outer edge the surface is grass/sand,
      // capped to 90 km/h. (Tracks only mark dirt/ice on the road itself.)
      let key = g.surface === 'grass' ? 'grass' : g.surface;
      const samp = track.samples[g.index];
      if (samp) {
        const half = samp.width / 2;
        if (Math.abs(g.lateral) > half + KERB_WIDTH) key = 'grass';
      }
      surf = key as SurfaceType;
      if (g.zone) zone = g.zone;
      roadPitch = g.roadPitch;
      roadDy = g.dy;
      roadDx = g.dx;
      roadDz = g.dz;
    }
  }
  const wasGrounded = st.grounded > 0;
  st.grounded = grounded;
  const airborne = grounded === 0;

  if (sumN > 0) {
    const sp = SURFACES[surf] ?? SURFACES.road;
    surfGrip = sp.grip;
    surfDrag = sp.drag;
  }

  // Velocity in car frame.
  let vF = st.vx * fwdX + st.vz * fwdZ;
  let vL = st.vx * rgtX + st.vz * rgtZ;
  st.speedKmh = f(Math.hypot(st.vx, st.vz) * 3.6);

  // --- Drift state (entry/exit blend 200–250 ms, no snap) ---
  const wantDrift = inp.brake > 0.3 && Math.abs(inp.steer) > 0.25 && st.speedKmh > T.driftMinSpeedKmh && !airborne;
  const entryRate = dt / (T.driftEntryMs / 1000);
  const exitRate = dt / (T.driftGripReturnMs / 1000);
  const target_drift = wantDrift ? 1 : 0;
  const dd = target_drift - st.drift;
  const rate = wantDrift ? entryRate : exitRate;
  st.drift += Math.max(-Math.abs(dd), Math.min(Math.abs(dd), Math.sign(dd) * rate));
  st.drifting = st.drift > 0.4;

  // --- Steering (LUT + counter-steer + smooth tyre + yaw damping) ---
  let lock = maxSteerDeg(st.speedKmh) * (Math.PI / 180);
  const slipNow = slipAngleDeg(vF, vL);
  // Counter-steer assist: rear sliding (>8°) allows up to 1.3x lock so a
  // save feels natural instead of ploughing.
  if (Math.abs(slipNow) > T.tyrePeakDeg) lock *= 1.3;
  const steerAngle = inp.steer * lock;
  // Front grips slightly more at low speed (turn-in), equal at high speed.
  const frontFactor = 1.1 - 0.1 * Math.min(1, st.speedKmh / 150);
  const gripFront = surfGrip * frontFactor;
  const gripRear = surfGrip * (1 - st.drift * (1 - T.driftRearGrip));
  const gripEff = gripRear;
  if (!airborne) {
    // Smooth tyre curve scales the yaw authority (no hard clamp).
    const curve = tyreCurve(slipNow, T.tyrePeakDeg);
    // Bicycle-ish yaw, scaled by the tyre curve so slides scrub progressively.
    const yawTarget = (vF >= 0 ? 1 : -1) * (steerAngle * Math.max(0, vF) * 0.32 + inp.steer * 0.55 * Math.min(1, Math.abs(vF) / 8));
    const yawAssist = st.drifting ? 1.25 : 1.0;
    const authority = (0.35 + 0.65 * curve) * gripFront;
    st.yawRate += (yawTarget * yawAssist * authority - st.yawRate) * Math.min(1, dt * 10);
    // Yaw damping: kills high-speed twitch, keeps low speed alive.
    const dampRate = T.yawDamping * (0.3 + st.speedKmh / 150);
    st.yawRate -= st.yawRate * Math.min(1, dampRate * dt);
    // Align pitch/roll to road bank (also follows loops and climbs).
    const bankRoll = Math.asin(Math.max(-1, Math.min(1, gnx * rgtX + gnz * rgtZ)));
    st.roll += (bankRoll * 0.9 - st.roll) * Math.min(1, dt * 6);
    st.pitch += (roadPitch * 0.9 - st.pitch) * Math.min(1, dt * 6);
  } else {
    // Air control: steer rolls, throttle/brake pitch.
    st.rollRate += (inp.steer * T.airRollTorque - st.rollRate) * Math.min(1, dt * 4);
    st.pitchRate += ((inp.brake - inp.throttle) * T.airPitchTorque - st.pitchRate) * Math.min(1, dt * 4);
    st.rollRate *= 1 - Math.min(1, dt * 1.2);
    st.pitchRate *= 1 - Math.min(1, dt * 1.2);
    st.roll += st.rollRate * dt;
    st.pitch += st.pitchRate * dt;
    st.roll = Math.max(-1.2, Math.min(1.2, st.roll));
    st.pitch = Math.max(-1.0, Math.min(1.0, st.pitch));
    st.yawRate *= 1 - Math.min(1, dt * 0.4);
  }
  st.yaw += st.yawRate * dt;

  // Recompute basis after yaw update for forces.
  const sy2 = Math.sin(st.yaw);
  const cy2 = Math.cos(st.yaw);
  const fx = f(sy2);
  const fz = f(cy2);
  const rx = f(cy2);
  const rz = f(-sy2);
  vF = st.vx * fx + st.vz * fz;
  vL = st.vx * rx + st.vz * rz;

  // --- Zones (edge-triggered: a new pad refreshes the timer, never stacks) ---
  const prevZone = st.zone;
  if ((zone === 'boost' || zone === 'turbo') && !airborne && zone !== prevZone) {
    if (zone === 'boost') {
      st.boostT = T.boostTime;
      st.boostKind = 'boost';
    } else {
      st.boostT = T.turboTime;
      st.boostKind = 'turbo';
    }
  } else if (zone === 'engineOff' && st.engineOffT <= 0 && zone !== prevZone) {
    st.engineOffT = T.engineOffTime;
  } else if (zone === 'reset') {
    st.roll *= 0.8;
    st.pitch *= 0.8;
    st.drift = 0;
  }
  st.zone = zone;
  if (st.boostT > 0) st.boostT -= dt;
  if (st.engineOffT > 0) st.engineOffT -= dt;
  const boosting = st.boostT > 0;

  // --- Longitudinal (torque curve + v² drag, no flat clamp) ---
  const topSpeed = T.topSpeedKmh * KMH;
  const aMax = (100 * KMH) / T.accel0_100;
  const bMax = (200 * KMH) / T.brake200_0;
  const revMax = T.reverseMaxKmh * KMH;
  const engineOn = st.engineOffT <= 0;
  const boostCap = T.boostCapKmh * KMH;
  const downhillCap = T.downhillCapKmh * KMH;
  // Rail state for steep glued ribbon (loops): 1D physics along tangent.
  let railTx = 0;
  let railTy = 0;
  let railTz = 0;
  let railLoop = false;
  if (!airborne) {
    const gc0 = track.ground(st.x, st.y, st.z, st.sampleIndex);
    if (gc0 && !gc0.gap && (Math.abs(gc0.dy) > 0.45 || gc0.ny < 0.2)) {
      const s0 = track.samples[gc0.index];
      if (s0 && Math.abs(gc0.lateral) < s0.width / 2 + 1.5) {
        railLoop = true;
        railTx = gc0.dx;
        railTy = gc0.dy;
        railTz = gc0.dz;
      }
    }
  }
  // Surface top-speed caps (off-road grass settles to 90 km/h).
  const surfCap = surf === 'grass' ? T.offroadCapKmh * KMH : surf === 'dirt' ? 140 * KMH : Infinity;
  if (railLoop) {
    st.drifting = false;
    let sp = st.vx * railTx + st.vy * railTy + st.vz * railTz;
    if (engineOn && inp.throttle > 0) {
      const over = Math.max(0, sp - topSpeed);
      const taper = Math.max(0, 1 - over / 30);
      const ratio = Math.min(1, Math.max(0, sp / topSpeed));
      // Loops need full momentum: no mid dip on the rail.
      const torque = 1 - T.torqueFalloff * ratio * ratio;
      sp += inp.throttle * aMax * torque * taper * dt;
    }
    if (boosting) {
      sp += (st.boostKind === 'turbo' ? T.turboAccel : T.boostAccel) * dt;
    }
    if (inp.brake > 0) {
      if (sp > 0.5) {
        sp -= Math.min(sp, inp.brake * bMax * dt);
      } else {
        sp = Math.max(-revMax, sp - inp.brake * aMax * 0.6 * dt);
      }
    }
    const dragK = T.dragBase * surfDrag + (sp > topSpeed ? T.dragOverTop : 0);
    sp -= sp * Math.abs(sp) * dragK * dt;
    sp -= Math.sign(sp) * Math.min(Math.abs(sp), T.rollingDrag * surfDrag * dt);
    if (sp > boostCap) sp = boostCap;
    st.vx = f(railTx * sp);
    st.vy = f(railTy * sp);
    st.vz = f(railTz * sp);
    vF = st.vx * fx + st.vz * fz;
    vL = st.vx * rx + st.vz * rz;
  } else if (!airborne) {
    if (engineOn && inp.throttle > 0 && vF < surfCap) {
      // Torque curve: strong low down, easing off near top (no hard wall).
      // Mid-range dip at ~60% of top slows 0–200 to target without hurting
      // 0–100 (low) or top speed (high).
      const ratio = Math.min(1, Math.max(0, vF / topSpeed));
      const dip = 1 - 0.18 * Math.exp(-Math.pow((ratio - 0.58) / 0.18, 2));
      const torque = (1 - T.torqueFalloff * ratio * ratio) * dip;
      const over = Math.max(0, vF - topSpeed);
      const taper = Math.max(0, 1 - over / 30);
      vF += inp.throttle * aMax * torque * taper * dt;
    }
    if (boosting) {
      vF += (st.boostKind === 'turbo' ? T.turboAccel : T.boostAccel) * dt;
    }
    if (inp.brake > 0) {
      if (vF > 0.5) {
        // Brake to a stop at full authority; only reverse once stopped.
        vF -= Math.min(vF, inp.brake * bMax * dt);
        if (vF < 0.5 && inp.brake > 0 && vF >= 0) {
          // Hold at zero rather than creeping into reverse while stopping.
          if (vF < 0) vF = 0;
        }
      } else {
        // Reverse (already stopped).
        vF = Math.max(-revMax, vF - inp.brake * aMax * 0.6 * dt);
      }
    }
    // Grade: uphill bleeds speed, downhill gains (capped later).
    if (sumN > 0) {
      const trackXZ = Math.hypot(roadDx, roadDz) || 1;
      const dot = (fx * roadDx + fz * roadDz) / trackXZ;
      const grade = 9.81 * T.gravityScale * T.gradeFactor * roadDy * Math.max(-1, Math.min(1, dot));
      vF -= grade * dt;
    }
    // Drift bleed.
    if (st.drifting) vF *= 1 - T.driftBleed * dt;
    // Drag: quadratic + rolling, steeper above top speed (smooth, no wall).
    const dragK = T.dragBase * surfDrag + (vF > topSpeed ? T.dragOverTop : 0);
    vF -= vF * Math.abs(vF) * dragK * dt;
    vF -= Math.sign(vF) * Math.min(Math.abs(vF), T.rollingDrag * surfDrag * dt);
    // Surface cap: converge to the cap instead of sailing past (grass → 90).
    if (vF > surfCap) {
      vF = surfCap + (vF - surfCap) * Math.max(0, 1 - 3 * dt);
    }
    // Downhill cap 300 (no boost): strong soft wall.
    if (!boosting && vF > downhillCap) {
      vF = downhillCap + (vF - downhillCap) * Math.max(0, 1 - 4 * dt);
    }
    // Absolute hard cap with boost: 330.
    if (vF > boostCap) vF = boostCap;
    if (vF < -revMax) vF = -revMax;
    // Lateral grip: smooth tyre curve (no hard clamp).
    const slipA = Math.abs(slipAngleDeg(vF, vL));
    const curveL = tyreCurve(slipA, T.tyrePeakDeg);
    // Peak lateral accel ~ 28 m/s² on road; slides scrub progressively.
    const maxLat = 28 * gripEff;
    const latForce = Math.sign(vL) * Math.min(Math.abs(vL) / Math.max(dt, 1e-4), maxLat * curveL * (0.4 + 0.6 * Math.min(1, Math.abs(vL) / 6)));
    // When nearly straight (tiny slip), hold the line without jitter.
    if (Math.abs(vL) < 0.05) {
      vL *= Math.max(0, 1 - Math.min(1, 20 * dt));
    } else {
      vL -= latForce * dt;
      // No steering-wiggle exploit: scrubbing sideways never adds forward speed.
      // (Longitudinal is untouched here; drift bleed above only removes speed.)
    }
  } else {
    // Slight air drag.
    vF -= vF * Math.abs(vF) * 0.00012 * dt;
    st.airTime += dt;
  }

  // --- Vertical / suspension (normal-based spring + bump stop + capped downforce) ---
  const steepGlue = !airborne && (Math.abs(roadPitch) > 0.45 || gny < 0.2);
  if (!airborne && !steepGlue && sumN > 0 && groundY > -Infinity) {
    const clearance = st.y - groundY;
    const targetN = T.rideHeight;
    // Spring along the road normal (not world up): banks/loops push correctly.
    const springK = T.suspStiffness / 500;
    const dampK = T.suspDamping / 500;
    const compression = (targetN - clearance) / T.suspTravel;
    let k = springK;
    // Bump stop: past 90% travel, 10x rate + damping.
    if (compression > 0.9) k = springK * T.bumpStopMult;
    const springN = (targetN - clearance) * k;
    // Damper: velocity along the normal.
    const velN = st.vx * gnx + st.vy * gny + st.vz * gnz;
    const dampN = -velN * dampK * (compression > 0.9 ? 2 : 1);
    // Downforce ∝ v², capped at 1.5x weight so springs win at speed.
    const dfRaw = vF * vF * T.downforce * 10;
    const dfCap = T.downforceCap * 9.81 * T.gravityScale;
    const dfN = -Math.min(dfRaw, dfCap);
    const accN = springN + dampN + dfN;
    st.vx = f(st.vx + gnx * accN * dt);
    st.vy = f(st.vy + gny * accN * dt);
    st.vz = f(st.vz + gnz * accN * dt);
    // Gravity (vertical).
    st.vy -= 9.81 * T.gravityScale * dt * 0; // gravity is in the spring target; keep small sink
    st.vy = Math.max(-30, Math.min(30, st.vy));
    if (wasGrounded === false || st.airTime > 0) {
      // Landing: flat −2%, bad −20% to −50% by angle.
      const tilt = Math.abs(st.roll) + Math.abs(st.pitch);
      const deg = tilt * (180 / Math.PI);
      if (st.airTime > 0.08) {
        if (deg < 20 && grounded >= 3) {
          const kk = 0.98;
          vF *= kk;
          vL *= kk;
          st.landingShake = Math.min(1, st.airTime * 1.5);
        } else {
          const loss = deg < 40 ? 0.8 : deg < 70 ? 0.65 : 0.5;
          vF *= loss;
          vL *= loss;
          st.landingShake = 1;
        }
        st.roll *= 0.3;
        st.pitch *= 0.3;
        st.rollRate = 0;
        st.pitchRate = 0;
      }
      st.airTime = 0;
    }
  } else if (airborne) {
    st.vy -= 9.81 * T.gravityScale * dt;
    if (st.vy < -60) st.vy = -60;
  }

  // Recompose horizontal velocity.
  st.vx = f(fx * vF + rx * vL);
  st.vz = f(fz * vF + rz * vL);

  // Integrate.
  st.x = f(st.x + st.vx * dt);
  st.y = f(st.y + st.vy * dt);
  st.z = f(st.z + st.vz * dt);

  // --- Walls (angle-based loss: 10° scrape −8%, 60°+ head-on −60%) ---
  const w = track.walls(st.x, st.y, st.z, st.vx, st.vy, st.vz, st.sampleIndex);
  if (w.impact > 0.02) {
    const angDeg = (Math.asin(Math.min(1, w.impact)) * 180) / Math.PI;
    // Piecewise loss: 8% at 10°, 60% at 60°, clamped.
    let loss: number;
    if (angDeg <= 10) loss = 0.08 * (angDeg / 10);
    else if (angDeg >= 60) loss = 0.6;
    else loss = 0.08 + ((angDeg - 10) / 50) * (0.6 - 0.08);
    const keep = 1 - loss;
    st.vx = f(w.vx * keep);
    st.vy = f(w.vy * keep);
    st.vz = f(w.vz * keep);
    st.x = f(w.px);
    st.y = f(w.py);
    st.z = f(w.pz);
    st.wallImpact = w.impact;
  } else {
    st.wallImpact = Math.max(0, st.wallImpact - dt * 3);
  }

  // --- Hard floor constraint (anti-tunnelling): no chassis corner below road.
  // Uses the surface normal; removes into-surface velocity (no bounce).
  // Wall-rides and loops (tilted normals) are owned by the glue/rail path:
  // a vertical floor there would fight the bank, so skip when tilted.
  if (!steepGlue && gny > 0.5) {
    const corners: [number, number][] = [
      [0, 0],
      [halfW, halfL],
      [-halfW, halfL],
      [halfW, -halfL],
      [-halfW, -halfL],
    ];
    for (let ci = 0; ci < corners.length; ci++) {
      const cxo = corners[ci]![0];
      const czo = corners[ci]![1];
      const qx = st.x + rgtX * cxo + fwdX * czo;
      const qz = st.z + rgtZ * cxo + fwdZ * czo;
      const gh = track.ground(qx, st.y, qz, st.sampleIndex);
      if (!gh || gh.gap) continue;
      if (gh.ny < 0.5) continue; // tilted: glue owns it
      const minY = gh.y + MIN_CLEAR;
      if (st.y < minY) {
        // Push back out along the surface normal.
        const pen = minY - st.y;
        const invNy = gh.ny > 0.2 ? 1 / gh.ny : 1;
        st.x = f(st.x + gh.nx * pen * invNy);
        st.y = f(minY);
        st.z = f(st.z + gh.nz * pen * invNy);
        const vn = st.vx * gh.nx + st.vy * gh.ny + st.vz * gh.nz;
        if (vn < 0) {
          st.vx = f(st.vx - gh.nx * vn);
          st.vy = f(st.vy - gh.ny * vn);
          st.vz = f(st.vz - gh.nz * vn);
        }
        // Recompute car-frame velocities after the projection.
        vF = st.vx * fx + st.vz * fz;
        vL = st.vx * rx + st.vz * rz;
      }
    }
  }

  // --- Surface glue (authoritative, runs after integrate + walls) ---
  // Loops (|tangent.y| large): snap fully to the ribbon, velocity along tangent.
  // Wall-rides (steep bank, flat tangent): glue height, project velocity on plane.
  st.loopFlip = false;
  if (!airborne) {
    const gc = track.ground(st.x, st.y, st.z, st.sampleIndex);
    if (gc && !gc.gap && (gc.ny < 0.4 || Math.abs(gc.dy) > 0.45)) {
      // Continuity first: prefer the sticky sample index over the query when
      // they agree on the area, so per-tick query flicker between adjacent
      // samples can't undo rail progress (treadmill).
      let idx = gc.index;
      const hi = st.sampleIndex;
      if (hi >= 0 && hi < track.samples.length && Math.abs(hi - gc.index) <= 10) idx = hi;
      const sh = track.samples[idx];
      if (!sh) return;
      const latRaw = (st.x - sh.x) * sh.sx + (st.y - sh.y) * sh.sy + (st.z - sh.z) * sh.sz;
      if (Math.abs(latRaw) > sh.width / 2 + 1.5) return;
      if (Math.abs(sh.dy) > 0.45 || sh.uy < 0.2) {
        // Loop limbs / steep climbs: explicit rail progress. Integrate signed
        // speed along the ribbon and walk the sample index, so the car can
        // neither stall (treadmill) nor skip ahead. Lateral offset is kept.
        const sp = st.vx * sh.dx + st.vy * sh.dy + st.vz * sh.dz;
        let along = (st.x - sh.x) * sh.dx + (st.y - sh.y) * sh.dy + (st.z - sh.z) * sh.dz + sp * dt;
        for (let k = 0; k < 8; k++) {
          const a = track.samples[idx];
          const b = track.samples[idx + (along >= 0 ? 1 : -1)];
          if (!a || !b) break;
          const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1.5;
          if (along >= 0 ? along > seg / 2 : along < -seg / 2) {
            idx += along >= 0 ? 1 : -1;
            along -= along >= 0 ? seg : -seg;
          } else break;
        }
        const s2 = track.samples[idx] ?? sh;
        const half2 = s2.width / 2;
        const lat = Math.max(-half2 - 1.0, Math.min(half2 + 1.0, latRaw));
        st.x = f(s2.x + s2.dx * along + s2.sx * lat);
        st.z = f(s2.z + s2.dz * along + s2.sz * lat);
        st.y = f(s2.y + along * s2.dy + lat * s2.sy + 0.35);
        st.vx = f(s2.dx * sp);
        st.vy = f(s2.dy * sp);
        st.vz = f(s2.dz * sp);
        const heading = Math.atan2(s2.dx, s2.dz);
        let dyaw = heading - st.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        st.yaw += dyaw * Math.min(1, dt * 10);
        st.loopFlip = s2.uy < 0;
        st.airTime = 0;
        st.upsideDownTime = 0;
        st.roll *= 0.9;
        st.sampleIndex = idx;
      } else if (sh.uy < 0.4) {
        const alongC = (st.x - sh.x) * sh.dx + (st.z - sh.z) * sh.dz;
        st.y = f(sh.y + alongC * sh.dy + latRaw * sh.sy + 0.35);
        const vn = st.vx * sh.ux + st.vy * sh.uy + st.vz * sh.uz;
        st.vx = f(st.vx - sh.ux * vn);
        st.vy = f(st.vy - sh.uy * vn);
        st.vz = f(st.vz - sh.uz * vn);
        st.upsideDownTime = 0;
        // Inverted/flat loop top (and steep wall-rides): keep guiding the
        // heading along the road so steering can't spin the car.
        const heading = Math.atan2(sh.dx, sh.dz);
        let dyaw = heading - st.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        st.yaw += dyaw * Math.min(1, dt * 8);
        st.yawRate *= 1 - Math.min(1, dt * 6);
        st.loopFlip = sh.uy < 0;
        st.airTime = 0;
      }
    }
  }

  // Off-track grass slow (when no ground found at all): heavy drag handled via surf; if fully off, sink slightly.
  st.surface = surf;
  st.speedKmh = f(Math.hypot(st.vx, st.vz) * 3.6);

  // Upside-down detection (roll beyond ~100deg while not stuck to a loop).
  if (Math.abs(st.roll) > 1.75 && (airborne || gny > 0.4)) st.upsideDownTime += dt;
  else st.upsideDownTime = 0;

  // Update nearest sample hint (continuity-safe across loops/overpasses).
  st.sampleIndex = track.trackIndex(st.x, st.y, st.z, st.sampleIndex);
}
