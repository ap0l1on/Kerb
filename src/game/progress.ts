// localStorage progress: schema-validated, try/catch, clean reset on corruption.
import { STORAGE_KEY } from '../config';

export interface TrackProgress {
  best: number | null;
  medal: 'author' | 'gold' | 'silver' | 'bronze' | null;
  bestGhost: string | null; // base64url RLE input code
  splits: number[] | null; // best-run checkpoint split times
}

export interface Progress {
  version: 1;
  tracks: Record<string, TrackProgress>;
  settings: {
    quality: 'low' | 'medium' | 'high';
    renderScale: number;
    fovOffset: number;
    showFps: boolean;
    units: 'kmh' | 'mph';
    ghostOn: boolean;
    master: number;
    engine: number;
    sfx: number;
    sensitivity: number;
    bindings: Record<string, string> | null;
  };
}

function defaultProgress(): Progress {
  return {
    version: 1,
    tracks: {},
    settings: {
      quality: 'medium',
      renderScale: 1.0,
      fovOffset: 0,
      showFps: false,
      units: 'kmh',
      ghostOn: true,
      master: 0.6,
      engine: 0.8,
      sfx: 0.8,
      sensitivity: 1.0,
      bindings: null,
    },
  };
}

function validMedal(m: unknown): m is TrackProgress['medal'] {
  return m === null || m === 'author' || m === 'gold' || m === 'silver' || m === 'bronze';
}

function sanitize(raw: unknown): Progress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const out = defaultProgress();
  if (typeof o.tracks === 'object' && o.tracks !== null) {
    for (const [k, v] of Object.entries(o.tracks as Record<string, unknown>)) {
      if (typeof v !== 'object' || v === null) continue;
      const t = v as Record<string, unknown>;
      if (!((t.best === null || (typeof t.best === 'number' && Number.isFinite(t.best))) && validMedal(t.medal))) continue;
      out.tracks[k] = {
        best: t.best as number | null,
        medal: t.medal as TrackProgress['medal'],
        bestGhost: typeof t.bestGhost === 'string' ? (t.bestGhost as string) : null,
        splits: Array.isArray(t.splits) && (t.splits as unknown[]).every((n) => typeof n === 'number') ? (t.splits as number[]) : null,
      };
    }
  }
  if (typeof o.settings === 'object' && o.settings !== null) {
    const s = o.settings as Record<string, unknown>;
    const st = out.settings;
    if (s.quality === 'low' || s.quality === 'medium' || s.quality === 'high') st.quality = s.quality;
    if (typeof s.renderScale === 'number' && s.renderScale >= 0.5 && s.renderScale <= 1) st.renderScale = s.renderScale;
    if (typeof s.fovOffset === 'number' && s.fovOffset >= -5 && s.fovOffset <= 10) st.fovOffset = s.fovOffset;
    if (typeof s.showFps === 'boolean') st.showFps = s.showFps;
    if (s.units === 'kmh' || s.units === 'mph') st.units = s.units;
    if (typeof s.ghostOn === 'boolean') st.ghostOn = s.ghostOn;
    for (const k of ['master', 'engine', 'sfx'] as const) {
      if (typeof s[k] === 'number' && (s[k] as number) >= 0 && (s[k] as number) <= 1) st[k] = s[k] as number;
    }
    if (typeof s.sensitivity === 'number' && (s.sensitivity as number) >= 0.5 && (s.sensitivity as number) <= 2) {
      st.sensitivity = s.sensitivity as number;
    }
    if (s.bindings === null || (typeof s.bindings === 'object' && s.bindings !== null)) {
      st.bindings = s.bindings as Record<string, string> | null;
    }
  }
  return out;
}

export function loadProgress(storage: Storage | null = null): Progress {
  try {
    const ls = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) return defaultProgress();
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed: unknown = JSON.parse(raw);
    return sanitize(parsed) ?? defaultProgress();
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: Progress, storage: Storage | null = null): void {
  try {
    const ls = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) return;
    ls.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function resetProgress(storage: Storage | null = null): Progress {
  const p = defaultProgress();
  try {
    const ls = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    ls?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return p;
}

// ---- Unlock rules ----
export function groupUnlocked(group: 'rookie' | 'pro' | 'elite', p: Progress, trackGroups: { id: string; group: string }[]): boolean {
  if (group === 'rookie') return true;
  const inGroup = (g: string) => trackGroups.filter((t) => t.group === g);
  if (group === 'pro') {
    return inGroup('rookie').every((t) => {
      const m = p.tracks[t.id]?.medal;
      return m === 'bronze' || m === 'silver' || m === 'gold' || m === 'author';
    });
  }
  // elite: gold (or author) on 3 pro tracks
  const pro = inGroup('pro');
  const golds = pro.filter((t) => {
    const m = p.tracks[t.id]?.medal;
    return m === 'gold' || m === 'author';
  }).length;
  return golds >= 3;
}
