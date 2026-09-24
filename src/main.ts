// Kerb boot: mobile gate, hash links, screens, fixed-step loop, ghosts, replay.
import * as THREE from 'three';
import './ui/styles.css';
import { FIXED_DT, LIVE_URL, NAME } from './config';
import { FixedLoop } from './core/loop';
import { Input, type InputFrame } from './core/input';
import { freshCar, type CarState } from './physics/car';
import { TrackCollider } from './physics/collide';
import { buildSamples, buildTrackMeshes, THEMES } from './track/build';
import { getTrack, TRACKS } from './tracks/index';
import type { TrackDef } from './track/types';
import { Race } from './game/race';
import { GhostRecorder, decodeGhost, encodeGhost, quantizeInput } from './game/ghost';
import { medalForTime, formatTime, MEDAL_EMOJI } from './game/medals';
import { loadProgress, saveProgress, resetProgress, groupUnlocked, type Progress } from './game/progress';
import { SceneManager } from './render/scene';
import { buildCar, poseCar, type CarRig } from './render/carModel';
import { buildProps, buildCheckpointArches } from './render/props';
import { ChaseCamera } from './render/camera';
import { Particles } from './render/particles';
import { AudioEngine } from './audio/engine';
import { Hud } from './ui/hud';
import { Screens, type FinishData } from './ui/screens';
import { toggleTuningPanel } from './ui/tuningPanel';
import { track } from './ui/analytics';

type Mode = 'title' | 'tracks' | 'race' | 'replay' | 'settings' | 'howto';
type SettingsFrom = 'title' | 'pause' | 'tracks';

function isMobileGate(): boolean {
  const narrow = window.innerWidth < 900;
  const touch = 'ontouchstart' in window && navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches;
  return narrow || touch;
}

