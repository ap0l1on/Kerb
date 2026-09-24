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
  steerLockLow: number; // deg at 0 kmh
  steerLockHigh: number; // deg at 250 kmh
  steerRampMs: number;
  steerReturnMs: number;
  downforce: number; // coefficient
  driftRearGrip: number; // 0.35
  driftMinSpeedKmh: number;
  driftBleed: number; // fraction per second
  driftGripReturnMs: number;
  airRollTorque: number;
  airPitchTorque: number;
  boostAccel: number; // m/s^2
  boostTime: number;
  turboAccel: number;
  turboTime: number;
  engineOffTime: number;
  wallFriction: number; // 0.6 factor in wall formula
  respawnUpsideDownS: number;
  dragBase: number;
  dragOverTop: number;
  rollingDrag: number;
}

export const TUNING: Tuning = {
  topSpeedKmh: 280,
  accel0_100: 2.2,
  brake200_0: 2.0,
  reverseMaxKmh: 40,
  gravityScale: 1.6,
  suspStiffness: 55000,
  suspDamping: 4500,
  suspRest: 0.45,
  suspTravel: 0.3,
  steerLockLow: 32,
  steerLockHigh: 7,
  steerRampMs: 80,
  steerReturnMs: 60,
  downforce: 0.00042,
  driftRearGrip: 0.35,
  driftMinSpeedKmh: 90,
  driftBleed: 0.06,
  driftGripReturnMs: 250,
  airRollTorque: 2.2,
  airPitchTorque: 1.6,
  boostAccel: 35,
  boostTime: 1.0,
  turboAccel: 55,
  turboTime: 1.2,
  engineOffTime: 2.0,
  wallFriction: 0.6,
  respawnUpsideDownS: 1.5,
  dragBase: 0.00035,
  dragOverTop: 0.004,
  rollingDrag: 0.35,
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
