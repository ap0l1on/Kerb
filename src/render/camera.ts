// Chase / far / bonnet cameras with damped follow, FOV kick, shake, wall clipping.
import * as THREE from 'three';

export type CamMode = 'chase' | 'far' | 'bonnet';

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class ChaseCamera {
  camera: THREE.PerspectiveCamera;
  mode: CamMode = 'chase';
  shake = 0;
  reducedMotion = false;
  fovOffset = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(72, aspect, 0.1, 3000);
  }

  cycle(): CamMode {
    this.mode = this.mode === 'chase' ? 'far' : this.mode === 'far' ? 'bonnet' : 'chase';
    return this.mode;
  }

  update(
    dt: number,
    x: number, y: number, z: number,
    yaw: number, speedKmh: number,
    turbo: boolean,
    landingShake: number,
    isWallBetween: (from: THREE.Vector3, to: THREE.Vector3) => number,
  ): void {
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const dist = this.mode === 'chase' ? 7.0 : this.mode === 'far' ? 9.5 : -0.5;
    const height = this.mode === 'chase' ? 2.4 : this.mode === 'far' ? 3.2 : 1.15;
    // Lookahead grows with speed so you can read the track ahead, not the bumper.
    const ahead = Math.min(20, 6 + speedKmh * 0.045);
    _desired.set(x - sy * dist, y + height, z - cy * dist);
    if (this.mode === 'bonnet') {
      _desired.set(x + sy * 0.4, y + 1.15, z + cy * 0.4);
      this.camera.position.copy(_desired);
      _look.set(x + sy * 30, y + 0.4, z + cy * 30);
      this.camera.lookAt(_look);
    } else {
      // Tighter follow than before so the car stays planted in frame.
      const k = 1 - Math.exp(-dt * 10);
      this.camera.position.lerp(_desired, k);
      // Wall clipping: pull camera in.
      _target.set(x, y + 1, z);
      _dir.copy(this.camera.position).sub(_target);
      const len = _dir.length();
      if (len > 0.001) {
        const hitT = isWallBetween(_target, this.camera.position);
        if (hitT < 1) {
          this.camera.position.copy(_target).addScaledVector(_dir, Math.max(0.15, hitT - 0.05));
        }
      }
      _look.set(x + sy * ahead, y + 1.0, z + cy * ahead);
      this.camera.lookAt(_look);
    }
    // FOV: 72 at 0 -> 88 at 280 (+8 turbo).
    const fovT = Math.min(1, speedKmh / 280);
    let fov = 72 + (88 - 72) * fovT + (turbo ? 8 : 0) + this.fovOffset;
    fov = Math.max(50, Math.min(110, fov));
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
    // Shake.
    const s = this.reducedMotion ? 0 : Math.max(landingShake * 0.35, turbo ? 0.03 : 0);
    if (s > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
  }

  /** Intro sweep along the start straight (1.2 s). */
  sweep(f: number, x: number, y: number, z: number, yaw: number): void {
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    this.camera.position.set(x + sy * (30 - 30 * f) - cy * 6, y + 6 - 4 * f, z + cy * (30 - 30 * f) + sy * 6);
    this.camera.lookAt(x, y + 1, z);
  }
}
