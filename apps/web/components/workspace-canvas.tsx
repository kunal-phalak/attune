'use client';

import {
  addToSelection,
  applySketchCommand,
  arcPoint,
  bsplineCreation,
  chooseSnapCandidateWithHysteresis,
  circleCreation,
  constraintInputForTool,
  constraintToolApplicability,
  defaultDimensionValue,
  dimensionInputForTool,
  ellipsePoint,
  ellipseCreation,
  EMPTY_SELECTION_SET,
  geometryBounds,
  geometryNodeIds,
  hitTestSketch,
  moveSketchNode,
  pruneSelection,
  positiveArcSweep,
  rankSnapCandidates,
  rectangleCreation,
  replaceSelection,
  selectEntitiesInMarquee,
  selectionCount,
  threePointArcCreation,
  trimSegmentAtPoint,
  toggleSelection,
  type GeometryEntity,
  type DefinitionStateAnalysis,
  type SelectionSet,
  type SketchCommand,
  type SketchBounds,
  type SketchDocument,
  type SketchPoint2D,
  type SnapCandidate,
} from '@attune/domain/editor';
import { Button } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import { NumberField } from '@cloudflare/kumo/primitives/number-field';
import type {
  Canvas as SkCanvas,
  CanvasKit,
  Image as SkImage,
  Paint,
  Surface,
} from 'canvaskit-wasm';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { getBrowserPlaneGcsPreviewRuntime } from '../lib/sketch/browser-planegcs';
import { Camera2D, type FitPadding, type ViewportSize } from '../lib/sketch/camera-2d';
import {
  projectGeometryForCanvas,
  projectSketchForCanvas,
} from '../lib/sketch/canvaskit-projection';
import { closedProfileContours } from '../lib/sketch/closed-profiles';
import {
  projectConstraintOverlay,
  type ConstraintOverlayBadge,
} from '../lib/sketch/constraint-overlay';
import {
  projectDimensionOverlay,
  type DimensionOverlayLabel,
} from '../lib/sketch/dimension-overlay';
import { editorCursorFor, type EditorCursorMode } from '../lib/sketch/editor-cursors';
import { editorToastManager } from '../lib/sketch/editor-toast';
import { adaptiveGridStep } from '../lib/sketch/grid';
import type { CanvasTool, ConstraintTool } from '../lib/sketch/panel-state';
import {
  previewGeometryTransform,
  selectionBounds,
  type GeometryTransform,
} from '../lib/sketch/transform-preview';
import type { ViewportInsets } from '../lib/sketch/viewport-insets';
import { AppIcons } from './ui/app-icons';
import { WorkspaceOrientationHud } from './workspace-orientation-hud';

declare global {
  interface Window {
    CanvasKitInit?: (options: {
      readonly locateFile: (file: string) => string;
    }) => Promise<CanvasKit>;
  }
}

let canvasKitPromise: Promise<CanvasKit> | undefined;
const canvasTextImages = new Map<
  string,
  { readonly image: SkImage; readonly width: number; readonly height: number }
>();

function loadCanvasKit(): Promise<CanvasKit> {
  canvasKitPromise ??= new Promise<CanvasKit>((resolve, reject) => {
    const initialize = () => {
      if (!window.CanvasKitInit) {
        reject(new Error('CanvasKit runtime did not initialize.'));
        return;
      }
      void window
        .CanvasKitInit({ locateFile: () => '/canvaskit/canvaskit.wasm' })
        .then(resolve, reject);
    };
    if (window.CanvasKitInit) {
      initialize();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-attune-canvaskit]');
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', initialize, { once: true });
    script.addEventListener('error', () => reject(new Error('CanvasKit runtime failed to load.')), {
      once: true,
    });
    if (!existing) {
      script.src = '/canvaskit/canvaskit.js';
      script.async = true;
      script.dataset.attuneCanvaskit = '';
      document.head.append(script);
    }
  });
  return canvasKitPromise;
}

export interface WorkspaceCanvasHandle {
  fitSketch(): void;
  resetView(): void;
}

interface CanvasMetrics extends ViewportSize {
  readonly pixelRatio: number;
}

interface EditorHover {
  readonly entityId: string | null;
  readonly nodeId: string | null;
  readonly constraintEntityIds: readonly string[];
}

export interface CameraViewState extends ViewportSize {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly gridStep: number;
}

export interface CanvasCommentPlacement {
  readonly screen: { readonly x: number; readonly y: number };
  readonly world: { readonly x: number; readonly y: number };
  readonly entityId?: string;
  readonly nodeId?: string;
}

type TransformKind = 'move' | 'rotate' | 'scale';

type PointerSession =
  | {
      readonly mode: 'pan';
      readonly id: number;
      x: number;
      y: number;
      commentPlacement?: {
        readonly originX: number;
        readonly originY: number;
        readonly allowPlacement: boolean;
        moved: boolean;
      };
    }
  | {
      readonly mode: 'marquee';
      readonly id: number;
      readonly originScreen: SketchPoint2D;
      currentScreen: SketchPoint2D;
      readonly originWorld: SketchPoint2D;
      readonly additive: boolean;
    }
  | {
      readonly mode: 'drag-node';
      readonly id: number;
      readonly dragSessionId: string;
      readonly nodeId: string;
      readonly base: SketchDocument;
      readonly origin: SketchPoint2D;
      target: SketchPoint2D;
      generation: number;
      immobile: boolean;
    }
  | {
      readonly mode: 'transform';
      readonly id: number;
      readonly dragSessionId: string;
      readonly kind: TransformKind;
      readonly base: SketchDocument;
      readonly entityIds: readonly string[];
      readonly originWorld: SketchPoint2D;
      readonly pivot: SketchPoint2D;
      readonly startVector: SketchPoint2D;
      targetWorld: SketchPoint2D;
      generation: number;
      transform: GeometryTransform;
    };

interface CreationSession {
  readonly tool: Exclude<CanvasTool, 'select' | 'trim'>;
  readonly points: readonly SketchPoint2D[];
  readonly current: SketchPoint2D | null;
  readonly snapCandidates: readonly SnapCandidate[];
}

type DimensionEditorState =
  | {
      readonly mode: 'edit';
      readonly id: string;
      readonly value: number;
      readonly screen: SketchPoint2D;
    }
  | {
      readonly mode: 'create';
      readonly id: string;
      readonly kind: 'distance' | 'radius' | 'diameter';
      readonly value: number;
      readonly screen: SketchPoint2D;
    };

interface MarqueeVisual {
  readonly origin: SketchPoint2D;
  readonly target: SketchPoint2D;
}

const EMPTY_HOVER: EditorHover = { entityId: null, nodeId: null, constraintEntityIds: [] };
const EMPTY_REMOTE_SELECTIONS: readonly {
  readonly color: readonly [number, number, number];
  readonly entityIds: readonly string[];
}[] = [];

function paint(
  canvasKit: CanvasKit,
  color: ReturnType<CanvasKit['Color']>,
  strokeWidth: number,
): Paint {
  const result = new canvasKit.Paint();
  result.setAntiAlias(true);
  result.setColor(color);
  result.setStyle(canvasKit.PaintStyle.Stroke);
  result.setStrokeWidth(strokeWidth);
  result.setStrokeCap(canvasKit.StrokeCap.Round);
  return result;
}

function drawGrid(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  viewport: ViewportSize,
): void {
  const minorStep = adaptiveGridStep(camera.zoom);
  const topLeft = camera.screenToWorld({ x: 0, y: 0 });
  const bottomRight = camera.screenToWorld({ x: viewport.width, y: viewport.height });
  const minimumX = Math.min(topLeft.x, bottomRight.x);
  const maximumX = Math.max(topLeft.x, bottomRight.x);
  const minimumY = Math.min(topLeft.y, bottomRight.y);
  const maximumY = Math.max(topLeft.y, bottomRight.y);
  const minor = paint(canvasKit, canvasKit.Color(74, 85, 104, 0.08), 0.7 / camera.zoom);
  const major = paint(canvasKit, canvasKit.Color(74, 85, 104, 0.16), 0.9 / camera.zoom);
  try {
    for (
      let index = Math.floor(minimumX / minorStep);
      index <= Math.ceil(maximumX / minorStep);
      index += 1
    ) {
      const x = index * minorStep;
      if (Math.abs(x) >= minorStep / 1000) {
        canvas.drawLine(x, minimumY, x, maximumY, index % 5 === 0 ? major : minor);
      }
    }
    for (
      let index = Math.floor(minimumY / minorStep);
      index <= Math.ceil(maximumY / minorStep);
      index += 1
    ) {
      const y = index * minorStep;
      if (Math.abs(y) >= minorStep / 1000) {
        canvas.drawLine(minimumX, y, maximumX, y, index % 5 === 0 ? major : minor);
      }
    }
  } finally {
    minor.delete();
    major.delete();
  }
}

function drawAxes(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  viewport: ViewportSize,
): void {
  const topLeft = camera.screenToWorld({ x: 0, y: 0 });
  const bottomRight = camera.screenToWorld({ x: viewport.width, y: viewport.height });
  const xAxis = paint(canvasKit, canvasKit.Color(203, 84, 65, 0.5), 1 / camera.zoom);
  const yAxis = paint(canvasKit, canvasKit.Color(46, 137, 113, 0.5), 1 / camera.zoom);
  try {
    canvas.drawLine(
      Math.min(topLeft.x, bottomRight.x),
      0,
      Math.max(topLeft.x, bottomRight.x),
      0,
      xAxis,
    );
    canvas.drawLine(
      0,
      Math.min(topLeft.y, bottomRight.y),
      0,
      Math.max(topLeft.y, bottomRight.y),
      yAxis,
    );
  } finally {
    xAxis.delete();
    yAxis.delete();
  }
}

function drawPrimitive(
  canvas: SkCanvas,
  primitive: ReturnType<typeof projectSketchForCanvas>[number],
  entityPaint: Paint,
): void {
  if (primitive.kind === 'point') {
    canvas.drawCircle(primitive.position.x, primitive.position.y, 2.5, entityPaint);
  } else if (primitive.kind === 'line') {
    canvas.drawLine(
      primitive.start.x,
      primitive.start.y,
      primitive.end.x,
      primitive.end.y,
      entityPaint,
    );
  } else if (primitive.kind === 'circle') {
    canvas.drawCircle(primitive.center.x, primitive.center.y, primitive.radius, entityPaint);
  } else if (primitive.kind === 'arc') {
    canvas.drawArc(
      [
        primitive.center.x - primitive.radius,
        primitive.center.y - primitive.radius,
        primitive.center.x + primitive.radius,
        primitive.center.y + primitive.radius,
      ],
      (primitive.startAngle * 180) / Math.PI,
      (primitive.sweepAngle * 180) / Math.PI,
      false,
      entityPaint,
    );
  } else if (primitive.kind === 'ellipse') {
    canvas.save();
    canvas.rotate((primitive.rotation * 180) / Math.PI, primitive.center.x, primitive.center.y);
    canvas.drawOval(
      [
        primitive.center.x - primitive.majorRadius,
        primitive.center.y - primitive.minorRadius,
        primitive.center.x + primitive.majorRadius,
        primitive.center.y + primitive.minorRadius,
      ],
      entityPaint,
    );
    canvas.restore();
  } else {
    for (let index = 1; index < primitive.points.length; index += 1) {
      const first = primitive.points[index - 1];
      const second = primitive.points[index];
      canvas.drawLine(first.x, first.y, second.x, second.y, entityPaint);
    }
  }
}

