// Cliffside — Pro / Coast. A jump off a cliff edge onto a lower road.
import type { TrackDef } from '../track/types';
import { P, medals } from './shared';

export const COAST_2: TrackDef = {
  id: 'coast-2',
  name: 'Cliffside',
  group: 'pro',
  theme: 'coast',
  path: [
    P(0, 0, 0, 14),
    P(0, 0, -150, 14),
    P(30, 2, -270, 13),
    P(100, 6, -360, 13),
    P(190, 10, -410, 12), // cliff top, take-off
    P(212, 5, -430, 12), // landing below (~30 m out, 5 m down)
    P(260, 2, -470, 12),
    P(300, 0, -560, 13),
    P(280, 0, -660, 13),
    P(210, 0, -730, 13),
    P(120, 0, -740, 14),
    P(40, 0, -680, 14),
  ],
  closed: false,
  gaps: [{ from: 0.425, to: 0.446 }],
  surfaces: [],
  zones: [{ at: 0.6, len: 25, type: 'boost' }],
  walls: [
    { from: 0, to: 0.35, side: 'left', height: 1.2 },
    { from: 0.35, to: 0.5, side: 'both', height: 1.4 },
    { from: 0.5, to: 1, side: 'both', height: 1.2 },
  ],
  checkpoints: [0.33, 0.55, 0.8],
  start: 0.01,
  finish: 0.99,
  killY: -25,
  props: [
    { kind: 'palm', t: 0.15, side: 17, up: 0, s: 1.0, ry: 0.8 },
    { kind: 'palm', t: 0.7, side: -18, up: 0, s: 1.1, ry: 2.2 },
    { kind: 'lighthouse', t: 0.35, side: -60, up: -8, s: 1.0, ry: 0 },
    { kind: 'buoy', t: 0.45, side: 40, up: -8, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.33, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.55, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.8, side: 0, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(24.2),
};
