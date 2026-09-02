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
}

function format(value: number): string {
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return rounded.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function midpoint(first: SketchPoint2D, second: SketchPoint2D): SketchPoint2D {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function entityLabel(
  document: SketchDocument,
  entityId: string,
): readonly {
  readonly id: string;
  readonly text: string;
  readonly anchor: SketchPoint2D;
  readonly offset: SketchPoint2D;
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
      },
      {
        id: 'sweep',
        text: `${format((sweep * 180) / Math.PI)}°`,
        anchor: {
          x: entity.center.x + Math.cos(middleAngle) * entity.radius * 1.25,
          y: entity.center.y + Math.sin(middleAngle) * entity.radius * 1.25,
        },
        offset: { x: Math.cos(middleAngle) * 18, y: -Math.sin(middleAngle) * 18 },
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
      },
      {
        id: 'minor',
        text: `${format(entity.minorRadius * 2)} mm`,
        anchor: entity.center,
        offset: { x: 42, y: 0 },
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

function place(
  desired: SketchPoint2D,
  occupied: readonly SketchPoint2D[],
  viewport?: { readonly width: number; readonly height: number },
): SketchPoint2D {
  let screen = { ...desired };
  let attempt = 0;
  while (
    occupied.some((point) => Math.abs(point.x - screen.x) < 86 && Math.abs(point.y - screen.y) < 24)
  ) {
    attempt += 1;
    screen = {
      x: desired.x + (attempt % 2 === 0 ? -1 : 1) * Math.ceil(attempt / 2) * 28,
      y: desired.y - 18 - attempt * 18,
    };
  }
  if (viewport) {
    screen = {
      x: Math.min(Math.max(screen.x, 54), Math.max(54, viewport.width - 54)),
      y: Math.min(Math.max(screen.y, 22), Math.max(22, viewport.height - 22)),
    };
  }
  return screen;
}

export function projectDimensionOverlay(
  document: SketchDocument,
  camera: Pick<Camera2D, 'worldToScreen'>,
  selection: { readonly entityIds: readonly string[]; readonly dimensionIds: readonly string[] },
  occupied: readonly SketchPoint2D[] = [],
  viewport?: { readonly width: number; readonly height: number },
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
      });
    }
  }
  return labels;
}
