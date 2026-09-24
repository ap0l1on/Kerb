// WebAudio synthesized engine + SFX. No audio files. Starts after first user click.
export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  engineGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private squealOsc: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;
  masterVol = 0.6;
  engineVol = 0.8;
  sfxVol = 0.8;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.masterVol;
    this.master.connect(ctx.destination);
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.connect(this.engineGain);
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 70;
    this.osc1.connect(this.filter);
    this.osc1.start();
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 35;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.osc2.connect(g2);
    g2.connect(this.filter);
    this.osc2.start();
    // Tyre squeal loop (gain 0 until drifting).
    this.squealOsc = ctx.createOscillator();
    this.squealOsc.type = 'sine';
    this.squealOsc.frequency.value = 1400;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squealOsc.connect(this.squealGain);
    this.squealGain.connect(this.master);
    this.squealOsc.start();
  }

  setVolumes(master: number, engine: number, sfx: number): void {
    this.masterVol = master;
    this.engineVol = engine;
    this.sfxVol = sfx;
    if (this.ctx && this.master && this.engineGain && this.sfxGain) {
      this.master.gain.value = master;
      this.sfxGain.gain.value = sfx;
    }
  }

  /** Fake RPM: speed + throttle, gear dips every 60 km/h. */
  engineUpdate(speedKmh: number, throttle: number): void {
    if (!this.ctx || !this.osc1 || !this.osc2 || !this.filter || !this.engineGain) return;
    const gear = Math.floor(speedKmh / 60);
    const inGear = (speedKmh % 60) / 60;
    const rpm = 60 + inGear * 160 + throttle * 40 - (gear > 0 ? 8 : 0);
    this.osc1.frequency.value = rpm;
    this.osc2.frequency.value = rpm / 2;
    this.filter.frequency.value = 500 + throttle * 1800 + speedKmh * 4;
    this.engineGain.gain.value = 0.05 + throttle * 0.11 * this.engineVol + Math.min(0.05, speedKmh / 280 * 0.05);
  }

  squeal(on: boolean): void {
    if (!this.ctx || !this.squealGain) return;
    this.squealGain.gain.value += ((on ? 0.05 : 0) - this.squealGain.gain.value) * 0.3;
  }

  private blip(freq: number, t: number, dur: number, type: OscillatorType = 'sine', vol = 0.25): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  countdownBeep(final: boolean): void {
    if (!this.ctx) return;
    this.blip(final ? 880 : 440, this.ctx.currentTime, final ? 0.4 : 0.15, 'square', 0.2);
  }
  checkpoint(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(660, t, 0.12);
    this.blip(990, t + 0.1, 0.2);
  }
  finish(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(523, t, 0.15);
    this.blip(659, t + 0.14, 0.15);
    this.blip(784, t + 0.28, 0.3);
  }
  wallThud(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(90, t, 0.18, 'sine', 0.4);
  }
  boost(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = 0.6;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + len);
    const g = ctx.createGain();
    g.gain.value = 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }
}
