// Mesa Run — Rookie / Canyon. A gentle jump over a small gap, S-bends, 1 boost.
import type { TrackDef } from '../track/types';
import { P, medals, wallsAll } from './shared';

export const CANYON_2: TrackDef = {
  id: 'canyon-2',
  name: 'Mesa Run',
  group: 'rookie',
  theme: 'canyon',
  path: [
    P(0, 0, 0, 14),
    P(0, 0, -140, 14),
    P(-30, 1, -250, 13),
    P(-90, 3, -330, 13),
    P(-80, 6, -430, 12), // ramp up
    P(-40, 6, -520, 12), // take-off edge
    P(-28, 4, -548, 12), // landing (lower, ~30 m past take-off)
    P(10, 3, -600, 12),
    P(70, 2, -670, 13),
    P(150, 1, -700, 13),
    P(230, 0, -660, 13),
    P(270, 0, -580, 14),
    P(250, 0, -480, 14),
  ],
  closed: false,
  gaps: [{ from: 0.482, to: 0.504 }],
  surfaces: [],
  zones: [{ at: 0.62, len: 25, type: 'boost' }],
  walls: wallsAll(1.2),
  checkpoints: [0.35, 0.55, 0.8],
  start: 0.01,
  finish: 0.99,
  killY: -30,
  props: [
    { kind: 'mesa', t: 0.3, side: -45, up: 0, s: 2.6, ry: 0.2 },
    { kind: 'mesa', t: 0.7, side: 50, up: 0, s: 3.2, ry: 2.4 },
    { kind: 'cactus', t: 0.15, side: 15, up: 0, s: 1.1, ry: 1.0 },
    { kind: 'cactus', t: 0.85, side: -16, up: 0, s: 0.9, ry: 0.3 },
    { kind: 'rock', t: 0.5, side: 18, up: 0, s: 1.4, ry: 1.1 },
    { kind: 'arch', t: 0.35, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.55, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.8, side: 0, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(25.567),
};
