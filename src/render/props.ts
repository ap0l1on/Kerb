// Instanced props: one InstancedMesh per type per track (max 400 each).
// Props sit outside the drivable area and have no collision.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import type { PropDef, ThemeId } from '../track/types';
import type { TrackSample } from '../track/types';

function sampleAt(samples: TrackSample[], t: number): TrackSample {
  const i = Math.max(0, Math.min(samples.length - 1, Math.round(t * (samples.length - 1))));
  return samples[i];
}

function place(samples: TrackSample[], p: PropDef): { x: number; y: number; z: number; yaw: number } {
  const s = sampleAt(samples, p.t);
  return {
    x: s.x + s.sx * p.side,
    y: s.y + p.up,
    z: s.z + s.sz * p.side,
    yaw: Math.atan2(s.dx, s.dz) + p.ry,
  };
}

function meshFor(kind: string): THREE.BufferGeometry {
  // Low-poly primitives built from boxes/cones/cylinders, merged manually via groups.
  // For instancing we use a single geometry per kind.
  switch (kind) {
    case 'cactus':
      return new THREE.CylinderGeometry(0.5, 0.7, 4, 6);
    case 'rock':
    case 'snowrock':
      return new THREE.IcosahedronGeometry(1.6, 0);
    case 'mesa':
      return new THREE.CylinderGeometry(7, 10, 14, 7);
    case 'pine':
      return new THREE.ConeGeometry(2.2, 6, 7);
    case 'palm': {
      const g = new THREE.CylinderGeometry(0.35, 0.5, 7, 6);
      return g;
    }
    case 'lighthouse':
      return new THREE.CylinderGeometry(2, 2.8, 12, 8);
    case 'buoy':
      return new THREE.SphereGeometry(1.2, 8, 6);
    case 'pylon':
      return new THREE.BoxGeometry(1.2, 9, 1.2);
    case 'glowarch':
    case 'arch': {
      const g = new THREE.TorusGeometry(7.5, 0.8, 6, 12, Math.PI);
      return g;
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function colorFor(kind: string, theme: ThemeId): number {
  switch (kind) {
    case 'cactus': return 0x3f8f4f;
    case 'rock': return 0x8a5a35;
    case 'snowrock': return 0xdfe8f2;
    case 'mesa': return theme === 'canyon' ? 0xb06030 : 0x333844;
    case 'pine': return 0x2c6b3c;
    case 'palm': return 0x4d8a3f;
    case 'lighthouse': return 0xf2f2f2;
    case 'buoy': return 0xe04848;
    case 'pylon': return 0x27e1ff;
    case 'glowarch': return 0xff3fa4;
    case 'arch': return 0xff5a1f;
    default: return 0x888888;
  }
}

export function buildProps(
  defs: PropDef[],
  samples: TrackSample[],
  theme: ThemeId,
  density = 1,
): THREE.Group {
  const group = new THREE.Group();
  const byKind = new Map<string, PropDef[]>();
  for (const d of defs) {
    const arr = byKind.get(d.kind) ?? [];
    arr.push(d);
    byKind.set(d.kind, arr);
  }
  const rng = mulberry32(1234);
  for (const [kind, list] of byKind) {
    const count = Math.min(400, density < 1 ? Math.ceil(list.length * density) : list.length);
    const geo = meshFor(kind);
    const isEmissive = kind === 'pylon' || kind === 'glowarch';
    const m = new THREE.MeshLambertMaterial({
      color: colorFor(kind, theme),
      flatShading: true,
      ...(isEmissive ? { emissive: colorFor(kind, theme), emissiveIntensity: 0.7 } : {}),
    });
    const inst = new THREE.InstancedMesh(geo, m, Math.max(1, count));
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const p = list[i % list.length];
      const at = place(samples, p);
      dummy.position.set(at.x, at.y + (kind === 'arch' || kind === 'glowarch' ? 1 : p.s * 1.5), at.z);
      dummy.rotation.set(0, at.yaw, 0);
      if (kind === 'arch' || kind === 'glowarch') {
        // Span the road: rotate to face travel direction.
        dummy.rotation.y = at.yaw;
      }
      const jitter = 0.9 + rng() * 0.2;
      dummy.scale.setScalar(p.s * jitter);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }
  return group;
}

/** Checkpoint arches with lit/unlit state (separate meshes, toggled by race). */
export function buildCheckpointArches(
  positions: { x: number; y: number; z: number; yaw: number }[],
): { group: THREE.Group; setLit: (i: number, lit: boolean) => void } {
  const group = new THREE.Group();
  const mats: THREE.MeshLambertMaterial[] = [];
  positions.forEach((p, i) => {
    if (i === 0) return; // skip start
    const mat = new THREE.MeshLambertMaterial({ color: 0x555c6a, emissive: 0x000000 });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.7, 6, 12, Math.PI), mat);
    arch.position.set(p.x, p.y + 0.5, p.z);
    arch.rotation.y = p.yaw;
    group.add(arch);
    mats.push(mat);
  });
  return {
    group,
    setLit: (i, lit) => {
      const m = mats[i - 1];
      if (!m) return;
      m.color.set(lit ? 0x2bd576 : 0x555c6a);
      m.emissive.set(lit ? 0x1a7a44 : 0x000000);
    },
  };
}