function parseHash(): { t: string | null; g: string | null } {
  const h = window.location.hash.replace(/^#/, '');
  const p = new URLSearchParams(h);
  return { t: p.get('t'), g: p.get('g') };
}

class Game {
  progress: Progress = loadProgress();
  mode: Mode = 'title';
  settingsFrom: SettingsFrom = 'title';
  input = new Input();
  scenes!: SceneManager;
  cam!: ChaseCamera;
  hud = new Hud();
  screens!: Screens;
  audio = new AudioEngine();
  particles!: Particles;
  loop = new FixedLoop(FIXED_DT);
  def: TrackDef | null = null;
  collider: TrackCollider | null = null;
  race: Race | null = null;
  recorder = new GhostRecorder();
  lastRunFrames: InputFrame[] = [];
  ghostRace: Race | null = null; // player best / challenge / author ghost, stepped in lockstep
  ghostRig: CarRig | null = null;
  ghostActive = false;
  ghostLabel = '';
  playerRig: CarRig | null = null;
  trackGroup: THREE.Group | null = null;
  setArchLit: ((i: number, lit: boolean) => void) | null = null;
  prevCar: CarState = freshCar();
  wheelSpin = 0;
  padEdge = { restart: false, checkpoint: false, camera: false, ghost: false, pause: false };
  paused = false;
  pauseFromRace = false;
  finishShown = false;
  replay: { frames: InputFrame[]; idx: number; speed: number; car: CarState; race: Race } | null = null;
  fpsFrames = 0;
  fpsT = 0;
  fpsText = '';
  lastWallSfx = 0;
  wasBoosting = false;
  titleAngle = 0;
  app: HTMLElement;

  constructor() {
    this.app = document.getElementById('app')!;
  }

  boot(): void {
    if (isMobileGate()) {
      this.screens = new Screens(this.app);
      this.screens.showGate();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'game';
    this.app.appendChild(canvas);
    this.scenes = new SceneManager(canvas);
    this.cam = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.particles = new Particles(this.scenes.scene);
    this.screens = new Screens(this.app);
    this.hud.mount(this.app);
    this.hud.hide();
    this.applySettings();
    this.input.attach();
    this.bindGlobalKeys();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('pointerdown', () => this.audio.unlock(), { passive: true });
    window.addEventListener('keydown', () => this.audio.unlock());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'race' && !this.paused) this.pauseGame();
    });
    this.onResize();
    // Title background: Sandline, low quality render of the real track.
    this.loadTrackWorld(getTrack('canyon-1')!, 'low');
    const pose = this.collider!.startPose(this.def!.start);
    this.titleCar(pose);
    this.showTitle();
    track('boot');
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- settings ----------
  applySettings(): void {
    const s = this.progress.settings;
    this.scenes?.setQuality(s.quality);
    this.scenes?.setRenderScale(s.renderScale);
    if (this.cam) this.cam.fovOffset = s.fovOffset;
    this.audio.setVolumes(s.master, s.engine, s.sfx);
    this.hud.units = s.units;
    this.input.steerSensitivity = s.sensitivity;
    if (s.bindings) this.input.bindings = { ...this.input.bindings, ...s.bindings };
    this.particles?.setEnabled(s.quality !== 'low');
  }

  saveSettings(): void {
    saveProgress(this.progress);
    this.applySettings();
  }

  onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.scenes.resize(w, h);
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
  }

  bindGlobalKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2' && import.meta.env.DEV) {
        e.preventDefault();
        toggleTuningPanel(this.app);
      }
      if (e.code === 'F3') {
        e.preventDefault();
        this.progress.settings.showFps = !this.progress.settings.showFps;
        this.saveSettings();
      }
    });
    this.input.onPause = () => {
      if (this.mode === 'race') {
        if (this.paused) this.resumeGame();
        else this.pauseGame();
      }
    };
    this.input.onRestart = () => {
      if (this.mode === 'race' && !this.paused) this.restartRun();
    };
    this.input.onCheckpoint = () => {
      // edge handled inside race via sampled flag; nothing extra needed
    };
    this.input.onCamera = () => {
      if (this.mode === 'race') {
        const m = this.cam.cycle();
        this.screens.toast(`Camera: ${m}`);
      }
    };
    this.input.onGhost = () => {
      if (this.mode === 'race') {
        this.ghostActive = !this.ghostActive;
        if (this.ghostRig) this.ghostRig.group.visible = this.ghostActive;
        this.screens.toast(this.ghostActive ? 'Ghost on' : 'Ghost off');
      }
    };
  }

  // ---------- world loading (track reload only on track switch) ----------
  loadTrackWorld(def: TrackDef, forceQuality: 'low' | 'medium' | 'high' | null = null): void {
    if (this.trackGroup) {
      this.scenes.scene.remove(this.trackGroup);
      this.trackGroup.traverse((o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
    }
    this.def = def;
    const { samples, totalLen } = buildSamples(def);
    const collider = new TrackCollider();
    collider.build(samples, totalLen, def.killY);
    this.collider = collider;
    const theme = THEMES[def.theme];
    this.scenes.setTheme(theme.skyTop, theme.skyBottom, theme.fog, theme.fogDensity);
    const group = new THREE.Group();
    const meshes = buildTrackMeshes(def, samples);
    group.add(meshes.group);
    const q = forceQuality ?? this.progress.settings.quality;
    group.add(buildProps(def.props, samples, def.theme, q === 'low' ? 0.5 : 1));
    const arches = buildCheckpointArches(meshes.checkpointPos);
    group.add(arches.group);
    this.setArchLit = arches.setLit;
    this.trackGroup = group;
    this.scenes.scene.add(group);
    // Player + ghost rigs.
    if (this.playerRig) this.scenes.scene.remove(this.playerRig.group);
    if (this.ghostRig) this.scenes.scene.remove(this.ghostRig.group);
    this.playerRig = buildCar(0xff5a1f, false);
    this.scenes.scene.add(this.playerRig.group);
    this.ghostRig = buildCar(0x39d0ff, true);
    this.ghostRig.group.visible = false;
    this.scenes.scene.add(this.ghostRig.group);
  }

  titleCar(pose: { x: number; y: number; z: number; yaw: number }): void {
    if (!this.playerRig) return;
    poseCar(this.playerRig, pose.x, pose.y, pose.z, pose.yaw, 0, 0, 0, 0);
  }

  // ---------- screens ----------
  showTitle(): void {
    this.mode = 'title';
    this.hud.hide();
    this.screens.showTitle({
      play: () => this.showTracks(),
      settings: () => {
        this.settingsFrom = 'title';
        this.showSettings();
      },
      howto: () => this.showHowto(),
    });
  }

  showTracks(): void {
    this.mode = 'tracks';
    this.hud.hide();
    this.screens.showTrackSelect(this.progress, {
      back: () => this.showTitle(),
      race: (id, author) => this.startRace(id, author),
    });
  }

  showSettings(): void {
    const from = this.mode === 'race' ? 'pause' : this.settingsFrom;
    if (this.mode !== 'race') this.mode = 'settings';
    this.screens.showSettings(this.progress, {
      change: () => this.saveSettings(),
      back: () => {
        if (from === 'pause') {
          this.showPause();
        } else if (from === 'tracks' || this.settingsFrom === 'tracks') {
          this.showTracks();
        } else this.showTitle();
      },
      reset: () => {
        this.progress = resetProgress();
        this.saveSettings();
        this.screens.toast('Progress reset');
      },
    });
  }

  showHowto(): void {
    this.mode = 'howto';
    this.screens.showHowto(() => this.showTitle());
  }

  showPause(): void {
    this.screens.showPause({
      resume: () => this.resumeGame(),
      restart: () => {
        this.resumeGame();
        this.restartRun();
      },
      tracks: () => {
        this.paused = false;
        this.showTracks();
      },
      settings: () => {
        this.settingsFrom = this.mode === 'race' ? 'pause' : 'title';
        this.showSettings();
      },
    });
  }

  // ---------- race ----------
  startRace(id: string, raceAuthor: boolean, challengeCode: string | null = null): void {
    const def = getTrack(id);
    if (!def) {
      this.screens.toast('Unknown track');
      return;
    }
    this.loadTrackWorld(def);
    this.mode = 'race';
    this.screens.clear();
    this.hud.show();
    this.hud.reset();
    const ref = this.progress.tracks[id]?.splits ?? null;
    this.race = new Race(def, this.collider!);
    this.race.onSplit = (e) => this.onSplit(e);
    this.race.onCountdown = (s) => this.onCountdown(s);
    this.race.onFinish = (t) => this.onFinish(t);
    this.race.reset(ref);
    // Next medal target highlight.
    const pr = this.progress.tracks[id];
    const next = !pr?.medal ? 'bronze' : pr.medal === 'bronze' ? 'silver' : pr.medal === 'silver' ? 'gold' : pr.medal === 'gold' ? 'author' : 'author';
    this.hud.setTargets(def.medals, next);
    // Ghost setup: challenge code > author > player best.
    this.ghostRace = null;
    this.ghostActive = false;
    this.ghostLabel = '';
    const tryGhost = (code: string, label: string): boolean => {
      const d = decodeGhost(code);
      if (!d) return false;
      const gr = new Race(def, this.collider!);
      gr.reset(null);
      // Fast-forward through sweep+countdown so ghost is at GO.
      const idle: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };
      for (let i = 0; i < 340; i++) gr.step(idle);
      this.ghostRace = gr;
      this.ghostFrames = d.frames;
      this.ghostIdx = 0;
      this.ghostLabel = label;
      return true;
    };
    if (challengeCode) {
      if (tryGhost(challengeCode, 'friend')) {
        this.ghostActive = true;
        // Resim to display the friend's time.
        const t = this.resimTime(def, decodeGhost(challengeCode)!.frames);
        this.screens.toast(t != null ? `Racing a friend's ${formatTime(t)} ghost` : 'This challenge link is broken');
        if (t == null) this.ghostRace = null;
      } else {
        this.screens.toast('This challenge link is broken');
      }
    } else if (raceAuthor) {
      void fetch(`${import.meta.env.BASE_URL}ghosts/${id}.kghost`)
        .then((r) => (r.ok ? r.text() : ''))
        .then((code) => {
          if (code && tryGhost(code.trim(), 'author')) {
            this.ghostActive = true;
            if (this.ghostRig) this.ghostRig.group.visible = true;
            this.screens.toast('Racing the author ghost');
          } else this.screens.toast('No author ghost yet');
        })
        .catch(() => this.screens.toast('No author ghost yet'));
    } else if (this.progress.settings.ghostOn) {
      const code = this.progress.tracks[id]?.bestGhost;
      if (code && tryGhost(code, 'you')) this.ghostActive = true;
    }
    if (this.ghostRig) this.ghostRig.group.visible = this.ghostActive;
    this.recorder.reset();
    this.lastRunFrames = [];
    this.paused = false;
    this.finishShown = false;
    this.prevCar = { ...this.race.car };
    // Snap camera behind car.
    const c = this.race.car;
    this.cam.camera.position.set(c.x - Math.sin(c.yaw) * 6, c.y + 2.5, c.z - Math.cos(c.yaw) * 6);
    window.location.hash = `t=${id}`;
    track('race_start', { track: id });
  }

  private ghostFrames: InputFrame[] = [];
  private ghostIdx = 0;

  resimTime(def: TrackDef, frames: InputFrame[]): number | null {
    const col = new TrackCollider();
    const { samples, totalLen } = buildSamples(def);
    col.build(samples, totalLen, def.killY);
    const r = new Race(def, col);
    r.reset(null);
    const idle: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };
    for (let i = 0; i < 340; i++) r.step(idle);
    for (const f of frames) {
      r.step(f);
      if (r.phase === 'finished') return r.finishTime;
    }
    return null;
  }

  onSplit(e: { index: number; time: number; delta: number | null }): void {
    this.hud.showSplit(e.delta, e.time);
    this.audio.checkpoint();
    if (this.setArchLit && e.index < (this.def?.checkpoints.length ?? 0)) {
      this.setArchLit(e.index + 1, true);
    }
  }

  onCountdown(stepIdx: number): void {
    // 0,1,2 -> 3,2,1 ; 3 -> GO
    if (stepIdx < 3) {
      this.hud.countdown(String(3 - stepIdx));
      this.audio.countdownBeep(false);
    } else {
      this.hud.countdown('GO!');
      this.audio.countdownBeep(true);
      window.setTimeout(() => this.hud.countdown(null), 500);
    }
  }

  onFinish(time: number): void {
    this.audio.finish();
    this.lastRunFrames = [...this.recorder.frames];
    const id = this.def!.id;
    const prev = this.progress.tracks[id];
    const isPB = prev?.best == null || time < prev.best;
    const medal = medalForTime(time, this.def!.medals);
    if (isPB) {
      this.progress.tracks[id] = {
        best: time,
        medal,
        bestGhost: encodeGhost(this.recorder.frames),
        splits: [...this.race!.splits.map((s) => s ?? 0)],
      };
      // Unlock toasts.
      const mini = TRACKS.map((t) => ({ id: t.id, group: t.group }));
      const hadPro = groupUnlocked('pro', this.progress, mini);
      const hadElite = groupUnlocked('elite', this.progress, mini);
      saveProgress(this.progress);
      void hadPro;
      void hadElite;
      // Recompute with previous progress to detect transitions.
      // (Simple: toast when the just-earned medal completes a group.)
      this.checkUnlockToast();
    } else {
      if (!prev) this.progress.tracks[id] = { best: time, medal, bestGhost: null, splits: null };
      else if (medal && (!prev.medal || medalRank(medal) < medalRank(prev.medal))) {
        prev.medal = medal;
        saveProgress(this.progress);
        this.checkUnlockToast();
      }
    }
    track('race_finish', { track: id });
    window.setTimeout(() => this.showFinishScreen(time, isPB), 800);
  }

  checkUnlockToast(): void {
    const mini = TRACKS.map((t) => ({ id: t.id, group: t.group }));
    if (groupUnlocked('pro', this.progress, mini)) {
      // toast once per session per group
      if (!sessionStorage.getItem('kerb.unlocked.pro')) {
        sessionStorage.setItem('kerb.unlocked.pro', '1');
        this.screens.toast('PRO unlocked!');
      }
    }
    if (groupUnlocked('elite', this.progress, mini)) {
      if (!sessionStorage.getItem('kerb.unlocked.elite')) {
        sessionStorage.setItem('kerb.unlocked.elite', '1');
        this.screens.toast('ELITE unlocked!');
      }
    }
  }

  showFinishScreen(time: number, isPB: boolean): void {
    if (this.mode !== 'race' || this.finishShown) return;
    this.finishShown = true;
    const def = this.def!;
    const prev = this.progress.tracks[def.id];
    const medal = medalForTime(time, def.medals);
    const order: ('bronze' | 'silver' | 'gold' | 'author')[] = ['bronze', 'silver', 'gold', 'author'];
    const nextM = order.find((m) => time > def.medals[m]);
    const nextLabel = nextM
      ? `Next: ${MEDAL_EMOJI[nextM]} ${formatTime(def.medals[nextM])} (−${(def.medals[nextM] - time).toFixed(2)})`
      : 'You beat the author. Untouchable.';
    const d: FinishData = {
      time,
      isPB,
      deltaBest: prev?.best != null && !isPB ? prev.best : isPB ? null : null,
      medal,
      medalLabel: medal ? medal.toUpperCase() : '',
      nextLabel,
    };
    const idx = TRACKS.findIndex((t) => t.id === def.id);
    const nextTrack = TRACKS[(idx + 1) % TRACKS.length];
    this.screens.showFinish(d, {
      retry: () => this.restartRun(),
      next: () => this.startRace(nextTrack.id, false),
      replay: () => this.startReplay(),
      share: () => this.shareTime(time, medal),
      challenge: () => this.shareChallenge(),
      tracks: () => this.showTracks(),
    });
  }

  shareTime(time: number, medal: ReturnType<typeof medalForTime>): void {
    const def = this.def!;
    const emoji = medal ? (MEDAL_EMOJI[medal] ?? '') : '';
    const text = `${NAME} · ${def.name} · ${formatTime(time)} ${emoji} ${LIVE_URL}#t=${def.id}`;
    void navigator.clipboard?.writeText(text).then(
      () => this.screens.toast('Copied! Send it to a friend.'),
      () => this.screens.toast(text),
    );
  }

  shareChallenge(): void {
    const def = this.def!;
    const code = encodeGhost(this.lastRunFrames.length ? this.lastRunFrames : this.recorder.frames);
    const url = `${LIVE_URL}#t=${def.id}&g=${code}`;
    void navigator.clipboard?.writeText(url).then(
      () => this.screens.toast('Challenge link copied!'),
      () => this.screens.toast('Copy failed — link too long?'),
    );
  }

  restartRun(): void {
    if (!this.race || !this.def) return;
    const ref = this.progress.tracks[this.def.id]?.splits ?? null;
    this.race.reset(ref);
    this.recorder.reset();
    this.ghostIdx = 0;
    if (this.ghostRace) {
      this.ghostRace.reset(null);
      const idle: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };
      for (let i = 0; i < 340; i++) this.ghostRace.step(idle);
    }
    this.prevCar = { ...this.race.car };
    this.hud.reset();
    this.hud.setTargets(this.def.medals, 'bronze');
    this.finishShown = false;
    // Reset arch lights.
    const n = this.def.checkpoints.length;
    for (let i = 1; i <= n + 1; i++) this.setArchLit?.(i, false);
    if (this.mode !== 'race') {
      this.mode = 'race';
      this.screens.clear();
      this.hud.show();
    } else if (this.finishShown === false) {
      this.screens.clear();
    }
  }

  pauseGame(): void {
    if (this.mode !== 'race' || this.paused) return;
    this.paused = true;
    if (this.race) this.race.phase = 'paused';
    this.showPause();
  }

  resumeGame(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.race && this.race.phase === 'paused') this.race.phase = 'racing';
    this.screens.clear();
  }

  // ---------- replay ----------
  startReplay(): void {
    if (!this.race || !this.def || !this.lastRunFrames.length) return;
    this.mode = 'replay';
    this.screens.clear();
    this.hud.hide();
    const col = this.collider!;
    const race = new Race(this.def, col);
    race.reset(null);
    const idle: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };
    for (let i = 0; i < 340; i++) race.step(idle);
    this.replay = { frames: this.lastRunFrames, idx: 0, speed: 1, car: race.car, race };
    this.screens.showReplayBar({
      exit: () => this.showFinishScreen(this.replay?.race.finishTime ?? 0, false),
      speed: (s) => {
        if (this.replay) this.replay.speed = s;
      },
      scrub: (f) => {
        if (!this.replay || !this.def) return;
        // Re-simulate from start to target (runs are short; fast).
        const target = Math.floor(f * this.replay.frames.length);
        const race2 = new Race(this.def, this.collider!);
        race2.reset(null);
        for (let i = 0; i < 340; i++) race2.step(idle);
        for (let i = 0; i < target; i++) race2.step(this.replay.frames[i]!);
        this.replay.race = race2;
        this.replay.car = race2.car;
        this.replay.idx = target;
      },
    });
    // after exit of replay bar, mode handling:
    this.finishShown = false; // allow re-show
  }

  // ---------- per-frame ----------
  private lastT = -1;

  frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    if (this.lastT < 0) this.lastT = now;
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.25) dt = 0.25;
    this.input.pollPadButtons(this.padEdge);
    // FPS meter.
    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      const fps = this.fpsFrames / this.fpsT;
      this.fpsText = `${fps.toFixed(0)} fps`;
      this.fpsFrames = 0;
      this.fpsT = 0;
    }

    if (this.mode === 'title') {
      this.titleAngle += dt * 0.15;
      const pose = this.collider!.startPose(this.def!.start);
      const r = 14;
      this.cam.camera.position.set(pose.x + Math.sin(this.titleAngle) * r, pose.y + 5, pose.z + Math.cos(this.titleAngle) * r);
      this.cam.camera.lookAt(pose.x, pose.y + 1, pose.z);
      this.scenes.renderer.render(this.scenes.scene, this.cam.camera);
      return;
    }
    if (this.mode === 'tracks' || this.mode === 'settings' || this.mode === 'howto') {
      // Slow orbit behind menus.
      this.titleAngle += dt * 0.05;
      const pose = this.collider!.startPose(this.def!.start);
      this.cam.camera.position.set(pose.x + Math.sin(this.titleAngle) * 18, pose.y + 7, pose.z + Math.cos(this.titleAngle) * 18);
      this.cam.camera.lookAt(pose.x, pose.y, pose.z);
      this.scenes.renderer.render(this.scenes.scene, this.cam.camera);
      return;
    }
    if (this.mode === 'replay' && this.replay) {
      const rp = this.replay;
      const steps = Math.round(rp.speed);
      for (let s = 0; s < steps; s++) {
        if (rp.idx < rp.frames.length) {
          rp.race.step(rp.frames[rp.idx]!);
          rp.idx++;
        }
      }
      rp.car = rp.race.car;
      if (this.playerRig) poseCar(this.playerRig, rp.car.x, rp.car.y, rp.car.z, rp.car.yaw, rp.car.pitch, rp.car.roll + (rp.car.loopFlip ? Math.PI : 0), 0, this.wheelSpin);
      this.titleAngle += dt * 0.2;
      this.cam.camera.position.set(rp.car.x + Math.sin(this.titleAngle) * 10, rp.car.y + 4, rp.car.z + Math.cos(this.titleAngle) * 10);
      this.cam.camera.lookAt(rp.car.x, rp.car.y + 1, rp.car.z);
      this.scenes.renderer.render(this.scenes.scene, this.cam.camera);
      return;
    }
    if (this.mode !== 'race' || !this.race || !this.def || !this.playerRig) return;

    // Fixed-step physics.
    if (!this.paused) {
      const { alpha } = this.loop.frame(dt, (h) => {
        const inp = quantizeInput(this.input.sample(h));
        // Record only racing ticks (ghost alignment starts at GO).
        if (this.race!.phase === 'racing') this.recorder.record(inp);
        this.prevCar = { ...this.race!.car };
        this.race!.step(inp);
        // Ghost in lockstep.
        if (this.ghostRace && this.ghostIdx < this.ghostFrames.length && this.race!.phase === 'racing') {
          this.ghostRace.step(this.ghostFrames[this.ghostIdx]!);
          this.ghostIdx++;
        }
      });
      void alpha;
      const c = this.race.car;
      // Render interpolation between prev and current.
      const a = this.loop.acc / FIXED_DT;
      const ix = this.prevCar.x + (c.x - this.prevCar.x) * a;
      const iy = this.prevCar.y + (c.y - this.prevCar.y) * a;
      const iz = this.prevCar.z + (c.z - this.prevCar.z) * a;
      this.wheelSpin += (c.speedKmh / 3.6) * dt * 2;
      poseCar(this.playerRig, ix, iy, iz, c.yaw, c.pitch, c.roll + (c.loopFlip ? Math.PI : 0), 0, this.wheelSpin);
      // Ghost rig.
      if (this.ghostRig) {
        this.ghostRig.group.visible = this.ghostActive && !!this.ghostRace;
        if (this.ghostRace && this.ghostActive) {
          const g = this.ghostRace.car;
          poseCar(this.ghostRig, g.x, g.y, g.z, g.yaw, g.pitch, g.roll + (g.loopFlip ? Math.PI : 0), 0, this.wheelSpin);
        }
      }
      // Camera.
      if (this.race.phase === 'sweep') {
        const f = Math.min(1, this.race.phaseT / 1.2);
        this.cam.sweep(f, c.x, c.y, c.z, c.yaw);
      } else if (this.race.phase === 'countdown') {
        const sy = Math.sin(c.yaw);
        const cy = Math.cos(c.yaw);
        this.cam.camera.position.set(c.x - sy * 5.5, c.y + 1.9, c.z - cy * 5.5);
        this.cam.camera.lookAt(c.x + sy * 3, c.y + 0.8, c.z + cy * 3);
      } else {
        this.cam.update(dt, c.x, c.y, c.z, c.yaw, c.speedKmh, c.boostT > 0 && c.boostKind === 'turbo', c.landingShake, () => 1);
        c.landingShake = Math.max(0, c.landingShake - dt * 2);
      }
      // HUD.
      this.hud.setTimer(this.race.phase === 'finished' ? this.race.finishTime : this.race.time);
      this.hud.setCps(this.race.checkpointsPassed, this.race.checkpointCount);
      this.hud.setSpeed(c.speedKmh, c.boostT > 0 ? c.boostT / (c.boostKind === 'turbo' ? 1.2 : 1.0) : 0);
      this.hud.tickSplit(dt);
      this.hud.engineOff(c.engineOffT > 0);
      this.hud.stuckHint(this.race.stuckT > 2 && this.race.phase === 'racing');
      if (this.progress.settings.showFps) this.hud.fps(true, this.fpsText);
      else this.hud.fps(false, '');
      // Audio.
      this.audio.engineUpdate(c.speedKmh, this.race.phase === 'racing' ? 1 : 0);
      this.audio.squeal(c.drifting && this.race.phase === 'racing');
      if (c.wallImpact > 0.3 && now - this.lastWallSfx > 300) {
        this.audio.wallThud();
        this.lastWallSfx = now;
      }
      if (c.boostT > 0 && !this.wasBoosting) this.audio.boost();
      this.wasBoosting = c.boostT > 0;
      if (this.playerRig) {
        const m = this.playerRig.boostGlow.material as THREE.MeshBasicMaterial;
        m.opacity = c.boostT > 0 ? 0.6 : 0;
      }
      // Particles.
      if (this.progress.settings.quality !== 'low') {
        if (c.drifting) {
          this.particles.driftSmoke(c.x - Math.sin(c.yaw) * 1.2, c.y - 0.2, c.z - Math.cos(c.yaw) * 1.2);
        }
        if (c.boostT > 0) {
          this.particles.boostFlame(c.x, c.y, c.z, Math.sin(c.yaw), Math.cos(c.yaw));
        }
        this.particles.update(dt);
      }
      // Adaptive quality.
      this.scenes.adapt(dt * 1000, dt);
    }
    this.scenes.renderer.render(this.scenes.scene, this.cam.camera);
  }
}

function medalRank(m: string): number {
  return m === 'author' ? 0 : m === 'gold' ? 1 : m === 'silver' ? 2 : 3;
}

function bootDeepLink(game: Game): void {
  const { t, g } = parseHash();
  if (t && getTrack(t)) {
    if (g && decodeGhost(g)) {
      game.showTracks();
      game.startRace(t, false, g);
    } else if (g) {
      game.showTracks();
      game.startRace(t, false, null);
      game.screens.toast('This challenge link is broken');
    } else {
      game.showTracks();
    }
  }
}

const game = new Game();
game.boot();
// Deep link after first frame setup.
if (!isMobileGate()) {
  const { t } = parseHash();
  if (t && getTrack(t)) {
    // If only #t (share link): open straight to that track card.
    game.showTracks();
  }
  bootDeepLink(game);
}
