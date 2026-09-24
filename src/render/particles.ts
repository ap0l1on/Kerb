// Pooled particles: boost flames + drift smoke. No per-frame allocation.
import * as THREE from 'three';

const MAX = 256;

export class Particles {
  points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private head = 0;
  private geo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xcccccc, size: 0.7, transparent: true, opacity: 0.55, depthWrite: false });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX; i++) {
      this.pos[i * 3 + 1] = -100;
    }
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number): void {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  driftSmoke(x: number, y: number, z: number): void {
    this.spawn(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.6);
  }

  boostFlame(x: number, y: number, z: number, bx: number, bz: number): void {
    this.spawn(x, y, z, -bx * 12 + (Math.random() - 0.5) * 2, 1, -bz * 12 + (Math.random() - 0.5) * 2, 0.35);
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -100;
        continue;
      }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  setEnabled(on: boolean): void {
    this.points.visible = on;
  }
}
