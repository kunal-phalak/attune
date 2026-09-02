export interface SketchPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface MakerPathSourceRef {
  readonly kind: 'maker-path';
  readonly routeKey: string;
  readonly route: readonly string[];
  readonly layer?: string;
  readonly pathId?: string;
}

export interface SketchNodeSourceRef extends MakerPathSourceRef {
  readonly anchor: 'self' | 'start' | 'end' | 'center';
}

export interface SketchNode {
  readonly id: string;
  readonly version: number;
  readonly position: SketchPoint2D;
  readonly sourceRefs?: readonly SketchNodeSourceRef[];
}

interface GeometryEntityBase {
  readonly id: string;
  readonly version: number;
  readonly name?: string;
  readonly construction?: boolean;
  readonly sourceRef?: MakerPathSourceRef;
}

export interface PointEntity extends GeometryEntityBase {
  readonly kind: 'point';
  readonly position: SketchPoint2D;
  /** Required for canonical documents; optional only for progressive legacy ingestion. */
  readonly nodeId?: string;
}

export interface LineEntity extends GeometryEntityBase {
  readonly kind: 'line';
  readonly start: SketchPoint2D;
  readonly end: SketchPoint2D;
  /** Required for canonical documents; optional only for progressive legacy ingestion. */
  readonly startNodeId?: string;
  /** Required for canonical documents; optional only for progressive legacy ingestion. */
  readonly endNodeId?: string;
}

export interface CircleEntity extends GeometryEntityBase {
  readonly kind: 'circle';
  readonly center: SketchPoint2D;
  readonly radius: number;
  /** Required for canonical documents; optional only for progressive legacy ingestion. */
  readonly centerNodeId?: string;
}

export interface ArcEntity extends GeometryEntityBase {
  readonly kind: 'arc';
  readonly center: SketchPoint2D;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
  /** Required for canonical documents; optional only for progressive legacy ingestion. */
  readonly centerNodeId?: string;
  /** Required for canonical documents; optional only for progressive legacy ingestion. */
  readonly startNodeId?: string;
  /** Required for canonical documents; optional only for progressive legacy ingestion. */
  readonly endNodeId?: string;
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

const TURN = Math.PI * 2;

export function normalizedAngle(angle: number): number {
  return ((angle % TURN) + TURN) % TURN;
}

export function positiveArcSweep(startAngle: number, endAngle: number): number {
  const sweep = normalizedAngle(endAngle) - normalizedAngle(startAngle);
  return sweep > 0 ? sweep : sweep + TURN;
}

/**
 * Compatibility fields for arcs are synchronized here and nowhere else. Node positions are the
 * topological fact; radius and angular fields remain an analytic circular-arc representation.
 */
export function synchronizeArcFromPoints(
  entity: ArcEntity,
  center: SketchPoint2D,
  start: SketchPoint2D,
  end: SketchPoint2D,
  radiusHint = entity.radius,
): ArcEntity {
  const startRadius = Math.hypot(start.x - center.x, start.y - center.y);
  const endRadius = Math.hypot(end.x - center.x, end.y - center.y);
  const averageRadius = (startRadius + endRadius) / 2;
  const analyticTolerance = Math.max(1e-8, averageRadius * 1e-8);
  const radius =
    Number.isFinite(radiusHint) &&
    Math.abs(startRadius - radiusHint) <= analyticTolerance &&
    Math.abs(endRadius - radiusHint) <= analyticTolerance
      ? radiusHint
      : averageRadius;
  const startAngle = normalizedAngle(Math.atan2(start.y - center.y, start.x - center.x));
  const endDirection = normalizedAngle(Math.atan2(end.y - center.y, end.x - center.x));
  const priorSweep = positiveArcSweep(entity.startAngle, entity.endAngle);
  let sweep = normalizedAngle(endDirection - startAngle);
  if (sweep === 0 && priorSweep > Math.PI) sweep = TURN;
  return {
    ...entity,
    center,
    radius,
    startAngle,
    endAngle: startAngle + sweep,
  };
}

/** Refresh compatibility coordinates from the canonical shared-node positions. */
export function synchronizeGeometryWithNodes(
  entities: readonly GeometryEntity[],
  nodes: readonly SketchNode[],
): readonly GeometryEntity[] {
  const byId = new Map(nodes.map((node) => [node.id, node.position]));
  const position = (id: string | undefined, fallback: SketchPoint2D) =>
    (id ? byId.get(id) : undefined) ?? fallback;
  return entities.map((entity): GeometryEntity => {
    switch (entity.kind) {
      case 'point':
        return { ...entity, position: position(entity.nodeId, entity.position) };
      case 'line':
        return {
          ...entity,
          start: position(entity.startNodeId, entity.start),
          end: position(entity.endNodeId, entity.end),
        };
      case 'circle':
        return { ...entity, center: position(entity.centerNodeId, entity.center) };
      case 'arc':
        return synchronizeArcFromPoints(
          entity,
          position(entity.centerNodeId, entity.center),
          position(entity.startNodeId, arcPoint(entity, entity.startAngle)),
          position(entity.endNodeId, arcPoint(entity, entity.endAngle)),
        );
      default:
        return entity;
    }
  });
}

export function geometryNodeIds(entity: GeometryEntity): readonly string[] {
  switch (entity.kind) {
    case 'point':
      return entity.nodeId ? [entity.nodeId] : [];
    case 'line':
      return [entity.startNodeId, entity.endNodeId].filter(
        (id): id is string => typeof id === 'string',
      );
    case 'circle':
      return entity.centerNodeId ? [entity.centerNodeId] : [];
    case 'arc':
      return [entity.centerNodeId, entity.startNodeId, entity.endNodeId].filter(
        (id): id is string => typeof id === 'string',
      );
    default:
      return [];
  }
}

export function geometryAnchorNodeId(
  entity: GeometryEntity,
  anchor: GeometryAnchor = 'self',
): string | undefined {
  switch (entity.kind) {
    case 'point':
      return anchor === 'self' || anchor === 'center' ? entity.nodeId : undefined;
    case 'line':
      if (anchor === 'start') return entity.startNodeId;
      if (anchor === 'end') return entity.endNodeId;
      return undefined;
    case 'circle':
      return anchor === 'self' || anchor === 'center' ? entity.centerNodeId : undefined;
    case 'arc':
      if (anchor === 'self' || anchor === 'center') return entity.centerNodeId;
      if (anchor === 'start') return entity.startNodeId;
      if (anchor === 'end') return entity.endNodeId;
      return undefined;
    default:
      return undefined;
  }
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
