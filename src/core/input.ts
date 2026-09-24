// Keyboard + gamepad -> one InputFrame per physics tick.
// Uses event.code so layouts (incl. Turkish Q/F) all work.
export interface InputFrame {
  /** -1..1 steering (left negative) */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  respawn: boolean;
  checkpoint: boolean;
}

export interface KeyBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  restart: string;
  checkpoint: string;
  checkpointAlt: string;
  pause: string;
  camera: string;
  ghost: string;
}

export const DEFAULT_BINDINGS: KeyBindings = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  restart: 'KeyR',
  checkpoint: 'Enter',
  checkpointAlt: 'Backspace',
  pause: 'Escape',
  camera: 'KeyC',
  ghost: 'KeyG',
};

const ALT_UP = 'ArrowUp';
const ALT_DOWN = 'ArrowDown';
const ALT_LEFT = 'ArrowLeft';
const ALT_RIGHT = 'ArrowRight';

export class Input {
  bindings: KeyBindings = { ...DEFAULT_BINDINGS };
  keys = new Set<string>();
  steerSm = 0;
  padIndex = -1;
  steerSensitivity = 1;
  onPause: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onCheckpoint: (() => void) | null = null;
  onCamera: (() => void) | null = null;
  onGhost: (() => void) | null = null;
  private downHandler = (e: KeyboardEvent) => this.onKeyDown(e);
  private upHandler = (e: KeyboardEvent) => this.onKeyUp(e);
  private blurHandler = () => this.releaseAll();
  private gamepadHandler = (_e: Event) => this.scanGamepad();

  attach(): void {
    window.addEventListener('keydown', this.downHandler);
    window.addEventListener('keyup', this.upHandler);
    window.addEventListener('blur', this.blurHandler);
    window.addEventListener('gamepadconnected', this.gamepadHandler);
    document.addEventListener('visibilitychange', this.blurHandler);
  }
  detach(): void {
    window.removeEventListener('keydown', this.downHandler);
    window.removeEventListener('keyup', this.upHandler);
    window.removeEventListener('blur', this.blurHandler);
    window.removeEventListener('gamepadconnected', this.gamepadHandler);
    document.removeEventListener('visibilitychange', this.blurHandler);
  }
  releaseAll(): void {
    this.keys.clear();
    this.steerSm = 0;
  }
  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) {
      if (this.isGameKey(e.code)) e.preventDefault();
      return;
    }
    this.keys.add(e.code);
    if (this.isGameKey(e.code)) e.preventDefault();
    const b = this.bindings;
    if (e.code === b.pause) this.onPause?.();
    if (e.code === b.restart) this.onRestart?.();
    if (e.code === b.checkpoint || e.code === b.checkpointAlt) this.onCheckpoint?.();
    if (e.code === b.camera) this.onCamera?.();
    if (e.code === b.ghost) this.onGhost?.();
  }
  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
  }
  private isGameKey(code: string): boolean {
    const b = this.bindings;
    return (
      code === b.up || code === b.down || code === b.left || code === b.right ||
      code === ALT_UP || code === ALT_DOWN || code === ALT_LEFT || code === ALT_RIGHT ||
      code === b.restart || code === b.checkpoint || code === b.checkpointAlt ||
      code === 'Space'
    );
  }
  private scanGamepad(): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]) {
        this.padIndex = i;
        break;
      }
    }
  }
  private readPad(): { steer: number; throttle: number; brake: number; buttons: boolean[] } | null {
    if (this.padIndex < 0 || !navigator.getGamepads) return null;
    const p = navigator.getGamepads()[this.padIndex];
    if (!p) return null;
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    const steer = dz(p.axes[0] ?? 0);
    const throttle = p.buttons[7]?.value ?? 0;
    const brake = p.buttons[6]?.value ?? 0;
    return { steer, throttle, brake, buttons: p.buttons.map((b) => b.pressed) };
  }
  /** Sample once per physics tick. dt is the fixed step. */
  sample(dt: number): InputFrame {
    const b = this.bindings;
    const k = this.keys;
    const left = k.has(b.left) || k.has(ALT_LEFT);
    const right = k.has(b.right) || k.has(ALT_RIGHT);
    // Physics-space steer: +1 yaws toward world +x. The chase camera looks
    // along travel, so world +x appears screen-LEFT: screen-right (D) must
    // produce negative steer. Keep this mapping in exactly one place.
    const target = (left ? 1 : 0) + (right ? -1 : 0);
    // Steer ramp: 0->full in 80ms, return in 60ms.
    const upRate = dt / 0.08;
    const downRate = dt / 0.06;
    const rate = target !== 0 ? upRate : downRate;
    if (this.steerSm < target) this.steerSm = Math.min(target, this.steerSm + rate);
    else if (this.steerSm > target) this.steerSm = Math.max(target, this.steerSm - rate);
    let steer = this.steerSm * this.steerSensitivity;
    steer = Math.max(-1, Math.min(1, steer));
    let throttle = k.has(b.up) || k.has(ALT_UP) || k.has('Space') ? 1 : 0;
    let brake = k.has(b.down) || k.has(ALT_DOWN) ? 1 : 0;
    let respawn = false;
    let checkpoint = k.has(b.checkpoint) || k.has(b.checkpointAlt);
    const pad = this.readPad();
    if (pad) {
      // Gamepad stick right (+) is screen-right: negate like the keyboard.
      if (Math.abs(pad.steer) > Math.abs(steer)) steer = -pad.steer;
      throttle = Math.max(throttle, pad.throttle);
      brake = Math.max(brake, pad.brake);
      if (pad.buttons[3]) respawn = true; // Y
      if (pad.buttons[1]) checkpoint = true; // B
    }
    return { steer, throttle, brake, respawn, checkpoint };
  }
  /** Poll edge-triggered gamepad buttons each frame (restart/camera/ghost/pause). */
  pollPadButtons(edge: { restart: boolean; checkpoint: boolean; camera: boolean; ghost: boolean; pause: boolean }): void {
    if (this.padIndex < 0 || !navigator.getGamepads) return;
    const p = navigator.getGamepads()[this.padIndex];
    if (!p) return;
    if (p.buttons[3]?.pressed && !edge.restart) this.onRestart?.();
    if (p.buttons[1]?.pressed && !edge.checkpoint) this.onCheckpoint?.();
    if (p.buttons[5]?.pressed && !edge.camera) this.onCamera?.();
    if (p.buttons[4]?.pressed && !edge.ghost) this.onGhost?.();
    if (p.buttons[9]?.pressed && !edge.pause) this.onPause?.();
    edge.restart = !!p.buttons[3]?.pressed;
    edge.checkpoint = !!p.buttons[1]?.pressed;
    edge.camera = !!p.buttons[5]?.pressed;
    edge.ghost = !!p.buttons[4]?.pressed;
    edge.pause = !!p.buttons[9]?.pressed;
  }
}
