export interface SketchPoint2D {
  readonly x: number;
  readonly y: number;
}

interface GeometryEntityBase {
  readonly id: string;
  readonly version: number;
  readonly name?: string;
  readonly construction?: boolean;
}

export interface PointEntity extends GeometryEntityBase {
  readonly kind: 'point';
  readonly position: SketchPoint2D;
}

export interface LineEntity extends GeometryEntityBase {
  readonly kind: 'line';
  readonly start: SketchPoint2D;
  readonly end: SketchPoint2D;
}

export interface CircleEntity extends GeometryEntityBase {
  readonly kind: 'circle';
  readonly center: SketchPoint2D;
  readonly radius: number;
}

export interface ArcEntity extends GeometryEntityBase {
  readonly kind: 'arc';
  readonly center: SketchPoint2D;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

export type GeometryEntity = PointEntity | LineEntity | CircleEntity | ArcEntity;

export type GeometryInput =
  | Omit<PointEntity, 'version'>
  | Omit<LineEntity, 'version'>
  | Omit<CircleEntity, 'version'>
  | Omit<ArcEntity, 'version'>;

export type GeometryPatch =
  | Pick<PointEntity, 'id' | 'kind' | 'position'>
  | Pick<LineEntity, 'id' | 'kind' | 'start' | 'end'>
  | Pick<CircleEntity, 'id' | 'kind' | 'center' | 'radius'>
  | Pick<ArcEntity, 'id' | 'kind' | 'center' | 'radius' | 'startAngle' | 'endAngle'>;

export type GeometryAnchor = 'self' | 'start' | 'end' | 'center';

export interface GeometryReference {
  readonly entityId: string;
  readonly anchor?: GeometryAnchor;
}

export interface SketchBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function arcPoint(entity: ArcEntity, angle: number): SketchPoint2D {
  return {
    x: entity.center.x + Math.cos(angle) * entity.radius,
    y: entity.center.y + Math.sin(angle) * entity.radius,
  };
}

export function geometryAnchorPoint(
  entity: GeometryEntity,
  anchor: GeometryAnchor = 'self',
): SketchPoint2D | undefined {
  switch (entity.kind) {
    case 'point':
      return anchor === 'self' || anchor === 'center' ? entity.position : undefined;
    case 'line':
      if (anchor === 'start') return entity.start;
      if (anchor === 'end') return entity.end;
      return undefined;
    case 'circle':
      return anchor === 'self' || anchor === 'center' ? entity.center : undefined;
    case 'arc':
      if (anchor === 'self' || anchor === 'center') return entity.center;
      if (anchor === 'start') return arcPoint(entity, entity.startAngle);
      if (anchor === 'end') return arcPoint(entity, entity.endAngle);
      return undefined;
  }
  return undefined;
}

export function geometryBounds(entity: GeometryEntity): SketchBounds {
  switch (entity.kind) {
    case 'point':
      return {
        minX: entity.position.x,
        minY: entity.position.y,
        maxX: entity.position.x,
        maxY: entity.position.y,
      };
    case 'line':
      return {
        minX: Math.min(entity.start.x, entity.end.x),
        minY: Math.min(entity.start.y, entity.end.y),
        maxX: Math.max(entity.start.x, entity.end.x),
        maxY: Math.max(entity.start.y, entity.end.y),
      };
    case 'circle':
    case 'arc':
      return {
        minX: entity.center.x - entity.radius,
        minY: entity.center.y - entity.radius,
        maxX: entity.center.x + entity.radius,
        maxY: entity.center.y + entity.radius,
      };
  }
  throw new TypeError('Unsupported geometry entity.');
}

function finitePoint(point: SketchPoint2D): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function validateGeometryEntity(entity: GeometryInput | GeometryEntity): void {
  if (!entity.id) throw new TypeError('Geometry entities require stable IDs.');
  switch (entity.kind) {
    case 'point':
      if (!finitePoint(entity.position)) throw new TypeError(`${entity.id} has an invalid point.`);
      return;
    case 'line':
      if (!finitePoint(entity.start) || !finitePoint(entity.end)) {
        throw new TypeError(`${entity.id} has invalid line endpoints.`);
      }
      if (entity.start.x === entity.end.x && entity.start.y === entity.end.y) {
        throw new TypeError(`${entity.id} must have non-zero length.`);
      }
      return;
    case 'circle':
      if (!finitePoint(entity.center) || !Number.isFinite(entity.radius) || entity.radius <= 0) {
        throw new TypeError(`${entity.id} has invalid circle geometry.`);
      }
      return;
    case 'arc':
      if (
        !finitePoint(entity.center) ||
        !Number.isFinite(entity.radius) ||
        entity.radius <= 0 ||
        !Number.isFinite(entity.startAngle) ||
        !Number.isFinite(entity.endAngle) ||
        entity.startAngle === entity.endAngle
      ) {
        throw new TypeError(`${entity.id} has invalid arc geometry.`);
      }
  }
}
