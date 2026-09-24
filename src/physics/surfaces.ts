// Grip table per surface.
export type SurfaceType = 'road' | 'dirt' | 'ice' | 'grass' | 'boost' | 'turbo';

export interface SurfaceProps {
  grip: number;
  drag: number;
  sound: 'road' | 'dirt' | 'ice' | 'grass' | 'boost';
}

export const SURFACES: Record<SurfaceType, SurfaceProps> = {
  road: { grip: 1.0, drag: 1.0, sound: 'road' },
  dirt: { grip: 0.7, drag: 1.15, sound: 'dirt' },
  ice: { grip: 0.25, drag: 0.95, sound: 'ice' },
  grass: { grip: 0.6, drag: 2.2, sound: 'grass' },
  boost: { grip: 1.0, drag: 1.0, sound: 'boost' },
  turbo: { grip: 1.0, drag: 1.0, sound: 'boost' },
};
