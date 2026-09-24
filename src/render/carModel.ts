// Low open-wheeler in the spirit of a mini Formula car, built in code:
// floor tub, nose cone, cockpit + helmet + halo, sidepods, front/rear wings,
// exposed wheels, shark fin. Nose toward +z (matches physics forward).
import * as THREE from 'three';

export interface CarRig {
  group: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  blob: THREE.Mesh;
  boostGlow: THREE.Mesh;
}

export function buildCar(accent = 0xff5a1f, ghost = false): CarRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const opacity = ghost ? 0.35 : 1;
  const mat = (c: number) =>
    new THREE.MeshLambertMaterial({ color: c, flatShading: true, transparent: ghost, opacity });
  const dark = mat(0x14161c);
  const accentM = mat(accent);
  const add = (m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
    m.position.set(x, y, z);
    body.add(m);
    return m;
  };
  const bx = (w: number, h: number, d: number, m: THREE.Material): THREE.Mesh =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  // Floor tub (low and wide).
  add(bx(1.5, 0.22, 3.4, dark), 0, 0.32, 0);
  // Nose cone tapering forward + accent tip.
  const nose = add(bx(0.55, 0.22, 1.6, dark), 0, 0.3, 2.2);
  nose.scale.x = 1;
  add(bx(0.4, 0.16, 0.3, accentM), 0, 0.28, 3.0);
  // Cockpit surround + dark opening.
  add(bx(1.1, 0.3, 1.5, dark), 0, 0.5, -0.3);
  add(bx(0.7, 0.12, 1.0, mat(0x05060a)), 0, 0.62, -0.3);
  // Driver helmet.
  const helmet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), accentM);
  add(helmet, 0, 0.72, -0.45);
  // Halo: two rear stalks + front stalk + top bar.
  add(bx(0.09, 0.5, 0.09, dark), -0.3, 0.85, -0.5);
  add(bx(0.09, 0.5, 0.09, dark), 0.3, 0.85, -0.5);
  add(bx(0.09, 0.45, 0.09, dark), 0, 0.8, 0.25);
  add(bx(0.7, 0.09, 0.85, dark), 0, 1.08, -0.15);
  // Sidepods.
  add(bx(0.45, 0.35, 1.6, accentM), -0.85, 0.42, -0.5);
  add(bx(0.45, 0.35, 1.6, accentM), 0.85, 0.42, -0.5);
  // Shark fin engine cover.
  const fin = add(bx(0.1, 0.55, 1.5, dark), 0, 0.75, -1.3);
  void fin;
  // Front wing (wide, low) + endplates.
  add(bx(2.3, 0.07, 0.45, dark), 0, 0.14, 3.1);
  add(bx(0.07, 0.3, 0.5, accentM), -1.12, 0.26, 3.1);
  add(bx(0.07, 0.3, 0.5, accentM), 1.12, 0.26, 3.1);
  // Rear wing + endplates + beam.
  add(bx(2.0, 0.07, 0.45, dark), 0, 1.05, -2.0);
  add(bx(0.07, 0.45, 0.55, accentM), -0.97, 0.85, -2.0);
  add(bx(0.07, 0.45, 0.55, accentM), 0.97, 0.85, -2.0);
  add(bx(0.5, 0.3, 0.15, dark), 0, 0.6, -1.95);
  // Exposed wheels (bigger rears) + suspension arms.
  const wheels: THREE.Mesh[] = [];
  const mkWheel = (r: number, w: number, x: number, z: number) => {
    const g = new THREE.CylinderGeometry(r, r, w, 12);
    g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, mat(0x0b0c10));
    add(m, x, r, z);
    wheels.push(m);
    // Simple top suspension arm to the tub.
    const arm = bx(Math.abs(x) - 0.6, 0.06, 0.12, dark);
    add(arm, (x > 0 ? 1 : -1) * (Math.abs(x) / 2 + 0.25), r + 0.12, z);
  };
  mkWheel(0.42, 0.38, -1.05, 1.45);
  mkWheel(0.42, 0.38, 1.05, 1.45);
  mkWheel(0.46, 0.44, -1.05, -1.45);
  mkWheel(0.46, 0.44, 1.05, -1.45);
  // Blob shadow (no real-time shadows).
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: ghost ? 0.1 : 0.32, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);
  // Boost glow plane behind car.
  const boostGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ color: 0x27e1ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  boostGlow.position.set(0, 0.6, -2.4);
  body.add(boostGlow);
  return { group, body, wheels, blob, boostGlow };
}

/** Pose the rig from physics state. Yaw/pitch/roll in radians. */
export function poseCar(rig: CarRig, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, steer: number, spin: number): void {
  rig.group.position.set(x, y - 0.35, z);
  rig.body.rotation.order = 'YXZ';
  rig.body.rotation.y = yaw;
  rig.body.rotation.x = -pitch;
  rig.body.rotation.z = -roll;
  rig.wheels[0].rotation.x = spin;
  rig.wheels[1].rotation.x = spin;
  rig.wheels[2].rotation.x = spin;
  rig.wheels[3].rotation.x = spin;
  // Front wheels (first two, +z) steer visually.
  rig.wheels[0].rotation.y = steer * 0.5;
  rig.wheels[1].rotation.y = steer * 0.5;
}
