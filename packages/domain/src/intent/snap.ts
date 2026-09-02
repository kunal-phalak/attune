import type { SketchDocument } from '../sketch/document';
import {
  arcPoint,
  type GeometryAnchor,
  type GeometryEntity,
  type SketchPoint2D,
} from '../sketch/geometry';
import { createSelectionContext } from './selection-context';

export type SnapCandidateKind =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'grid'
  | 'horizontal'
  | 'vertical'
  | 'coincident'
  | 'tangent'
  | 'concentric';

export interface SnapCandidate {
  readonly kind: SnapCandidateKind;
  readonly point: SketchPoint2D;
  readonly distance: number;
  readonly score: number;
  readonly label: string;
  readonly entityId?: string;
  readonly anchor?: GeometryAnchor;
  readonly guide?: {
    readonly kind: 'horizontal' | 'vertical' | 'radial' | 'locus';
    readonly from: SketchPoint2D;
    readonly to: SketchPoint2D;
  };
}

export interface SnapResult {
  readonly point: SketchPoint2D;
  readonly source: 'none' | 'grid' | 'entity' | 'guide';
  readonly kind?: SnapCandidateKind;
  readonly entityId?: string;
  readonly anchor?: GeometryAnchor;
  readonly distance: number;
  readonly candidates?: readonly SnapCandidate[];
}

export interface SnapOptions {
  readonly gridStep: number;
  /** World-space tolerance retained for deterministic non-UI callers. */
  readonly tolerance?: number;
  /** Preferred UI input, converted through cameraZoom. */
  readonly screenTolerance?: number;
  readonly cameraZoom?: number;
  readonly origin?: SketchPoint2D;
  readonly movement?: SketchPoint2D;
  readonly currentTool?: 'select' | 'line' | 'rectangle' | 'circle' | 'arc' | 'ellipse' | 'bspline';
  readonly excludeEntityIds?: readonly string[];
}

export interface SnapHysteresisOptions {
  readonly captureScreenDistance?: number;
  readonly releaseScreenDistance?: number;
  readonly cameraZoom: number;
}

function pointDistance(first: SketchPoint2D, second: SketchPoint2D): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function sameCandidate(left: SnapCandidate, right: SnapCandidate): boolean {
  return (
    left.kind === right.kind &&
    left.entityId === right.entityId &&
    left.anchor === right.anchor &&
    pointDistance(left.point, right.point) <= 1e-7
  );
}

/**
 * Keeps a captured semantic snap until the pointer crosses a larger release radius. The caller
 * should rank candidates using at least `releaseScreenDistance` so the retained candidate remains
 * observable outside the initial capture radius.
 */
export function chooseSnapCandidateWithHysteresis(
  previous: SnapCandidate | null,
  candidates: readonly SnapCandidate[],
  options: SnapHysteresisOptions,
): SnapCandidate | null {
  const capture = (options.captureScreenDistance ?? 10) / options.cameraZoom;
  const release = (options.releaseScreenDistance ?? 15) / options.cameraZoom;
  if (previous) {
    const retained = candidates.find((candidate) => sameCandidate(candidate, previous));
    if (retained && retained.distance <= release) return retained;
  }
  return candidates.find(({ distance }) => distance <= capture) ?? null;
}

function weight(kind: SnapCandidateKind, tool: SnapOptions['currentTool']): number {
  const base: Record<SnapCandidateKind, number> = {
    coincident: 1,
    endpoint: 0.99,
    center: 0.97,
    concentric: 0.965,
    midpoint: 0.94,
    tangent: 0.92,
    horizontal: 0.89,
    vertical: 0.89,
    grid: 0.72,
  };
  if (tool === 'circle' && (kind === 'center' || kind === 'concentric')) return base[kind] + 0.04;
  if (tool === 'line' && (kind === 'endpoint' || kind === 'horizontal' || kind === 'vertical')) {
    return base[kind] + 0.03;
  }
  return base[kind];
}

function createCandidate(
  kind: SnapCandidateKind,
  candidatePoint: SketchPoint2D,
  target: SketchPoint2D,
  tolerance: number,
  tool: SnapOptions['currentTool'],
  details: Omit<SnapCandidate, 'kind' | 'point' | 'distance' | 'score'>,
): SnapCandidate {
  const distance = pointDistance(candidatePoint, target);
  return {
    kind,
    point: candidatePoint,
    distance,
    score: weight(kind, tool) - distance / Math.max(tolerance, 1e-9) / 4,
    ...details,
  };
}

function entityAnchors(entity: GeometryEntity): readonly {
  readonly kind: SnapCandidateKind;
  readonly point: SketchPoint2D;
  readonly anchor: GeometryAnchor;
  readonly label: string;
}[] {
  switch (entity.kind) {
    case 'point':
      return [{ kind: 'coincident', point: entity.position, anchor: 'self', label: 'Coincident' }];
    case 'line':
      return [
        { kind: 'endpoint', point: entity.start, anchor: 'start', label: 'Endpoint' },
        { kind: 'endpoint', point: entity.end, anchor: 'end', label: 'Endpoint' },
        {
          kind: 'midpoint',
          point: { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 },
          anchor: 'self',
          label: 'Midpoint',
        },
      ];
    case 'circle':
      return [{ kind: 'center', point: entity.center, anchor: 'center', label: 'Center' }];
    case 'arc':
      return [
        { kind: 'center', point: entity.center, anchor: 'center', label: 'Center' },
        {
          kind: 'endpoint',
          point: arcPoint(entity, entity.startAngle),
          anchor: 'start',
          label: 'Endpoint',
        },
        {
          kind: 'endpoint',
          point: arcPoint(entity, entity.endAngle),
          anchor: 'end',
          label: 'Endpoint',
        },
        {
          kind: 'midpoint',
          point: arcPoint(entity, entity.startAngle + (entity.endAngle - entity.startAngle) / 2),
          anchor: 'self',
          label: 'Arc midpoint',
        },
      ];
    case 'ellipse':
      return [{ kind: 'center', point: entity.center, anchor: 'center', label: 'Center' }];
    case 'bspline':
      return [
        { kind: 'endpoint', point: entity.controlPoints[0], anchor: 'start', label: 'Endpoint' },
        { kind: 'endpoint', point: entity.controlPoints.at(-1)!, anchor: 'end', label: 'Endpoint' },
      ];
  }
  throw new TypeError(`Unsupported geometry: ${JSON.stringify(entity)}`);
}

