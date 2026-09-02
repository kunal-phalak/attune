import {
  normalizedAngle,
  positiveArcSweep,
  type ArcEntity,
  type CircleEntity,
  type GeometryEntity,
  type GeometryInput,
  type LineEntity,
  type SketchPoint2D,
} from './geometry';

interface ParametricIntersection {
  readonly point: SketchPoint2D;
  readonly firstParameter: number;
  readonly secondParameter: number;
}

const TURN = Math.PI * 2;
const EPSILON = 1e-8;

function cross(left: SketchPoint2D, right: SketchPoint2D): number {
  return left.x * right.y - left.y * right.x;
}

function lineLine(first: LineEntity, second: LineEntity): readonly ParametricIntersection[] {
  const r = { x: first.end.x - first.start.x, y: first.end.y - first.start.y };
  const s = { x: second.end.x - second.start.x, y: second.end.y - second.start.y };
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= EPSILON) return [];
  const delta = { x: second.start.x - first.start.x, y: second.start.y - first.start.y };
  const firstParameter = cross(delta, s) / denominator;
  const secondParameter = cross(delta, r) / denominator;
  if (
    firstParameter < -EPSILON ||
    firstParameter > 1 + EPSILON ||
    secondParameter < -EPSILON ||
    secondParameter > 1 + EPSILON
  )
    return [];
  return [
    {
      point: { x: first.start.x + firstParameter * r.x, y: first.start.y + firstParameter * r.y },
      firstParameter,
      secondParameter,
    },
  ];
}

function lineCircle(
  line: LineEntity,
  circle: CircleEntity | ArcEntity,
): readonly ParametricIntersection[] {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const fx = line.start.x - circle.center.x;
  const fy = line.start.y - circle.center.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - circle.radius * circle.radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON || a <= EPSILON) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  return [...new Set([(-b - root) / (2 * a), (-b + root) / (2 * a)])]
    .filter((parameter) => parameter >= -EPSILON && parameter <= 1 + EPSILON)
    .flatMap((firstParameter) => {
      const point = {
        x: line.start.x + firstParameter * dx,
        y: line.start.y + firstParameter * dy,
      };
      const angle = normalizedAngle(
        Math.atan2(point.y - circle.center.y, point.x - circle.center.x),
      );
      if (circle.kind === 'arc' && !angleWithinArc(circle, angle)) return [];
      return [{ point, firstParameter, secondParameter: angle }];
    });
}

function circleCircle(
  first: CircleEntity | ArcEntity,
  second: CircleEntity | ArcEntity,
): readonly ParametricIntersection[] {
  const dx = second.center.x - first.center.x;
  const dy = second.center.y - first.center.y;
  const distance = Math.hypot(dx, dy);
  if (
    distance <= EPSILON ||
    distance > first.radius + second.radius + EPSILON ||
    distance < Math.abs(first.radius - second.radius) - EPSILON
  )
    return [];
  const along = (first.radius ** 2 - second.radius ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, first.radius ** 2 - along ** 2));
  const base = {
    x: first.center.x + (along * dx) / distance,
    y: first.center.y + (along * dy) / distance,
  };
  const points = [
    { x: base.x - (height * dy) / distance, y: base.y + (height * dx) / distance },
    { x: base.x + (height * dy) / distance, y: base.y - (height * dx) / distance },
  ].filter(
    (point, index, values) =>
      index === 0 || Math.hypot(point.x - values[0].x, point.y - values[0].y) > EPSILON,
  );
  return points.flatMap((point) => {
    const firstParameter = normalizedAngle(
      Math.atan2(point.y - first.center.y, point.x - first.center.x),
    );
    const secondParameter = normalizedAngle(
      Math.atan2(point.y - second.center.y, point.x - second.center.x),
    );
    if (first.kind === 'arc' && !angleWithinArc(first, firstParameter)) return [];
    if (second.kind === 'arc' && !angleWithinArc(second, secondParameter)) return [];
    return [{ point, firstParameter, secondParameter }];
  });
}

function angleWithinArc(arc: ArcEntity, angle: number): boolean {
  return (
    normalizedAngle(angle - arc.startAngle) <=
    positiveArcSweep(arc.startAngle, arc.endAngle) + EPSILON
  );
}

