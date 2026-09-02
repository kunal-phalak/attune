import type { ConstraintInput } from './constraints';
import {
  normalizedAngle,
  positiveArcSweep,
  type ArcEntity,
  type GeometryInput,
  type SketchPoint2D,
} from './geometry';
import type { GroupInput } from './groups';

export interface PrimitiveCreation {
  readonly entities: readonly GeometryInput[];
  readonly constraints: readonly ConstraintInput[];
  readonly group?: GroupInput;
}

export function lineCreation(
  id: string,
  start: SketchPoint2D,
  end: SketchPoint2D,
): PrimitiveCreation {
  return { entities: [{ id, kind: 'line', start, end }], constraints: [] };
}

export function polylineCreation(
  id: string,
  points: readonly SketchPoint2D[],
  autoConstrain = false,
): PrimitiveCreation {
  if (points.length < 2) throw new TypeError('A polyline requires at least two points.');
  const entities = points.slice(1).map(
    (end, index): GeometryInput => ({
      id: `${id}:line:${index + 1}`,
      kind: 'line',
      start: points[index],
      end,
    }),
  );
  const constraints: ConstraintInput[] = [];
  if (autoConstrain) {
    for (const entity of entities) {
      if (entity.kind !== 'line') continue;
      const dx = Math.abs(entity.end.x - entity.start.x);
      const dy = Math.abs(entity.end.y - entity.start.y);
      if (dy <= 1e-7) {
        constraints.push({
          id: `${id}:constraint:${entity.id}:horizontal`,
          type: 'horizontal',
          refs: [{ entityId: entity.id }],
        });
      } else if (dx <= 1e-7) {
        constraints.push({
          id: `${id}:constraint:${entity.id}:vertical`,
          type: 'vertical',
          refs: [{ entityId: entity.id }],
        });
      }
    }
  }
  return { entities, constraints };
}

export function rectangleCreation(
  id: string,
  first: SketchPoint2D,
  opposite: SketchPoint2D,
  options: { readonly centered?: boolean; readonly autoConstrain?: boolean } = {},
): PrimitiveCreation {
  const minimum = options.centered
    ? { x: first.x - Math.abs(opposite.x - first.x), y: first.y - Math.abs(opposite.y - first.y) }
    : { x: Math.min(first.x, opposite.x), y: Math.min(first.y, opposite.y) };
  const maximum = options.centered
    ? { x: first.x + Math.abs(opposite.x - first.x), y: first.y + Math.abs(opposite.y - first.y) }
    : { x: Math.max(first.x, opposite.x), y: Math.max(first.y, opposite.y) };
  if (minimum.x === maximum.x || minimum.y === maximum.y) {
    throw new TypeError('A rectangle requires non-zero width and height.');
  }
  const points = [
    { x: minimum.x, y: minimum.y },
    { x: maximum.x, y: minimum.y },
    { x: maximum.x, y: maximum.y },
    { x: minimum.x, y: maximum.y },
  ];
  const entities = points.map(
    (start, index): GeometryInput => ({
      id: `${id}:line:${index + 1}`,
      kind: 'line',
      name: `Rectangle edge ${index + 1}`,
      start,
      end: points[(index + 1) % points.length],
    }),
  );
  const constraints: ConstraintInput[] =
    options.autoConstrain === false
      ? []
      : entities.map((entity, index) => ({
          id: `${id}:constraint:${index + 1}`,
          type: index % 2 === 0 ? 'horizontal' : 'vertical',
          refs: [{ entityId: entity.id }],
        }));
  return {
    entities,
    constraints,
    group: {
      id: `${id}:group`,
      name: 'Rectangle',
      entityIds: entities.map(({ id: entityId }) => entityId),
      kind: 'group',
    },
  };
}

export function circleCreation(
  id: string,
  center: SketchPoint2D,
  edge: SketchPoint2D,
): PrimitiveCreation {
  const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
  if (radius <= 1e-9) throw new TypeError('A circle requires a non-zero radius.');
  return { entities: [{ id, kind: 'circle', center, radius }], constraints: [] };
}

export function threePointArcCreation(
  id: string,
  start: SketchPoint2D,
  through: SketchPoint2D,
  end: SketchPoint2D,
): PrimitiveCreation {
  const determinant =
    2 *
    (start.x * (through.y - end.y) + through.x * (end.y - start.y) + end.x * (start.y - through.y));
  if (Math.abs(determinant) <= 1e-9)
    throw new TypeError('A 3-point arc requires non-collinear points.');
  const startSquared = start.x * start.x + start.y * start.y;
  const throughSquared = through.x * through.x + through.y * through.y;
  const endSquared = end.x * end.x + end.y * end.y;
  const center = {
    x:
      (startSquared * (through.y - end.y) +
        throughSquared * (end.y - start.y) +
        endSquared * (start.y - through.y)) /
      determinant,
    y:
      (startSquared * (end.x - through.x) +
        throughSquared * (start.x - end.x) +
        endSquared * (through.x - start.x)) /
      determinant,
  };
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const startAngle = normalizedAngle(Math.atan2(start.y - center.y, start.x - center.x));
  const throughAngle = normalizedAngle(Math.atan2(through.y - center.y, through.x - center.x));
  const endAngle = normalizedAngle(Math.atan2(end.y - center.y, end.x - center.x));
  const forwardSweep = positiveArcSweep(startAngle, endAngle);
  const throughSweep = positiveArcSweep(startAngle, throughAngle);
  const entity: Omit<ArcEntity, 'version'> =
    throughSweep <= forwardSweep
      ? { id, kind: 'arc', center, radius, startAngle, endAngle: startAngle + forwardSweep }
      : {
          id,
          kind: 'arc',
          center,
          radius,
          startAngle: endAngle,
          endAngle: endAngle + positiveArcSweep(endAngle, startAngle),
        };
  return { entities: [entity], constraints: [] };
}

export function ellipseCreation(
  id: string,
  center: SketchPoint2D,
  majorPoint: SketchPoint2D,
  minorRadius: number,
): PrimitiveCreation {
  const majorRadius = Math.hypot(majorPoint.x - center.x, majorPoint.y - center.y);
  if (majorRadius <= 1e-9 || minorRadius <= 1e-9) {
    throw new TypeError('An ellipse requires non-zero major and minor radii.');
  }
  const major = Math.max(majorRadius, minorRadius);
  const minor = Math.min(majorRadius, minorRadius);
  const rotation =
    Math.atan2(majorPoint.y - center.y, majorPoint.x - center.x) +
    (minorRadius > majorRadius ? Math.PI / 2 : 0);
  return {
    entities: [{ id, kind: 'ellipse', center, majorRadius: major, minorRadius: minor, rotation }],
    constraints: [],
  };
}

export function bsplineCreation(
  id: string,
  controlPoints: readonly SketchPoint2D[],
): PrimitiveCreation {
  if (controlPoints.length < 4)
    throw new TypeError('A cubic B-spline requires four control points.');
  return {
    entities: [{ id, kind: 'bspline', degree: 3, controlPoints: [...controlPoints] }],
    constraints: [],
  };
}
