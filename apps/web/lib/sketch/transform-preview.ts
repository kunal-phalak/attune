import {
  geometryNodeIds,
  synchronizeGeometryWithNodes,
  type SketchDocument,
  type SketchPoint2D,
} from '@attune/domain/editor';

export interface GeometryTransform {
  readonly pivot: SketchPoint2D;
  readonly translation?: SketchPoint2D;
  readonly rotation?: number;
  readonly scale?: number;
}

function transformPoint(point: SketchPoint2D, transform: GeometryTransform): SketchPoint2D {
  const translation = transform.translation ?? { x: 0, y: 0 };
  const rotation = transform.rotation ?? 0;
  const scale = transform.scale ?? 1;
  const dx = (point.x - transform.pivot.x) * scale;
  const dy = (point.y - transform.pivot.y) * scale;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: transform.pivot.x + dx * cosine - dy * sine + translation.x,
    y: transform.pivot.y + dx * sine + dy * cosine + translation.y,
  };
}

/** Cheap canonical-node projection before the worker enforces persistent constraints. */
export function previewGeometryTransform(
  document: SketchDocument,
  entityIds: readonly string[],
  transform: GeometryTransform,
): SketchDocument {
  const selected = new Set(entityIds);
  const nodeIds = new Set(
    document.entities.filter(({ id }) => selected.has(id)).flatMap(geometryNodeIds),
  );
  const scale = transform.scale ?? 1;
  const nodes = document.nodes.map((node) =>
    nodeIds.has(node.id) ? { ...node, position: transformPoint(node.position, transform) } : node,
  );
  const intrinsic = document.entities.map((entity) => {
    if (!selected.has(entity.id) || scale === 1) return entity;
    if (entity.kind === 'circle' || entity.kind === 'arc') {
      return { ...entity, radius: entity.radius * scale };
    }
    if (entity.kind === 'ellipse') {
      return {
        ...entity,
        majorRadius: entity.majorRadius * scale,
        minorRadius: entity.minorRadius * scale,
      };
    }
    return entity;
  });
  return { ...document, nodes, entities: synchronizeGeometryWithNodes(intrinsic, nodes) };
}

export function selectionBounds(
  document: SketchDocument,
  entityIds: readonly string[],
): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} | null {
  const selected = document.entities.filter(({ id }) => entityIds.includes(id));
  if (selected.length === 0) return null;
  const points = selected.flatMap((entity): readonly SketchPoint2D[] => {
    if (entity.kind === 'point') return [entity.position];
    if (entity.kind === 'line') return [entity.start, entity.end];
    if (entity.kind === 'circle' || entity.kind === 'arc') {
      return [
        { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
        { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius },
      ];
    }
    if (entity.kind === 'ellipse') {
      return [
        { x: entity.center.x - entity.majorRadius, y: entity.center.y - entity.majorRadius },
        { x: entity.center.x + entity.majorRadius, y: entity.center.y + entity.majorRadius },
      ];
    }
    return entity.controlPoints;
  });
  return {
    minX: Math.min(...points.map(({ x }) => x)),
    minY: Math.min(...points.map(({ y }) => y)),
    maxX: Math.max(...points.map(({ x }) => x)),
    maxY: Math.max(...points.map(({ y }) => y)),
  };
}
