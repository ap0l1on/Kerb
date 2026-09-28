// Every physics number lives here. Tuned for arcade feel. Dev F2 panel edits these.
export interface Tuning {
  topSpeedKmh: number;
  accel0_100: number; // seconds
  brake200_0: number; // seconds
  reverseMaxKmh: number;
  gravityScale: number;
  suspStiffness: number; // N/m
  suspDamping: number; // N.s/m
  suspRest: number; // m
  suspTravel: number; // m
  wheelRadius: number; // m
  rideHeight: number; // m body above road at rest
  rayOriginH: number; // m above body origin where suspension rays start
  downforce: number; // coefficient
  downforceCap: number; // x car weight (1.5)
  bumpStopMult: number; // x spring rate past 90% travel (10)
  steerLockLow: number; // deg at 0 kmh (kept for compat, LUT overrides)
  steerLockHigh: number; // deg at 250 kmh (kept for compat)
  steerRampMs: number;
  steerReturnMs: number;
  steerSensitivity: number; // 0.7..1.3 default 1.0
  yawDamping: number; // base yaw damping rate
  tyrePeakDeg: number; // peak slip angle (~8)
  driftRearGrip: number; // 0.35
  driftMinSpeedKmh: number;
  driftBleed: number; // fraction per second
  driftGripReturnMs: number;
  driftEntryMs: number; // 220
  airRollTorque: number;
  airPitchTorque: number;
  boostAccel: number; // m/s^2
  boostTime: number;
  turboAccel: number;
  turboTime: number;
  boostCapKmh: number; // 330 hard cap with boost
  downhillCapKmh: number; // 300
  offroadCapKmh: number; // 90 grass/sand
  engineOffTime: number;
  wallFriction: number; // 0.6 factor in wall formula
  respawnUpsideDownS: number;
  dragBase: number;
  dragOverTop: number;
  rollingDrag: number;
  torqueFalloff: number; // 0..1 engine falloff at top speed
  gradeFactor: number; // uphill strength multiplier
}

export const TUNING: Tuning = {
  topSpeedKmh: 270,
  accel0_100: 2.3,
  brake200_0: 2.2,
  reverseMaxKmh: 40,
  gravityScale: 1.6,
  suspStiffness: 65000,
  suspDamping: 5200,
  suspRest: 0.45,
  suspTravel: 0.3,
  wheelRadius: 0.33,
  rideHeight: 0.35,
  rayOriginH: 0.5,
  downforce: 0.00032,
  downforceCap: 1.5,
  bumpStopMult: 10,
  steerLockLow: 30,
  steerLockHigh: 7,
  steerRampMs: 110,
  steerReturnMs: 80,
  steerSensitivity: 1.0,
  yawDamping: 1.4,
  tyrePeakDeg: 8,
  driftRearGrip: 0.35,
  driftMinSpeedKmh: 90,
  driftBleed: 0.06,
  driftGripReturnMs: 250,
  driftEntryMs: 220,
  airRollTorque: 2.2,
  airPitchTorque: 1.6,
  boostAccel: 16,
  boostTime: 1.0,
  turboAccel: 21,
  turboTime: 1.2,
  boostCapKmh: 330,
  downhillCapKmh: 300,
  offroadCapKmh: 90,
  engineOffTime: 2.0,
  wallFriction: 0.6,
  respawnUpsideDownS: 1.5,
  dragBase: 0.00043,
  dragOverTop: 0.0015,
  rollingDrag: 0.35,
  torqueFalloff: 0.8,
  gradeFactor: 1.7,
};

export function tuningToJson(): string {
  return JSON.stringify(TUNING, null, 2);
}
export function tuningFromJson(json: string): boolean {
  try {
    const o = JSON.parse(json) as Partial<Tuning>;
    for (const k of Object.keys(TUNING) as (keyof Tuning)[]) {
      if (typeof o[k] === 'number' && Number.isFinite(o[k] as number)) {
        (TUNING as unknown as Record<string, number>)[k as string] = o[k] as number;
      }
    }
    return true;
  } catch {
    return false;
  }
}
