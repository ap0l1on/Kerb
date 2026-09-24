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
   *  so loops, bridges and stacked spirals resolve to the surface you drive on. */
  ground(x: number, y: number, z: number, hint = -1): GroundHit | null {
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
    if (!best && hint < 0) {
      for (let i = 0; i < this.samples.length; i += 4) evalIdx(i);
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
