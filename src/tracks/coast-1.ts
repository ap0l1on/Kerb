// Harbour Loop — Rookie / Coast. A flowing seaside chicane.
import type { TrackDef } from '../track/types';
import { P, medals } from './shared';

export const COAST_1: TrackDef = {
  id: 'coast-1',
  name: 'Harbour Loop',
  group: 'rookie',
  theme: 'coast',
  path: [
    P(0, 0, 0, 14),
    P(0, 0, -130, 14),
    P(20, 0, -230, 13),
    P(80, 1, -300, 13, 6),
    P(160, 1, -320, 12, 0),
    P(220, 2, -280, 12, -6),
    P(240, 2, -200, 12, 0),
    P(200, 1, -120, 13),
    P(120, 0, -80, 14),
    P(40, 0, -40, 14),
    P(-20, 0, 40, 14),
  ],
  closed: false,
  gaps: [],
  surfaces: [],
  zones: [{ at: 0.3, len: 22, type: 'boost' }],
  walls: [
    { from: 0, to: 0.35, side: 'both', height: 1.2 },
    { from: 0.35, to: 0.65, side: 'left', height: 1.2 },
    { from: 0.65, to: 1, side: 'both', height: 1.2 },
  ],
  checkpoints: [0.3, 0.55, 0.8],
  start: 0.01,
  finish: 0.99,
  killY: -30,
  props: [
    { kind: 'palm', t: 0.2, side: 18, up: 0, s: 1.0, ry: 0.5 },
    { kind: 'palm', t: 0.5, side: -20, up: 0, s: 1.2, ry: 2.0 },
    { kind: 'palm', t: 0.75, side: 16, up: 0, s: 1.0, ry: 4.0 },
    { kind: 'lighthouse', t: 0.45, side: 60, up: 0, s: 1.0, ry: 0 },
    { kind: 'buoy', t: 0.4, side: -45, up: -2, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.3, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.55, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.8, side: 0, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(18.558),
};
