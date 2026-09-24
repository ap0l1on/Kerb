import { describe, it, expect } from 'vitest';
import { groupUnlocked, type Progress } from '../src/game/progress';
import { TRACKS } from '../src/tracks/index';

const mini = TRACKS.map((t) => ({ id: t.id, group: t.group }));

function prog(medals: Record<string, 'bronze' | 'gold' | 'author'>): Progress {
  return {
    version: 1,
    tracks: Object.fromEntries(
      Object.entries(medals).map(([id, medal]) => [id, { best: 10, medal, bestGhost: null, splits: null }]),
    ),
    settings: {
      quality: 'medium', renderScale: 1, fovOffset: 0, showFps: false,
      units: 'kmh', ghostOn: true, master: 0.6, engine: 0.8, sfx: 0.8, sensitivity: 1, bindings: null,
    },
  };
}

describe('unlocks', () => {
  it('rookie always open; pro needs bronze on all 4 rookie', () => {
    expect(groupUnlocked('rookie', prog({}), mini)).toBe(true);
    expect(groupUnlocked('pro', prog({}), mini)).toBe(false);
    const rookie = TRACKS.filter((t) => t.group === 'rookie');
    const p = prog(Object.fromEntries(rookie.map((t) => [t.id, 'bronze' as const])));
    expect(groupUnlocked('pro', p, mini)).toBe(true);
  });

  it('elite needs gold on 3 pro tracks', () => {
    const pro = TRACKS.filter((t) => t.group === 'pro');
    const two = prog(Object.fromEntries(pro.slice(0, 2).map((t) => [t.id, 'gold' as const])));
    expect(groupUnlocked('elite', two, mini)).toBe(false);
    const three = prog(Object.fromEntries(pro.slice(0, 3).map((t) => [t.id, 'gold' as const])));
    expect(groupUnlocked('elite', three, mini)).toBe(true);
  });
});
