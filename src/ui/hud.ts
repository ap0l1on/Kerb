// Minimal race HUD (DOM, updated at most once per frame, text only on change).
import { formatTime, formatSplit } from '../game/medals';
import type { Medals } from '../track/types';

export class Hud {
  root!: HTMLElement;
  private timerEl!: HTMLElement;
  private cpsEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private unitEl!: HTMLElement;
  private boostEl!: HTMLElement;
  private medalsEl!: HTMLElement;
  private splitEl!: HTMLElement;
  private countEl!: HTMLElement;
  private engEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private lastTimer = '';
  private lastSpeed = '';
  private lastCps = '';
  private splitT = 0;
  units: 'kmh' | 'mph' = 'kmh';

  mount(parent: HTMLElement): void {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML =
      `<div class="timer">0:00.000</div><div class="cps"></div>` +
      `<div class="speedbox"><div class="speed">0</div><div class="unit">km/h</div>` +
      `<div class="boostbar"><div></div></div></div>` +
      `<div class="medals"></div><div class="split" style="display:none"></div>` +
      `<div class="count" style="display:none"></div>` +
      `<div class="engineoff">ENGINE OFF</div><div class="hint">Enter · last checkpoint</div>` +
      `<div class="fps" style="display:none"></div>`;
    parent.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.timerEl = q('.timer');
    this.cpsEl = q('.cps');
    this.speedEl = q('.speed');
    this.unitEl = q('.unit');
    this.boostEl = q('.boostbar > div');
    this.medalsEl = q('.medals');
    this.splitEl = q('.split');
    this.countEl = q('.count');
    this.engEl = q('.engineoff');
    this.hintEl = q('.hint');
    this.fpsEl = q('.fps');
  }

  reset(): void {
    this.lastTimer = '';
    this.lastSpeed = '';
    this.lastCps = '';
    this.splitT = 0;
    this.splitEl.style.display = 'none';
    this.countEl.style.display = 'none';
    this.engEl.style.display = 'none';
    this.hintEl.style.display = 'none';
  }

  setTargets(m: Medals, next: 'author' | 'gold' | 'silver' | 'bronze' | null): void {
    const row = (e: string, t: number, id: string) =>
      `<div class="${id === next ? 'next' : ''}">${e} ${formatTime(t)}</div>`;
    this.medalsEl.innerHTML =
      row('◆', m.author, 'author') + row('🥇', m.gold, 'gold') +
      row('🥈', m.silver, 'silver') + row('🥉', m.bronze, 'bronze');
  }

  setTimer(t: number): void {
    const s = formatTime(t);
    if (s !== this.lastTimer) {
      this.lastTimer = s;
      this.timerEl.textContent = s;
    }
  }
  setCps(passed: number, total: number): void {
    const s = `${passed} / ${total + 1}`;
    if (s !== this.lastCps) {
      this.lastCps = s;
      this.cpsEl.textContent = s;
    }
  }
  setSpeed(kmh: number, boostFrac: number): void {
    const v = this.units === 'mph' ? Math.round(kmh * 0.621371) : Math.round(kmh);
    const s = String(v);
    if (s !== this.lastSpeed) {
      this.lastSpeed = s;
      this.speedEl.textContent = s;
      this.unitEl.textContent = this.units === 'mph' ? 'mph' : 'km/h';
    }
    (this.boostEl as HTMLElement).style.width = `${Math.round(boostFrac * 100)}%`;
  }
  showSplit(delta: number | null, time: number): void {
    this.splitEl.style.display = 'block';
    if (delta == null) {
      this.splitEl.className = 'split';
      this.splitEl.textContent = formatTime(time);
    } else {
      this.splitEl.className = 'split ' + (delta < 0 ? 'ahead' : 'behind');
      this.splitEl.textContent = formatSplit(delta);
    }
    this.splitT = 1.2;
  }
  tickSplit(dt: number): void {
    if (this.splitT > 0) {
      this.splitT -= dt;
      if (this.splitT <= 0) this.splitEl.style.display = 'none';
    }
  }
  countdown(n: string | null): void {
    if (!n) this.countEl.style.display = 'none';
    else {
      this.countEl.style.display = 'block';
      this.countEl.textContent = n;
    }
  }
  engineOff(on: boolean): void {
    this.engEl.style.display = on ? 'block' : 'none';
  }
  stuckHint(on: boolean): void {
    this.hintEl.style.display = on ? 'block' : 'none';
  }
  fps(show: boolean, text: string): void {
    this.fpsEl.style.display = show ? 'block' : 'none';
    if (show) this.fpsEl.textContent = text;
  }
  show(): void {
    this.root.style.display = 'block';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
}
