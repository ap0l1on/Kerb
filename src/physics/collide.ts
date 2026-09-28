// Track collision: road ribbon queries via a spatial hash grid + wall segments.
// Deterministic: no Math.random, iteration order fixed.
import type { TrackSample } from '../track/types';
import { KERB_WIDTH } from '../track/types';

export interface GroundHit {
  y: number;
  nx: number;
  ny: number;
  nz: number;
  /** Road tangent (unit). */
  dx: number;
  dy: number;
  dz: number;
  /** Road pitch (asin of tangent dy): used to align the car on loops/climbs. */
  roadPitch: number;
  surface: 'road' | 'dirt' | 'ice' | 'grass';
  zone: 'boost' | 'turbo' | 'engineOff' | 'reset' | null;
  lateral: number; // metres from centre (+ right)
  t: number;
  index: number;
  gap: boolean;
}

const CELL = 12;

function cellKey(cx: number, cz: number): string {
  return cx + ':' + cz;
}

/** Vertical-down ray vs triangle. Returns hit y + geometric normal, or null.
 *  Deterministic Möller–Trumbore restricted to dir (0,-1,0). */
function rayDownTri(
  px: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): { y: number; n: { x: number; y: number; z: number } } | null {
  // Edge vectors.
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  // p = dir x e2, dir=(0,-1,0): p = (-1*e2z*? ) compute explicitly:
  // dir x e2 = (dy*e2z - dz*e2y, dz*e2x - dx*e2z, dx*e2y - dy*e2x)
  // with dir=(0,-1,0): = (-1*e2z - 0, 0 - 0, 0 - (-1)*e2x) = (-e2z, 0, e2x)
  const pxv = -e2z;
  const pyv = 0;
  const pzv = e2x;
  const det = e1x * pxv + e1y * pyv + e1z * pzv;
  if (det > -1e-9 && det < 1e-9) return null; // parallel
  const inv = 1 / det;
  // tvec = origin - a, origin=(px, +inf, pz): use ay-relative formulation.
  // Solve for u,v,t with origin.y eliminated: use 2D barycentric in XZ then y.
  // Barycentric in XZ plane (project triangle to XZ; degenerate when vertical).
  const d00x = bx - ax;
  const d00z = bz - az;
  const d01x = cx - ax;
  const d01z = cz - az;
  const d20x = px - ax;
  const d20z = pz - az;
  const denom = d00x * d01z - d01x * d00z;
  if (denom > -1e-9 && denom < 1e-9) {
    // Triangle edge-on in XZ (vertical wall / loop limb): fall back to
    // closest-point plane test is handled by the caller; skip here.
    return null;
  }
  const invD = 1 / denom;
  const v = (d20x * d01z - d01x * d20z) * invD;
  const w = (d00x * d20z - d20x * d00z) * invD;
  const u = 1 - v - w;
  if (u < -1e-6 || v < -1e-6 || w < -1e-6) return null;
  const hy = u * ay + v * by + w * cy;
  // Geometric normal = e1 x e2, oriented to +up (ny >= 0 when possible;
  // loops need the true side, so keep sign if the road is inverted? The
  // ribbon up vector decides: orient toward the sample up later by caller.
  // Here orient to positive Y for stable floor constraints on normal roads;
  // steep/inverted roads are owned by the rail/glue path, not this ray.)
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  void inv;
  return { y: hy, n: { x: nx, y: ny, z: nz } };
}

export class TrackCollider {
  samples: TrackSample[] = [];
  totalLen = 0;
  grid = new Map<string, number[]>();
  killY = -30;

