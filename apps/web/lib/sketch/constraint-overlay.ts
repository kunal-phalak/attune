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
  readonly constraintType?: SketchConstraint['type'];
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

const CLUSTER_RADIUS_PX = 42;
const BADGE_CLEARANCE_PX = 21;
const BADGE_OFFSETS: readonly SketchPoint2D[] = [
  { x: 13, y: -18 },
  { x: 35, y: -18 },
  { x: 13, y: 4 },
  { x: 35, y: 4 },
  { x: -13, y: -18 },
  { x: -35, y: -18 },
  { x: -13, y: 4 },
  { x: -35, y: 4 },
  { x: 13, y: -40 },
  { x: -13, y: -40 },
];

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

interface ConstraintCluster {
  screen: SketchPoint2D;
  constraints: SketchConstraint[];
}

type ConstraintEntry = SketchConstraint | { readonly overflow: readonly SketchConstraint[] };

interface ProjectionState {
  readonly document: SketchDocument;
  readonly selectedEntities: ReadonlySet<string>;
  readonly selectedConstraints: ReadonlySet<string>;
  readonly conflicts: ReadonlySet<string>;
}

function clusterConstraints(
  document: SketchDocument,
  camera: Pick<Camera2D, 'worldToScreen'>,
): readonly ConstraintCluster[] {
  const clustered: ConstraintCluster[] = [];
  const constraints = document.constraints
    .filter(({ temporary }) => !temporary)
    .toSorted((left, right) => left.id.localeCompare(right.id));
  for (const constraint of constraints) {
    const anchor = camera.worldToScreen(entityAnchor(document, constraint));
    const cluster = clustered.find(
      ({ screen }) => Math.hypot(screen.x - anchor.x, screen.y - anchor.y) < CLUSTER_RADIUS_PX,
    );
    if (!cluster) {
      clustered.push({ screen: anchor, constraints: [constraint] });
      continue;
    }
    const count = cluster.constraints.length;
    cluster.screen = {
      x: (cluster.screen.x * count + anchor.x) / (count + 1),
      y: (cluster.screen.y * count + anchor.y) / (count + 1),
    };
    cluster.constraints.push(constraint);
  }
  return clustered;
}

function availableBadgePosition(
  anchor: SketchPoint2D,
  preferredIndex: number,
  occupied: readonly SketchPoint2D[],
): SketchPoint2D {
  const candidates = BADGE_OFFSETS.map((offset, candidateIndex) => ({
    screen: { x: anchor.x + offset.x, y: anchor.y + offset.y },
    candidateIndex,
  }));
  return candidates.toSorted((left, right) => {
    const score = ({ screen, candidateIndex }: (typeof candidates)[number]) =>
      occupied.filter(
        (point) => Math.hypot(point.x - screen.x, point.y - screen.y) < BADGE_CLEARANCE_PX,
      ).length *
        10_000 +
      Math.abs(candidateIndex - preferredIndex) * 100 +
      Math.hypot(screen.x - anchor.x, screen.y - anchor.y);
    return score(left) - score(right);
  })[0].screen;
}

function projectEntry(
  entry: ConstraintEntry,
  clusterIndex: number,
  screen: SketchPoint2D,
  state: ProjectionState,
): ConstraintOverlayBadge {
  const { document, selectedEntities, selectedConstraints, conflicts } = state;
  if ('overflow' in entry) {
    const ids = entry.overflow.map(({ id }) => id);
    const affectedEntityIds = [
      ...new Set(entry.overflow.flatMap(({ refs }) => refs.map(({ entityId }) => entityId))),
    ];
    return {
      id: `constraint-overflow:${clusterIndex}`,
      kind: 'overflow',
      constraintIds: ids,
      label: `+${ids.length}`,
      title: entry.overflow.map((constraint) => tooltip(document, constraint)).join('\n'),
      screen,
      affectedEntityIds,
      conflict: entry.overflow.some(({ id }) => conflicts.has(id)),
      related: affectedEntityIds.some((id) => selectedEntities.has(id)),
      selected: ids.some((id) => selectedConstraints.has(id)),
    };
  }
  const affectedEntityIds = [...new Set(entry.refs.map(({ entityId }) => entityId))];
  return {
    id: entry.id,
    kind: 'constraint',
    constraintType: entry.type,
    constraintIds: [entry.id],
    label: LABELS[entry.type],
    title: tooltip(document, entry),
    screen,
    affectedEntityIds,
    conflict: conflicts.has(entry.id),
    related: affectedEntityIds.some((id) => selectedEntities.has(id)),
    selected: selectedConstraints.has(entry.id),
  };
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
  const state = { document, selectedEntities, selectedConstraints, conflicts };
  const result: ConstraintOverlayBadge[] = [];
  const occupied: SketchPoint2D[] = [];
  for (const [clusterIndex, cluster] of clusterConstraints(document, camera).entries()) {
    const ordered = cluster.constraints.toSorted((left, right) => left.id.localeCompare(right.id));
    const visible = ordered.length > 3 ? ordered.slice(0, 2) : ordered;
    const entries: readonly ConstraintEntry[] = [
      ...visible,
      ...(ordered.length > 3 ? [{ overflow: ordered.slice(2) }] : []),
    ];
    for (const [index, entry] of entries.entries()) {
      const screen = availableBadgePosition(cluster.screen, index, occupied);
      occupied.push(screen);
      result.push(projectEntry(entry, clusterIndex, screen, state));
    }
  }
  return result;
}
