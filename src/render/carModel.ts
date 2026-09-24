// Low-poly car built in code: box body, cabin, wheels, spoiler, blob shadow.
import * as THREE from 'three';

export interface CarRig {
  group: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  blob: THREE.Mesh;
  boostGlow: THREE.Mesh;
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return m;
}

export function buildCar(accent = 0xff5a1f, ghost = false): CarRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const opacity = ghost ? 0.35 : 1;
  const mat = (c: number) =>
    new THREE.MeshLambertMaterial({ color: c, flatShading: true, transparent: ghost, opacity });
  // Chassis (nose toward +z to match forward=(sin yaw, cos yaw)).
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 3.6), mat(0x23262e));
  chassis.position.y = 0.55;
  body.add(chassis);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.9), mat(accent));
  nose.position.set(0, 0.48, 2.0);
  body.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.4), mat(0x101318));
  cabin.position.set(0, 1.0, -0.3);
  body.add(cabin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 3.2), mat(accent));
  stripe.position.set(0, 0.83, 0.2);
  body.add(stripe);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.5), mat(0x101318));
  wing.position.set(0, 1.15, -1.9);
  body.add(wing);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.5), mat(accent));
  wingL.position.set(-0.8, 0.9, -1.9);
  body.add(wingL);
  const wingR = wingL.clone();
  wingR.position.x = 0.8;
  body.add(wingR);
  // Wheels.
  const wheels: THREE.Mesh[] = [];
  const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wg.rotateZ(Math.PI / 2);
  const wm = new THREE.MeshLambertMaterial({ color: 0x0b0c10, flatShading: true, transparent: ghost, opacity });
  for (const [x, z] of [[-0.85, 1.25], [0.85, 1.25], [-0.85, -1.25], [0.85, -1.25]]) {
    const w = new THREE.Mesh(wg, wm);
    w.position.set(x, 0.38, z);
    body.add(w);
    wheels.push(w);
  }
  // Blob shadow (no real-time shadows).
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 16),
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
  boostGlow.position.set(0, 0.7, -2.2);
  body.add(boostGlow);
  void box;
  return { group, body, wheels, blob, boostGlow };
}

/** Pose the rig from physics state. Yaw/pitch/roll in radians. */
export function poseCar(rig: CarRig, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, steer: number, spin: number): void {
  rig.group.position.set(x, y - 0.35, z);
  rig.body.rotation.set(0, 0, 0);
  rig.group.rotation.set(0, 0, 0);
  // three: yaw around Y; forward +z matches atan2(dx,dz).
  rig.body.rotation.order = 'YXZ';
  rig.body.rotation.y = yaw;
  rig.body.rotation.x = -pitch;
  rig.body.rotation.z = -roll;
  rig.wheels[0].rotation.x = spin;
  rig.wheels[1].rotation.x = spin;
  rig.wheels[2].rotation.x = spin;
  rig.wheels[3].rotation.x = spin;
  // Front wheels steer visually.
  rig.wheels[0].rotation.y = steer * 0.5;
  rig.wheels[1].rotation.y = steer * 0.5;
}
