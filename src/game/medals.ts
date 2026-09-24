// Medal calculation + formatting.
import type { Medals } from '../track/types';

export type MedalId = 'author' | 'gold' | 'silver' | 'bronze' | null;

export function medalForTime(time: number, medals: Medals): MedalId {
  if (time <= medals.author) return 'author';
  if (time <= medals.gold) return 'gold';
  if (time <= medals.silver) return 'silver';
  if (time <= medals.bronze) return 'bronze';
  return null;
}

/** Format seconds as m:ss.mmm */
export function formatTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return '—';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t * 1000) % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatSplit(d: number): string {
  const sign = d < 0 ? '−' : '+';
  return `${sign}${Math.abs(d).toFixed(3)}`;
}

export const MEDAL_EMOJI: Record<string, string> = {
  author: '◆',
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
};
