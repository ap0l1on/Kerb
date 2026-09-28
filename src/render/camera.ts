// Chase / far / bonnet cameras with damped follow, FOV kick, shake, wall clipping.
// Yaw follow is critically damped (tau ~0.18 s), never rigidly locked, so
// steering never looks twitchier than it is. Look-at is low-passed so bumps
// and suspension don't shake the view. Speed FOV 72→88 smoothed over 0.4 s.
import * as THREE from 'three';

export type CamMode = 'chase' | 'far' | 'bonnet';

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _dir = new THREE.Vector3();

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class ChaseCamera {
  camera: THREE.PerspectiveCamera;
  mode: CamMode = 'chase';
  shake = 0;
  reducedMotion = false;
  fovOffset = 0;
  /** Smoothed follow yaw (critically damped, tau 0.18 s). */
  followYaw = 0;
  followInit = false;
  /** Low-passed look-at target (kills suspension shake in the view). */
  lookSm = new THREE.Vector3();
  lookInit = false;
  /** Smoothed FOV value. */
  fovSm = 72;
  t = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(72, aspect, 0.5, 3000);
    this.fovSm = 72;
  }

  cycle(): CamMode {
    this.mode = this.mode === 'chase' ? 'far' : this.mode === 'far' ? 'bonnet' : 'chase';
    return this.mode;
  }

  reset(x: number, y: number, z: number, yaw: number): void {
    this.followYaw = yaw;
    this.followInit = true;
    this.lookSm.set(x, y + 1, z);
    this.lookInit = true;
  }

  update(
    dt: number,
    x: number, y: number, z: number,
    yaw: number, speedKmh: number,
    turbo: boolean,
    landingShake: number,
    isWallBetween: (from: THREE.Vector3, to: THREE.Vector3) => number,
  ): void {
    this.t += dt;
    if (!this.followInit) {
      this.followYaw = yaw;
      this.followInit = true;
    }
    if (!this.lookInit) {
      this.lookSm.set(x, y + 1, z);
      this.lookInit = true;
    }
    // Critically damped yaw follow, tau = 0.18 s. Never locked rigidly.
    const yawK = 1 - Math.exp(-dt / 0.18);
    const dy = wrapPi(yaw - this.followYaw);
    this.followYaw += dy * yawK;
    const sy = Math.sin(this.followYaw);
    const cy = Math.cos(this.followYaw);
    const dist = this.mode === 'chase' ? 7.0 : this.mode === 'far' ? 9.5 : -0.5;
    const height = this.mode === 'chase' ? 2.4 : this.mode === 'far' ? 3.2 : 1.15;
    // Lookahead grows with speed so you can read the track ahead, not the bumper.
    const ahead = Math.min(20, 6 + speedKmh * 0.045);
    _desired.set(x - sy * dist, y + height, z - cy * dist);
    if (this.mode === 'bonnet') {
      _desired.set(x + Math.sin(yaw) * 0.4, y + 1.15, z + Math.cos(yaw) * 0.4);
      this.camera.position.copy(_desired);
      _look.set(x + Math.sin(yaw) * 30, y + 0.4, z + Math.cos(yaw) * 30);
      // Low-pass even the bonnet look target.
      const lk = 1 - Math.exp(-dt / 0.08);
      this.lookSm.lerp(_look, lk);
      this.camera.lookAt(this.lookSm);
    } else {
      // Position follows the damped yaw frame (not the rigid car yaw).
      const pk = 1 - Math.exp(-dt / 0.18);
      this.camera.position.lerp(_desired, pk);
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
      // Low-pass the look-at target so bumps/suspension don't shake the view.
      _look.set(x + Math.sin(this.followYaw) * ahead, y + 1.0, z + Math.cos(this.followYaw) * ahead);
      const lk = 1 - Math.exp(-dt / 0.12);
      this.lookSm.lerp(_look, lk);
      this.camera.lookAt(this.lookSm);
    }
    // FOV: 72 at 0 -> 88 at 280 (+8 turbo), smoothed over 0.4 s.
    const fovT = Math.min(1, speedKmh / 280);
    let fov = 72 + (88 - 72) * fovT + (turbo ? 8 : 0) + this.fovOffset;
    fov = Math.max(50, Math.min(110, fov));
    const fk = 1 - Math.exp(-dt / 0.4);
    this.fovSm += (fov - this.fovSm) * fk;
    if (Math.abs(this.camera.fov - this.fovSm) > 0.01) {
      this.camera.fov = this.fovSm;
      this.camera.updateProjectionMatrix();
    }
    // Shake (deterministic sine-based, no Math.random so replays stay stable).
    const s = this.reducedMotion ? 0 : Math.max(landingShake * 0.35, turbo ? 0.03 : 0);
    if (s > 0.001) {
      this.camera.position.x += Math.sin(this.t * 61.7) * 0.5 * s;
      this.camera.position.y += Math.sin(this.t * 47.3 + 1.7) * 0.5 * s;
    }
  }

  /** Intro sweep along the start straight (1.2 s). */
  sweep(f: number, x: number, y: number, z: number, yaw: number): void {
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    this.camera.position.set(x + sy * (30 - 30 * f) - cy * 6, y + 6 - 4 * f, z + cy * (30 - 30 * f) + sy * 6);
    this.camera.lookAt(x, y + 1, z);
    // Keep the damped state in sync so the handoff doesn't snap.
    this.followYaw = yaw;
    this.followInit = true;
    this.lookSm.set(x, y + 1, z);
    this.lookInit = true;
    this.fovSm = 72;
  }
}
