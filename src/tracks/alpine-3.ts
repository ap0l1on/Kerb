// Whiteout — Elite / Alpine. A long ice descent, walls only on the outside, a wall-ride.
import type { TrackDef } from '../track/types';
import { P, medals } from './shared';

export const ALPINE_3: TrackDef = {
  id: 'alpine-3',
  name: 'Whiteout',
  group: 'elite',
  theme: 'alpine',
  path: [
    P(0, 50, 0, 14),
    P(0, 48, -150, 14),
    P(30, 44, -270, 13),
    P(100, 38, -350, 13, 10),
    P(180, 32, -370, 12, 0),
    P(240, 26, -320, 12, -75), // wall-ride (left wall becomes floor)
    P(270, 20, -230, 12, -75),
    P(250, 14, -140, 12, 0),
    P(190, 8, -80, 13),
    P(110, 3, -60, 13),
    P(40, 0, -100, 14),
    P(0, 0, -180, 14),
  ],
  closed: false,
  gaps: [],
  surfaces: [{ from: 0.1, to: 0.7, type: 'ice' }],
  zones: [{ at: 0.75, len: 25, type: 'boost' }],
  walls: [
    { from: 0, to: 0.25, side: 'both', height: 1.2 },
    { from: 0.25, to: 0.7, side: 'left', height: 1.6 },
    { from: 0.4, to: 0.6, side: 'right', height: 1.6 },
    { from: 0.7, to: 1, side: 'both', height: 1.2 },
  ],
  checkpoints: [0.3, 0.5, 0.7, 0.88],
  start: 0.01,
  finish: 0.99,
  killY: -20,
  props: [
    { kind: 'pine', t: 0.1, side: 24, up: 0, s: 1.3, ry: 0.3 },
    { kind: 'pine', t: 0.4, side: -26, up: 0, s: 1.5, ry: 1.4 },
    { kind: 'pine', t: 0.8, side: 22, up: 0, s: 1.2, ry: 2.5 },
    { kind: 'snowrock', t: 0.55, side: 24, up: 0, s: 1.6, ry: 0.7 },
    { kind: 'arch', t: 0.3, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.5, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.7, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.88, side: 0, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(39.933),
};
