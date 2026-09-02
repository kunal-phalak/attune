import {
  arcPoint,
  geometryBounds,
  positiveArcSweep,
  type SketchDocument,
  type SketchPoint2D,
} from '@attune/domain/editor';

import type { Camera2D } from './camera-2d';

export interface DimensionOverlayLabel {
  readonly id: string;
  readonly kind: 'driving' | 'selection' | 'temporary';
  readonly text: string;
  readonly screen: SketchPoint2D;
  readonly entityIds: readonly string[];
  readonly selected: boolean;
  /** Screen-space radians, normalized so text never renders upside down. */
  readonly rotation: number;
}

function format(value: number): string {
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return rounded.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function midpoint(first: SketchPoint2D, second: SketchPoint2D): SketchPoint2D {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function readableRotation(rotation: number): number {
  let result = rotation;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result <= -Math.PI) result += Math.PI * 2;
  if (result > Math.PI / 2) result -= Math.PI;
  if (result < -Math.PI / 2) result += Math.PI;
  return result;
}

function entityLabel(
  document: SketchDocument,
  entityId: string,
): readonly {
  readonly id: string;
  readonly text: string;
  readonly anchor: SketchPoint2D;
  readonly offset: SketchPoint2D;
  readonly rotation: number;
}[] {
  const entity = document.entities.find(({ id }) => id === entityId);
  if (!entity) return [];
  if (entity.kind === 'line') {
    const length = Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y);
    return [
      {
        id: 'length',
        text: `${format(length)} mm`,
        anchor: midpoint(entity.start, entity.end),
        offset: { x: 0, y: -30 },
        rotation: readableRotation(
          -Math.atan2(entity.end.y - entity.start.y, entity.end.x - entity.start.x),
        ),
      },
    ];
  }
  if (entity.kind === 'circle') {
    return [
      {
        id: 'diameter',
        text: `Ø ${format(entity.radius * 2)} mm`,
        anchor: entity.center,
        offset: { x: 0, y: -32 },
        rotation: -Math.PI / 6,
      },
    ];
  }
  if (entity.kind === 'arc') {
    const sweep = positiveArcSweep(entity.startAngle, entity.endAngle);
    const middleAngle = entity.startAngle + sweep / 2;
    const middle = arcPoint(entity, middleAngle);
    return [
      {
        id: 'radius',
        text: `R ${format(entity.radius)} mm`,
        anchor: midpoint(entity.center, middle),
        offset: { x: Math.cos(middleAngle) * 26, y: -Math.sin(middleAngle) * 26 },
        rotation: readableRotation(-middleAngle),
      },
      {
        id: 'sweep',
        text: `${format((sweep * 180) / Math.PI)}°`,
        anchor: {
          x: entity.center.x + Math.cos(middleAngle) * entity.radius * 1.25,
          y: entity.center.y + Math.sin(middleAngle) * entity.radius * 1.25,
        },
        offset: { x: Math.cos(middleAngle) * 18, y: -Math.sin(middleAngle) * 18 },
        rotation: readableRotation(-middleAngle - Math.PI / 2),
      },
    ];
  }
  if (entity.kind === 'ellipse') {
    return [
      {
        id: 'major',
        text: `${format(entity.majorRadius * 2)} mm`,
        anchor: entity.center,
        offset: { x: 0, y: -34 },
        rotation: readableRotation(-entity.rotation),
      },
      {
        id: 'minor',
        text: `${format(entity.minorRadius * 2)} mm`,
        anchor: entity.center,
        offset: { x: 42, y: 0 },
        rotation: readableRotation(-entity.rotation + Math.PI / 2),
      },
    ];
  }
  if (entity.kind === 'bspline') {
    return [
      {
        id: 'controls',
        text: `${entity.controlPoints.length} control points`,
        anchor: entity.controlPoints[Math.floor(entity.controlPoints.length / 2)],
        offset: { x: 0, y: -26 },
        rotation: 0,
      },
    ];
  }
  return [];
}

function dimensionAnchor(document: SketchDocument, entityIds: readonly string[]): SketchPoint2D {
  const bounds = entityIds.flatMap((id) => {
    const entity = document.entities.find(({ id: candidate }) => candidate === id);
    return entity ? [geometryBounds(entity)] : [];
  });
  if (bounds.length === 0) return { x: 0, y: 0 };
  return {
    x:
      (Math.min(...bounds.map(({ minX }) => minX)) + Math.max(...bounds.map(({ maxX }) => maxX))) /
      2,
    y: Math.max(...bounds.map(({ maxY }) => maxY)),
  };
}

