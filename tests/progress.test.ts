import { describe, it, expect } from 'vitest';
import { loadProgress } from '../src/game/progress';

function memStorage(initial: Record<string, string> = {}): Storage {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k]! : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: (i: number) => Object.keys(data)[i] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  };
}

describe('progress schema', () => {
  it('loads defaults when empty', () => {
    const p = loadProgress(memStorage());
    expect(p.version).toBe(1);
    expect(p.tracks).toEqual({});
  });

  it('resets cleanly on corrupt data', () => {
    for (const bad of ['{oops', '[1,2,3]', '"str"', 'null', '{"version":2}', '{"version":1,"tracks":{"a":5}}']) {
      const p = loadProgress(memStorage({ 'kerb.v1': bad }));
      expect(p.version).toBe(1);
      expect(p.tracks).toEqual({});
    }
  });

  it('keeps valid entries, drops invalid ones', () => {
    const raw = JSON.stringify({
      version: 1,
      tracks: {
        'canyon-1': { best: 21.5, medal: 'gold', bestGhost: 'abc', splits: [5, 10] },
        bad: { best: 'fast', medal: 'platinum' },
      },
      settings: { quality: 'ultra', renderScale: 99, units: 'mph' },
    });
    const p = loadProgress(memStorage({ 'kerb.v1': raw }));
    expect(p.tracks['canyon-1']?.best).toBe(21.5);
    expect(p.tracks['bad']).toBeUndefined();
    expect(p.settings.quality).toBe('medium');
    expect(p.settings.units).toBe('mph');
  });
});
