import { describe, it, expect } from 'vitest';
import { medalForTime } from '../src/game/medals';
import { medals } from '../src/tracks/shared';

describe('medals', () => {
  it('gold = author*1.08, silver *1.20, bronze *1.40 rounded UP to 0.1s', () => {
    const m = medals(30.0);
    expect(m.author).toBe(30.0);
    expect(m.gold).toBe(32.4);
    expect(m.silver).toBe(36.0);
    expect(m.bronze).toBe(42.0);
    const m2 = medals(24.567);
    expect(m2.gold).toBe(Math.ceil(24.567 * 1.08 * 10) / 10);
    expect(m2.silver).toBe(Math.ceil(24.567 * 1.2 * 10) / 10);
    expect(m2.bronze).toBe(Math.ceil(24.567 * 1.4 * 10) / 10);
  });

  it('medalForTime picks the best earned medal', () => {
    const m = medals(30.0);
    expect(medalForTime(29.9, m)).toBe('author');
    expect(medalForTime(30.0, m)).toBe('author');
    expect(medalForTime(32.4, m)).toBe('gold');
    expect(medalForTime(36.0, m)).toBe('silver');
    expect(medalForTime(42.0, m)).toBe('bronze');
    expect(medalForTime(42.1, m)).toBeNull();
  });
});
