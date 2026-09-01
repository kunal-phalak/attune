import type { SketchConstraint } from '../sketch/constraints';
import { geometryById, groupById, type SketchDocument } from '../sketch/document';
import {
  arcPoint,
  type ArcEntity,
  type GeometryEntity,
  type SketchBounds,
  type SketchPoint2D,
} from '../sketch/geometry';
import { SketchSpatialIndex } from './spatial-index';

export interface SerializedCamera2D {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface SelectionContextRequest {
  readonly worldPoint?: SketchPoint2D;
  readonly screenPoint?: SketchPoint2D;
  readonly camera?: SerializedCamera2D;
  readonly entityIds?: readonly string[];
  readonly groupIds?: readonly string[];
  readonly sharedSelection?: readonly string[];
  readonly worldRegion?: SketchBounds;
  readonly tolerance?: number;
}

export interface RankedSelectionEntity {
  readonly entityId: string;
  readonly kind: GeometryEntity['kind'];
  readonly distance: number | null;
}

export interface SelectionContext {
  readonly worldPoint: SketchPoint2D | null;
  readonly hoveredEntity: RankedSelectionEntity | null;
  readonly nearbyEntities: readonly RankedSelectionEntity[];
  readonly selectedEntityIds: readonly string[];
  readonly selectedGroupIds: readonly string[];
  readonly selectedGroups: readonly {
    readonly groupId: string;
    readonly name: string;
    readonly entityIds: readonly string[];
  }[];
  readonly activeConstraints: readonly SketchConstraint[];
  readonly relevantDegreesOfFreedom: number | null;
}

function screenToWorld(point: SketchPoint2D, camera: SerializedCamera2D): SketchPoint2D {
  return { x: (point.x - camera.x) / camera.zoom, y: (camera.y - point.y) / camera.zoom };
}

function pointDistance(first: SketchPoint2D, second: SketchPoint2D): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function lineDistance(point: SketchPoint2D, entity: Extract<GeometryEntity, { kind: 'line' }>) {
  const dx = entity.end.x - entity.start.x;
  const dy = entity.end.y - entity.start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - entity.start.x) * dx + (point.y - entity.start.y) * dy) / lengthSquared,
    ),
  );
  return pointDistance(point, { x: entity.start.x + t * dx, y: entity.start.y + t * dy });
}

function normalizedAngle(angle: number): number {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
}

function angleWithinArc(angle: number, arc: ArcEntity): boolean {
  const start = normalizedAngle(arc.startAngle);
  const end = normalizedAngle(arc.endAngle);
  const current = normalizedAngle(angle);
  return end >= start ? current >= start && current <= end : current >= start || current <= end;
}

export function distanceToGeometry(point: SketchPoint2D, entity: GeometryEntity): number {
  switch (entity.kind) {
    case 'point':
      return pointDistance(point, entity.position);
    case 'line':
      return lineDistance(point, entity);
    case 'circle':
      return Math.abs(pointDistance(point, entity.center) - entity.radius);
    case 'arc': {
      const angle = Math.atan2(point.y - entity.center.y, point.x - entity.center.x);
      if (angleWithinArc(angle, entity)) {
        return Math.abs(pointDistance(point, entity.center) - entity.radius);
      }
      return Math.min(
        pointDistance(point, arcPoint(entity, entity.startAngle)),
        pointDistance(point, arcPoint(entity, entity.endAngle)),
      );
    }
  }
  throw new TypeError('Unsupported geometry entity.');
}

export function createSelectionContext(
  document: SketchDocument,
  request: SelectionContextRequest = {},
): SelectionContext {
  const worldPoint =
    request.worldPoint ??
    (request.screenPoint && request.camera
      ? screenToWorld(request.screenPoint, request.camera)
      : undefined);
  const tolerance = request.tolerance ?? (request.camera ? 10 / request.camera.zoom : 8);
  const groupIds = [...new Set(request.groupIds ?? [])].toSorted();
  const groupEntityIds = groupIds.flatMap((id) => groupById(document, id)?.entityIds ?? []);
  const selectedEntityIds = [
    ...new Set([
      ...(request.entityIds ?? []),
      ...(request.sharedSelection ?? []),
      ...groupEntityIds,
    ]),
  ]
    .filter((id) => Boolean(geometryById(document, id)))
    .toSorted();

  let candidates: readonly GeometryEntity[];
  if (request.worldRegion) {
    candidates = new SketchSpatialIndex(document.entities).query(request.worldRegion);
  } else if (worldPoint) {
    candidates = new SketchSpatialIndex(document.entities).query({
      minX: worldPoint.x - tolerance,
      minY: worldPoint.y - tolerance,
      maxX: worldPoint.x + tolerance,
      maxY: worldPoint.y + tolerance,
    });
  } else {
    const explicitIds =
      selectedEntityIds.length > 0 ? selectedEntityIds : document.entities.map(({ id }) => id);
    candidates = explicitIds
      .map((id) => geometryById(document, id))
      .filter((entity): entity is GeometryEntity => Boolean(entity));
  }

  const nearbyEntities = candidates
    .map(
      (entity): RankedSelectionEntity => ({
        entityId: entity.id,
        kind: entity.kind,
        distance: worldPoint ? distanceToGeometry(worldPoint, entity) : null,
      }),
    )
    .filter(({ distance }) => distance === null || distance <= tolerance)
    .toSorted(
      (left, right) =>
        (left.distance ?? 0) - (right.distance ?? 0) || left.entityId.localeCompare(right.entityId),
    );
  const relevantIds = new Set([
    ...selectedEntityIds,
    ...nearbyEntities.map(({ entityId }) => entityId),
  ]);
  const activeConstraints = document.constraints.filter((constraint) =>
    constraint.refs.some(({ entityId }) => relevantIds.has(entityId)),
  );

  return {
    worldPoint: worldPoint ?? null,
    hoveredEntity: nearbyEntities[0] ?? null,
    nearbyEntities,
    selectedEntityIds,
    selectedGroupIds: groupIds,
    selectedGroups: groupIds.flatMap((id) => {
      const group = groupById(document, id);
      return group ? [{ groupId: group.id, name: group.name, entityIds: group.entityIds }] : [];
    }),
    activeConstraints,
    relevantDegreesOfFreedom: document.lastSolve?.degreesOfFreedom ?? null,
  };
}
