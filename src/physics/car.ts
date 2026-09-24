// Custom deterministic raycast car physics (no physics engine).
// Fixed dt = 1/120. Same inputs -> same trajectory. No Math.random.
import { KMH } from '../config';
import type { InputFrame } from '../core/input';
import { TUNING } from './tuning';
import { SURFACES, type SurfaceType } from './surfaces';
import type { TrackCollider, GroundHit } from './collide';

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
    drift: 0,     drifting: false, speedKmh: 0, sampleIndex: 0,
    wallImpact: 0, landingShake: 0, loopFlip: false,
  };
}

// (scratch removed: walls() takes scalars now)

function steerLockDeg(speedKmh: number): number {
  const t = Math.min(1, Math.max(0, speedKmh / 250));
  const lock = TUNING.steerLockLow + (TUNING.steerLockHigh - TUNING.steerLockLow) * t;
  return lock;
}

/** One fixed physics step. Mutates state. */
export function stepCar(
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

  // Sample ground under each wheel (4 raycasts along world -Y from body corners).
  const halfW = 0.85;
  const halfL = 1.5;
  const restLen = T.suspRest;
  let grounded = 0;
  let sumY = 0;
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
  for (let w = 0; w < 4; w++) {
    const o = offs[w] as number[];
    const wx = st.x + rgtX * (o[0] as number) + fwdX * (o[1] as number);
    const wz = st.z + rgtZ * (o[0] as number) + fwdZ * (o[1] as number);
    const g: GroundHit | null = track.ground(wx, st.y, wz, st.sampleIndex);
    if (!g || g.gap) continue;
    const topY = g.y + restLen + T.suspTravel;
    const rayTop = st.y + 0.35;
    // Loop assist: on steep/inverted road (loop-the-loop, steep climbs),
    // stick to the surface when close, so full loops are drivable arcade-style.
    const steep = g.ny < 0.4 || Math.abs(g.dy) > 0.45;
    if (rayTop < g.y - 0.5) {
      // Magnet-close on steep road: count as grounded so loops stay stuck.
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
      }
      continue;
    }
    const compression = topY - rayTop;
    if (compression > 0) {
      grounded++;
      sumY += g.y;
      sumN++;
      if (g.y > groundY) {
        groundY = g.y;
        gnx = g.nx;
        gny = g.ny;
        gnz = g.nz;
      }
      if (w === 0 || g.y >= groundY - 0.01) {
        const key = g.surface === 'grass' ? 'grass' : g.surface;
        surf = key as SurfaceType;
        if (g.zone) zone = g.zone;
        roadPitch = g.roadPitch;
      }
    }
  }
  void sumY;
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

  // --- Drift state ---
  const wantDrift = inp.brake > 0.3 && Math.abs(inp.steer) > 0.25 && st.speedKmh > T.driftMinSpeedKmh && !airborne;
  const blendRate = wantDrift ? dt / 0.12 : dt / (T.driftGripReturnMs / 1000);
  st.drift += Math.max(-st.drift, Math.min((wantDrift ? 1 : 0) - st.drift, Math.sign((wantDrift ? 1 : 0) - st.drift) * blendRate));
  st.drifting = st.drift > 0.4;

  // --- Steering ---
  const lock = steerLockDeg(st.speedKmh) * (Math.PI / 180);
  const steerAngle = inp.steer * lock;
  // Yaw rate: bicycle-ish, reduced by drift & surface grip.
  const gripEff = surfGrip * (1 - st.drift * (1 - T.driftRearGrip));
  if (!airborne) {
    const yawTarget = (vF >= 0 ? 1 : -1) * (steerAngle * Math.max(0, vF) * 0.32 + inp.steer * 0.55 * Math.min(1, Math.abs(vF) / 8));
    const yawAssist = st.drifting ? 1.25 : 1.0;
    st.yawRate += (yawTarget * yawAssist * gripEff - st.yawRate) * Math.min(1, dt * 10);
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

  // --- Zones ---
  if (zone === 'boost' && st.boostT <= 0 && !airborne) {
    st.boostT = T.boostTime;
    st.boostKind = 'boost';
  } else if (zone === 'turbo' && st.boostT <= 0 && !airborne) {
    st.boostT = T.turboTime;
    st.boostKind = 'turbo';
  } else if (zone === 'engineOff' && st.engineOffT <= 0) {
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

  // --- Longitudinal ---
  const topSpeed = T.topSpeedKmh * KMH;
  const aMax = (100 * KMH) / T.accel0_100; // ~12.6 m/s^2
  const bMax = (200 * KMH) / T.brake200_0;
  const revMax = T.reverseMaxKmh * KMH;
  const engineOn = st.engineOffT <= 0;
  // Rail state for steep glued ribbon: 1D physics along the road tangent
  // (a horizontal car-forward engine is useless on a vertical wall and gets
  // deleted by the rail projection every tick). Rails on steep climbs AND
  // anywhere inverted (loop top), releasing only when upright and gentle.
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
  if (railLoop) {
    st.drifting = false;
    let sp = st.vx * railTx + st.vy * railTy + st.vz * railTz;
    if (engineOn && inp.throttle > 0) {
      const over = Math.max(0, sp - topSpeed);
      const taper = Math.max(0, 1 - over / 30);
      sp += inp.throttle * aMax * taper * dt;
    }
    if (boosting) {
      sp += (st.boostKind === 'turbo' ? T.turboAccel : T.boostAccel) * dt;
    }
    if (inp.brake > 0) {
      if (sp > 2) {
        sp -= Math.min(sp, inp.brake * bMax * dt);
      } else {
        sp = Math.max(-revMax, sp - inp.brake * aMax * 0.6 * dt);
      }
    }
    const dragK = T.dragBase * surfDrag + (sp > topSpeed ? T.dragOverTop : 0);
    sp -= sp * Math.abs(sp) * dragK * dt;
    sp -= Math.sign(sp) * Math.min(Math.abs(sp), T.rollingDrag * surfDrag * dt);
    st.vx = f(railTx * sp);
    st.vy = f(railTy * sp);
    st.vz = f(railTz * sp);
    vF = st.vx * fx + st.vz * fz;
    vL = st.vx * rx + st.vz * rz;
  } else if (!airborne) {
    if (engineOn && inp.throttle > 0) {
      // Soft cap: taper engine force near top speed.
      const over = Math.max(0, vF - topSpeed);
      const taper = Math.max(0, 1 - over / 30);
      vF += inp.throttle * aMax * taper * dt;
    }
    if (boosting) {
      vF += (st.boostKind === 'turbo' ? T.turboAccel : T.boostAccel) * dt;
    }
    if (inp.brake > 0) {
      if (vF > 2) {
        const bMax = (200 * KMH) / T.brake200_0;
        vF -= Math.min(vF, inp.brake * bMax * dt);
      } else {
        // Reverse.
        const revMax = T.reverseMaxKmh * KMH;
        vF = Math.max(-revMax, vF - inp.brake * aMax * 0.6 * dt);
      }
    }
    // Drift bleed.
    if (st.drifting) vF *= 1 - T.driftBleed * dt;
    // Drag: quadratic + rolling, steeper above top speed.
    const dragK = T.dragBase * surfDrag + (vF > topSpeed ? T.dragOverTop : 0);
    vF -= vF * Math.abs(vF) * dragK * dt;
    vF -= Math.sign(vF) * Math.min(Math.abs(vF), T.rollingDrag * surfDrag * dt);
    // Lateral grip: kill sideways slip.
    const latKeep = Math.max(0, 1 - Math.min(1, (6 + gripEff * 14) * dt * (st.drifting ? 0.35 : 1)));
    vL *= latKeep;
  } else {
    // Slight air drag.
    vF -= vF * Math.abs(vF) * 0.00012 * dt;
    st.airTime += dt;
  }

  // --- Vertical / suspension ---
  // On steep glued ribbon (loop limbs) the end-snap owns y/vy: skip spring,
  // damper and downforce so climbing speed is preserved, not damped away.
  // Same while inverted (loop top), where the rail owns the motion.
  const steepGlue = !airborne && (Math.abs(roadPitch) > 0.45 || gny < 0.2);
  if ((globalThis as unknown as { KERB_TRACE?: boolean }).KERB_TRACE) {
    // eslint-disable-next-line no-console
    console.log('TRACE vert', { airborne, roadPitch, steepGlue, vy: st.vy, groundY, y: st.y });
  }
  if (!airborne && !steepGlue) {
    const targetY = groundY + 0.35;
    // Spring toward ride height with damping.
    const spring = (targetY - st.y) * 60;
    const damp = (0 - st.vy) * 9;
    st.vy += (spring + damp) * dt * 0.55;
    st.vy = Math.max(-30, Math.min(30, st.vy));
    if (wasGrounded === false || st.airTime > 0) {
      // Landing.
      const tilt = Math.abs(st.roll) + Math.abs(st.pitch);
      const deg = tilt * (180 / Math.PI);
      if (st.airTime > 0.08) {
        if (deg < 20 && grounded >= 3) {
          const k = 0.98;
          vF *= k;
          vL *= k;
          st.landingShake = Math.min(1, st.airTime * 1.5);
        } else {
          const loss = deg < 40 ? 0.8 : deg < 70 ? 0.6 : 0.4;
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

  // Downforce at speed (extra planted feel + keeps jumps sane).
  if (!airborne && !steepGlue) {
    st.vy -= vF * vF * T.downforce * dt * 10;
  }

  // Recompose horizontal velocity.
  st.vx = f(fx * vF + rx * vL);
  st.vz = f(fz * vF + rz * vL);

  // Integrate.
  st.x = f(st.x + st.vx * dt);
  st.y = f(st.y + st.vy * dt);
  st.z = f(st.z + st.vz * dt);

  // --- Walls ---
  const w = track.walls(st.x, st.y, st.z, st.vx, st.vy, st.vz, st.sampleIndex);
  if (w.impact > 0.02) {
    const keep = 1 - T.wallFriction * w.impact;
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

  // --- Surface glue (authoritative, runs after integrate + walls) ---
  // Loops (|tangent.y| large): snap fully to the ribbon, velocity along tangent.
  // Wall-rides (steep bank, flat tangent): glue height, project velocity on plane.
  st.loopFlip = false;
  if (!airborne) {
    const gc = track.ground(st.x, st.y, st.z, st.sampleIndex);
    if ((globalThis as unknown as { KERB_DEBUG?: boolean }).KERB_DEBUG) {
      // eslint-disable-next-line no-console
      console.log('GLUE', { airborne, gc: gc ? { ny: gc.ny, dy: gc.dy, gap: gc.gap, lat: gc.lateral, idx: gc.index } : null });
    }
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
