import type { SketchDocument } from '../sketch/document';
import {
  arcPoint,
  bsplinePoint,
  ellipsePoint,
  geometryBounds,
  normalizedAngle,
  positiveArcSweep,
  type ArcEntity,
  type GeometryEntity,
  type SketchBounds,
  type SketchPoint2D,
} from '../sketch/geometry';
import { adaptiveCurveSegments } from './curve-proximity';
import { SketchSpatialIndex } from './spatial-index';

export type MarqueeMode = 'enclosed' | 'crossing';

export interface MarqueeSelectionResult {
  readonly bounds: SketchBounds;
  readonly mode: MarqueeMode;
  readonly entityIds: readonly string[];
}

function boundsFrom(first: SketchPoint2D, second: SketchPoint2D): SketchBounds {
  return {
    minX: Math.min(first.x, second.x),
    minY: Math.min(first.y, second.y),
    maxX: Math.max(first.x, second.x),
    maxY: Math.max(first.y, second.y),
  };
}

function containsPoint(bounds: SketchBounds, point: SketchPoint2D): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function boundsContained(inner: SketchBounds, outer: SketchBounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

function orientation(a: SketchPoint2D, b: SketchPoint2D, c: SketchPoint2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function between(value: number, first: number, second: number): boolean {
  return value >= Math.min(first, second) - 1e-9 && value <= Math.max(first, second) + 1e-9;
}

function segmentsIntersect(
  firstStart: SketchPoint2D,
  firstEnd: SketchPoint2D,
  secondStart: SketchPoint2D,
  secondEnd: SketchPoint2D,
): boolean {
  const a = orientation(firstStart, firstEnd, secondStart);
  const b = orientation(firstStart, firstEnd, secondEnd);
  const c = orientation(secondStart, secondEnd, firstStart);
  const d = orientation(secondStart, secondEnd, firstEnd);
  if (((a > 0 && b < 0) || (a < 0 && b > 0)) && ((c > 0 && d < 0) || (c < 0 && d > 0))) {
    return true;
  }
  if (
    Math.abs(a) <= 1e-9 &&
    between(secondStart.x, firstStart.x, firstEnd.x) &&
    between(secondStart.y, firstStart.y, firstEnd.y)
  )
    return true;
  if (
    Math.abs(b) <= 1e-9 &&
    between(secondEnd.x, firstStart.x, firstEnd.x) &&
    between(secondEnd.y, firstStart.y, firstEnd.y)
  )
    return true;
  if (
    Math.abs(c) <= 1e-9 &&
    between(firstStart.x, secondStart.x, secondEnd.x) &&
    between(firstStart.y, secondStart.y, secondEnd.y)
  )
    return true;
  return (
    Math.abs(d) <= 1e-9 &&
    between(firstEnd.x, secondStart.x, secondEnd.x) &&
    between(firstEnd.y, secondStart.y, secondEnd.y)
  );
}

function rectangleEdges(
  bounds: SketchBounds,
): readonly (readonly [SketchPoint2D, SketchPoint2D])[] {
  const lowerLeft = { x: bounds.minX, y: bounds.minY };
  const lowerRight = { x: bounds.maxX, y: bounds.minY };
  const upperRight = { x: bounds.maxX, y: bounds.maxY };
  const upperLeft = { x: bounds.minX, y: bounds.maxY };
  return [
    [lowerLeft, lowerRight],
    [lowerRight, upperRight],
    [upperRight, upperLeft],
    [upperLeft, lowerLeft],
  ];
}

function lineTouchesBounds(
  start: SketchPoint2D,
  end: SketchPoint2D,
  bounds: SketchBounds,
): boolean {
  return (
    containsPoint(bounds, start) ||
    containsPoint(bounds, end) ||
    rectangleEdges(bounds).some(([first, second]) => segmentsIntersect(start, end, first, second))
  );
}

function angleOnArc(arc: ArcEntity, angle: number): boolean {
  const relative = normalizedAngle(angle - arc.startAngle);
  return relative <= positiveArcSweep(arc.startAngle, arc.endAngle) + 1e-9;
}

function circleSegmentIntersections(
  center: SketchPoint2D,
  radius: number,
  start: SketchPoint2D,
  end: SketchPoint2D,
): readonly SketchPoint2D[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - center.x;
  const fy = start.y - center.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a === 0) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter(
      (value, index, values) =>
        value >= -1e-9 && value <= 1 + 1e-9 && values.indexOf(value) === index,
    )
    .map((value) => ({ x: start.x + dx * value, y: start.y + dy * value }));
}

function circleTouchesBounds(
  center: SketchPoint2D,
  radius: number,
  bounds: SketchBounds,
  arc?: ArcEntity,
): boolean {
  const endpoints = arc ? [arcPoint(arc, arc.startAngle), arcPoint(arc, arc.endAngle)] : [];
  if (endpoints.some((point) => containsPoint(bounds, point))) return true;
  if (
    !arc &&
    [
      { x: center.x + radius, y: center.y },
      { x: center.x - radius, y: center.y },
      { x: center.x, y: center.y + radius },
      { x: center.x, y: center.y - radius },
    ].some((point) => containsPoint(bounds, point))
  )
    return true;
  return rectangleEdges(bounds).some(([start, end]) =>
    circleSegmentIntersections(center, radius, start, end).some((point) =>
      arc ? angleOnArc(arc, Math.atan2(point.y - center.y, point.x - center.x)) : true,
    ),
  );
}

function curveTolerance(bounds: SketchBounds): number {
  return Math.max(1e-7, Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 1e-6);
}

function fullyInside(entity: GeometryEntity, bounds: SketchBounds): boolean {
  if (entity.kind === 'arc') {
    const points = [arcPoint(entity, entity.startAngle), arcPoint(entity, entity.endAngle)];
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      if (angleOnArc(entity, angle)) points.push(arcPoint(entity, angle));
    }
    return points.every((point) => containsPoint(bounds, point));
  }
  if (entity.kind === 'bspline') {
    return adaptiveCurveSegments(
      (parameter) => bsplinePoint(entity, parameter),
      curveTolerance(bounds),
    ).every(({ start, end }) => containsPoint(bounds, start) && containsPoint(bounds, end));
  }
  return boundsContained(geometryBounds(entity), bounds);
}