const projectionCache = new WeakMap<SketchDocument, ReturnType<typeof projectSketchForCanvas>>();
const profileCache = new WeakMap<SketchDocument, ReturnType<typeof closedProfileContours>>();

function projection(document: SketchDocument) {
  const cached = projectionCache.get(document);
  if (cached) return cached;
  const next = projectSketchForCanvas(document);
  projectionCache.set(document, next);
  return next;
}

function profiles(document: SketchDocument) {
  const cached = profileCache.get(document);
  if (cached) return cached;
  const next = closedProfileContours(document);
  profileCache.set(document, next);
  return next;
}

function drawProfiles(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  document: SketchDocument,
  selection: SelectionSet,
  enabled: boolean,
): void {
  if (!enabled) return;
  const contours = profiles(document);
  if (contours.length === 0) return;
  const builder = new canvasKit.PathBuilder();
  for (const contour of contours) {
    const first = contour.points[0];
    if (!first) continue;
    builder.moveTo(first.x, first.y);
    contour.points.slice(1).forEach((point) => builder.lineTo(point.x, point.y));
    builder.close();
  }
  const path = builder.detachAndDelete();
  path.setFillType(canvasKit.FillType.EvenOdd);
  const fill = new canvasKit.Paint();
  fill.setAntiAlias(true);
  fill.setStyle(canvasKit.PaintStyle.Fill);
  fill.setColor(canvasKit.Color(67, 121, 157, 0.08));
  try {
    canvas.drawPath(path, fill);
    const selected = new Set(selection.entityIds);
    for (const contour of contours.filter(({ entityIds }) =>
      entityIds.every((id) => selected.has(id)),
    )) {
      const selectedBuilder = new canvasKit.PathBuilder();
      const first = contour.points[0];
      if (!first) continue;
      selectedBuilder.moveTo(first.x, first.y);
      contour.points.slice(1).forEach((point) => selectedBuilder.lineTo(point.x, point.y));
      selectedBuilder.close();
      const selectedPath = selectedBuilder.detachAndDelete();
      fill.setColor(canvasKit.Color(234, 122, 45, 0.14));
      canvas.drawPath(selectedPath, fill);
      selectedPath.delete();
    }
  } finally {
    path.delete();
    fill.delete();
  }
}

function drawSketch(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  document: SketchDocument | null,
  selection: SelectionSet,
  hover: EditorHover,
  definition: DefinitionStateAnalysis | null,
  profileFill: boolean,
  remoteSelections: readonly {
    readonly color: readonly [number, number, number];
    readonly entityIds: readonly string[];
  }[],
): void {
  if (!document) return;
  drawProfiles(canvasKit, canvas, document, selection, profileFill);
  const under = paint(canvasKit, canvasKit.Color(35, 126, 184, 0.96), 1.7 / camera.zoom);
  const full = paint(canvasKit, canvasKit.Color(34, 139, 94, 0.98), 1.8 / camera.zoom);
  const conflict = paint(canvasKit, canvasKit.Color(205, 48, 62, 1), 2.25 / camera.zoom);
  const selectedUnder = paint(canvasKit, canvasKit.Color(232, 112, 32, 1), 2 / camera.zoom);
  const halo = paint(canvasKit, canvasKit.Color(246, 143, 62, 0.62), 3.6 / camera.zoom);
  const hoverPaint = paint(canvasKit, canvasKit.Color(72, 161, 211, 0.58), 3 / camera.zoom);
  const construction = paint(canvasKit, canvasKit.Color(104, 124, 141, 0.75), 1.2 / camera.zoom);
  const selectedIds = new Set(selection.entityIds);
  const relatedIds = new Set(hover.constraintEntityIds);
  for (const constraintId of selection.constraintIds) {
    document.constraints
      .find(({ id }) => id === constraintId)
      ?.refs.forEach(({ entityId }) => relatedIds.add(entityId));
  }
  try {
    for (const primitive of projection(document)) {
      const entity = document.entities.find(({ id }) => id === primitive.id);
      const state = definition?.entities[primitive.id];
      const isConflict = (state?.conflictRefs.length ?? 0) > 0;
      const selected = selectedIds.has(primitive.id);
      const related = relatedIds.has(primitive.id);
      const remote = remoteSelections.find(({ entityIds }) => entityIds.includes(primitive.id));
      if (selected || related) drawPrimitive(canvas, primitive, halo);
      if (!selected && primitive.id === hover.entityId)
        drawPrimitive(canvas, primitive, hoverPaint);
      if (remote) {
        const remoteHalo = paint(
          canvasKit,
          canvasKit.Color(remote.color[0], remote.color[1], remote.color[2], 0.75),
          5 / camera.zoom,
        );
        drawPrimitive(canvas, primitive, remoteHalo);
        remoteHalo.delete();
      }
      const semantic = isConflict
        ? conflict
        : entity?.construction
          ? construction
          : selected && !state?.fullyDefined
            ? selectedUnder
            : state?.fullyDefined
              ? full
              : under;
      drawPrimitive(canvas, primitive, semantic);
    }
    const visibleNodes = new Set([
      ...selection.nodeIds,
      ...document.entities.filter(({ id }) => selectedIds.has(id)).flatMap(geometryNodeIds),
    ]);
    const fill = new canvasKit.Paint();
    fill.setAntiAlias(true);
    fill.setStyle(canvasKit.PaintStyle.Fill);
    for (const node of document.nodes) {
      if (!visibleNodes.has(node.id)) continue;
      const state = definition?.nodes[node.id];
      const active = selection.nodeIds.includes(node.id);
      const radius = (active ? 5.2 : 4.2) / camera.zoom;
      fill.setColor(
        (state?.conflictRefs.length ?? 0) > 0
          ? canvasKit.Color(205, 48, 62, 1)
          : state?.fullyDefined
            ? canvasKit.Color(34, 139, 94, 1)
            : active || node.id === hover.nodeId
              ? canvasKit.Color(232, 112, 32, 1)
              : canvasKit.Color(247, 248, 249, 1),
      );
      canvas.drawCircle(node.position.x, node.position.y, radius, halo);
      canvas.drawCircle(node.position.x, node.position.y, radius, fill);
    }
    fill.delete();
  } finally {
    under.delete();
    full.delete();
    conflict.delete();
    selectedUnder.delete();
    halo.delete();
    hoverPaint.delete();
    construction.delete();
  }
}

function drawTrimPreview(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  entity: GeometryEntity | null,
): void {
  if (!entity) return;
  const erase = paint(canvasKit, canvasKit.Color(205, 48, 62, 0.98), 4.4 / camera.zoom);
  try {
    drawPrimitive(canvas, projectGeometryForCanvas(entity), erase);
  } finally {
    erase.delete();
  }
}

function creationPreview(session: CreationSession): ReturnType<typeof projectSketchForCanvas> {
  if (!session.current || session.points.length === 0) return [];
  const id = 'preview:creation';
  try {
    if (session.tool === 'line') {
      return [{ id, kind: 'line', start: session.points.at(-1)!, end: session.current }];
    }
    if (session.tool === 'rectangle') {
      const first = session.points[0];
      const opposite = session.current;
      return [
        { id, kind: 'line', start: first, end: { x: opposite.x, y: first.y } },
        { id, kind: 'line', start: { x: opposite.x, y: first.y }, end: opposite },
        { id, kind: 'line', start: opposite, end: { x: first.x, y: opposite.y } },
        { id, kind: 'line', start: { x: first.x, y: opposite.y }, end: first },
      ];
    }
    if (session.tool === 'circle') {
      const center = session.points[0];
      return [
        {
          id,
          kind: 'circle',
          center,
          radius: Math.hypot(session.current.x - center.x, session.current.y - center.y),
        },
      ];
    }
    if (session.tool === 'arc' && session.points.length >= 2) {
      const entity = threePointArcCreation(
        id,
        session.points[0],
        session.points[1],
        session.current,
      ).entities[0];
      if (entity?.kind !== 'arc') return [];
      return [
        {
          id,
          kind: 'arc',
          center: entity.center,
          radius: entity.radius,
          startAngle: entity.startAngle,
          sweepAngle: entity.endAngle - entity.startAngle,
        },
      ];
    }
    if (session.tool === 'ellipse' && session.points.length >= 2) {
      const center = session.points[0];
      const majorPoint = session.points[1];
      const dx = majorPoint.x - center.x;
      const dy = majorPoint.y - center.y;
      const majorRadius = Math.hypot(dx, dy);
      const minorRadius =
        Math.abs((session.current.x - center.x) * -dy + (session.current.y - center.y) * dx) /
        Math.max(majorRadius, 1e-9);
      return [
        { id, kind: 'ellipse', center, majorRadius, minorRadius, rotation: Math.atan2(dy, dx) },
      ];
    }
    if (session.tool === 'bspline') {
      const points = [...session.points, session.current];
      if (points.length < 4) return [];
      const entity = bsplineCreation(id, points).entities[0];
      if (entity?.kind !== 'bspline') return [];
      const previewDocument: SketchDocument = {
        schemaVersion: 1,
        id,
        revision: 0,
        name: 'Preview',
        nodes: [],
        entities: [{ ...entity, version: 1 }],
        constraints: [],
        dimensions: [],
        groups: [],
        parameters: [],
      };
      return projectSketchForCanvas(previewDocument);
    }
  } catch {
    return [];
  }
  return [];
}

function drawCreationGuides(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  session: CreationSession | null,
): void {
  if (!session) return;
  const guide = paint(canvasKit, canvasKit.Color(76, 111, 137, 0.58), 1.05 / camera.zoom);
  const active = paint(canvasKit, canvasKit.Color(232, 112, 32, 0.95), 1.8 / camera.zoom);
  const dash = canvasKit.PathEffect.MakeDash([7 / camera.zoom, 5 / camera.zoom]);
  guide.setPathEffect(dash);
  try {
    for (const [index, candidate] of session.snapCandidates.slice(0, 3).entries()) {
      if (candidate.guide) {
        canvas.drawLine(
          candidate.guide.from.x,
          candidate.guide.from.y,
          candidate.guide.to.x,
          candidate.guide.to.y,
          guide,
        );
      }
      if (index === 0) {
        canvas.drawCircle(candidate.point.x, candidate.point.y, 5 / camera.zoom, active);
      }
    }
    const preview = creationPreview(session);
    preview.forEach((primitive) => drawPrimitive(canvas, primitive, active));
    if (session.current && session.points.length > 0) {
      const origin = session.points[0];
      if (session.tool === 'circle')
        canvas.drawLine(origin.x, origin.y, session.current.x, session.current.y, guide);
      if (session.tool === 'ellipse' && session.points[1]) {
        const major = session.points[1];
        canvas.drawLine(origin.x, origin.y, major.x, major.y, guide);
        canvas.drawLine(origin.x, origin.y, session.current.x, session.current.y, guide);
      }
      if (session.tool === 'arc' && preview[0]?.kind === 'arc') {
        const arc = preview[0];
        canvas.drawCircle(arc.center.x, arc.center.y, arc.radius, guide);
        canvas.drawLine(arc.center.x, arc.center.y, session.current.x, session.current.y, guide);
      }
      if (session.tool === 'bspline') {
        const controls = [...session.points, session.current];
        for (let index = 1; index < controls.length; index += 1) {
          canvas.drawLine(
            controls[index - 1].x,
            controls[index - 1].y,
            controls[index].x,
            controls[index].y,
            guide,
          );
        }
      }
    }
  } finally {
    guide.setPathEffect(null);
    dash.delete();
    guide.delete();
    active.delete();
  }
}

