// Dev-only telemetry overlay (F4) + CSV logger (F5) + scripted replay helper.
// No Math.random. Overlay reads on demand; CSV logs every physics tick.
import type { CarState } from '../physics/car';
import { carTelemetry } from '../physics/car';
import type { InputFrame } from '../core/input';
import type { TrackCollider } from '../physics/collide';

export interface FrameInfo {
  steps: number;
  frameMs: number;
  rawSteer: number;
  throttle: number;
  brake: number;
}

export class Telemetry {
  el: HTMLElement | null = null;
  enabled = false;
  logging = false;
  rows: string[] = [];
  tick = 0;
  time = 0;

  mount(parent: HTMLElement): void {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = 'telemetry';
    el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:99;display:none;' +
      'background:rgba(0,0,0,0.72);color:#0f0;font:11px/1.5 monospace;' +
      'padding:8px 10px;border-radius:6px;white-space:pre;pointer-events:none;';
    parent.appendChild(el);
    this.el = el;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.el) this.el.style.display = this.enabled ? 'block' : 'none';
    return this.enabled;
  }

  toggleLogging(): boolean {
    if (this.logging) {
      this.stopAndDownload();
      return false;
    }
    this.start();
    return true;
  }

  start(): void {
    this.logging = true;
    this.rows = [
      'tick,time,speedKmh,throttle,brake,steer,steerAngleDeg,' +
      'w0_hit,w0_comp,w0_surf,w1_hit,w1_comp,w1_surf,w2_hit,w2_comp,w2_surf,w3_hit,w3_comp,w3_surf,' +
      'slipDeg,bodyClear,pitchDeg,rollDeg,downforceN,x,y,z,yaw,grounded',
    ];
    this.tick = 0;
    this.time = 0;
  }

  recordTick(st: CarState, inp: InputFrame, track: TrackCollider, dt: number): void {
    if (!this.logging) return;
    this.time += dt;
    const t = carTelemetry(st, inp, track);
    const w = t.wheels;
    const row =
      `${this.tick},${this.time.toFixed(4)},${t.speedKmh.toFixed(2)},${inp.throttle},${inp.brake},${inp.steer.toFixed(3)},${t.steerAngleDeg.toFixed(2)},` +
      `${w[0]!.hit ? 1 : 0},${w[0]!.compression.toFixed(3)},${w[0]!.surface},` +
      `${w[1]!.hit ? 1 : 0},${w[1]!.compression.toFixed(3)},${w[1]!.surface},` +
      `${w[2]!.hit ? 1 : 0},${w[2]!.compression.toFixed(3)},${w[2]!.surface},` +
      `${w[3]!.hit ? 1 : 0},${w[3]!.compression.toFixed(3)},${w[3]!.surface},` +
      `${t.slipDeg.toFixed(2)},${Number.isFinite(t.bodyClear) ? t.bodyClear.toFixed(3) : ''},` +
      `${t.pitchDeg.toFixed(2)},${t.rollDeg.toFixed(2)},${t.downforceN.toFixed(1)},` +
      `${st.x.toFixed(3)},${st.y.toFixed(3)},${st.z.toFixed(3)},${st.yaw.toFixed(4)},${st.grounded}`;
    this.rows.push(row);
    this.tick++;
  }

  stopAndDownload(): void {
    this.logging = false;
    try {
      const blob = new Blob([this.rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kerb-telemetry-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      // headless / no DOM download: keep rows in memory
    }
  }

  update(
    st: CarState,
    inp: InputFrame,
    track: TrackCollider,
    info: FrameInfo,
  ): void {
    if (!this.enabled || !this.el) return;
    const t = carTelemetry(st, inp, track);
    const w = t.wheels;
    const lines = [
      `speed ${t.speedKmh.toFixed(1)} km/h  thr ${inp.throttle} brk ${inp.brake}`,
      `steer raw ${info.rawSteer.toFixed(2)} sm ${inp.steer.toFixed(3)} angle ${t.steerAngleDeg.toFixed(1)}°`,
      `w0 ${w[0]!.hit ? 'HIT' : 'miss'} c=${w[0]!.compression.toFixed(2)} ${w[0]!.surface}`,
      `w1 ${w[1]!.hit ? 'HIT' : 'miss'} c=${w[1]!.compression.toFixed(2)} ${w[1]!.surface}`,
      `w2 ${w[2]!.hit ? 'HIT' : 'miss'} c=${w[2]!.compression.toFixed(2)} ${w[2]!.surface}`,
      `w3 ${w[3]!.hit ? 'HIT' : 'miss'} c=${w[3]!.compression.toFixed(2)} ${w[3]!.surface}`,
      `slip ${t.slipDeg.toFixed(1)}° clear ${Number.isFinite(t.bodyClear) ? t.bodyClear.toFixed(3) : '—'} m`,
      `pitch ${t.pitchDeg.toFixed(1)}° roll ${t.rollDeg.toFixed(1)}° df ${(t.downforceN / 1000).toFixed(1)} kN`,
      `steps ${info.steps} frame ${info.frameMs.toFixed(2)} ms${this.logging ? ' LOGGING' : ''}`,
    ];
    // Clip warning (the sinking cause): body below road or ray origin below.
    if (Number.isFinite(t.bodyClear) && t.bodyClear < 0) {
      lines.push('!! CLIP: body below road !!');
    }
    if (w.some((x) => !x.hit)) {
      lines.push('ray miss (check origin/length)');
    }
    this.el.textContent = lines.join('\n');
  }
}

/** Scripted input replay for audits/benchmarks (deterministic, no DOM).
 *  Full throttle, then full steer left/right holds, then brake+steer. */
export function scriptedReplay(tick: number): InputFrame {
  const s = (v: number) => ({ steer: v, throttle: 1, brake: 0, respawn: false, checkpoint: false }) as InputFrame;
  const sb = (v: number) => ({ steer: v, throttle: 0, brake: 1, respawn: false, checkpoint: false }) as InputFrame;
  const t = tick / 120;
  if (t < 6) return s(0);
  if (t < 8) return s(1);
  if (t < 10) return s(-1);
  if (t < 12) return s(0);
  if (t < 14) return sb(0);
  if (t < 16) return sb(0.8);
  return s(0);
}
