// Catmull-Rom centreline sampling with banking and width.
// Deterministic: pure math, no allocation in the hot path (callers reuse arrays).
import type { PathPoint } from './types';

export interface SplinePoint {
  x: number;
  y: number;
  z: number;
  w: number;
  bank: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Sample the centreline uniformly (~every step metres). Returns points with cumulative distance. */
export function sampleCentreline(
  path: PathPoint[],
  closed: boolean,
  step = 1.5,
): { pts: SplinePoint[]; lengths: number[]; total: number } {
  const n = path.length;
  // Dense sample then resample uniformly.
  const dense: SplinePoint[] = [];
  const segs = closed ? n : n - 1;
  const per = 16;
  const at = (i: number): PathPoint => path[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let s = 0; s < segs; s++) {
    const p0 = at(s - 1);
    const p1 = at(s);
    const p2 = at(s + 1);
    const p3 = at(s + 2);
    for (let i = 0; i < per; i++) {
      const t = i / per;
      dense.push({
        x: catmullRom(p0.p[0], p1.p[0], p2.p[0], p3.p[0], t),
        y: catmullRom(p0.p[1], p1.p[1], p2.p[1], p3.p[1], t),
        z: catmullRom(p0.p[2], p1.p[2], p2.p[2], p3.p[2], t),
        w: catmullRom(p0.w, p1.w, p2.w, p3.w, t),
        bank: catmullRom(p0.bank, p1.bank, p2.bank, p3.bank, t),
      });
    }
  }
  if (!closed && n > 0) {
    const last = path[n - 1];
    dense.push({ x: last.p[0], y: last.p[1], z: last.p[2], w: last.w, bank: last.bank });
  }
  // Cumulative lengths.
  const lengths: number[] = new Array(dense.length);
  lengths[0] = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    lengths[i] = lengths[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const total = lengths[dense.length - 1] || 1;
  // Uniform resample.
  const count = Math.max(8, Math.floor(total / step));
  const pts: SplinePoint[] = [];
  const outLen: number[] = [];
  let j = 0;
  for (let i = 0; i <= count; i++) {
    const d = (i / count) * total;
    while (j < dense.length - 2 && (lengths[j + 1] as number) < d) j++;
    const l0 = lengths[j] as number;
    const l1 = lengths[j + 1] as number;
    const f = l1 > l0 ? (d - l0) / (l1 - l0) : 0;
    const a = dense[j];
    const b = dense[j + 1];
    pts.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
      w: a.w + (b.w - a.w) * f,
      bank: a.bank + (b.bank - a.bank) * f,
    });
    outLen.push(d);
  }
  return { pts, lengths: outLen, total };
}

/** Insert a vertical loop of control points. Returns new path array. */
export function loopHelper(
  path: PathPoint[],
  index: number,
  radius: number,
  width: number,
  segments = 12,
): PathPoint[] {
  // Build a loop in the vertical plane aligned with travel direction at path[index].
  const a = path[Math.max(0, index - 1)];
  const b = path[Math.min(path.length - 1, index)];
  const c = path[Math.min(path.length - 1, index + 1)];
  let dx = c.p[0] - a.p[0];
  let dz = c.p[2] - a.p[2];
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  const cx = b.p[0];
  const cy = b.p[1] + radius;
  const cz = b.p[2];
  const pts: PathPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    // Parametrize: enter at bottom, go up and around.
    const theta = -Math.PI / 2 + (i / segments) * Math.PI * 2;
    const fwd = Math.cos(theta) * radius; // horizontal travel
    const h = Math.sin(theta) * radius + radius; // 0..2R
    pts.push({
      p: [cx + dx * fwd, cy - radius + h, cz + dz * fwd],
      w: width,
      bank: 0,
    });
  }
  const out = [...path];
  out.splice(index, 1, ...pts);
  return out;
}
