import type { Bounds2D, Point2D } from './camera-2d';

export interface SketchLine {
  readonly kind: 'line';
  readonly id: string;
  readonly start: Point2D;
  readonly end: Point2D;
}

export interface SketchCircle {
  readonly kind: 'circle';
  readonly id: string;
  readonly center: Point2D;
  readonly radius: number;
}

export type SketchEntity = SketchLine | SketchCircle;

const spokeLines: readonly SketchLine[] = Array.from({ length: 6 }, (_, index) => {
  const angle = (index * Math.PI) / 3;
  return {
    kind: 'line',
    id: `spoke-${index + 1}`,
    start: { x: Math.cos(angle) * 38, y: Math.sin(angle) * 38 },
    end: { x: Math.cos(angle) * 132, y: Math.sin(angle) * 132 },
  };
});

export const SPOKE_SKETCH: Readonly<{
  name: 'Spoke sketch';
  bounds: Bounds2D;
  entities: readonly SketchEntity[];
}> = {
  name: 'Spoke sketch',
  bounds: { minX: -165, minY: -165, maxX: 165, maxY: 165 },
  entities: [
    { kind: 'circle', id: 'outer-ring', center: { x: 0, y: 0 }, radius: 150 },
    { kind: 'circle', id: 'inner-ring', center: { x: 0, y: 0 }, radius: 132 },
    { kind: 'circle', id: 'center-hub', center: { x: 0, y: 0 }, radius: 38 },
    { kind: 'circle', id: 'center-bore', center: { x: 0, y: 0 }, radius: 16 },
    ...spokeLines,
  ],
};
