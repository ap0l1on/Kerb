// Night Shift — Pro / Neon. A tight banked spiral up 3 levels, turbo at exit.
import type { TrackDef } from '../track/types';
import { P, medals, wallsAll } from './shared';

export const NEON_1: TrackDef = {
  id: 'neon-1',
  name: 'Night Shift',
  group: 'pro',
  theme: 'neon',
  path: [
    P(0, 0, 0, 14),
    P(0, 0, -150, 14),
    P(40, 2, -260, 13),
    P(120, 6, -320, 12, 10),
    P(190, 10, -280, 12, 14),
    P(210, 14, -200, 12, 10),
    P(170, 18, -130, 12, 12),
    P(100, 22, -110, 12, 14),
    P(50, 26, -150, 12, 10),
    P(40, 30, -220, 13, 0),
    P(80, 30, -300, 13),
    P(160, 30, -340, 14),
    P(240, 30, -300, 14),
  ],
  closed: false,
  gaps: [],
  surfaces: [],
  zones: [{ at: 0.86, len: 25, type: 'turbo' }],
  walls: wallsAll(1.4),
  checkpoints: [0.3, 0.55, 0.8],
  start: 0.01,
  finish: 0.99,
  killY: -20,
  props: [
    { kind: 'pylon', t: 0.15, side: 16, up: 0, s: 1.0, ry: 0 },
    { kind: 'pylon', t: 0.4, side: -16, up: 0, s: 1.0, ry: 0 },
    { kind: 'pylon', t: 0.6, side: 16, up: 0, s: 1.0, ry: 0 },
    { kind: 'pylon', t: 0.85, side: -16, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.3, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.55, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.8, side: 0, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(24.3),
};