function drawMarquee(canvasKit: CanvasKit, canvas: SkCanvas, marquee: MarqueeVisual | null): void {
  if (!marquee) return;
  const enclosed = marquee.target.x >= marquee.origin.x;
  const outline = paint(
    canvasKit,
    enclosed ? canvasKit.Color(35, 126, 184, 0.9) : canvasKit.Color(232, 112, 32, 0.9),
    1,
  );
  const fill = new canvasKit.Paint();
  fill.setStyle(canvasKit.PaintStyle.Fill);
  fill.setColor(
    enclosed ? canvasKit.Color(35, 126, 184, 0.08) : canvasKit.Color(232, 112, 32, 0.08),
  );
  const rectangle = [
    Math.min(marquee.origin.x, marquee.target.x),
    Math.min(marquee.origin.y, marquee.target.y),
    Math.max(marquee.origin.x, marquee.target.x),
    Math.max(marquee.origin.y, marquee.target.y),
  ];
  try {
    canvas.drawRect(rectangle, fill);
    canvas.drawRect(rectangle, outline);
  } finally {
    fill.delete();
    outline.delete();
  }
}

function drawScreenArrow(
  canvas: SkCanvas,
  tip: SketchPoint2D,
  toward: SketchPoint2D,
  line: Paint,
): void {
  const angle = Math.atan2(toward.y - tip.y, toward.x - tip.x);
  const length = 7;
  for (const offset of [-0.48, 0.48]) {
    canvas.drawLine(
      tip.x,
      tip.y,
      tip.x + Math.cos(angle + offset) * length,
      tip.y + Math.sin(angle + offset) * length,
      line,
    );
  }
}