function touches(entity: GeometryEntity, bounds: SketchBounds): boolean {
  switch (entity.kind) {
    case 'point':
      return containsPoint(bounds, entity.position);
    case 'line':
      return lineTouchesBounds(entity.start, entity.end, bounds);
    case 'circle':
      return circleTouchesBounds(entity.center, entity.radius, bounds);
    case 'arc':
      return circleTouchesBounds(entity.center, entity.radius, bounds, entity);
    case 'ellipse':
      return adaptiveCurveSegments(
        (parameter) => ellipsePoint(entity, parameter * Math.PI * 2),
        curveTolerance(bounds),
      ).some(({ start, end }) => lineTouchesBounds(start, end, bounds));
    case 'bspline':
      return adaptiveCurveSegments(
        (parameter) => bsplinePoint(entity, parameter),
        curveTolerance(bounds),
      ).some(({ start, end }) => lineTouchesBounds(start, end, bounds));
  }
  throw new TypeError(`Unsupported geometry: ${JSON.stringify(entity)}`);
}

/** Left-to-right encloses; right-to-left crosses. Broad phase is indexed, exact phase is analytic. */
export function selectEntitiesInMarquee(
  document: SketchDocument,
  origin: SketchPoint2D,
  target: SketchPoint2D,
  index = new SketchSpatialIndex(document.entities),
): MarqueeSelectionResult {
  const bounds = boundsFrom(origin, target);
  const mode: MarqueeMode = target.x >= origin.x ? 'enclosed' : 'crossing';
  return {
    bounds,
    mode,
    entityIds: index
      .query(bounds)
      .filter((entity) =>
        mode === 'enclosed' ? fullyInside(entity, bounds) : touches(entity, bounds),
      )
      .map(({ id }) => id)
      .toSorted(),
  };
}