export function geometryIntersections(
  first: GeometryEntity,
  second: GeometryEntity,
): readonly ParametricIntersection[] {
  if (first.kind === 'line' && second.kind === 'line') return lineLine(first, second);
  if (first.kind === 'line' && (second.kind === 'circle' || second.kind === 'arc')) {
    return lineCircle(first, second);
  }
  if ((first.kind === 'circle' || first.kind === 'arc') && second.kind === 'line') {
    return lineCircle(second, first).map(({ point, firstParameter, secondParameter }) => ({
      point,
      firstParameter: secondParameter,
      secondParameter: firstParameter,
    }));
  }
  if (
    (first.kind === 'circle' || first.kind === 'arc') &&
    (second.kind === 'circle' || second.kind === 'arc')
  )
    return circleCircle(first, second);
  return [];
}

function lineParameter(line: LineEntity, point: SketchPoint2D): number {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const lengthSquared = dx * dx + dy * dy;
  return ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / lengthSquared;
}

function intervalContaining(values: readonly number[], parameter: number): number {
  for (let index = 0; index < values.length - 1; index += 1) {
    if (parameter >= values[index] - EPSILON && parameter <= values[index + 1] + EPSILON)
      return index;
  }
  return Math.max(0, values.length - 2);
}

function splitId(entityId: string, index: number, start: number, end: number): string {
  const source = `${entityId}|${index}|${start.toPrecision(15)}|${end.toPrecision(15)}`;
  let hash = 0x811c9dc5;
  for (let offset = 0; offset < source.length; offset += 1) {
    hash ^= source.charCodeAt(offset);
    hash = Math.imul(hash, 0x01000193);
  }
  return index === 0 ? entityId : `${entityId}:trim:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function lineBoundaries(entity: LineEntity, parameters: readonly number[]): readonly number[] {
  return [
    ...new Set([0, ...parameters.filter((value) => value > EPSILON && value < 1 - EPSILON), 1]),
  ].toSorted((a, b) => a - b);
}

function trimLine(
  entity: LineEntity,
  parameters: readonly number[],
  pickPoint: SketchPoint2D,
): readonly GeometryInput[] {
  const values = lineBoundaries(entity, parameters);
  if (values.length < 3) throw new TypeError('Trim requires at least one interior boundary.');
  const removing = intervalContaining(values, lineParameter(entity, pickPoint));
  const dx = entity.end.x - entity.start.x;
  const dy = entity.end.y - entity.start.y;
  return values.slice(0, -1).flatMap((start, index) => {
    const end = values[index + 1];
    if (index === removing || end - start <= EPSILON) return [];
    return [
      {
        ...entity,
        id: splitId(entity.id, index < removing ? index : index - 1, start, end),
        start: { x: entity.start.x + dx * start, y: entity.start.y + dy * start },
        end: { x: entity.start.x + dx * end, y: entity.start.y + dy * end },
        startNodeId: undefined,
        endNodeId: undefined,
      },
    ];
  });
}

function trimCircular(
  entity: CircleEntity | ArcEntity,
  intersectionAngles: readonly number[],
  pickPoint: SketchPoint2D,
): readonly GeometryInput[] {
  const pickAngle = normalizedAngle(
    Math.atan2(pickPoint.y - entity.center.y, pickPoint.x - entity.center.x),
  );
  const sourceStart = entity.kind === 'arc' ? normalizedAngle(entity.startAngle) : 0;
  const sourceSweep =
    entity.kind === 'arc' ? positiveArcSweep(entity.startAngle, entity.endAngle) : TURN;
  const relative = (angle: number) => normalizedAngle(angle - sourceStart);
  const values = [
    ...new Set([
      0,
      ...intersectionAngles
        .map(relative)
        .filter((value) => value > EPSILON && value < sourceSweep - EPSILON),
      sourceSweep,
    ]),
  ].toSorted((a, b) => a - b);
  if (entity.kind === 'circle') {
    const circular = [...new Set(intersectionAngles.map(normalizedAngle))].toSorted(
      (a, b) => a - b,
    );
    if (circular.length < 2)
      throw new TypeError('A circle trim requires two intersection boundaries.');
    const expanded = [...circular, circular[0] + TURN];
    const normalizedPick = pickAngle < circular[0] ? pickAngle + TURN : pickAngle;
    const removing = intervalContaining(expanded, normalizedPick);
    const kept = expanded.slice(0, -1).flatMap((start, index) => {
      const end = expanded[index + 1];
      return index === removing ? [] : [[start, end] as const];
    });
    return kept.map(([start, end], index) => ({
      id: splitId(entity.id, index, start, end),
      version: entity.version,
      kind: 'arc' as const,
      name: entity.name,
      construction: entity.construction,
      center: entity.center,
      radius: entity.radius,
      startAngle: start,
      endAngle: end,
    }));
  }
  if (values.length < 3)
    throw new TypeError('An arc trim requires an interior intersection boundary.');
  const pickRelative = relative(pickAngle);
  const removing = intervalContaining(values, pickRelative);
  return values.slice(0, -1).flatMap((start, index) => {
    const end = values[index + 1];
    if (index === removing || end - start <= EPSILON) return [];
    return [
      {
        ...entity,
        id: splitId(entity.id, index < removing ? index : index - 1, start, end),
        startAngle: sourceStart + start,
        endAngle: sourceStart + end,
        centerNodeId: undefined,
        startNodeId: undefined,
        endNodeId: undefined,
      },
    ];
  });
}

export function trimGeometryAtPoint(
  entities: readonly GeometryEntity[],
  entityId: string,
  pickPoint: SketchPoint2D,
): readonly GeometryInput[] {
  const target = entities.find(({ id }) => id === entityId);
  if (!target) throw new TypeError(`Unknown trim target ${entityId}.`);
  if (target.kind !== 'line' && target.kind !== 'circle' && target.kind !== 'arc') {
    throw new TypeError('Trim currently supports lines, circles, and circular arcs.');
  }
  const parameters = entities
    .filter(({ id }) => id !== target.id)
    .flatMap((other) =>
      geometryIntersections(target, other).map(({ firstParameter }) => firstParameter),
    );
  if (target.kind === 'line') return trimLine(target, parameters, pickPoint);
  return trimCircular(target, parameters, pickPoint);
}

/** Exact removable segment used only for hover feedback; it never mutates topology. */
export function trimSegmentAtPoint(
  entities: readonly GeometryEntity[],
  entityId: string,
  pickPoint: SketchPoint2D,
): GeometryInput {
  const target = entities.find(({ id }) => id === entityId);
  if (!target) throw new TypeError(`Unknown trim target ${entityId}.`);
  if (target.kind !== 'line' && target.kind !== 'circle' && target.kind !== 'arc') {
    throw new TypeError('Trim currently supports lines, circles, and circular arcs.');
  }
  const parameters = entities
    .filter(({ id }) => id !== target.id)
    .flatMap((other) =>
      geometryIntersections(target, other).map(({ firstParameter }) => firstParameter),
    );
  if (target.kind === 'line') {
    const values = lineBoundaries(target, parameters);
    if (values.length < 3) throw new TypeError('Trim requires at least one interior boundary.');
    const interval = intervalContaining(values, lineParameter(target, pickPoint));
    const start = values[interval];
    const end = values[interval + 1];
    const dx = target.end.x - target.start.x;
    const dy = target.end.y - target.start.y;
    return {
      ...target,
      id: `${target.id}:trim-preview`,
      start: { x: target.start.x + dx * start, y: target.start.y + dy * start },
      end: { x: target.start.x + dx * end, y: target.start.y + dy * end },
      startNodeId: undefined,
      endNodeId: undefined,
    };
  }
  const pickAngle = normalizedAngle(
    Math.atan2(pickPoint.y - target.center.y, pickPoint.x - target.center.x),
  );
  if (target.kind === 'circle') {
    const values = [...new Set(parameters.map(normalizedAngle))].toSorted((a, b) => a - b);
    if (values.length < 2)
      throw new TypeError('A circle trim requires two intersection boundaries.');
    const expanded = [...values, values[0] + TURN];
    const normalizedPick = pickAngle < values[0] ? pickAngle + TURN : pickAngle;
    const interval = intervalContaining(expanded, normalizedPick);
    return {
      id: `${target.id}:trim-preview`,
      kind: 'arc',
      name: target.name,
      construction: target.construction,
      center: target.center,
      radius: target.radius,
      startAngle: expanded[interval],
      endAngle: expanded[interval + 1],
    };
  }
  const sourceStart = normalizedAngle(target.startAngle);
  const sourceSweep = positiveArcSweep(target.startAngle, target.endAngle);
  const relative = (angle: number) => normalizedAngle(angle - sourceStart);
  const values = [
    ...new Set([
      0,
      ...parameters
        .map(relative)
        .filter((value) => value > EPSILON && value < sourceSweep - EPSILON),
      sourceSweep,
    ]),
  ].toSorted((a, b) => a - b);
  if (values.length < 3)
    throw new TypeError('An arc trim requires an interior intersection boundary.');
  const interval = intervalContaining(values, relative(pickAngle));
  return {
    ...target,
    id: `${target.id}:trim-preview`,
    startAngle: sourceStart + values[interval],
    endAngle: sourceStart + values[interval + 1],
    centerNodeId: undefined,
    startNodeId: undefined,
    endNodeId: undefined,
  };
}
