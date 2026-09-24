// Renderer, sky dome, fog, lights, quality levels. No shadows (blob shadow only).
import * as THREE from 'three';

export type Quality = 'low' | 'medium' | 'high';

export class SceneManager {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  sky!: THREE.Mesh;
  hemi!: THREE.HemisphereLight;
  dir!: THREE.DirectionalLight;
  quality: Quality = 'medium';
  renderScale = 1;
  baseW = 1280;
  baseH = 800;
  adaptiveNote = false;
  private slowT = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.9);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.6);
    this.dir.position.set(60, 120, 40);
    this.scene.add(this.dir);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  }

  setTheme(skyTop: number, skyBottom: number, fogColor: number, fogDensity: number): void {
    // Gradient sky dome (BackSide sphere with vertex colours).
    if (this.sky) {
      this.scene.remove(this.sky);
      this.sky.geometry.dispose();
      (this.sky.material as THREE.Material).dispose();
    }
    const geo = new THREE.SphereGeometry(1500, 16, 12);
    const top = new THREE.Color(skyTop);
    const bot = new THREE.Color(skyBottom);
    const cols: number[] = [];
    const posA = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < posA.count; i++) {
      const y = posA.getY(i) / 1500;
      const f = Math.max(0, Math.min(1, (y + 0.15) * 0.8));
      const c = bot.clone().lerp(top, f);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(fogColor, this.quality === 'low' ? 0 : fogDensity);
    this.scene.background = new THREE.Color(skyBottom);
  }

  setQuality(q: Quality): void {
    this.quality = q;
    // Note: antialias is fixed at context creation; High keeps MSAA via pixel ratio path.
    this.applySize();
  }

  setRenderScale(s: number): void {
    this.renderScale = Math.max(0.5, Math.min(1, s));
    this.applySize();
  }

  applySize(): void {
    const w = Math.floor(this.baseW * this.renderScale);
    const h = Math.floor(this.baseH * this.renderScale);
    this.renderer.setSize(w, h, false);
  }

  resize(w: number, h: number): void {
    this.baseW = w;
    this.baseH = h;
    this.applySize();
  }

  /** Adaptive quality: lower render scale if slow for 2 s. Returns note when it kicks in. */
  adapt(frameMs: number, dt: number): boolean {
    if (frameMs > 18) this.slowT += dt;
    else this.slowT = Math.max(0, this.slowT - dt);
    if (this.slowT > 2 && this.renderScale > 0.6) {
      this.setRenderScale(Math.max(0.6, this.renderScale - 0.1));
      this.slowT = 0;
      this.adaptiveNote = true;
      return true;
    }
    return false;
  }
}
