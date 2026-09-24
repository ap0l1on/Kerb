// TrackDef -> sampled ribbon + collision + three.js meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TrackDef, TrackSample, ThemeId } from './types';
import { KERB_WIDTH } from './types';
import { sampleCentreline } from './spline';
import { TrackCollider } from '../physics/collide';

export interface BuiltTrack {
  def: TrackDef;
  samples: TrackSample[];
  totalLen: number;
  collider: TrackCollider;
}

export function inRanges(t: number, ranges: { from: number; to: number }[]): boolean {
  return ranges.some((r) => t >= r.from && t <= r.to);
}

/** Pure + deterministic: sample the ribbon. No three.js needed (testable in node). */
export function buildSamples(def: TrackDef): { samples: TrackSample[]; totalLen: number } {
  const { pts, total } = sampleCentreline(def.path, def.closed, 1.5);
  const n = pts.length;
  // Tangents.
  const T: number[][] = [];
  for (let i = 0; i < n; i++) {
    const q = pts[Math.min(n - 1, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    let tx = q.x - o.x;
    let ty = q.y - o.y;
    let tz = q.z - o.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    T.push([tx / tl, ty / tl, tz / tl]);
  }
  // Parallel-transport up vectors so frames stay continuous through loops.
  const U: number[][] = [];
  U.push([0, 1, 0]);
  for (let i = 1; i < n; i++) {
    const t = T[i] as number[];
    const p = U[i - 1] as number[];
    const d = p[0] * (t[0] as number) + p[1] * (t[1] as number) + p[2] * (t[2] as number);
    let ux = (p[0] as number) - (t[0] as number) * d;
    let uy = (p[1] as number) - (t[1] as number) * d;
    let uz = (p[2] as number) - (t[2] as number) * d;
    const l = Math.hypot(ux, uy, uz);
    if (l < 1e-6) {
      ux = p[0] as number;
      uy = p[1] as number;
      uz = p[2] as number;
    } else {
      ux /= l;
      uy /= l;
      uz /= l;
    }
    U.push([ux, uy, uz]);
  }
  const samples: TrackSample[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const t3 = T[i] as number[];
    const up = U[i] as number[];
    const tx = t3[0] as number;
    const ty = t3[1] as number;
    const tz = t3[2] as number;
    // side = tangent x up (right of travel).
    let sx = ty * (up[2] as number) - tz * (up[1] as number);
    let sy = tz * (up[0] as number) - tx * (up[2] as number);
    let sz = tx * (up[1] as number) - ty * (up[0] as number);
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl;
    sy /= sl;
    sz /= sl;
    // Banking rotates side/up around the tangent. Positive bank: right side dips.
    const bank = (p.bank * Math.PI) / 180;
    const cb = Math.cos(bank);
    const sb = Math.sin(bank);
    const rsx = sx * cb - (up[0] as number) * sb;
    const rsy = sy * cb - (up[1] as number) * sb;
    const rsz = sz * cb - (up[2] as number) * sb;
    const ux = (up[0] as number) * cb + sx * sb;
    const uy = (up[1] as number) * cb + sy * sb;
    const uz = (up[2] as number) * cb + sz * sb;
    const t = n > 1 ? i / (n - 1) : 0;
    let surface: TrackSample['surface'] = 'road';
    for (const s of def.surfaces) {
      if (t >= s.from && t <= s.to) {
        surface = s.type;
        break;
      }
    }
    let zone: TrackSample['zone'] = null;
    for (const z of def.zones) {
      const zt0 = z.at;
      const zt1 = z.at + z.len / total;
      if (t >= zt0 && t <= zt1) {
        zone = z.type;
        break;
      }
    }
    const gap = def.gaps.some((g) => t > g.from && t < g.to);
    let wallL = 0;
    let wallR = 0;
    for (const w of def.walls) {
      if (t >= w.from && t <= w.to) {
        if (w.side === 'left' || w.side === 'both') wallL = Math.max(wallL, w.height);
        if (w.side === 'right' || w.side === 'both') wallR = Math.max(wallR, w.height);
      }
    }
    samples.push({
      t, x: p.x, y: p.y, z: p.z,
      dx: tx, dy: ty, dz: tz,
      sx: rsx, sy: rsy, sz: rsz,
      ux, uy, uz,
      width: p.w, bank: p.bank, surface, zone, gap, wallL, wallR,
    });
  }
  return { samples, totalLen: total };
}

export function makeCollider(def: TrackDef): TrackCollider {
  const { samples, totalLen } = buildSamples(def);
  const c = new TrackCollider();
  c.build(samples, totalLen, def.killY);
  return c;
}

// ---------- Rendering ----------

export const THEMES: Record<ThemeId, {
  road: number; kerbA: number; kerbB: number; ground: number; cliff: number;
  skyTop: number; skyBottom: number; fog: number; fogDensity: number;
  emissive: boolean;
}> = {
  canyon: { road: 0x3a3a40, kerbA: 0xe8e2d4, kerbB: 0xd9482b, ground: 0xc9773f, cliff: 0xa85a2e, skyTop: 0xf6b26b, skyBottom: 0xfce3c0, fog: 0xf2c194, fogDensity: 0.0035, emissive: false },
  coast: { road: 0x34383f, kerbA: 0xffffff, kerbB: 0x1f8fd6, ground: 0x6dbe6a, cliff: 0xe6d6a8, skyTop: 0x7cc7f2, skyBottom: 0xe6f6ff, fog: 0xcfe9f7, fogDensity: 0.003, emissive: false },
  alpine: { road: 0x3b4150, kerbA: 0xffffff, kerbB: 0x2f6bdb, ground: 0xf2f5fa, cliff: 0x9aa7ba, skyTop: 0xb8cce8, skyBottom: 0xf4f8ff, fog: 0xd8e4f2, fogDensity: 0.006, emissive: false },
  neon: { road: 0x15161e, kerbA: 0xff3fa4, kerbB: 0x27e1ff, ground: 0x0b0c12, cliff: 0x1a1030, skyTop: 0x07080d, skyBottom: 0x1a1030, fog: 0x140f2e, fogDensity: 0.005, emissive: true },
};

function pushQuad(
  pos: number[], col: number[], idx: number[],
  a: number[], b: number[], c: number[], d: number[],
  color: THREE.Color, vi: number,
): number {
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  for (let k = 0; k < 4; k++) col.push(color.r, color.g, color.b);
  idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
  return vi + 4;
}

export interface TrackMeshes {
  group: THREE.Group;
  checkpointPos: { x: number; y: number; z: number; yaw: number }[];
  zoneAnchors: { t: number; type: string; x: number; y: number; z: number }[];
}

export function buildTrackMeshes(def: TrackDef, samples: TrackSample[]): TrackMeshes {
  const theme = THEMES[def.theme];
  const group = new THREE.Group();
  const roadPos: number[] = [];
  const roadCol: number[] = [];
  const roadIdx: number[] = [];
  const kerbPos: number[] = [];
  const kerbCol: number[] = [];
  const kerbIdx: number[] = [];
  const wallPos: number[] = [];
  const wallCol: number[] = [];
  const wallIdx: number[] = [];
  const basePos: number[] = [];
  const baseCol: number[] = [];
  const baseIdx: number[] = [];
  const cRoad = new THREE.Color(theme.road);
  const cKerbA = new THREE.Color(theme.kerbA);
  const cKerbB = new THREE.Color(theme.kerbB);
  const cWall = new THREE.Color(0xdde3ec);
  const cBase = new THREE.Color(theme.cliff);
  const cGround = new THREE.Color(theme.ground);
  let viR = 0;
  let viK = 0;
  let viW = 0;
  let viB = 0;
  const KERB_W = KERB_WIDTH;
  const KERB_LIFT = 0.06;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.gap) continue;
    const seg = Math.floor(i / 4) % 2 === 0;
    const hwA = a.width / 2;
    const hwB = b.width / 2;
    const aL = [a.x - a.sx * hwA, a.y, a.z - a.sz * hwA];
    const aR = [a.x + a.sx * hwA, a.y, a.z + a.sz * hwA];
    const bL = [b.x - b.sx * hwB, b.y, b.z - b.sz * hwB];
    const bR = [b.x + b.sx * hwB, b.y, b.z + b.sz * hwB];
    // Road (with slight per-quad shade variation for low-poly feel, deterministic).
    const shade = 0.96 + 0.04 * ((i % 3) / 2);
    const cc = new THREE.Color(cRoad.r * shade, cRoad.g * shade, cRoad.b * shade);
    // Zone tint.
    if (a.zone === 'boost' || a.zone === 'turbo') cc.set(0x1d4d2b);
    if (a.zone === 'engineOff') cc.set(0x4d1d1d);
    viR = pushQuad(roadPos, roadCol, roadIdx, aL, aR, bL, bR, cc, viR);
    // Kerbs on both edges.
    const aKL0 = [a.x - a.sx * (hwA + KERB_W), a.y + KERB_LIFT, a.z - a.sz * (hwA + KERB_W)];
    const bKL0 = [b.x - b.sx * (hwB + KERB_W), b.y + KERB_LIFT, b.z - b.sz * (hwB + KERB_W)];
    const aKR0 = [a.x + a.sx * (hwA + KERB_W), a.y + KERB_LIFT, a.z + a.sz * (hwA + KERB_W)];
    const bKR0 = [b.x + b.sx * (hwB + KERB_W), b.y + KERB_LIFT, b.z + b.sz * (hwB + KERB_W)];
    const kc = seg ? cKerbA : cKerbB;
    viK = pushQuad(kerbPos, kerbCol, kerbIdx, aKL0, aL, bKL0, bL, kc, viK);
    viK = pushQuad(kerbPos, kerbCol, kerbIdx, aR, aKR0, bR, bKR0, kc, viK);
    // Walls stand OUTSIDE the kerbs (at the kerb outer edge, road height),
    // so the kerbs stay visible between road and wall.
    const aWL0 = [a.x - a.sx * (hwA + KERB_W), a.y, a.z - a.sz * (hwA + KERB_W)];
    const bWL0 = [b.x - b.sx * (hwB + KERB_W), b.y, b.z - b.sz * (hwB + KERB_W)];
    const aWR0 = [a.x + a.sx * (hwA + KERB_W), a.y, a.z + a.sz * (hwA + KERB_W)];
    const bWR0 = [b.x + b.sx * (hwB + KERB_W), b.y, b.z + b.sz * (hwB + KERB_W)];
    // Walls.
    if (a.wallL > 0) {
      const h = a.wallL;
      const aT = [aWL0[0], aWL0[1] + h, aWL0[2]];
      const bT = [bWL0[0], bWL0[1] + h, bWL0[2]];
      viW = pushQuad(wallPos, wallCol, wallIdx, aWL0, bWL0, aT, bT, cWall, viW);
      viW = pushQuad(wallPos, wallCol, wallIdx, aT, bT, [aT[0] - a.sx * 0.4, aT[1], aT[2] - a.sz * 0.4], [bT[0] - b.sx * 0.4, bT[1], bT[2] - b.sz * 0.4], cWall, viW);
    }
    if (a.wallR > 0) {
      const h = a.wallR;
      const aT = [aWR0[0], aWR0[1] + h, aWR0[2]];
      const bT = [bWR0[0], bWR0[1] + h, bWR0[2]];
      viW = pushQuad(wallPos, wallCol, wallIdx, bWR0, aWR0, bT, aT, cWall, viW);
      viW = pushQuad(wallPos, wallCol, wallIdx, [aT[0] + a.sx * 0.4, aT[1], aT[2] + a.sz * 0.4], [bT[0] + b.sx * 0.4, bT[1], bT[2] + b.sz * 0.4], aT, bT, cWall, viW);
    }
    // Base skirt under road.
    const drop = 6;
    const aBL = [aL[0], aL[1] - drop, aL[2]];
    const bBL = [bL[0], bL[1] - drop, bL[2]];
    const aBR = [aR[0], aR[1] - drop, aR[2]];
    const bBR = [bR[0], bR[1] - drop, bR[2]];
    viB = pushQuad(basePos, baseCol, baseIdx, aL, aBL, bL, bBL, cBase, viB);
    viB = pushQuad(basePos, baseCol, baseIdx, aBR, bBR, aBR, bBR, cBase, viB);
    void aBR;
    void bBR;
  }
  // Ground plane (huge, theme ground colour).
  {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z);
      maxZ = Math.max(maxZ, s.z);
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const ext = Math.max(maxX - minX, maxZ - minZ) / 2 + 250;
    const gy = Math.min(...samples.map((s) => s.y)) - 8;
    viB = pushQuad(basePos, baseCol, baseIdx,
      [cx - ext, gy, cz - ext], [cx + ext, gy, cz - ext],
      [cx - ext, gy, cz + ext], [cx + ext, gy, cz + ext], cGround, viB);
  }
  const mat = (emissive: boolean) =>
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, ...(emissive ? { emissive: 0x222222 } : {}) });
  const mkMesh = (pos: number[], col: number[], idx: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(false));
    return m;
  };
  if (roadIdx.length) group.add(mkMesh(roadPos, roadCol, roadIdx));
  if (kerbIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(kerbPos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(kerbCol, 3));
    g.setIndex(kerbIdx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, theme.emissive
      ? new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x661133, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    group.add(m);
  }
  if (wallIdx.length) group.add(mkMesh(wallPos, wallCol, wallIdx));
  if (baseIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(basePos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(baseCol, 3));
    g.setIndex(baseIdx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
  }
  void mergeGeometries;
  // Checkpoint + zone anchors.
  const checkpointPos = [
    { t: def.start, kind: 'start' },
    ...def.checkpoints.map((t) => ({ t, kind: 'cp' })),
    { t: def.finish, kind: 'finish' },
  ].map(({ t }) => {
    const i = Math.max(0, Math.min(samples.length - 1, Math.round(t * (samples.length - 1))));
    const s = samples[i];
    return { x: s.x, y: s.y, z: s.z, yaw: Math.atan2(s.dx, s.dz), t };
  });
  const zoneAnchors = def.zones.map((z) => {
    const i = Math.max(0, Math.min(samples.length - 1, Math.round(z.at * (samples.length - 1))));
    const s = samples[i];
    return { t: z.at, type: z.type, x: s.x, y: s.y, z: s.z };
  });
  return { group, checkpointPos, zoneAnchors };
}
