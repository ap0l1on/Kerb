// Overclock — Elite / Neon. A full loop, straight into a turbo. Engine-off before the loop.
import type { TrackDef } from '../track/types';
import { P, medals, wallsAll, loopPts } from './shared';

// (loop points come from shared.loopPts: radius 16, every 15 degrees)

export const NEON_2: TrackDef = {
  id: 'neon-2',
  name: 'Overclock',
  group: 'elite',
  theme: 'neon',
  path: [
    P(0, 0, 0, 14),
    P(0, 0, -150, 14),
    P(0, 0, -260, 13),
    P(0, 0, -290, 13),
    P(0, 1, -315, 13),
    P(0, 2.5, -328, 12),
    P(0, 4.5, -336, 12),
    ...loopPts(0, -340, 12),
    P(0, 4, -345, 12),
    P(0, 2, -352, 12),
    P(0, 0, -365, 13),
    P(0, 0, -400, 13),
    P(0, 0, -430, 13),
    P(30, 0, -540, 13),
    P(100, 2, -620, 12, 8),
    P(190, 2, -640, 12, 0),
    P(260, 1, -590, 13),
    P(280, 0, -500, 14),
    P(240, 0, -410, 14),
  ],
  closed: false,
  gaps: [],
  surfaces: [],
  zones: [
    { at: 0.22, len: 20, type: 'engineOff' },
    { at: 0.5, len: 30, type: 'turbo' },
  ],
  walls: wallsAll(1.4),
  checkpoints: [0.3, 0.48, 0.68, 0.86],
  start: 0.01,
  finish: 0.99,
  killY: -25,
  props: [
    { kind: 'pylon', t: 0.1, side: 16, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.3, side: 0, up: 0, s: 1.2, ry: 0 },
    { kind: 'glowarch', t: 0.48, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.68, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.86, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'pylon', t: 0.6, side: -16, up: 0, s: 1.0, ry: 0 },
    { kind: 'pylon', t: 0.9, side: 16, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(22.342),
};