function tangentPoints(origin: SketchPoint2D, entity: GeometryEntity): readonly SketchPoint2D[] {
  if (entity.kind !== 'circle' && entity.kind !== 'arc') return [];
  const dx = origin.x - entity.center.x;
  const dy = origin.y - entity.center.y;
  const distanceSquared = dx * dx + dy * dy;
  const radiusSquared = entity.radius * entity.radius;
  if (distanceSquared <= radiusSquared + 1e-9) return [];
  const scale = radiusSquared / distanceSquared;
  const offset = (entity.radius * Math.sqrt(distanceSquared - radiusSquared)) / distanceSquared;
  return [
    {
      x: entity.center.x + scale * dx - offset * dy,
      y: entity.center.y + scale * dy + offset * dx,
    },
    {
      x: entity.center.x + scale * dx + offset * dy,
      y: entity.center.y + scale * dy - offset * dx,
    },
  ];
}

export function rankSnapCandidates(
  document: SketchDocument,
  point: SketchPoint2D,
  options: SnapOptions,
): readonly SnapCandidate[] {
  const tolerance =
    options.tolerance ?? (options.screenTolerance ?? 10) / (options.cameraZoom ?? 1);
  const excluded = new Set(options.excludeEntityIds ?? []);
  const candidates: SnapCandidate[] = [];
  const grid = {
    x: Math.round(point.x / options.gridStep) * options.gridStep,
    y: Math.round(point.y / options.gridStep) * options.gridStep,
  };
  if (pointDistance(point, grid) <= tolerance) {
    candidates.push(
      createCandidate('grid', grid, point, tolerance, options.currentTool, { label: 'Grid' }),
    );
  }

  const context = createSelectionContext(document, { worldPoint: point, tolerance: tolerance * 2 });
  for (const { entityId } of context.nearbyEntities) {
    if (excluded.has(entityId)) continue;
    const entity = document.entities.find(({ id }) => id === entityId);
    if (!entity) continue;
    for (const anchor of entityAnchors(entity)) {
      if (pointDistance(point, anchor.point) > tolerance) continue;
      const kind =
        anchor.kind === 'center' && options.currentTool === 'circle' ? 'concentric' : anchor.kind;
      candidates.push(
        createCandidate(kind, anchor.point, point, tolerance, options.currentTool, {
          label: kind === 'concentric' ? 'Concentric' : anchor.label,
          entityId,
          anchor: anchor.anchor,
        }),
      );
    }
    if (options.origin) {
      for (const tangent of tangentPoints(options.origin, entity)) {
        if (pointDistance(point, tangent) > tolerance) continue;
        candidates.push(
          createCandidate('tangent', tangent, point, tolerance, options.currentTool, {
            label: 'Tangent',
            entityId,
            guide: {
              kind: 'radial',
              from: entity.kind === 'circle' || entity.kind === 'arc' ? entity.center : tangent,
              to: tangent,
            },
          }),
        );
      }
    }
  }

  if (options.origin) {
    const horizontal = { x: point.x, y: options.origin.y };
    const vertical = { x: options.origin.x, y: point.y };
    if (Math.abs(point.y - options.origin.y) <= tolerance) {
      candidates.push(
        createCandidate('horizontal', horizontal, point, tolerance, options.currentTool, {
          label: 'Horizontal',
          guide: { kind: 'horizontal', from: options.origin, to: horizontal },
        }),
      );
    }
    if (Math.abs(point.x - options.origin.x) <= tolerance) {
      candidates.push(
        createCandidate('vertical', vertical, point, tolerance, options.currentTool, {
          label: 'Vertical',
          guide: { kind: 'vertical', from: options.origin, to: vertical },
        }),
      );
    }
  }

  return candidates.toSorted(
    (left, right) =>
      right.score - left.score ||
      left.distance - right.distance ||
      left.label.localeCompare(right.label),
  );
}

export function snapSketchPoint(
  document: SketchDocument,
  point: SketchPoint2D,
  options: SnapOptions,
): SnapResult {
  const candidates = rankSnapCandidates(document, point, options);
  const primary = candidates[0];
  if (!primary)
    return { point, source: 'none', distance: Number.POSITIVE_INFINITY, candidates: [] };
  return {
    point: primary.point,
    source:
      primary.kind === 'grid'
        ? 'grid'
        : primary.kind === 'horizontal' || primary.kind === 'vertical'
          ? 'guide'
          : 'entity',
    kind: primary.kind,
    ...(primary.entityId ? { entityId: primary.entityId } : {}),
    ...(primary.anchor ? { anchor: primary.anchor } : {}),
    distance: primary.distance,
    candidates,
  };
}
