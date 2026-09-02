import type { SketchConstraint } from '../sketch/constraints';
import type { SketchDocument } from '../sketch/document';
import {
  arcPoint,
  bsplinePoint,
  ellipsePoint,
  geometryNodeIds,
  type ArcEntity,
  type GeometryEntity,
  type SketchBounds,
  type SketchPoint2D,
} from '../sketch/geometry';
import { closestCurveDistance } from './curve-proximity';
import { SketchSpatialIndex } from './spatial-index';

function geometryById(document: SketchDocument, id: string): GeometryEntity | undefined {
  return document.entities.find((candidate) => candidate.id === id);
}

function groupById(document: SketchDocument, id: string) {
  return document.groups.find((candidate) => candidate.id === id);
}

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
  readonly nodeIds?: readonly string[];
  readonly constraintIds?: readonly string[];
  readonly groupIds?: readonly string[];
  readonly activeGroupId?: string;
  readonly activeHumanTool?: string;
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
  readonly selectedNodeIds: readonly string[];
  readonly selectedConstraintIds: readonly string[];
  readonly selectedGroupIds: readonly string[];
  readonly activeGroupId: string | null;
  readonly activeHumanTool: string | null;
  readonly selectedGroups: readonly {
    readonly groupId: string;
    readonly name: string;
    readonly entityIds: readonly string[];
  }[];
  readonly activeConstraints: readonly SketchConstraint[];
  readonly relevantDegreesOfFreedom: number | null;
}

export interface SketchHitResult {
  readonly kind: 'node' | 'entity';
  readonly id: string;
  readonly distance: number;
  readonly worldPoint: SketchPoint2D;
}

export interface SketchHitTestRequest {
  readonly screenPoint: SketchPoint2D;
  readonly camera: SerializedCamera2D;
  readonly screenTolerance?: number;
  readonly selectedEntityId?: string | null;
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

export function distanceToGeometry(
  point: SketchPoint2D,
  entity: GeometryEntity,
  tolerance = 1e-5,
): number {
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
    case 'ellipse':
      return closestCurveDistance(
        point,
        (parameter) => ellipsePoint(entity, parameter * Math.PI * 2),
        tolerance,
      );
    case 'bspline':
      return closestCurveDistance(point, (parameter) => bsplinePoint(entity, parameter), tolerance);
  }
  throw new TypeError('Unsupported geometry entity.');
}

/** Analytic picking with a constant screen-space target; CanvasKit pixels never participate. */
export function hitTestSketch(
  document: SketchDocument,
  request: SketchHitTestRequest,
): SketchHitResult | null {
  const worldPoint = screenToWorld(request.screenPoint, request.camera);
  const tolerance = (request.screenTolerance ?? 9) / request.camera.zoom;
  const selected = request.selectedEntityId
    ? geometryById(document, request.selectedEntityId)
    : undefined;
  if (selected) {
    const visibleNodeIds = new Set(geometryNodeIds(selected));
    const nodeHit = (document.nodes ?? [])
      .filter(({ id }) => visibleNodeIds.has(id))
      .map((node) => ({
        kind: 'node' as const,
        id: node.id,
        distance: pointDistance(worldPoint, node.position),
        worldPoint,
      }))
      .filter(({ distance }) => distance <= tolerance)
      .toSorted(
        (left, right) => left.distance - right.distance || left.id.localeCompare(right.id),
      )[0];
    if (nodeHit) return nodeHit;
  }
  const context = createSelectionContext(document, {
    worldPoint,
    tolerance,
    ...(request.selectedEntityId ? { entityIds: [request.selectedEntityId] } : {}),
  });
  const entity =
    context.nearbyEntities.find(({ entityId }) => entityId === request.selectedEntityId) ??
    context.hoveredEntity;
  return entity?.distance === null
    ? null
    : entity
      ? {
          kind: 'entity',
          id: entity.entityId,
          distance: entity.distance,
          worldPoint,
        }
      : null;
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
  const nodeIds = [...new Set(request.nodeIds ?? [])]
    .filter((id) => document.nodes.some((node) => node.id === id))
    .toSorted();
  const constraintIds = [...new Set(request.constraintIds ?? [])]
    .filter((id) => document.constraints.some((constraint) => constraint.id === id))
    .toSorted();
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
        distance: worldPoint ? distanceToGeometry(worldPoint, entity, tolerance) : null,
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
  const activeConstraints = document.constraints.filter(
    (constraint) =>
      constraintIds.includes(constraint.id) ||
      constraint.refs.some(({ entityId }) => relevantIds.has(entityId)),
  );

  return {
    worldPoint: worldPoint ?? null,
    hoveredEntity: nearbyEntities[0] ?? null,
    nearbyEntities,
    selectedEntityIds,
    selectedNodeIds: nodeIds,
    selectedConstraintIds: constraintIds,
    selectedGroupIds: groupIds,
    activeGroupId:
      request.activeGroupId && document.groups.some(({ id }) => id === request.activeGroupId)
        ? request.activeGroupId
        : null,
    activeHumanTool: request.activeHumanTool ?? null,
    selectedGroups: groupIds.flatMap((id) => {
      const group = groupById(document, id);
      return group ? [{ groupId: group.id, name: group.name, entityIds: group.entityIds }] : [];
    }),
    activeConstraints,
    relevantDegreesOfFreedom: document.lastSolve?.degreesOfFreedom ?? null,
  };
}
