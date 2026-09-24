// First Frost — Rookie / Alpine. A short, safe ice patch on a straight.
import type { TrackDef } from '../track/types';
import { P, medals, wallsAll } from './shared';

export const ALPINE_1: TrackDef = {
  id: 'alpine-1',
  name: 'First Frost',
  group: 'rookie',
  theme: 'alpine',
  path: [
    P(0, 0, 0, 14),
    P(0, 0, -150, 14),
    P(0, 0, -280, 14),
    P(30, 1, -390, 13),
    P(100, 2, -460, 13),
    P(180, 2, -480, 13),
    P(250, 1, -430, 13),
    P(280, 0, -340, 14),
    P(260, 0, -230, 14),
    P(200, 0, -140, 14),
  ],
  closed: false,
  gaps: [],
  surfaces: [{ from: 0.3, to: 0.45, type: 'ice' }],
  zones: [{ at: 0.6, len: 22, type: 'boost' }],
  walls: wallsAll(1.2),
  checkpoints: [0.35, 0.6, 0.85],
  start: 0.01,
  finish: 0.99,
  killY: -30,
  props: [
    { kind: 'pine', t: 0.15, side: 20, up: 0, s: 1.1, ry: 0.4 },
    { kind: 'pine', t: 0.5, side: -22, up: 0, s: 1.4, ry: 1.8 },
    { kind: 'pine', t: 0.8, side: 18, up: 0, s: 1.0, ry: 3.1 },
    { kind: 'snowrock', t: 0.4, side: 24, up: 0, s: 1.2, ry: 0.9 },
    { kind: 'arch', t: 0.35, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.6, side: 0, up: 0, s: 1.0, ry: 0 },
    { kind: 'arch', t: 0.85, side: 0, up: 0, s: 1.0, ry: 0 },
  ],
  medals: medals(23.733),
};
