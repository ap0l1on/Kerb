// Kerbstone — Elite / Neon. The boss: jump + loop + wall-ride + ice. 6 checkpoints.
import type { TrackDef } from '../track/types';
import { P, medals, loopPts } from './shared';

export const NEON_3: TrackDef = {
  id: 'neon-3',
  name: 'Kerbstone',
  group: 'elite',
  theme: 'neon',
  path: [
    P(0, 0, 0, 14),
    P(0, 0, -150, 14),
    P(-20, 2, -260, 13),
    P(-60, 5, -350, 12), // ramp
    P(-60, 5, -450, 12), // take-off
    P(-52, 3, -478, 12), // landing (~29 m out, 2 m down)
    P(40, 0, -620, 13),
    P(60, 0, -670, 13),
    P(60, 1, -700, 12),
    P(60, 2.5, -715, 12),
    P(60, 4, -724, 12),
    ...loopPts(60, -730, 12),
    P(60, 4, -735, 12),
    P(60, 2, -742, 12),
    P(60, 0, -755, 13),
    P(60, 0, -790, 13),
    P(80, 0, -830, 13),
    P(140, 2, -910, 14, 75), // wall-ride (wide for margin)
    P(220, 4, -930, 14, 75),
    P(290, 4, -880, 14, 0),
    P(320, 2, -800, 13),
    P(300, 0, -710, 13),
    P(240, 0, -650, 14),
  ],
  closed: false,
  gaps: [{ from: 0.292, to: 0.306 }],
  surfaces: [
    { from: 0.6, to: 0.68, type: 'ice' },
    { from: 0.8, to: 0.84, type: 'ice' },
  ],
  zones: [
    { at: 0.32, len: 25, type: 'boost' },
    { at: 0.82, len: 20, type: 'reset' },
    { at: 0.87, len: 25, type: 'turbo' },
  ],
  walls: [
    { from: 0, to: 0.64, side: 'both', height: 1.4 },
    // wall-ride: tall readable wall on the upper (left) edge, past the transition
    { from: 0.64, to: 0.83, side: 'left', height: 6 },
    { from: 0.64, to: 0.83, side: 'right', height: 1.4 },
    { from: 0.83, to: 1, side: 'both', height: 1.4 },
  ],
  checkpoints: [0.18, 0.33, 0.48, 0.62, 0.76, 0.9],
  start: 0.01,
  finish: 0.99,
  killY: -25,
  props: [
    { kind: 'pylon', t: 0.08, side: 16, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.18, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.33, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.48, side: 0, up: 0, s: 1.2, ry: 0 },
    { kind: 'glowarch', t: 0.62, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.76, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'glowarch', t: 0.9, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'pylon', t: 0.7, side: -16, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(41.508),
};
