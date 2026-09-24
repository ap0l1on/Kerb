// Dust Devil — Elite / Canyon. A long dirt drift section on a narrow road, two jumps.
import type { TrackDef } from '../track/types';
import { P, medals, wallsAll } from './shared';

export const CANYON_4: TrackDef = {
  id: 'canyon-4',
  name: 'Dust Devil',
  group: 'elite',
  theme: 'canyon',
  path: [
    P(0, 0, 0, 13),
    P(0, 0, -140, 13),
    P(-40, 1, -250, 12),
    P(-110, 3, -330, 11), // ramp
    P(-150, 4, -420, 11), // take-off
    P(-146, 2, -448, 11), // landing (~28 m out, 2 m down)
    P(-90, 1, -580, 10),
    P(-10, 0, -620, 10, 6),
    P(70, 0, -590, 10, 8),
    P(120, 1, -520, 10, 0),
    P(130, 3, -440, 10), // ramp 2
    P(100, 3, -360, 10), // take-off 2
    P(80, 1, -336, 11), // landing 2 (~30 m out, 2 m down)
    P(-30, 0, -250, 12),
    P(-70, 0, -160, 13),
    P(-60, 0, -60, 13),
  ],
  closed: false,
  gaps: [
    { from: 0.322, to: 0.343 },
    { from: 0.735, to: 0.756 },
  ],
  surfaces: [{ from: 0.32, to: 0.6, type: 'dirt' }],
  zones: [
    { at: 0.08, len: 25, type: 'boost' },
    { at: 0.72, len: 25, type: 'boost' },
  ],
  walls: wallsAll(1.2),
  checkpoints: [0.28, 0.5, 0.7, 0.88],
  start: 0.01,
  finish: 0.99,
  killY: -30,
  props: [
    { kind: 'mesa', t: 0.35, side: 50, up: 0, s: 3.0, ry: 1.1 },
    { kind: 'mesa', t: 0.65, side: -50, up: 0, s: 2.6, ry: 2.2 },
    { kind: 'cactus', t: 0.15, side: 14, up: 0, s: 1.0, ry: 0.9 },
    { kind: 'cactus', t: 0.55, side: -13, up: 0, s: 1.2, ry: 2.8 },
    { kind: 'rock', t: 0.45, side: 18, up: 0, s: 1.6, ry: 0.4 },
    { kind: 'arch', t: 0.28, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.5, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.7, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.88, side: 0, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(33.75),
};
