// Registry of all 12 handcrafted tracks.
import type { TrackDef } from '../track/types';
import { CANYON_1 } from './canyon-1';
import { CANYON_2 } from './canyon-2';
import { COAST_1 } from './coast-1';
import { ALPINE_1 } from './alpine-1';
import { CANYON_3 } from './canyon-3';
import { COAST_2 } from './coast-2';
import { NEON_1 } from './neon-1';
import { ALPINE_2 } from './alpine-2';
import { NEON_2 } from './neon-2';
import { CANYON_4 } from './canyon-4';
import { ALPINE_3 } from './alpine-3';
import { NEON_3 } from './neon-3';

export const TRACKS: TrackDef[] = [
  CANYON_1, CANYON_2, COAST_1, ALPINE_1,
  CANYON_3, COAST_2, NEON_1, ALPINE_2,
  NEON_2, CANYON_4, ALPINE_3, NEON_3,
];

export function getTrack(id: string): TrackDef | undefined {
  return TRACKS.find((t) => t.id === id);
}