  build(samples: TrackSample[], totalLen: number, killY: number): void {
    this.samples = samples;
    this.totalLen = totalLen;
    this.killY = killY;
    this.grid.clear();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const cx = Math.floor(s.x / CELL);
      const cz = Math.floor(s.z / CELL);
      for (let ax = -1; ax <= 1; ax++) {
        for (let az = -1; az <= 1; az++) {
          const k = cellKey(cx + ax, cz + az);
          let arr = this.grid.get(k);
          if (!arr) {
            arr = [];
            this.grid.set(k, arr);
          }
          arr.push(i);
        }
      }
    }
  }

  /** Nearest road sample to (x,z). Searches nearby cells then falls back to window around hint. */
  nearest(x: number, z: number, hint = -1): number {
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    const arr = this.grid.get(k);
    let best = -1;
    let bestD = Infinity;
    const consider = (i: number) => {
      const s = this.samples[i];
      const dx = x - s.x;
      const dz = z - s.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    };
    if (arr) {
      for (let n = 0; n < arr.length; n++) consider(arr[n] as number);
    }
    if (best < 0) {
      // Fallback: window around hint, else full scan (rare, e.g. far off track).
      if (hint >= 0) {
        for (let o = -40; o <= 40; o++) {
          const i = hint + o;
          if (i >= 0 && i < this.samples.length) consider(i);
        }
      } else {
        for (let i = 0; i < this.samples.length; i += 2) consider(i);
      }
    }
    // Refine: local walk to nearest (handles cell misses).
    if (best >= 0) {
      for (let pass = 0; pass < 2; pass++) {
        let improved = false;
        for (const o of [-1, 1]) {
          const i = best + o;
          if (i < 0 || i >= this.samples.length) continue;
          const s = this.samples[i];
          const dx = x - s.x;
          const dz = z - s.z;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = i;
            improved = true;
          }
        }
        if (!improved) break;
      }
    }
    return best;
  }

  /** Ground height + frame at (x,z). Picks the road level closest in height,
   *  so loops, bridges and stacked spirals resolve to the surface you drive on.
   *  Exact-triangle first: each ribbon quad (i,i+1) is two triangles; a vertical
   *  ray is tested against neighbouring-cell segments so tunnelling and seam
   *  steps can't hide the road. Falls back to the tangent-plane approximation
   *  for shoulders (up to 6 m beyond the edge) where no triangle covers. */
  ground(x: number, y: number, z: number, hint = -1): GroundHit | null {
    // 1) Exact triangle pass: vertical ray from above, all levels.
    const tri = this.groundTriangle(x, y, z, hint);
    // 2) Plane-approximation pass (shoulders / far field), same as before.
    let best: GroundHit | null = null;
    let bestScore = Infinity;
    const evalIdx = (i: number) => {
      if (i < 0 || i >= this.samples.length) return;
      const s = this.samples[i];
      const rx = x - s.x;
      const rz = z - s.z;
      if (rx * rx + rz * rz > 30 * 30) return;
      const lateral = rx * s.sx + rz * s.sz;
      const half = s.width / 2;
      if (Math.abs(lateral) > half + 6) return;
      const along = rx * s.dx + rz * s.dz;
      const gy = s.y + along * s.dy + lateral * s.sy;
      // Penalize extrapolation distance: a far sample whose tangent line
      // happens to pass near the car must not beat the true nearby sample.
      const dist = Math.sqrt(rx * rx + rz * rz);
      const score = Math.abs(gy - y) + dist * 0.5 + (s.gap ? 60 : 0);
      if (score < bestScore) {
        bestScore = score;
        const dyC = Math.max(-1, Math.min(1, s.dy));
        best = {
          y: gy, nx: s.ux, ny: s.uy, nz: s.uz, dx: s.dx, dy: s.dy, dz: s.dz,
          roadPitch: Math.asin(dyC),
          surface: s.surface, zone: s.zone, lateral, t: s.t, index: i, gap: s.gap,
        };
      }
    };
    if (hint >= 0) {
      for (let o = -90; o <= 90; o++) evalIdx(hint + o);
    }
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    const arr = this.grid.get(k);
    if (arr) for (let n = 0; n < arr.length; n++) evalIdx(arr[n] as number);
    // Also check the 8 neighbouring cells explicitly so a fast car straddling
    // a cell border can't miss the road for one tick (tunnelling guard).
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let ax = -1; ax <= 1; ax++) {
      for (let az = -1; az <= 1; az++) {
        if (ax === 0 && az === 0) continue;
        const a2 = this.grid.get(cellKey(cx + ax, cz + az));
        if (a2) for (let n = 0; n < a2.length; n++) {
          const i = a2[n] as number;
          // Only evaluate segments not already covered by the hint window
          // when hint is present (hint window already spans ±90).
          if (hint >= 0 && Math.abs(i - hint) <= 90) continue;
          evalIdx(i);
        }
      }
    }
    if (!best && hint < 0) {
      for (let i = 0; i < this.samples.length; i += 4) evalIdx(i);
    }
    // Prefer the exact triangle hit when it is on the road surface and close
    // in height: it is seam-free and uses the true geometric normal.
    if (tri && !tri.gap) {
      const triScore = Math.abs(tri.y - y);
      // triScore compares directly with bestScore (which includes dist*0.5);
      // accept the triangle when it is within 0.6 m of the plane answer or
      // when there is no plane answer at all.
      if (!best || triScore <= bestScore + 0.6) return tri;
    }
    return best;
  }

  /** Exact triangle raycast: vertical ray at (x,z) against ribbon quads.
   *  Returns the level closest in height to y (loop/bridge safe). */
  groundTriangle(x: number, y: number, z: number, hint = -1): GroundHit | null {
    let best: GroundHit | null = null;
    let bestScore = Infinity;
    const considerSegment = (i: number) => {
      if (i < 0 || i + 1 >= this.samples.length) return;
      const a = this.samples[i];
      const b = this.samples[i + 1];
      if (a.gap) return;
      // Broadphase: segment midpoint within 30 m in XZ.
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const mdx = x - mx;
      const mdz = z - mz;
      if (mdx * mdx + mdz * mdz > 30 * 30) return;
      const ha = a.width / 2;
      const hb = b.width / 2;
      const aLx = a.x - a.sx * ha;
      const aLy = a.y - a.sy * ha;
      const aLz = a.z - a.sz * ha;
      const aRx = a.x + a.sx * ha;
      const aRy = a.y + a.sy * ha;
      const aRz = a.z + a.sz * ha;
      const bLx = b.x - b.sx * hb;
      const bLy = b.y - b.sy * hb;
      const bLz = b.z - b.sz * hb;
      const bRx = b.x + b.sx * hb;
      const bRy = b.y + b.sy * hb;
      const bRz = b.z + b.sz * hb;
      // Two triangles: (aL,aR,bL) and (bL,aR,bR). Vertical ray dir (0,-1,0).
      const hit1 = rayDownTri(x, z, aLx, aLy, aLz, aRx, aRy, aRz, bLx, bLy, bLz);
      const hit2 = rayDownTri(x, z, bLx, bLy, bLz, aRx, aRy, aRz, bRx, bRy, bRz);
      let hy: number | null = null;
      let hn: { x: number; y: number; z: number } | null = null;
      if (hit1) {
        hy = hit1.y;
        hn = hit1.n;
      }
      if (hit2) {
        if (hy == null || Math.abs(hit2.y - y) < Math.abs(hy - y)) {
          hy = hit2.y;
          hn = hit2.n;
        }
      }
      if (hy == null || !hn) return;
      // Lateral for zone/surface bookkeeping (use a-frame).
      const lateral = (x - a.x) * a.sx + (z - a.z) * a.sz;
      const dist = Math.sqrt(mdx * mdx + mdz * mdz);
      const score = Math.abs(hy - y) + dist * 0.5;
      if (score < bestScore) {
        bestScore = score;
        const dyC = Math.max(-1, Math.min(1, a.dy));
        best = {
          y: hy, nx: hn.x, ny: hn.y, nz: hn.z, dx: a.dx, dy: a.dy, dz: a.dz,
          roadPitch: Math.asin(dyC),
          surface: a.surface, zone: a.zone, lateral, t: a.t, index: i, gap: a.gap,
        };
      }
    };
    if (hint >= 0) {
      for (let o = -90; o <= 90; o++) considerSegment(hint + o);
    }
    const kk = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    const cellArr = this.grid.get(kk);
    if (cellArr) for (let n = 0; n < cellArr.length; n++) considerSegment((cellArr[n] as number) - 1);
    // Neighbouring cells too (tunnelling guard at speed).
    const ncx = Math.floor(x / CELL);
    const ncz = Math.floor(z / CELL);
    for (let ax = -1; ax <= 1; ax++) {
      for (let az = -1; az <= 1; az++) {
        if (ax === 0 && az === 0) continue;
        const a2 = this.grid.get(cellKey(ncx + ax, ncz + az));
        if (a2) for (let n = 0; n < a2.length; n++) considerSegment((a2[n] as number) - 1);
      }
    }
    return best;
  }

  /** Continuity-safe index: nearest sample in XZ among levels near current height.
   *  Sticky forward: strongly resist rewinding progress (folds/joints can look
   *  closer behind). Genuine teleports (respawn) still win by closeness. */
  trackIndex(x: number, y: number, z: number, hint = -1): number {
    let best = hint;
    let bestScore = Infinity;
    const hintT = hint >= 0 && hint < this.samples.length ? this.samples[hint].t : 0;
    const evalIdx = (i: number) => {
      if (i < 0 || i >= this.samples.length) return;
      const s = this.samples[i];
      const dx = x - s.x;
      const dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 40 * 40) return;
      let score = d2 + Math.abs(s.y - y) * 4;
      if (s.t < hintT - 0.008 && d2 > 9) score += 100000;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    };
    if (hint >= 0) {
      for (let o = -90; o <= 90; o++) evalIdx(hint + o);
    } else {
      const n = this.nearest(x, z, -1);
      return n;
    }
    return best < 0 ? this.nearest(x, z, hint) : best;
  }

  /** Resolve wall collision. Mutates px/pz/vx/vz. Returns impact |sin| (0 = no hit). */
  /** Resolve wall collision (3D road frame so banks/loops contain the car).
   *  Returns impact |sin| (0 = no hit) plus corrected position/velocity. */
  walls(
    px: number, py: number, pz: number,
    vx: number, vy: number, vz: number,
    hint: number,
  ): { impact: number; px: number; py: number; pz: number; vx: number; vy: number; vz: number } {
    // Height-aware sample pick: stacked roads (loops, spirals, switchbacks)
    // must resolve walls from the level the car actually drives on.
    let bi = -1;
    let best = Infinity;
    const consider = (i: number) => {
      if (i < 0 || i >= this.samples.length) return;
      const s = this.samples[i];
      const dx = px - s.x;
      const dz = pz - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 40 * 40) return;
      const score = d2 + (s.y - py) * (s.y - py) * 0.3;
      if (score < best) {
        best = score;
        bi = i;
      }
    };
    if (hint >= 0) {
      for (let o = -60; o <= 60; o++) consider(hint + o);
    } else {
      const k = cellKey(Math.floor(px / CELL), Math.floor(pz / CELL));
      const arr = this.grid.get(k);
      if (arr) for (let n = 0; n < arr.length; n++) consider(arr[n] as number);
    }
    if (bi < 0) bi = this.nearest(px, pz, hint);
    if (bi < 0) return { impact: 0, px, py, pz, vx, vy, vz };
    const s = this.samples[bi];
    // 3D lateral offset in the road frame (matters on banks/loops where the
    // side vector tilts; identical to XZ lateral on flat roads).
    const rx = px - s.x;
    const ry = py - s.y;
    const rz = pz - s.z;
    const lateral = rx * s.sx + ry * s.sy + rz * s.sz;
    // Walls stand at the kerb outer edge (see KERB_WIDTH).
    const half = s.width / 2 + KERB_WIDTH;
    const margin = 0.9; // car half-width + wall thickness
    let impact = 0;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    // Wall gates use the wall's edge height (edges lift on banks).
    const edgeRy = s.y + half * s.sy;
    const edgeLy = s.y - half * s.sy;
    if (lateral > half && s.wallR > 0 && py < edgeRy + s.wallR + 1.2) {
      const pen = lateral - half;
      if (pen < margin) {
        // Push back inside along the road frame.
        px -= s.sx * pen;
        py -= s.sy * pen;
        pz -= s.sz * pen;
        // Remove into-wall velocity: v -= n*(v.n), n = side vector.
        const vn = vx * s.sx + vy * s.sy + vz * s.sz;
        if (vn > 0) {
          vx -= s.sx * vn;
          vy -= s.sy * vn;
          vz -= s.sz * vn;
          impact = speed > 1 ? Math.min(1, vn / Math.max(1, speed)) : 0;
        }
      }
    } else if (lateral < -half && s.wallL > 0 && py < edgeLy + s.wallL + 1.2) {
      const pen = -half - lateral;
      if (pen < margin) {
        px += s.sx * pen;
        py += s.sy * pen;
        pz += s.sz * pen;
        const vn = vx * s.sx + vy * s.sy + vz * s.sz;
        if (vn < 0) {
          vx -= s.sx * vn;
          vy -= s.sy * vn;
          vz -= s.sz * vn;
          impact = speed > 1 ? Math.min(1, -vn / Math.max(1, speed)) : 0;
        }
      }
    }
    return { impact, px, py, pz, vx, vy, vz };
  }

  startPose(t: number): { x: number; y: number; z: number; yaw: number } {
    const i = Math.max(0, Math.min(this.samples.length - 1, Math.floor(t * (this.samples.length - 1))));
    const s = this.samples[i];
    return { x: s.x, y: s.y + 0.4, z: s.z, yaw: Math.atan2(s.dx, s.dz) };
  }
}