function dimensionRotation(document: SketchDocument, entityIds: readonly string[]): number {
  const entity = document.entities.find(({ id }) => id === entityIds[0]);
  if (!entity) return 0;
  if (entity.kind === 'line') {
    return readableRotation(
      -Math.atan2(entity.end.y - entity.start.y, entity.end.x - entity.start.x),
    );
  }
  if (entity.kind === 'arc') {
    return readableRotation(
      -entity.startAngle - positiveArcSweep(entity.startAngle, entity.endAngle) / 2,
    );
  }
  if (entity.kind === 'ellipse') return readableRotation(-entity.rotation);
  return entity.kind === 'circle' ? -Math.PI / 6 : 0;
}

function place(
  desired: SketchPoint2D,
  occupied: readonly SketchPoint2D[],
  viewport?: {
    readonly width: number;
    readonly height: number;
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
  },
): SketchPoint2D {
  const clampToViewport = (candidate: SketchPoint2D): SketchPoint2D => {
    if (!viewport) return candidate;
    const left = viewport.left ?? 0;
    const right = viewport.right ?? 0;
    const top = viewport.top ?? 0;
    const bottom = viewport.bottom ?? 0;
    return {
      x: Math.min(
        Math.max(candidate.x, left + 54),
        Math.max(left + 54, viewport.width - right - 54),
      ),
      y: Math.min(
        Math.max(candidate.y, top + 22),
        Math.max(top + 22, viewport.height - bottom - 22),
      ),
    };
  };
  const candidates = [
    desired,
    { x: desired.x, y: desired.y - 32 },
    { x: desired.x, y: desired.y + 40 },
    { x: desired.x - 62, y: desired.y },
    { x: desired.x + 62, y: desired.y },
    { x: desired.x - 48, y: desired.y - 34 },
    { x: desired.x + 48, y: desired.y - 34 },
  ].map(clampToViewport);
  return candidates.toSorted((left, right) => {
    const score = (candidate: SketchPoint2D) =>
      occupied.filter(
        (point) => Math.abs(point.x - candidate.x) < 86 && Math.abs(point.y - candidate.y) < 24,
      ).length *
        10_000 +
      Math.hypot(candidate.x - desired.x, candidate.y - desired.y);
    return score(left) - score(right);
  })[0];
}

export function projectDimensionOverlay(
  document: SketchDocument,
  camera: Pick<Camera2D, 'worldToScreen'>,
  selection: { readonly entityIds: readonly string[]; readonly dimensionIds: readonly string[] },
  occupied: readonly SketchPoint2D[] = [],
  viewport?: {
    readonly width: number;
    readonly height: number;
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
  },
): readonly DimensionOverlayLabel[] {
  const labels: DimensionOverlayLabel[] = [];
  const used = [...occupied];
  for (const dimension of document.dimensions) {
    const entityIds = [...new Set(dimension.refs.map(({ entityId }) => entityId))];
    const rawValue =
      typeof dimension.value === 'number' ? format(dimension.value) : dimension.value.parameterId;
    const prefix = dimension.kind === 'radius' ? 'R ' : dimension.kind === 'diameter' ? 'Ø ' : '';
    const desired = camera.worldToScreen(dimensionAnchor(document, entityIds));
    const screen = place({ x: desired.x, y: desired.y - 24 }, used, viewport);
    used.push(screen);
    labels.push({
      id: dimension.id,
      kind: 'driving',
      text: dimension.label ?? `${prefix}${rawValue} mm`,
      screen,
      entityIds,
      selected: selection.dimensionIds.includes(dimension.id),
      rotation: dimensionRotation(document, entityIds),
    });
  }
  for (const entityId of selection.entityIds.length === 1 ? selection.entityIds : []) {
    if (document.dimensions.some(({ refs }) => refs.some(({ entityId: id }) => id === entityId)))
      continue;
    for (const measurement of entityLabel(document, entityId)) {
      const anchor = camera.worldToScreen(measurement.anchor);
      const screen = place(
        { x: anchor.x + measurement.offset.x, y: anchor.y + measurement.offset.y },
        used,
        viewport,
      );
      used.push(screen);
      labels.push({
        id: `selection-measurement:${entityId}:${measurement.id}`,
        kind: 'selection',
        text: measurement.text,
        screen,
        entityIds: [entityId],
        selected: false,
        rotation: measurement.rotation,
      });
    }
  }
  return labels;
}
