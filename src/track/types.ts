// Track definition types. Every track is a handcrafted TrackDef in src/tracks/.
export type ThemeId = 'canyon' | 'coast' | 'alpine' | 'neon';
export type GroupId = 'rookie' | 'pro' | 'elite';

export interface PathPoint {
  p: [number, number, number];
  w: number;
  bank: number; // degrees, + banks right side down
}

export interface GapDef {
  from: number;
  to: number;
}
export interface SurfaceDef {
  from: number;
  to: number;
  type: 'dirt' | 'ice' | 'grass';
}
export type ZoneType = 'boost' | 'turbo' | 'engineOff' | 'reset';
export interface ZoneDef {
  at: number; // t along path
  len: number; // metres
  type: ZoneType;
}
export interface WallDef {
  from: number;
  to: number;
  side: 'left' | 'right' | 'both';
  height: number;
}
export interface PropDef {
  kind: string;
  t: number; // position along path
  side: number; // lateral metres from centre (+ right)
  up: number; // vertical offset
  s: number; // scale
  ry: number; // yaw radians
}

export interface Medals {
  author: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface TrackDef {
  id: string;
  name: string;
  group: GroupId;
  theme: ThemeId;
  path: PathPoint[];
  closed: boolean;
  gaps: GapDef[];
  surfaces: SurfaceDef[];
  zones: ZoneDef[];
  walls: WallDef[];
  checkpoints: number[];
  start: number;
  finish: number;
  killY: number;
  props: PropDef[];
  medals: Medals;
}

// A sampled point on the centreline ribbon.
export interface TrackSample {
  t: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number; // tangent (unit)
  sx: number;
  sy: number;
  sz: number; // side vector (unit, right)
  ux: number;
  uy: number;
  uz: number; // up vector
  width: number;
  bank: number;
  surface: 'road' | 'dirt' | 'ice' | 'grass';
  zone: ZoneType | null;
  gap: boolean;
  wallL: number; // wall height left (0 = none)
  wallR: number;
}
