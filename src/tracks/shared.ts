// Shared helpers for the handcrafted track defs.
import type { Medals, PathPoint } from '../track/types';

export function P(x: number, y: number, z: number, w: number, bank = 0): PathPoint {
  return { p: [x, y, z], w, bank };
}

/** Gold = author*1.08, silver *1.20, bronze *1.40, rounded UP to 0.1 s. */
export function medals(author: number): Medals {
  const up = (m: number) => Math.ceil(author * m * 10 - 1e-9) / 10;
  return { author, gold: up(1.08), silver: up(1.2), bronze: up(1.4) };
}

const ALL = { from: 0, to: 1 };

export function wallsAll(height: number) {
  return [{ ...ALL, side: 'both' as const, height }];
}

/** Vertical loop (travel = -z): CLOSED circle, radius 14, base 6 m, slight
 *  forward lean. Ridden 0..360 deg, revisiting the joint (same point and
 *  tangent twice — Catmull-Rom handles this; no consecutive duplicates).
 *  The raised base separates approach/exit from the low limbs at the joint.
 *  Approach: (x,0,z0+45), (x,1.5,z0+10), (x,3,z0+7) then the joint.
 *  Exit: (x,4,z0-5), (x,2,z0-12), (x,0,z0-25) then continue. */
export function loopPts(x: number, z0: number, w: number): PathPoint[] {
  const R = 14;
  const BASE = 6;
  const LEAN = 10;
  const pts: PathPoint[] = [];
  for (let deg = 0; deg <= 360; deg += 15) {
    if (deg === 0 || deg === 360) {
      pts.push(P(x, BASE, z0, w));
      continue;
    }
    const a = (deg * Math.PI) / 180;
    const y = BASE + R - R * Math.cos(a);
    const z = z0 - R * Math.sin(a) - (LEAN * (1 - Math.cos(a))) / 2;
    pts.push(P(x, Math.max(0, y), z, w));
  }
  return pts;
}
