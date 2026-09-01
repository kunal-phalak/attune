import type { SketchDocument } from '../sketch/document';
import { geometryAnchorPoint, type SketchPoint2D } from '../sketch/geometry';
import { createSelectionContext } from './selection-context';

export interface SnapResult {
  readonly point: SketchPoint2D;
  readonly source: 'none' | 'grid' | 'entity';
  readonly entityId?: string;
  readonly anchor?: 'self' | 'start' | 'end' | 'center';
  readonly distance: number;
}

export function snapSketchPoint(
  document: SketchDocument,
  point: SketchPoint2D,
  options: { readonly gridStep: number; readonly tolerance: number },
): SnapResult {
  const grid = {
    x: Math.round(point.x / options.gridStep) * options.gridStep,
    y: Math.round(point.y / options.gridStep) * options.gridStep,
  };
  let result: SnapResult = {
    point,
    source: 'none',
    distance: Number.POSITIVE_INFINITY,
  };
  const gridDistance = Math.hypot(grid.x - point.x, grid.y - point.y);
  if (gridDistance <= options.tolerance) {
    result = { point: grid, source: 'grid', distance: gridDistance };
  }

  const context = createSelectionContext(document, {
    worldPoint: point,
    tolerance: options.tolerance,
  });
  for (const { entityId } of context.nearbyEntities) {
    const entity = document.entities.find(({ id }) => id === entityId);
    if (!entity) continue;
    const anchors =
      entity.kind === 'line'
        ? (['start', 'end'] as const)
        : entity.kind === 'arc'
          ? (['center', 'start', 'end'] as const)
          : (['self'] as const);
    for (const anchor of anchors) {
      const candidate = geometryAnchorPoint(entity, anchor);
      if (!candidate) continue;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance <= options.tolerance && distance <= result.distance) {
        result = { point: candidate, source: 'entity', entityId, anchor, distance };
      }
    }
  }
  return result;
}