function drawCanvasText(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  text: string,
  screen: SketchPoint2D,
  color: readonly [number, number, number],
  size = 11,
  rotation = 0,
): void {
  const key = `${text}|${color.join(',')}|${size}`;
  let cached = canvasTextImages.get(key);
  if (!cached) {
    const scale = 2;
    const source = document.createElement('canvas');
    const context = source.getContext('2d');
    if (!context) return;
    context.font = `500 ${size * scale}px Geist, system-ui, sans-serif`;
    const width = Math.ceil(context.measureText(text).width / scale + 8);
    const height = Math.ceil(size * 1.65 + 6);
    source.width = width * scale;
    source.height = height * scale;
    context.scale(scale, scale);
    context.font = `500 ${size}px Geist, system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(247, 248, 249, 0.92)';
    context.lineWidth = 3.2;
    context.fillStyle = `rgb(${color.join(' ')})`;
    context.strokeText(text, width / 2, height / 2);
    context.fillText(text, width / 2, height / 2);
    cached = { image: canvasKit.MakeImageFromCanvasImageSource(source), width, height };
    canvasTextImages.set(key, cached);
    if (canvasTextImages.size > 96) {
      const oldest = canvasTextImages.entries().next();
      if (!oldest.done && oldest.value[0] !== key) {
        oldest.value[1].image.delete();
        canvasTextImages.delete(oldest.value[0]);
      }
    }
  }
  const imagePaint = new canvasKit.Paint();
  imagePaint.setAntiAlias(true);
  try {
    canvas.save();
    canvas.translate(screen.x, screen.y);
    if (rotation) canvas.rotate((rotation * 180) / Math.PI, 0, 0);
    canvas.drawImageRect(
      cached.image,
      [0, 0, cached.image.width(), cached.image.height()],
      [-cached.width / 2, -cached.height / 2, cached.width / 2, cached.height / 2],
      imagePaint,
      true,
    );
    canvas.restore();
  } finally {
    imagePaint.delete();
  }
}

function lineIntersection(
  first: Extract<GeometryEntity, { kind: 'line' }>,
  second: Extract<GeometryEntity, { kind: 'line' }>,
): SketchPoint2D | null {
  const ax = first.end.x - first.start.x;
  const ay = first.end.y - first.start.y;
  const bx = second.end.x - second.start.x;
  const by = second.end.y - second.start.y;
  const determinant = ax * by - ay * bx;
  if (Math.abs(determinant) <= 1e-8) return null;
  const dx = second.start.x - first.start.x;
  const dy = second.start.y - first.start.y;
  const firstParameter = (dx * by - dy * bx) / determinant;
  const secondParameter = (dx * ay - dy * ax) / determinant;
  if (
    firstParameter < -0.02 ||
    firstParameter > 1.02 ||
    secondParameter < -0.02 ||
    secondParameter > 1.02
  )
    return null;
  return {
    x: first.start.x + ax * firstParameter,
    y: first.start.y + ay * firstParameter,
  };
}

function drawPerpendicularMarks(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  document: SketchDocument,
): void {
  const marker = paint(canvasKit, canvasKit.Color(82, 96, 108, 0.78), 1.2);
  try {
    for (const constraint of document.constraints.filter(
      ({ type, temporary }) => type === 'perpendicular' && !temporary,
    )) {
      const entities = constraint.refs.map(({ entityId }) =>
        document.entities.find(({ id }) => id === entityId),
      );
      const [first, second] = entities;
      if (first?.kind !== 'line' || second?.kind !== 'line') continue;
      const intersection = lineIntersection(first, second);
      if (!intersection) continue;
      const screen = camera.worldToScreen(intersection);
      const firstDirection = {
        x: first.end.x - first.start.x,
        y: -(first.end.y - first.start.y),
      };
      const secondDirection = {
        x: second.end.x - second.start.x,
        y: -(second.end.y - second.start.y),
      };
      const firstLength = Math.max(1e-9, Math.hypot(firstDirection.x, firstDirection.y));
      const secondLength = Math.max(1e-9, Math.hypot(secondDirection.x, secondDirection.y));
      const a = { x: firstDirection.x / firstLength, y: firstDirection.y / firstLength };
      const b = { x: secondDirection.x / secondLength, y: secondDirection.y / secondLength };
      const size = 9;
      const firstPoint = { x: screen.x + a.x * size, y: screen.y + a.y * size };
      const corner = {
        x: screen.x + (a.x + b.x) * size,
        y: screen.y + (a.y + b.y) * size,
      };
      const secondPoint = { x: screen.x + b.x * size, y: screen.y + b.y * size };
      canvas.drawLine(firstPoint.x, firstPoint.y, corner.x, corner.y, marker);
      canvas.drawLine(corner.x, corner.y, secondPoint.x, secondPoint.y, marker);
    }
  } finally {
    marker.delete();
  }
}

function drawDimensionLabels(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  labels: readonly DimensionOverlayLabel[],
): void {
  for (const label of labels) {
    drawCanvasText(
      canvasKit,
      canvas,
      label.text,
      label.screen,
      label.selected ? [154, 67, 14] : label.kind === 'driving' ? [43, 117, 85] : [47, 83, 108],
      11,
      label.rotation,
    );
  }
}

function drawCreationScreenOverlay(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  session: CreationSession | null,
): void {
  if (!session?.current) return;
  const current = camera.worldToScreen(session.current);
  const primary = session.snapCandidates[0];
  if (primary) {
    drawCanvasText(
      canvasKit,
      canvas,
      primary.label,
      { x: current.x, y: current.y - 17 },
      [78, 91, 102],
    );
  }
  const measurement = creationMeasurement(session);
  if (measurement) {
    measurement.split(' · ').forEach((part, index) => {
      drawCanvasText(
        canvasKit,
        canvas,
        part,
        { x: current.x + 18, y: current.y + 24 + index * 15 },
        [154, 67, 14],
      );
    });
  }
}

function drawSelectedDimensionGeometry(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  metrics: CanvasMetrics,
  document: SketchDocument | null,
  selection: SelectionSet,
): void {
  if (!document || selection.entityIds.length !== 1) return;
  const entity = document.entities.find(({ id }) => id === selection.entityIds[0]);
  if (!entity || entity.kind === 'point' || entity.kind === 'bspline') return;
  const line = paint(canvasKit, canvasKit.Color(45, 105, 143, 0.72), 1.05);
  try {
    if (entity.kind === 'line') {
      const start = camera.worldToScreen(entity.start);
      const end = camera.worldToScreen(entity.end);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.max(1e-9, Math.hypot(dx, dy));
      const normal = { x: -dy / length, y: dx / length };
      const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const center = { x: metrics.width / 2, y: metrics.height / 2 };
      const sign =
        (middle.x - center.x) * normal.x + (middle.y - center.y) * normal.y >= 0 ? 1 : -1;
      const offset = { x: normal.x * 28 * sign, y: normal.y * 28 * sign };
      const first = { x: start.x + offset.x, y: start.y + offset.y };
      const second = { x: end.x + offset.x, y: end.y + offset.y };
      canvas.drawLine(start.x, start.y, first.x, first.y, line);
      canvas.drawLine(end.x, end.y, second.x, second.y, line);
      canvas.drawLine(first.x, first.y, second.x, second.y, line);
      drawScreenArrow(canvas, first, second, line);
      drawScreenArrow(canvas, second, first, line);
      return;
    }
    if (entity.kind === 'circle') {
      const center = camera.worldToScreen(entity.center);
      const radius = entity.radius * camera.zoom;
      const direction = { x: Math.cos(-Math.PI / 6), y: Math.sin(-Math.PI / 6) };
      const first = {
        x: center.x - direction.x * radius,
        y: center.y - direction.y * radius,
      };
      const second = {
        x: center.x + direction.x * radius,
        y: center.y + direction.y * radius,
      };
      canvas.drawLine(first.x, first.y, second.x, second.y, line);
      drawScreenArrow(canvas, first, center, line);
      drawScreenArrow(canvas, second, center, line);
      return;
    }
    if (entity.kind === 'arc') {
      const center = camera.worldToScreen(entity.center);
      const sweep = positiveArcSweep(entity.startAngle, entity.endAngle);
      const middle = camera.worldToScreen(arcPoint(entity, entity.startAngle + sweep / 2));
      canvas.drawLine(center.x, center.y, middle.x, middle.y, line);
      drawScreenArrow(canvas, middle, center, line);
      const radius = entity.radius * camera.zoom + 22;
      canvas.drawArc(
        [center.x - radius, center.y - radius, center.x + radius, center.y + radius],
        (-entity.startAngle * 180) / Math.PI,
        (-sweep * 180) / Math.PI,
        false,
        line,
      );
      const angularPoint = (angle: number) => ({
        x: center.x + Math.cos(angle) * radius,
        y: center.y - Math.sin(angle) * radius,
      });
      const start = angularPoint(entity.startAngle);
      const end = angularPoint(entity.startAngle + sweep);
      drawScreenArrow(canvas, start, angularPoint(entity.startAngle + 0.12), line);
      drawScreenArrow(canvas, end, angularPoint(entity.startAngle + sweep - 0.12), line);
      return;
    }
    const majorStart = camera.worldToScreen(ellipsePoint(entity, Math.PI));
    const majorEnd = camera.worldToScreen(ellipsePoint(entity, 0));
    const minorStart = camera.worldToScreen(ellipsePoint(entity, -Math.PI / 2));
    const minorEnd = camera.worldToScreen(ellipsePoint(entity, Math.PI / 2));
    canvas.drawLine(majorStart.x, majorStart.y, majorEnd.x, majorEnd.y, line);
    canvas.drawLine(minorStart.x, minorStart.y, minorEnd.x, minorEnd.y, line);
    drawScreenArrow(canvas, majorStart, majorEnd, line);
    drawScreenArrow(canvas, majorEnd, majorStart, line);
    drawScreenArrow(canvas, minorStart, minorEnd, line);
    drawScreenArrow(canvas, minorEnd, minorStart, line);
  } finally {
    line.delete();
  }
}

function renderSurface(
  canvasKit: CanvasKit,
  surface: Surface,
  camera: Camera2D,
  metrics: CanvasMetrics,
  insets: ViewportInsets,
  document: SketchDocument | null,
  selection: SelectionSet,
  hover: EditorHover,
  definition: DefinitionStateAnalysis | null,
  creation: CreationSession | null,
  marquee: MarqueeVisual | null,
  trimPreview: GeometryEntity | null,
  profileFill: boolean,
  remoteSelections: readonly {
    readonly color: readonly [number, number, number];
    readonly entityIds: readonly string[];
  }[],
): void {
  const canvas = surface.getCanvas();
  canvas.clear(canvasKit.Color(247, 248, 249, 1));
  canvas.save();
  canvas.scale(metrics.pixelRatio, metrics.pixelRatio);
  canvas.save();
  canvas.translate(camera.x, camera.y);
  canvas.scale(camera.zoom, -camera.zoom);
  drawGrid(canvasKit, canvas, camera, metrics);
  drawAxes(canvasKit, canvas, camera, metrics);
  drawSketch(
    canvasKit,
    canvas,
    camera,
    document,
    selection,
    hover,
    definition,
    profileFill,
    remoteSelections,
  );
  drawTrimPreview(canvasKit, canvas, camera, trimPreview);
  drawCreationGuides(canvasKit, canvas, camera, creation);
  canvas.restore();
  if (document) {
    const badges = projectConstraintOverlay(document, camera, selection);
    const dimensions = projectDimensionOverlay(
      document,
      camera,
      selection,
      badges.map(({ screen }) => screen),
      { ...metrics, ...insets },
    );
    for (const entityId of new Set(
      dimensions
        .filter(({ entityIds }) => entityIds.length === 1)
        .flatMap(({ entityIds }) => entityIds),
    )) {
      drawSelectedDimensionGeometry(canvasKit, canvas, camera, metrics, document, {
        ...EMPTY_SELECTION_SET,
        entityIds: [entityId],
      });
    }
    drawPerpendicularMarks(canvasKit, canvas, camera, document);
    drawDimensionLabels(canvasKit, canvas, dimensions);
  }
  drawCreationScreenOverlay(canvasKit, canvas, camera, creation);
  drawMarquee(canvasKit, canvas, marquee);
  canvas.restore();
  surface.flush();
}

function fitPadding(insets: ViewportInsets): FitPadding {
  return {
    top: insets.top + 56,
    right: insets.right + 72,
    bottom: insets.bottom + 72,
    left: insets.left + 72,
  };
}

function screenPoint(event: ReactPointerEvent<HTMLCanvasElement>): SketchPoint2D {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function selectionPivot(document: SketchDocument, entityIds: readonly string[]): SketchPoint2D {
  const bounds = selectionBounds(document, entityIds);
  return bounds
    ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
    : { x: 0, y: 0 };
}

function ConstraintBadgeGraphic({ badge }: { readonly badge: ConstraintOverlayBadge }) {
  if (badge.kind === 'overflow') return <span>{badge.label}</span>;
  const Icon =
    badge.constraintType === 'coincident'
      ? AppIcons.Coincident
      : badge.constraintType === 'horizontal'
        ? AppIcons.Horizontal
        : badge.constraintType === 'vertical'
          ? AppIcons.Vertical
          : badge.constraintType === 'parallel'
            ? AppIcons.Parallel
            : badge.constraintType === 'perpendicular'
              ? AppIcons.Perpendicular
              : badge.constraintType === 'tangent'
                ? AppIcons.Tangent
                : badge.constraintType === 'equal'
                  ? AppIcons.Equal
                  : badge.constraintType === 'concentric'
                    ? AppIcons.Concentric
                    : badge.constraintType === 'fixed'
                      ? AppIcons.Fixed
                      : badge.constraintType === 'radius'
                        ? AppIcons.Radius
                        : AppIcons.Dimension;
  return <Icon size={12} weight="regular" aria-hidden />;
}

function formatSketchNumber(value: number): string {
  return value.toFixed(Math.abs(value) >= 100 ? 1 : 2).replace(/\.00$/, '');
}

function creationMeasurement(session: CreationSession): string {
  const current = session.current;
  const first = session.points[0];
  if (!current || !first) return '';
  const dx = current.x - first.x;
  const dy = current.y - first.y;
  const distance = Math.hypot(dx, dy);
  if (session.tool === 'line') {
    const origin = session.points.at(-1)!;
    return `${formatSketchNumber(Math.hypot(current.x - origin.x, current.y - origin.y))} mm · ${formatSketchNumber((Math.atan2(current.y - origin.y, current.x - origin.x) * 180) / Math.PI)}°`;
  }
  if (session.tool === 'rectangle')
    return `${formatSketchNumber(Math.abs(dx))} × ${formatSketchNumber(Math.abs(dy))} mm`;
  if (session.tool === 'circle')
    return `R ${formatSketchNumber(distance)} mm · Ø ${formatSketchNumber(distance * 2)} mm`;
  if (session.tool === 'arc' && session.points.length >= 2) {
    try {
      const arc = threePointArcCreation('measure', first, session.points[1], current).entities[0];
      if (arc?.kind === 'arc')
        return `R ${formatSketchNumber(arc.radius)} mm · ${formatSketchNumber(((arc.endAngle - arc.startAngle) * 180) / Math.PI)}°`;
    } catch {
      return '';
    }
  }
  if (session.tool === 'ellipse' && session.points[1]) {
    const major = Math.hypot(session.points[1].x - first.x, session.points[1].y - first.y);
    return `${formatSketchNumber(major * 2)} × ${formatSketchNumber(distance * 2)} mm`;
  }
  return session.tool === 'bspline'
    ? `${session.points.length + 1} control points · Enter to finish`
    : '';
}

function constraintToolApplicabilityMessage(tool: ConstraintTool): string {
  const instructions: Record<ConstraintTool, string> = {
    coincident: 'Coincident — choose two points, or a point and a line.',
    horizontal: 'Horizontal — choose a line.',
    vertical: 'Vertical — choose a line.',
    parallel: 'Parallel — choose two lines.',
    perpendicular: 'Perpendicular — choose two lines.',
    tangent: 'Tangent — choose two compatible curves.',
    concentric: 'Concentric — choose two circles or arcs.',
    equal: 'Equal — choose two lines, or two circles/arcs.',
    fixed: 'Fix / Unfix — choose geometry.',
    distance: 'Distance — choose a line.',
    radius: 'Radius — choose a circle or arc.',
    diameter: 'Diameter — choose a circle or arc.',
  };
  return instructions[tool];
}

export const WorkspaceCanvas = forwardRef<
  WorkspaceCanvasHandle,
  {
    readonly insets: ViewportInsets;
    readonly renderComments?: (
      view: CameraViewState,
      placement: CanvasCommentPlacement | null,
      clearPlacement: () => void,
      cursor: { readonly x: number; readonly y: number } | null,
    ) => ReactNode;
    readonly projectName: string;
    readonly cursorMode: EditorCursorMode;
    readonly tool: CanvasTool;
    readonly constraintTool: ConstraintTool | null;
    readonly document: SketchDocument | null;
    readonly selection: SelectionSet;
    readonly autoConstrain: boolean;
    readonly profileFill: boolean;
    readonly readOnly?: boolean;
    readonly canComment?: boolean;
    readonly remoteSelections?: readonly {
      readonly color: readonly [number, number, number];
      readonly entityIds: readonly string[];
    }[];
    readonly onSelectionChange: (selection: SelectionSet) => void;
    readonly onToolChange?: (tool: CanvasTool) => void;
    readonly onConstraintToolChange?: (tool: ConstraintTool | null) => void;
    readonly onCommentPlacementComplete?: () => void;
    readonly onCommand?: (command: SketchCommand) => Promise<SketchDocument>;
  }
>(function WorkspaceCanvas(
  {
    insets,
    renderComments,
    projectName,
    document,
    cursorMode,
    tool,
    constraintTool,
    selection,
    autoConstrain,
    profileFill,
    readOnly = false,
    canComment = false,
    remoteSelections = EMPTY_REMOTE_SELECTIONS,
    onSelectionChange,
    onToolChange,
    onConstraintToolChange,
    onCommentPlacementComplete,
    onCommand,
  },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new Camera2D({ minZoom: 0.08, maxZoom: 18 }));
  const surfaceRef = useRef<Surface | null>(null);
  const metricsRef = useRef<CanvasMetrics>({ width: 0, height: 0, pixelRatio: 1 });
  const insetsRef = useRef(insets);
  const profileFillRef = useRef(profileFill);
  const remoteSelectionsRef = useRef(remoteSelections);
  const authoritativeRef = useRef(document);
  const persistedDocumentRef = useRef(document);
  const displayDocumentRef = useRef(document);
  const selectionRef = useRef(selection);
  const hoverRef = useRef<EditorHover>(EMPTY_HOVER);
  const definitionRef = useRef<DefinitionStateAnalysis | null>(null);
  const creationRef = useRef<CreationSession | null>(null);
  const trimPreviewRef = useRef<GeometryEntity | null>(null);
  const pointerRef = useRef<PointerSession | null>(null);
  const suppressCommentClickUntilRef = useRef(0);
  const committingRef = useRef(0);
  const commitGenerationRef = useRef(0);
  const redrawRef = useRef<() => void>(() => undefined);
  const initializedRef = useRef(false);
  const cameraAnimationRef = useRef<number | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const snapLockRef = useRef<SnapCandidate | null>(null);
  const pendingPreviewRef = useRef<{
    readonly dragSessionId: string;
    readonly generation: number;
    readonly document: SketchDocument;
    readonly immobile: boolean;
    readonly message?: string;
  } | null>(null);
  const [interactionState, setInteractionState] = useState<
    'idle' | 'dragging' | 'previewing' | 'committing'
  >('idle');
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [commentAnchor, setCommentAnchor] = useState<Omit<CanvasCommentPlacement, 'screen'> | null>(
    null,
  );
  const [commentCursor, setCommentCursor] = useState<{
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const [surfaceState, setSurfaceState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [, setOverlayRevision] = useState(0);
  const [dimensionEditor, setDimensionEditor] = useState<DimensionEditorState | null>(null);
  const [viewState, setViewState] = useState<CameraViewState>({
    x: 0,
    y: 0,
    zoom: 1,
    gridStep: 50,
    width: 0,
    height: 0,
  });

  insetsRef.current = insets;
  profileFillRef.current = profileFill;
  remoteSelectionsRef.current = remoteSelections;
  selectionRef.current = selection;

  useEffect(() => {
    if (cursorMode !== 'comment') {
      setCommentAnchor(null);
      setCommentCursor(null);
    }
  }, [cursorMode]);

  const updateSelection = (next: SelectionSet) => {
    selectionRef.current = next;
    onSelectionChange(next);
    redrawRef.current();
  };

  const publishView = () => {
    const camera = cameraRef.current;
    setViewState({
      x: camera.x,
      y: camera.y,
      zoom: camera.zoom,
      gridStep: adaptiveGridStep(camera.zoom),
      width: metricsRef.current.width,
      height: metricsRef.current.height,
    });
  };

  const marqueeVisual = (): MarqueeVisual | null => {
    const pointer = pointerRef.current;
    return pointer?.mode === 'marquee'
      ? { origin: pointer.originScreen, target: pointer.currentScreen }
      : null;
  };

  const redraw = () => redrawRef.current();

  const documentBounds = (): SketchBounds | null => {
    const entities = displayDocumentRef.current?.entities ?? [];
    if (entities.length === 0) return null;
    const bounds = entities.map(geometryBounds);
    return {
      minX: Math.min(...bounds.map(({ minX }) => minX)),
      minY: Math.min(...bounds.map(({ minY }) => minY)),
      maxX: Math.max(...bounds.map(({ maxX }) => maxX)),
      maxY: Math.max(...bounds.map(({ maxY }) => maxY)),
    };
  };

  const cancelCameraAnimation = () => {
    if (cameraAnimationRef.current !== null) cancelAnimationFrame(cameraAnimationRef.current);
    cameraAnimationRef.current = null;
  };

  const animateCamera = (configure: (target: Camera2D) => void) => {
    const metrics = metricsRef.current;
    if (metrics.width === 0 || metrics.height === 0) return;
    cancelCameraAnimation();
    const camera = cameraRef.current;
    const start = camera.state();
    const target = new Camera2D({ ...start, minZoom: camera.minZoom, maxZoom: camera.maxZoom });
    configure(target);
    const finish = target.state();
    const startedAt = performance.now();
    const frame = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / 180);
      camera.interpolate(start, finish, 1 - (1 - progress) ** 3);
      redraw();
      publishView();
      cameraAnimationRef.current = progress < 1 ? requestAnimationFrame(frame) : null;
    };
    cameraAnimationRef.current = requestAnimationFrame(frame);
  };

  const fitSketch = () => {
    const bounds = documentBounds();
    const metrics = metricsRef.current;
    if (metrics.width === 0 || metrics.height === 0) return;
    animateCamera((target) =>
      bounds
        ? target.fitBounds(bounds, metrics, fitPadding(insetsRef.current))
        : target.resetView(metrics),
    );
  };

  const resetView = () => {
    const metrics = metricsRef.current;
    if (metrics.width > 0 && metrics.height > 0)
      animateCamera((target) => target.resetView(metrics));
  };

  useImperativeHandle(forwardedRef, () => ({ fitSketch, resetView }));

  const applyPendingPreview = () => {
    previewFrameRef.current = null;
    const pending = pendingPreviewRef.current;
    const pointer = pointerRef.current;
    if (!pending || !pointer || (pointer.mode !== 'drag-node' && pointer.mode !== 'transform'))
      return;
    if (
      pending.dragSessionId !== pointer.dragSessionId ||
      pending.generation !== pointer.generation
    )
      return;
    displayDocumentRef.current = pending.document;
    if (pointer.mode === 'drag-node') pointer.immobile = pending.immobile;
    setInteractionMessage(pending.message ?? null);
    setInteractionState('previewing');
    redraw();
  };

  const queuePreview = (
    pointer: Extract<PointerSession, { mode: 'drag-node' | 'transform' }>,
    previewDocument: SketchDocument,
    nodeId?: string,
    target?: SketchPoint2D,
  ) => {
    getBrowserPlaneGcsPreviewRuntime().preview({
      dragSessionId: pointer.dragSessionId,
      generation: pointer.generation,
      document: previewDocument,
      ...(nodeId ? { nodeId } : {}),
      ...(target ? { target } : {}),
      receive: (result) => {
        pendingPreviewRef.current = result;
        if (previewFrameRef.current === null) {
          previewFrameRef.current = requestAnimationFrame(applyPendingPreview);
        }
      },
    });
  };

  const commitCommand = async (
    command: SketchCommand,
    preserveCurrentPreview = false,
  ): Promise<SketchDocument | null> => {
    if (!onCommand) return null;
    const generation = ++commitGenerationRef.current;
    committingRef.current += 1;
    setInteractionState('committing');
    setInteractionMessage(null);
    const optimisticBase = displayDocumentRef.current ?? authoritativeRef.current;
    if (!preserveCurrentPreview && optimisticBase) {
      try {
        displayDocumentRef.current = applySketchCommand(optimisticBase, command).document;
        authoritativeRef.current = displayDocumentRef.current;
        redraw();
      } catch {
        // The authority remains responsible for validation; unsupported local previews stay put.
      }
    } else if (displayDocumentRef.current) {
      authoritativeRef.current = displayDocumentRef.current;
    }
    try {
      const authoritative = await onCommand(command);
      persistedDocumentRef.current = authoritative;
      if (generation === commitGenerationRef.current) {
        authoritativeRef.current = authoritative;
        displayDocumentRef.current = authoritative;
        updateSelection(pruneSelection(selectionRef.current, authoritative));
        setInteractionMessage(null);
        redraw();
      }
      return authoritative;
    } catch (error) {
      if (generation === commitGenerationRef.current) {
        authoritativeRef.current = persistedDocumentRef.current;
        displayDocumentRef.current = persistedDocumentRef.current;
      }
      const raw = error instanceof Error ? error.message : '';
      const label = command.type === 'apply_constraint' ? command.constraints[0]?.type : undefined;
      const message = raw.match(/fixed/i)
        ? 'That geometry cannot move while its Fix constraint is locked.'
        : command.type === 'apply_constraint'
          ? `Adding ${label ? label[0].toUpperCase() + label.slice(1) : 'that constraint'} would over-constrain the selected geometry.`
          : command.type === 'set_dimension'
            ? 'That dimension conflicts with the geometry’s current constraints.'
            : raw || 'The sketch change was not accepted.';
      setInteractionMessage(null);
      editorToastManager.add({
        variant: 'error',
        title:
          command.type === 'apply_constraint' ? 'Constraint conflict' : 'Sketch change rejected',
        description: message,
      });
      redraw();
      return null;
    } finally {
      committingRef.current = Math.max(0, committingRef.current - 1);
      if (!pointerRef.current)
        setInteractionState(committingRef.current === 0 ? 'idle' : 'committing');
    }
  };

  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | null = null;
    const start = async () => {
      try {
        const canvasKit = await loadCanvasKit();
        if (!active) return;
        const host = hostRef.current;
        const canvasElement = canvasRef.current;
        if (!host || !canvasElement) return;
        const resize = () => {
          const rect = host.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return;
          const previous = metricsRef.current;
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const metrics = { width: rect.width, height: rect.height, pixelRatio };
          metricsRef.current = metrics;
          surfaceRef.current?.delete();
          canvasElement.width = Math.round(rect.width * pixelRatio);
          canvasElement.height = Math.round(rect.height * pixelRatio);
          surfaceRef.current =
            canvasKit.MakeWebGLCanvasSurface(canvasElement) ??
            canvasKit.MakeSWCanvasSurface(canvasElement);
          if (!surfaceRef.current) throw new Error('CanvasKit surface creation failed.');
          if (!initializedRef.current) {
            initializedRef.current = true;
            const bounds = documentBounds();
            if (bounds) cameraRef.current.fitBounds(bounds, metrics, fitPadding(insetsRef.current));
            else cameraRef.current.resetView(metrics);
          } else if (previous.width > 0 && previous.height > 0) {
            cameraRef.current.panBy(
              (metrics.width - previous.width) / 2,
              (metrics.height - previous.height) / 2,
            );
          }
          redraw();
          publishView();
        };
        redrawRef.current = () => {
          if (renderFrameRef.current !== null) return;
          renderFrameRef.current = requestAnimationFrame(() => {
            renderFrameRef.current = null;
            const surface = surfaceRef.current;
            if (!surface) return;
            renderSurface(
              canvasKit,
              surface,
              cameraRef.current,
              metricsRef.current,
              insetsRef.current,
              displayDocumentRef.current,
              selectionRef.current,
              hoverRef.current,
              definitionRef.current,
              creationRef.current,
              marqueeVisual(),
              trimPreviewRef.current,
              profileFillRef.current,
              remoteSelectionsRef.current,
            );
          });
        };
        observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();
        setSurfaceState('ready');
      } catch {
        if (active) setSurfaceState('failed');
      }
    };
    void start();
    return () => {
      active = false;
      observer?.disconnect();
      surfaceRef.current?.delete();
      surfaceRef.current = null;
      redrawRef.current = () => undefined;
      cancelCameraAnimation();
      if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
      if (renderFrameRef.current !== null) cancelAnimationFrame(renderFrameRef.current);
    };
  }, []);

  useEffect(() => {
    persistedDocumentRef.current = document;
    if (committingRef.current === 0) authoritativeRef.current = document;
    if (!pointerRef.current && committingRef.current === 0) displayDocumentRef.current = document;
    if (document) {
      const nextSelection = pruneSelection(selectionRef.current, document);
      selectionRef.current = nextSelection;
      onSelectionChange(nextSelection);
    }
    redraw();
  }, [document, onSelectionChange]);

  useEffect(() => {
    profileFillRef.current = profileFill;
    redraw();
  }, [profileFill]);

  useEffect(() => {
    remoteSelectionsRef.current = remoteSelections;
    redraw();
  }, [remoteSelections]);

  useEffect(() => {
    selectionRef.current = selection;
    redraw();
  }, [selection]);

  useEffect(() => {
    if (!document) {
      definitionRef.current = null;
      return () => undefined;
    }
    let active = true;
    const expected = `${document.id}:${document.revision}`;
    void getBrowserPlaneGcsPreviewRuntime()
      .analyze(document)
      .then((analysis) => {
        const current = authoritativeRef.current;
        if (!active || !current || `${current.id}:${current.revision}` !== expected) return;
        definitionRef.current = analysis;
        setOverlayRevision((revision) => revision + 1);
        redraw();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [document]);

  useEffect(() => {
    if (tool === 'select' || tool === 'trim') creationRef.current = null;
    else if (creationRef.current?.tool !== tool) {
      creationRef.current = { tool, points: [], current: null, snapCandidates: [] };
    }
    snapLockRef.current = null;
    trimPreviewRef.current = null;
    redraw();
  }, [tool]);

  useEffect(() => {
    snapLockRef.current = null;
    if (!constraintTool) setDimensionEditor(null);
    setInteractionMessage(
      constraintTool ? constraintToolApplicabilityMessage(constraintTool) : null,
    );
    redraw();
  }, [constraintTool]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelCameraAnimation();
      const bounds = element.getBoundingClientRect();
      const cursor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const wantsZoom = event.metaKey || event.ctrlKey;
      const wantsPan = event.altKey;
      const looksLikeTrackpadPan =
        !wantsZoom &&
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
        (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 45);
      if (wantsZoom)
        cameraRef.current.zoomAt(
          cursor,
          Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.0018)),
        );
      else if (wantsPan || looksLikeTrackpadPan)
        cameraRef.current.panBy(-event.deltaX, -event.deltaY);
      else cameraRef.current.zoomAt(cursor, Math.exp(-event.deltaY * 0.0018));
      redraw();
      publishView();
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const hitVisibleNode = (sketch: SketchDocument, screen: SketchPoint2D) => {
    const visible = new Set([
      ...(constraintTool === 'coincident' ? sketch.nodes.map(({ id }) => id) : []),
      ...selectionRef.current.nodeIds,
      ...sketch.entities
        .filter(({ id }) => selectionRef.current.entityIds.includes(id))
        .flatMap(geometryNodeIds),
    ]);
    return sketch.nodes
      .filter(({ id }) => visible.has(id))
      .map((node) => ({
        node,
        distance: Math.hypot(
          cameraRef.current.worldToScreen(node.position).x - screen.x,
          cameraRef.current.worldToScreen(node.position).y - screen.y,
        ),
      }))
      .filter(({ distance }) => distance <= 9)
      .toSorted((left, right) => left.distance - right.distance)[0]?.node;
  };

  const reportConstraintIssue = (message: string) => {
    setInteractionMessage(message);
    editorToastManager.add({
      variant: 'warning',
      title: 'Constraint conflict',
      description: message,
    });
  };

  const applyConstraintToolSelection = async (
    activeTool: ConstraintTool,
    sketch: SketchDocument,
    nextSelection: SelectionSet,
    anchorScreen: SketchPoint2D,
  ) => {
    if (activeTool === 'distance' || activeTool === 'radius' || activeTool === 'diameter') {
      const entity = sketch.entities.find(({ id }) => id === nextSelection.entityIds[0]);
      const value = entity ? defaultDimensionValue(entity, activeTool) : null;
      if (value === null) {
        setInteractionMessage(constraintToolApplicabilityMessage(activeTool));
        return;
      }
      setDimensionEditor({
        mode: 'create',
        id: `dimension:${activeTool}:${crypto.randomUUID()}`,
        kind: activeTool,
        value,
        screen: anchorScreen,
      });
      setInteractionMessage(null);
      return;
    }

    const applicability = constraintToolApplicability(sketch, nextSelection, activeTool);
    if (activeTool === 'fixed' && nextSelection.entityIds[0]) {
      const entityId = nextSelection.entityIds[0];
      const existing = sketch.constraints.filter(
        ({ type, refs }) =>
          type === 'fixed' && refs.some((reference) => reference.entityId === entityId),
      );
      if (existing.length > 0) {
        const accepted = await commitCommand({
          type: 'remove_constraint',
          constraintIds: existing.map(({ id }) => id),
        });
        if (accepted) onConstraintToolChange?.(null);
        return;
      }
    }
    if (applicability.status === 'incomplete') {
      setInteractionMessage(applicability.message);
      return;
    }
    if (applicability.status !== 'ready') {
      reportConstraintIssue(applicability.message);
      return;
    }

    const constraint = constraintInputForTool(
      sketch,
      nextSelection,
      activeTool,
      `constraint:${activeTool}:${crypto.randomUUID()}`,
    );
    if (!constraint) {
      reportConstraintIssue(applicability.message);
      return;
    }
    try {
      const preview = applySketchCommand(sketch, {
        type: 'apply_constraint',
        constraints: [constraint],
      }).document;
      const analysis = await getBrowserPlaneGcsPreviewRuntime().analyze(preview);
      if (analysis.conflicts.length > 0) {
        reportConstraintIssue(
          `${constraintToolApplicabilityMessage(activeTool).split(' — ')[0]} conflicts with the selected geometry.`,
        );
        return;
      }
      const accepted = await commitCommand({ type: 'apply_constraint', constraints: [constraint] });
      if (accepted) onConstraintToolChange?.(null);
    } catch (error) {
      reportConstraintIssue(
        error instanceof Error ? error.message : 'That constraint cannot be applied here.',
      );
    }
  };

  const stableSnap = (
    sketch: SketchDocument,
    world: SketchPoint2D,
    options: Parameters<typeof rankSnapCandidates>[2],
  ) => {
    const candidates = rankSnapCandidates(sketch, world, {
      ...options,
      screenTolerance: 15,
      cameraZoom: cameraRef.current.zoom,
    });
    const primary = chooseSnapCandidateWithHysteresis(snapLockRef.current, candidates, {
      cameraZoom: cameraRef.current.zoom,
      captureScreenDistance: 10,
      releaseScreenDistance: 15,
    });
    snapLockRef.current = primary;
    return {
      point: primary?.point ?? world,
      candidates: primary
        ? [primary, ...candidates.filter((candidate) => candidate !== primary)]
        : candidates,
    };
  };

  const startTransform = (
    event: ReactPointerEvent<HTMLCanvasElement>,
    kind: TransformKind,
    sketch: SketchDocument,
    originWorld: SketchPoint2D,
  ) => {
    const pivot = selectionPivot(sketch, selectionRef.current.entityIds);
    pointerRef.current = {
      mode: 'transform',
      id: event.pointerId,
      dragSessionId: `transform:${crypto.randomUUID()}`,
      kind,
      base: sketch,
      entityIds: selectionRef.current.entityIds,
      originWorld,
      pivot,
      startVector: { x: originWorld.x - pivot.x, y: originWorld.y - pivot.y },
      targetWorld: originWorld,
      generation: 0,
      transform: { pivot },
    };
    setInteractionState('dragging');
  };

  const commitCreation = (
    session: CreationSession,
    point: SketchPoint2D,
    shiftKey: boolean,
    altKey: boolean,
  ) => {
    const id = `${session.tool}:${crypto.randomUUID()}`;
    let creation;
    try {
      if (session.tool === 'line') {
        const start = session.points.at(-1)!;
        const primary = session.snapCandidates[0];
        const constraints =
          autoConstrain && (primary?.kind === 'horizontal' || primary?.kind === 'vertical')
            ? [
                {
                  id: `constraint:${primary.kind}:${crypto.randomUUID()}`,
                  type: primary.kind,
                  refs: [{ entityId: id }],
                },
              ]
            : autoConstrain && primary?.kind === 'tangent' && primary.entityId
              ? [
                  {
                    id: `constraint:tangent:${crypto.randomUUID()}`,
                    type: 'tangent' as const,
                    refs: [{ entityId: id }, { entityId: primary.entityId }],
                  },
                ]
              : [];
        creation = { entities: [{ id, kind: 'line' as const, start, end: point }], constraints };
      } else if (session.tool === 'rectangle') {
        const start = session.points[0];
        let target = point;
        if (shiftKey) {
          const size = Math.max(Math.abs(point.x - start.x), Math.abs(point.y - start.y));
          target = {
            x: start.x + Math.sign(point.x - start.x || 1) * size,
            y: start.y + Math.sign(point.y - start.y || 1) * size,
          };
        }
        creation = rectangleCreation(id, start, target, { centered: altKey, autoConstrain });
      } else if (session.tool === 'circle') {
        creation = circleCreation(id, session.points[0], point);
      } else if (session.tool === 'arc') {
        creation = threePointArcCreation(id, session.points[0], session.points[1], point);
      } else if (session.tool === 'ellipse') {
        const center = session.points[0];
        const majorPoint = session.points[1];
        const dx = majorPoint.x - center.x;
        const dy = majorPoint.y - center.y;
        const majorRadius = Math.hypot(dx, dy);
        const minor = shiftKey
          ? majorRadius
          : Math.abs((point.x - center.x) * -dy + (point.y - center.y) * dx) /
            Math.max(majorRadius, 1e-9);
        creation = ellipseCreation(id, center, majorPoint, minor);
      } else {
        creation = bsplineCreation(id, session.points);
      }
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : 'The primitive is not valid.');
      return;
    }
    const command: SketchCommand = {
      type: 'create_geometry',
      entities: creation.entities,
      ...(creation.constraints.length > 0 ? { constraints: creation.constraints } : {}),
      ...(creation.group ? { group: creation.group } : {}),
    };
    void commitCommand(command).then((accepted) => {
      if (!accepted) return;
      const ids = creation.entities.map(({ id: entityId }) => entityId);
      updateSelection(replaceSelection('entity', ids));
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    cancelCameraAnimation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const screen = screenPoint(event);
    const world = cameraRef.current.screenToWorld(screen);
    const sketch = displayDocumentRef.current;
    if (event.button === 1 || event.metaKey || event.ctrlKey) {
      pointerRef.current = {
        mode: 'pan',
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        ...(cursorMode === 'comment' && event.button === 0
          ? {
              commentPlacement: {
                originX: event.clientX,
                originY: event.clientY,
                allowPlacement: false,
                moved: false,
              },
            }
          : {}),
      };
      setInteractionState('dragging');
      return;
    }
    if (cursorMode === 'comment') {
      pointerRef.current = {
        mode: 'pan',
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        commentPlacement: {
          originX: event.clientX,
          originY: event.clientY,
          allowPlacement: true,
          moved: false,
        },
      };
      return;
    }
    if (readOnly) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (!sketch) return;

    if (tool !== 'select' && tool !== 'trim') {
      const current = creationRef.current ?? {
        tool,
        points: [],
        current: null,
        snapCandidates: [],
      };
      const origin = current.points.at(-1);
      const snapped = stableSnap(sketch, world, {
        gridStep: adaptiveGridStep(cameraRef.current.zoom),
        currentTool: current.tool,
        ...(origin ? { origin } : {}),
      });
      const points = [...current.points, snapped.point];
      const required = current.tool === 'arc' || current.tool === 'ellipse' ? 3 : 2;
      if (current.tool === 'bspline') {
        creationRef.current = {
          ...current,
          points,
          current: snapped.point,
          snapCandidates: snapped.candidates ?? [],
        };
      } else if (points.length >= required) {
        const complete = {
          ...current,
          points: current.points,
          current: snapped.point,
          snapCandidates: snapped.candidates ?? [],
        };
        commitCreation(complete, snapped.point, event.shiftKey, event.altKey);
        creationRef.current =
          current.tool === 'line'
            ? { ...current, points: [snapped.point], current: snapped.point, snapCandidates: [] }
            : { ...current, points: [], current: null, snapCandidates: [] };
      } else {
        creationRef.current = {
          ...current,
          points,
          current: snapped.point,
          snapCandidates: snapped.candidates ?? [],
        };
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      redraw();
      return;
    }

    const hit = hitTestSketch(sketch, {
      screenPoint: screen,
      camera: cameraRef.current.state(),
      selectedEntityId: selectionRef.current.entityIds[0] ?? null,
    });
    if (constraintTool) {
      const node = constraintTool === 'coincident' ? hitVisibleNode(sketch, screen) : undefined;
      let next: SelectionSet | null = null;
      if (node) {
        const selectionSize =
          selectionRef.current.nodeIds.length + selectionRef.current.entityIds.length;
        next =
          constraintTool === 'coincident' && selectionSize > 0 && selectionSize < 2
            ? addToSelection(selectionRef.current, 'node', [node.id])
            : selectionRef.current.nodeIds.length === 0 || selectionRef.current.nodeIds.length >= 2
              ? replaceSelection('node', [node.id])
              : addToSelection(selectionRef.current, 'node', [node.id]);
      } else if (hit?.kind === 'entity') {
        const selected = selectionRef.current.entityIds;
        const selectionSize = selected.length + selectionRef.current.nodeIds.length;
        next =
          constraintTool === 'coincident' && selectionSize > 0 && selectionSize < 2
            ? addToSelection(selectionRef.current, 'entity', [hit.id])
            : selected.length === 0 || selected.length >= 2
              ? replaceSelection('entity', [hit.id])
              : addToSelection(selectionRef.current, 'entity', [hit.id]);
      }
      if (next) {
        updateSelection(next);
        void applyConstraintToolSelection(constraintTool, sketch, next, screen);
      } else {
        setInteractionMessage(constraintToolApplicabilityMessage(constraintTool));
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (tool === 'trim') {
      if (hit?.kind === 'entity') {
        void commitCommand({ type: 'trim_geometry', entityId: hit.id, pickPoint: world });
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    const node = hitVisibleNode(sketch, screen);
    if (node) {
      const state = definitionRef.current?.nodes[node.id];
      updateSelection(toggleSelection(selectionRef.current, 'node', node.id, event.shiftKey));
      pointerRef.current = {
        mode: 'drag-node',
        id: event.pointerId,
        dragSessionId: `drag:${crypto.randomUUID()}`,
        nodeId: node.id,
        base: sketch,
        origin: node.position,
        target: node.position,
        generation: 0,
        immobile: state?.fullyDefined ?? false,
      };
      setInteractionMessage(state?.fullyDefined ? 'Fully constrained geometry cannot move.' : null);
      setInteractionState('dragging');
      return;
    }
    if (hit?.kind === 'entity') {
      const alreadySelected = selectionRef.current.entityIds.includes(hit.id);
      const next = toggleSelection(selectionRef.current, 'entity', hit.id, event.shiftKey);
      updateSelection(next);
      if (event.shiftKey) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      if (!alreadySelected) selectionRef.current = next;
      startTransform(event, 'move', sketch, world);
      return;
    }
    if (!event.shiftKey) updateSelection(replaceSelection('entity', []));
    pointerRef.current = {
      mode: 'marquee',
      id: event.pointerId,
      originScreen: screen,
      currentScreen: screen,
      originWorld: world,
      additive: event.shiftKey,
    };
    setInteractionState('dragging');
  };

  const placeComment = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (cursorMode !== 'comment' || !canComment) return;
    if (performance.now() <= suppressCommentClickUntilRef.current) {
      suppressCommentClickUntilRef.current = 0;
      return;
    }
    if (commentAnchor) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const world = cameraRef.current.screenToWorld(screen);
    setCommentCursor(null);
    setCommentAnchor({
      world,
      ...((hoverRef.current.entityId ?? selectionRef.current.entityIds[0])
        ? { entityId: hoverRef.current.entityId ?? selectionRef.current.entityIds[0] }
        : {}),
      ...((hoverRef.current.nodeId ?? selectionRef.current.nodeIds[0])
        ? { nodeId: hoverRef.current.nodeId ?? selectionRef.current.nodeIds[0] }
        : {}),
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    const screen = screenPoint(event);
    const world = cameraRef.current.screenToWorld(screen);
    const sketch = displayDocumentRef.current;
    if (!pointer || pointer.id !== event.pointerId) {
      if (cursorMode === 'comment') {
        if (canComment && !commentAnchor) setCommentCursor(screen);
        return;
      }
      if (!sketch) return;
      if (tool !== 'select' && tool !== 'trim') {
        const current = creationRef.current ?? {
          tool,
          points: [],
          current: null,
          snapCandidates: [],
        };
        const origin = current.points.at(-1);
        const snapped = stableSnap(sketch, world, {
          gridStep: adaptiveGridStep(cameraRef.current.zoom),
          currentTool: current.tool,
          ...(origin ? { origin } : {}),
        });
        creationRef.current = {
          ...current,
          current: snapped.point,
          snapCandidates: snapped.candidates,
        };
        redraw();
        return;
      }
      const hit = hitTestSketch(sketch, {
        screenPoint: screen,
        camera: cameraRef.current.state(),
        selectedEntityId: selectionRef.current.entityIds[0] ?? null,
      });
      if (tool === 'trim') {
        trimPreviewRef.current = null;
        if (hit?.kind === 'entity') {
          try {
            const segment = trimSegmentAtPoint(sketch.entities, hit.id, world);
            trimPreviewRef.current = { ...segment, version: 0 };
          } catch {
            // No bounded removable segment at this pointer location.
          }
        }
      }
      const next: EditorHover = {
        entityId: hit?.kind === 'entity' ? hit.id : null,
        nodeId: hit?.kind === 'node' ? hit.id : null,
        constraintEntityIds: hoverRef.current.constraintEntityIds,
      };
      if (next.entityId !== hoverRef.current.entityId || next.nodeId !== hoverRef.current.nodeId) {
        hoverRef.current = next;
        redraw();
      }
      return;
    }
    if (pointer.mode === 'pan') {
      if (pointer.commentPlacement && !pointer.commentPlacement.moved) {
        const distance = Math.hypot(
          event.clientX - pointer.commentPlacement.originX,
          event.clientY - pointer.commentPlacement.originY,
        );
        if (distance < 4) return;
        pointer.commentPlacement.moved = true;
        setCommentCursor(null);
        setInteractionState('dragging');
      }
      cameraRef.current.panBy(event.clientX - pointer.x, event.clientY - pointer.y);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      redraw();
      publishView();
      return;
    }
    if (pointer.mode === 'marquee') {
      pointer.currentScreen = screen;
      redraw();
      return;
    }
    if (pointer.mode === 'drag-node') {
      if (pointer.immobile && definitionRef.current?.nodes[pointer.nodeId]?.fullyDefined) return;
      const snapped = stableSnap(pointer.base, world, {
        gridStep: adaptiveGridStep(cameraRef.current.zoom),
        excludeEntityIds: selectionRef.current.entityIds,
      });
      pointer.target = snapped.point;
      pointer.generation += 1;
      displayDocumentRef.current = moveSketchNode(pointer.base, pointer.nodeId, pointer.target);
      queuePreview(pointer, pointer.base, pointer.nodeId, pointer.target);
      setInteractionState('previewing');
      redraw();
      return;
    }
    pointer.targetWorld = world;
    pointer.generation += 1;
    if (pointer.kind === 'move') {
      let dx = world.x - pointer.originWorld.x;
      let dy = world.y - pointer.originWorld.y;
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      pointer.transform = { pivot: pointer.pivot, translation: { x: dx, y: dy } };
    } else if (pointer.kind === 'rotate') {
      const start = Math.atan2(pointer.startVector.y, pointer.startVector.x);
      let rotation = Math.atan2(world.y - pointer.pivot.y, world.x - pointer.pivot.x) - start;
      if (event.shiftKey) rotation = (Math.round(rotation / (Math.PI / 12)) * Math.PI) / 12;
      pointer.transform = { pivot: pointer.pivot, rotation };
    } else {
      const startDistance = Math.hypot(pointer.startVector.x, pointer.startVector.y);
      const currentDistance = Math.hypot(world.x - pointer.pivot.x, world.y - pointer.pivot.y);
      pointer.transform = {
        pivot: pointer.pivot,
        scale: Math.max(0.01, currentDistance / Math.max(startDistance, 1e-9)),
      };
    }
    const preview = previewGeometryTransform(pointer.base, pointer.entityIds, pointer.transform);
    displayDocumentRef.current = preview;
    queuePreview(pointer, preview);
    setInteractionState('previewing');
    redraw();
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>, commit: boolean) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointerRef.current = null;
    setInteractionState('idle');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointer.mode === 'marquee') {
      const targetWorld = cameraRef.current.screenToWorld(pointer.currentScreen);
      const sketch = displayDocumentRef.current;
      if (!sketch) return;
      const result = selectEntitiesInMarquee(sketch, pointer.originWorld, targetWorld);
      const next = pointer.additive
        ? addToSelection(selectionRef.current, 'entity', result.entityIds)
        : replaceSelection('entity', result.entityIds);
      updateSelection(next);
      redraw();
      return;
    }
    if (pointer.mode === 'pan') {
      if (
        pointer.commentPlacement &&
        (!pointer.commentPlacement.allowPlacement || pointer.commentPlacement.moved)
      ) {
        suppressCommentClickUntilRef.current = performance.now() + 100;
      }
      return;
    }
    getBrowserPlaneGcsPreviewRuntime().cancel(pointer.dragSessionId);
    snapLockRef.current = null;
    if (!commit) {
      displayDocumentRef.current = authoritativeRef.current;
      redraw();
      return;
    }
    if (pointer.mode === 'drag-node') {
      const moved = Math.hypot(
        pointer.target.x - pointer.origin.x,
        pointer.target.y - pointer.origin.y,
      );
      if (moved > 1e-7 && !pointer.immobile) {
        void commitCommand(
          { type: 'move_node', nodeId: pointer.nodeId, position: pointer.target },
          true,
        );
      } else {
        displayDocumentRef.current = authoritativeRef.current;
        redraw();
      }
      return;
    }
    const transform = pointer.transform;
    const translation = transform.translation;
    const changed =
      Math.hypot(translation?.x ?? 0, translation?.y ?? 0) > 1e-7 ||
      Math.abs(transform.rotation ?? 0) > 1e-7 ||
      Math.abs((transform.scale ?? 1) - 1) > 1e-7;
    if (changed) {
      void commitCommand(
        {
          type: 'transform_geometry',
          entityIds: pointer.entityIds,
          pivot: transform.pivot,
          ...(translation ? { translation } : {}),
          ...(transform.rotation !== undefined ? { rotation: transform.rotation } : {}),
          ...(transform.scale !== undefined ? { scale: transform.scale } : {}),
        },
        true,
      );
    } else {
      displayDocumentRef.current = authoritativeRef.current;
      redraw();
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Escape') {
      if (pointerRef.current) {
        const pointer = pointerRef.current;
        if (pointer.mode === 'drag-node' || pointer.mode === 'transform') {
          getBrowserPlaneGcsPreviewRuntime().cancel(pointer.dragSessionId);
        }
        pointerRef.current = null;
        displayDocumentRef.current = authoritativeRef.current;
      } else if (creationRef.current?.points.length) {
        creationRef.current = {
          ...creationRef.current,
          points: [],
          current: null,
          snapCandidates: [],
        };
      } else if (constraintTool) {
        setDimensionEditor(null);
        onConstraintToolChange?.(null);
      } else if (tool !== 'select' && tool !== 'trim') {
        creationRef.current = null;
        onToolChange?.('select');
      } else {
        updateSelection(replaceSelection('entity', []));
      }
      setInteractionMessage(null);
      redraw();
      return;
    }
    if (
      event.key === 'Enter' &&
      creationRef.current?.tool === 'bspline' &&
      creationRef.current.points.length >= 4
    ) {
      commitCreation(creationRef.current, creationRef.current.points.at(-1)!, false, false);
      creationRef.current = {
        ...creationRef.current,
        points: [],
        current: null,
        snapCandidates: [],
      };
      onToolChange?.('select');
      redraw();
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault();
    if (selectionRef.current.constraintIds.length > 0) {
      void commitCommand({
        type: 'remove_constraint',
        constraintIds: selectionRef.current.constraintIds,
      });
    } else if (selectionRef.current.dimensionIds.length > 0) {
      void commitCommand({
        type: 'remove_dimension',
        dimensionIds: selectionRef.current.dimensionIds,
      });
    } else if (selectionRef.current.entityIds.length > 0) {
      void commitCommand({ type: 'delete_geometry', entityIds: selectionRef.current.entityIds });
    }
  };

  const constraintBadges = (() => {
    const sketch = displayDocumentRef.current;
    if (!sketch) return [];
    return projectConstraintOverlay(sketch, cameraRef.current, selection);
  })();
  const dimensions = (() => {
    const sketch = displayDocumentRef.current;
    if (!sketch) return [];
    return projectDimensionOverlay(
      sketch,
      cameraRef.current,
      selection,
      constraintBadges.map(({ screen }) => screen),
      { ...viewState, ...insets },
    );
  })();

  const clickConstraint = (
    event: ReactPointerEvent<HTMLButtonElement>,
    badge: ConstraintOverlayBadge,
  ) => {
    event.stopPropagation();
    let next = selectionRef.current;
    for (const id of badge.constraintIds)
      next = toggleSelection(next, 'constraint', id, event.shiftKey);
    updateSelection(next);
    hoverRef.current = { ...hoverRef.current, constraintEntityIds: badge.affectedEntityIds };
    redraw();
  };

  const selectedCount = selectionCount(selection);
  const selectedFixedConstraints =
    document?.constraints.filter(
      ({ type, refs }) =>
        type === 'fixed' && refs.some(({ entityId }) => selection.entityIds.includes(entityId)),
    ) ?? [];
  const panning = pointerRef.current?.mode === 'pan';
  const cursor = editorCursorFor(panning ? 'pan' : cursorMode);
  const commentPlacement = commentAnchor
    ? {
        ...commentAnchor,
        screen: cameraRef.current.worldToScreen(commentAnchor.world),
      }
    : null;

  return (
    <section
      ref={hostRef}
      className="attune-sketch-canvas"
      aria-label={`${projectName} canvas`}
      data-camera-x={viewState.x.toFixed(2)}
      data-camera-y={viewState.y.toFixed(2)}
      data-camera-zoom={viewState.zoom.toFixed(4)}
      data-grid-step={viewState.gridStep}
      data-cursor-mode={cursorMode}
      data-interaction-state={interactionState}
      data-read-only={readOnly || undefined}
    >
      <canvas
        ref={canvasRef}
        className={panning ? 'is-panning' : undefined}
        style={{ cursor: cursor.cssCursor }}
        tabIndex={0}
        aria-label="CanvasKit precision sketch surface"
        onDoubleClick={fitSketch}
        onPointerDown={onPointerDown}
        onClick={placeComment}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishPointer(event, true)}
        onPointerCancel={(event) => finishPointer(event, false)}
        onPointerLeave={() => {
          if (cursorMode === 'comment') setCommentCursor(null);
          if (tool === 'trim' && trimPreviewRef.current) {
            trimPreviewRef.current = null;
            hoverRef.current = EMPTY_HOVER;
            redraw();
          }
        }}
        onKeyDown={onKeyDown}
      />
      <div className="sketch-semantic-overlays" aria-label="Sketch constraints and dimensions">
        {constraintBadges.map((badge) => (
          <button
            type="button"
            key={badge.id}
            className="sketch-constraint-hit-target"
            data-selected={badge.selected}
            data-related={badge.related}
            data-conflict={badge.conflict}
            data-overflow={badge.kind === 'overflow'}
            title={badge.title}
            style={{ left: badge.screen.x, top: badge.screen.y }}
            onPointerEnter={() => {
              hoverRef.current = {
                ...hoverRef.current,
                constraintEntityIds: badge.affectedEntityIds,
              };
              redraw();
            }}
            onPointerLeave={() => {
              hoverRef.current = { ...hoverRef.current, constraintEntityIds: [] };
              redraw();
            }}
            onPointerDown={(event) => clickConstraint(event, badge)}
          >
            <ConstraintBadgeGraphic badge={badge} />
            <span className="visually-hidden">{badge.title}</span>
          </button>
        ))}
        {dimensions.map((dimension) => {
          const current = authoritativeRef.current?.dimensions.find(
            ({ id }) => id === dimension.id,
          );
          return (
            <button
              type="button"
              key={dimension.id}
              className="sketch-dimension-hit-target"
              aria-label={
                dimension.kind === 'driving'
                  ? `${dimension.text}; double-click to edit`
                  : dimension.text
              }
              style={{ left: dimension.screen.x, top: dimension.screen.y }}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (dimension.kind === 'driving') {
                  updateSelection(
                    toggleSelection(
                      selectionRef.current,
                      'dimension',
                      dimension.id,
                      event.shiftKey,
                    ),
                  );
                }
              }}
              onDoubleClick={() => {
                if (typeof current?.value !== 'number') return;
                setDimensionEditor({
                  mode: 'edit',
                  id: dimension.id,
                  value: current.value,
                  screen: dimension.screen,
                });
              }}
            />
          );
        })}
      </div>
      <Popover
        open={dimensionEditor !== null}
        onOpenChange={(open) => {
          if (!open) setDimensionEditor(null);
        }}
      >
        <Popover.Trigger
          nativeButton={false}
          render={
            <span
              className="sketch-dimension-popover-anchor"
              style={
                dimensionEditor
                  ? { left: dimensionEditor.screen.x, top: dimensionEditor.screen.y }
                  : undefined
              }
            />
          }
        />
        <Popover.Content side="right" sideOffset={8} className="sketch-dimension-editor">
          <Popover.Title>
            {dimensionEditor?.mode === 'create' ? `Set ${dimensionEditor.kind}` : 'Edit dimension'}
          </Popover.Title>
          <NumberField.Root
            value={dimensionEditor?.value ?? null}
            min={0.001}
            onValueChange={(value) => {
              if (dimensionEditor && value !== null)
                setDimensionEditor({ ...dimensionEditor, value });
            }}
          >
            <NumberField.Group className="sketch-number-field">
              <NumberField.Input
                aria-label="Dimension value in millimetres"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setDimensionEditor(null);
                    onConstraintToolChange?.(null);
                  }
                  if (event.key !== 'Enter' || !dimensionEditor || !authoritativeRef.current)
                    return;
                  const sketch = authoritativeRef.current;
                  if (!Number.isFinite(dimensionEditor.value) || dimensionEditor.value <= 0) return;
                  if (dimensionEditor.mode === 'edit') {
                    const current = sketch.dimensions.find(({ id }) => id === dimensionEditor.id);
                    if (current) {
                      void commitCommand({
                        type: 'set_dimension',
                        dimensions: [{ ...current, value: dimensionEditor.value }],
                      });
                    }
                  } else {
                    const input = dimensionInputForTool(
                      sketch,
                      selectionRef.current,
                      dimensionEditor.kind,
                      dimensionEditor.id,
                      dimensionEditor.value,
                    );
                    if (input) {
                      void commitCommand({ type: 'set_dimension', dimensions: [input] }).then(
                        (accepted) => accepted && onConstraintToolChange?.(null),
                      );
                    }
                  }
                  setDimensionEditor(null);
                }}
              />
            </NumberField.Group>
          </NumberField.Root>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDimensionEditor(null)}>
            Cancel
          </Button>
        </Popover.Content>
      </Popover>
      {selectedCount > 0 ? (
        <output className="sketch-selection-context">
          <strong>
            {selection.constraintIds.length > 0
              ? `${selection.constraintIds.length} constraint${selection.constraintIds.length === 1 ? '' : 's'} selected`
              : `${selectedCount} selected`}
          </strong>
          {selection.entityIds.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() =>
                  void commitCommand({ type: 'delete_geometry', entityIds: selection.entityIds })
                }
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedFixedConstraints.length > 0) {
                    void commitCommand({
                      type: 'remove_constraint',
                      constraintIds: selectedFixedConstraints.map(({ id }) => id),
                    });
                  } else {
                    void commitCommand({
                      type: 'apply_constraint',
                      constraints: selection.entityIds.map((entityId) => ({
                        id: `constraint:fixed:${crypto.randomUUID()}`,
                        type: 'fixed',
                        refs: [{ entityId }],
                      })),
                    });
                  }
                }}
              >
                {selectedFixedConstraints.length > 0 ? 'Unfix' : 'Fix'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const selectedEntities =
                    document?.entities.filter(({ id }) => selection.entityIds.includes(id)) ?? [];
                  const construction = !selectedEntities.every((entity) => entity.construction);
                  void commitCommand({
                    type: 'set_construction',
                    entityIds: selection.entityIds,
                    construction,
                  });
                }}
              >
                Construction
              </button>
            </>
          ) : null}
        </output>
      ) : null}
      {interactionMessage ? (
        <output className="sketch-interaction-message">{interactionMessage}</output>
      ) : null}
      {renderComments?.(
        viewState,
        commentPlacement,
        () => {
          setCommentAnchor(null);
          onCommentPlacementComplete?.();
        },
        commentAnchor ? null : commentCursor,
      )}
      <WorkspaceOrientationHud right={insets.right} />
      {surfaceState !== 'ready' ? (
        <span
          className="sketch-surface-status"
          role={surfaceState === 'failed' ? 'alert' : 'status'}
        >
          {surfaceState === 'failed' ? 'Canvas unavailable' : 'Opening sketch…'}
        </span>
      ) : null}
    </section>
  );
});
