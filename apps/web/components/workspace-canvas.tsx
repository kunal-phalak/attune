'use client';

import {
  createSelectionContext,
  geometryBounds,
  snapSketchPoint,
  type CircleEntity,
  type GeometryPatch,
  type SketchBounds,
  type SketchDocument,
} from '@attune/domain/sketch';
import type { Canvas as SkCanvas, CanvasKit, Paint, Surface } from 'canvaskit-wasm';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { Camera2D, type FitPadding, type ViewportSize } from '../lib/sketch/camera-2d';
import { editorCursorFor, type EditorCursorMode } from '../lib/sketch/editor-cursors';
import { adaptiveGridStep } from '../lib/sketch/grid';
import type { ViewportInsets } from '../lib/sketch/viewport-insets';
import { WorkspaceOrientationHud } from './workspace-orientation-hud';

declare global {
  interface Window {
    CanvasKitInit?: (options: {
      readonly locateFile: (file: string) => string;
    }) => Promise<CanvasKit>;
  }
}

let canvasKitPromise: Promise<CanvasKit> | undefined;

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

export interface CameraViewState extends ViewportSize {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly gridStep: number;
}

export interface CanvasCommentPlacement {
  readonly screen: { readonly x: number; readonly y: number };
  readonly world: { readonly x: number; readonly y: number };
}

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
  const majorEvery = 5;
  const topLeft = camera.screenToWorld({ x: 0, y: 0 });
  const bottomRight = camera.screenToWorld({ x: viewport.width, y: viewport.height });
  const minimumX = Math.min(topLeft.x, bottomRight.x);
  const maximumX = Math.max(topLeft.x, bottomRight.x);
  const minimumY = Math.min(topLeft.y, bottomRight.y);
  const maximumY = Math.max(topLeft.y, bottomRight.y);
  const startX = Math.floor(minimumX / minorStep);
  const endX = Math.ceil(maximumX / minorStep);
  const startY = Math.floor(minimumY / minorStep);
  const endY = Math.ceil(maximumY / minorStep);
  const minor = paint(canvasKit, canvasKit.Color(74, 85, 104, 0.08), 0.7 / camera.zoom);
  const major = paint(canvasKit, canvasKit.Color(74, 85, 104, 0.16), 0.9 / camera.zoom);

  try {
    for (let index = startX; index <= endX; index += 1) {
      const x = index * minorStep;
      if (Math.abs(x) < minorStep / 1000) continue;
      canvas.drawLine(x, minimumY, x, maximumY, index % majorEvery === 0 ? major : minor);
    }
    for (let index = startY; index <= endY; index += 1) {
      const y = index * minorStep;
      if (Math.abs(y) < minorStep / 1000) continue;
      canvas.drawLine(minimumX, y, maximumX, y, index % majorEvery === 0 ? major : minor);
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
  const minimumX = Math.min(topLeft.x, bottomRight.x);
  const maximumX = Math.max(topLeft.x, bottomRight.x);
  const minimumY = Math.min(topLeft.y, bottomRight.y);
  const maximumY = Math.max(topLeft.y, bottomRight.y);
  const xAxis = paint(canvasKit, canvasKit.Color(203, 84, 65, 0.58), 1.1 / camera.zoom);
  const yAxis = paint(canvasKit, canvasKit.Color(46, 137, 113, 0.58), 1.1 / camera.zoom);
  const origin = new canvasKit.Paint();
  origin.setAntiAlias(true);
  origin.setColor(canvasKit.Color(57, 68, 84, 0.82));
  origin.setStyle(canvasKit.PaintStyle.Fill);

  try {
    canvas.drawLine(minimumX, 0, maximumX, 0, xAxis);
    canvas.drawLine(0, minimumY, 0, maximumY, yAxis);
    canvas.drawCircle(0, 0, 2.8 / camera.zoom, origin);
  } finally {
    xAxis.delete();
    yAxis.delete();
    origin.delete();
  }
}

function drawSketch(
  canvasKit: CanvasKit,
  canvas: SkCanvas,
  camera: Camera2D,
  document: SketchDocument | null,
): void {
  if (!document) return;
  const geometryPaint = paint(canvasKit, canvasKit.Color(38, 48, 63, 0.95), 1.65 / camera.zoom);
  try {
    for (const entity of document.entities) {
      switch (entity.kind) {
        case 'point':
          canvas.drawCircle(entity.position.x, entity.position.y, 2.5 / camera.zoom, geometryPaint);
          break;
        case 'line':
          canvas.drawLine(
            entity.start.x,
            entity.start.y,
            entity.end.x,
            entity.end.y,
            geometryPaint,
          );
          break;
        case 'circle':
          canvas.drawCircle(entity.center.x, entity.center.y, entity.radius, geometryPaint);
          break;
        case 'arc':
          canvas.drawArc(
            [
              entity.center.x - entity.radius,
              entity.center.y - entity.radius,
              entity.center.x + entity.radius,
              entity.center.y + entity.radius,
            ],
            (-entity.endAngle * 180) / Math.PI,
            ((entity.endAngle - entity.startAngle) * 180) / Math.PI,
            false,
            geometryPaint,
          );
          break;
      }
    }
  } finally {
    geometryPaint.delete();
  }
}

function renderSurface(
  canvasKit: CanvasKit,
  surface: Surface,
  camera: Camera2D,
  metrics: CanvasMetrics,
  document: SketchDocument | null,
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
  drawSketch(canvasKit, canvas, camera, document);
  canvas.restore();
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

export const WorkspaceCanvas = forwardRef<
  WorkspaceCanvasHandle,
  {
    readonly insets: ViewportInsets;
    readonly renderComments?: (
      view: CameraViewState,
      placement: CanvasCommentPlacement | null,
    ) => ReactNode;
    readonly projectName: string;
    readonly cursorMode: EditorCursorMode;
    readonly document: SketchDocument | null;
    readonly onEditGeometry?: (patches: readonly GeometryPatch[]) => Promise<void>;
  }
>(function WorkspaceCanvas(
  { insets, renderComments, projectName, document, cursorMode, onEditGeometry },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new Camera2D({ minZoom: 0.08, maxZoom: 18 }));
  const surfaceRef = useRef<Surface | null>(null);
  const metricsRef = useRef<CanvasMetrics>({ width: 0, height: 0, pixelRatio: 1 });
  const insetsRef = useRef(insets);
  const documentRef = useRef(document);
  const redrawRef = useRef<() => void>(() => undefined);
  const initializedRef = useRef(false);
  const cameraAnimationRef = useRef<number | null>(null);
  const pointerRef = useRef<
    | { readonly mode: 'pan'; readonly id: number; x: number; y: number }
    | {
        readonly mode: 'resize-circle';
        readonly id: number;
        readonly entityId: string;
        readonly original: CircleEntity;
      }
    | null
  >(null);
  const [dragging, setDragging] = useState(false);
  const [commentPointer, setCommentPointer] = useState<CanvasCommentPlacement['screen'] | null>(
    null,
  );
  const [surfaceState, setSurfaceState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [viewState, setViewState] = useState<CameraViewState>({
    x: 0,
    y: 0,
    zoom: 1,
    gridStep: 50,
    width: 0,
    height: 0,
  });

  insetsRef.current = insets;
  documentRef.current = document;

  const documentBounds = (): SketchBounds | null => {
    const entities = documentRef.current?.entities ?? [];
    if (entities.length === 0) return null;
    const bounds = entities.map(geometryBounds);
    return {
      minX: Math.min(...bounds.map(({ minX }) => minX)),
      minY: Math.min(...bounds.map(({ minY }) => minY)),
      maxX: Math.max(...bounds.map(({ maxX }) => maxX)),
      maxY: Math.max(...bounds.map(({ maxY }) => maxY)),
    };
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

  const cancelCameraAnimation = () => {
    if (cameraAnimationRef.current !== null) {
      cancelAnimationFrame(cameraAnimationRef.current);
      cameraAnimationRef.current = null;
    }
  };

  const animateCamera = (configure: (target: Camera2D) => void) => {
    const metrics = metricsRef.current;
    if (metrics.width === 0 || metrics.height === 0) return;
    cancelCameraAnimation();
    const camera = cameraRef.current;
    const start = camera.state();
    const target = new Camera2D({
      ...start,
      minZoom: camera.minZoom,
      maxZoom: camera.maxZoom,
    });
    configure(target);
    const finish = target.state();
    const startedAt = performance.now();
    const frame = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / 180);
      camera.interpolate(start, finish, 1 - (1 - progress) ** 3);
      redrawRef.current();
      publishView();
      if (progress < 1) {
        cameraAnimationRef.current = requestAnimationFrame(frame);
      } else {
        cameraAnimationRef.current = null;
      }
    };
    cameraAnimationRef.current = requestAnimationFrame(frame);
  };

  const fitSketch = () => {
    const metrics = metricsRef.current;
    if (metrics.width === 0 || metrics.height === 0) return;
    const bounds = documentBounds();
    animateCamera((target) =>
      bounds
        ? target.fitBounds(bounds, metrics, fitPadding(insetsRef.current))
        : target.resetView(metrics),
    );
  };

  const resetView = () => {
    const metrics = metricsRef.current;
    if (metrics.width === 0 || metrics.height === 0) return;
    animateCamera((target) => target.resetView(metrics));
  };

  useImperativeHandle(forwardedRef, () => ({ fitSketch, resetView }));

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
            if (bounds) {
              cameraRef.current.fitBounds(bounds, metrics, fitPadding(insetsRef.current));
            } else {
              cameraRef.current.resetView(metrics);
            }
          } else if (previous.width > 0 && previous.height > 0) {
            cameraRef.current.panBy(
              (metrics.width - previous.width) / 2,
              (metrics.height - previous.height) / 2,
            );
          }
          redrawRef.current();
          publishView();
        };

        redrawRef.current = () => {
          const surface = surfaceRef.current;
          if (surface) {
            renderSurface(
              canvasKit,
              surface,
              cameraRef.current,
              metricsRef.current,
              documentRef.current,
            );
          }
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
    };
  }, []);

  useEffect(() => {
    documentRef.current = document;
    redrawRef.current();
  }, [document]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelCameraAnimation();
      const bounds = element.getBoundingClientRect();
      const cursor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const looksLikeTrackpadPan =
        !event.ctrlKey &&
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
        (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 45);
      if (looksLikeTrackpadPan) {
        cameraRef.current.panBy(-event.deltaX, -event.deltaY);
      } else {
        const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.0018));
        cameraRef.current.zoomAt(cursor, factor);
      }
      redrawRef.current();
      publishView();
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    cancelCameraAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const sketch = documentRef.current;
    if (event.button === 0 && cursorMode === 'select' && sketch) {
      const context = createSelectionContext(sketch, {
        screenPoint: screen,
        camera: {
          x: cameraRef.current.x,
          y: cameraRef.current.y,
          zoom: cameraRef.current.zoom,
        },
      });
      const hovered = context.hoveredEntity
        ? sketch.entities.find(({ id }) => id === context.hoveredEntity?.entityId)
        : undefined;
      if (hovered?.kind === 'circle') {
        pointerRef.current = {
          mode: 'resize-circle',
          id: event.pointerId,
          entityId: hovered.id,
          original: hovered,
        };
        setDragging(true);
        return;
      }
    }
    pointerRef.current = {
      mode: 'pan',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.mode === 'pan') {
      cameraRef.current.panBy(event.clientX - pointer.x, event.clientY - pointer.y);
      pointerRef.current = { ...pointer, x: event.clientX, y: event.clientY };
    } else {
      const sketch = documentRef.current;
      if (!sketch) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const world = cameraRef.current.screenToWorld({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      const snapped = snapSketchPoint(sketch, world, {
        gridStep: adaptiveGridStep(cameraRef.current.zoom),
        tolerance: 9 / cameraRef.current.zoom,
      });
      const radius = Math.max(
        0.1,
        Math.hypot(
          snapped.point.x - pointer.original.center.x,
          snapped.point.y - pointer.original.center.y,
        ),
      );
      documentRef.current = {
        ...sketch,
        entities: sketch.entities.map((entity) =>
          entity.id === pointer.entityId && entity.kind === 'circle'
            ? Object.assign({}, entity, { radius })
            : entity,
        ),
      };
    }
    redrawRef.current();
    publishView();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (pointer?.id !== event.pointerId) return;
    pointerRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointer.mode === 'resize-circle') {
      const changed = documentRef.current?.entities.find(
        (entity): entity is CircleEntity =>
          entity.id === pointer.entityId && entity.kind === 'circle',
      );
      documentRef.current = document;
      redrawRef.current();
      if (changed && Math.abs(changed.radius - pointer.original.radius) > 1e-6) {
        void onEditGeometry?.([
          {
            id: changed.id,
            kind: 'circle',
            center: changed.center,
            radius: changed.radius,
          },
        ]).catch(() => {
          documentRef.current = document;
          redrawRef.current();
        });
      }
    }
  };

  const onCommentPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (cursorMode !== 'comment') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setCommentPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  };

  useEffect(() => {
    if (cursorMode !== 'comment') setCommentPointer(null);
  }, [cursorMode]);

  const cursor = editorCursorFor(dragging ? 'pan' : cursorMode);
  const commentPlacement = commentPointer
    ? {
        screen: commentPointer,
        world: cameraRef.current.screenToWorld(commentPointer),
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
      data-cursor-mode={dragging ? 'pan' : cursorMode}
      onPointerMove={onCommentPointerMove}
      onPointerLeave={() => setCommentPointer(null)}
    >
      <canvas
        ref={canvasRef}
        className={dragging ? 'is-panning' : undefined}
        style={{ cursor: cursor.cssCursor }}
        tabIndex={0}
        aria-label="CanvasKit precision sketch surface"
        onDoubleClick={fitSketch}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {renderComments?.(viewState, commentPlacement)}
      <WorkspaceOrientationHud right={insets.right} gridStep={viewState.gridStep} />
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
