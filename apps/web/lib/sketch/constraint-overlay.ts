import {
  arcPoint,
  geometryAnchorPoint,
  type SketchConstraint,
  type SketchDocument,
  type SketchPoint2D,
} from '@attune/domain/editor';

import type { Camera2D } from './camera-2d';

export interface ConstraintOverlayBadge {
  readonly id: string;
  readonly kind: 'constraint' | 'overflow';
  readonly constraintIds: readonly string[];
  readonly label: string;
  readonly title: string;
  readonly screen: SketchPoint2D;
  readonly affectedEntityIds: readonly string[];
  readonly conflict: boolean;
  readonly related: boolean;
  readonly selected: boolean;
}

const LABELS: Readonly<Record<SketchConstraint['type'], string>> = {
  coincident: '●',
  horizontal: 'H',
  vertical: 'V',
  parallel: '∥',
  perpendicular: '⊥',
  tangent: 'T',
  equal: '=',
  concentric: '◎',
  fixed: 'F',
  distance: 'D',
  radius: 'R',
  diameter: 'Ø',
};

function entityAnchor(document: SketchDocument, constraint: SketchConstraint): SketchPoint2D {
  const points = constraint.refs.flatMap((reference) => {
    const entity = document.entities.find(({ id }) => id === reference.entityId);
    if (!entity) return [];
    const explicit = geometryAnchorPoint(entity, reference.anchor ?? 'self');
    if (explicit) return [explicit];
    if (entity.kind === 'line') {
      return [{ x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 }];
    }
    if (entity.kind === 'circle' || entity.kind === 'ellipse') return [entity.center];
    if (entity.kind === 'arc') {
      return [arcPoint(entity, entity.startAngle + (entity.endAngle - entity.startAngle) / 2)];
    }
    if (entity.kind === 'bspline')
      return [entity.controlPoints[Math.floor(entity.controlPoints.length / 2)]];
    return [entity.position];
  });
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function tooltip(document: SketchDocument, constraint: SketchConstraint): string {
  const refs = constraint.refs.map(({ entityId }) => {
    const entity = document.entities.find(({ id }) => id === entityId);
    return entity?.name ?? entityId;
  });
  const label = `${constraint.type[0].toUpperCase()}${constraint.type.slice(1)}`;
  return `${label} — ${refs.join(' ↔ ')}`;
}

export function projectConstraintOverlay(
  document: SketchDocument,
  camera: Pick<Camera2D, 'worldToScreen'>,
  selection: {
    readonly entityIds: readonly string[];
    readonly constraintIds: readonly string[];
  },
): readonly ConstraintOverlayBadge[] {
  const selectedEntities = new Set(selection.entityIds);
  const selectedConstraints = new Set(selection.constraintIds);
  const conflicts = new Set(document.lastSolve?.conflicts ?? []);
  const clustered = new Map<
    string,
    { readonly screen: SketchPoint2D; readonly constraints: SketchConstraint[] }
  >();
  for (const constraint of document.constraints) {
    if (constraint.temporary) continue;
    const anchor = camera.worldToScreen(entityAnchor(document, constraint));
    const key = `${Math.round(anchor.x / 34)}:${Math.round(anchor.y / 34)}`;
    const cluster = clustered.get(key) ?? { screen: anchor, constraints: [] };
    cluster.constraints.push(constraint);
    clustered.set(key, cluster);
  }

  const result: ConstraintOverlayBadge[] = [];
  const occupied: SketchPoint2D[] = [];
  for (const [clusterKey, cluster] of [...clustered].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const ordered = cluster.constraints.toSorted((left, right) => left.id.localeCompare(right.id));
    const visible = ordered.length > 4 ? ordered.slice(0, 2) : ordered;
    const entries: readonly (
      | SketchConstraint
      | { readonly overflow: readonly SketchConstraint[] }
    )[] = [...visible, ...(ordered.length > 4 ? [{ overflow: ordered.slice(2) }] : [])];
    for (const [index, entry] of entries.entries()) {
      let screen = {
        x: cluster.screen.x + 14 + index * 26,
        y: cluster.screen.y - 22 - (index % 2) * 4,
      };
      while (occupied.some((point) => Math.hypot(point.x - screen.x, point.y - screen.y) < 22)) {
        screen.y -= 24;
      }
      occupied.push(screen);
      if ('overflow' in entry) {
        const ids = entry.overflow.map(({ id }) => id);
        result.push({
          id: `constraint-overflow:${clusterKey}`,
          kind: 'overflow',
          constraintIds: ids,
          label: `+${ids.length}`,
          title: entry.overflow.map((constraint) => tooltip(document, constraint)).join('\n'),
          screen,
          affectedEntityIds: [
            ...new Set(entry.overflow.flatMap(({ refs }) => refs.map(({ entityId }) => entityId))),
          ],
          conflict: entry.overflow.some(({ id }) => conflicts.has(id)),
          related: entry.overflow.some(({ refs }) =>
            refs.some(({ entityId }) => selectedEntities.has(entityId)),
          ),
          selected: entry.overflow.some(({ id }) => selectedConstraints.has(id)),
        });
        continue;
      }
      const affectedEntityIds = [...new Set(entry.refs.map(({ entityId }) => entityId))];
      result.push({
        id: entry.id,
        kind: 'constraint',
        constraintIds: [entry.id],
        label: LABELS[entry.type],
        title: tooltip(document, entry),
        screen,
        affectedEntityIds,
        conflict: conflicts.has(entry.id),
        related: affectedEntityIds.some((id) => selectedEntities.has(id)),
        selected: selectedConstraints.has(entry.id),
      });
    }
  }
  return result;
}
