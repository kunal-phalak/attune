'use client';

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

import type { SketchTemplate } from '../lib/projects/library';
import { Camera2D, type FitPadding, type ViewportSize } from '../lib/sketch/camera-2d';
import { editorCursorFor, type EditorCursorMode } from '../lib/sketch/editor-cursors';
import { adaptiveGridStep } from '../lib/sketch/grid';
import { SPOKE_SKETCH } from '../lib/sketch/spoke-sketch';
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
  template: SketchTemplate,
): void {
  if (template === 'blank') return;
  const geometryPaint = paint(canvasKit, canvasKit.Color(38, 48, 63, 0.95), 1.65 / camera.zoom);
  try {
    for (const entity of SPOKE_SKETCH.entities) {
      if (entity.kind === 'circle') {
        canvas.drawCircle(entity.center.x, entity.center.y, entity.radius, geometryPaint);
      } else {
        canvas.drawLine(entity.start.x, entity.start.y, entity.end.x, entity.end.y, geometryPaint);
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
  template: SketchTemplate,
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
  drawSketch(canvasKit, canvas, camera, template);
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
    readonly renderComments?: (view: CameraViewState) => ReactNode;
    readonly projectName: string;
    readonly template: SketchTemplate;
    readonly cursorMode: EditorCursorMode;
  }
>(function WorkspaceCanvas(
  { insets, renderComments, projectName, template, cursorMode },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new Camera2D({ minZoom: 0.08, maxZoom: 18 }));
  const surfaceRef = useRef<Surface | null>(null);
  const metricsRef = useRef<CanvasMetrics>({ width: 0, height: 0, pixelRatio: 1 });
  const insetsRef = useRef(insets);
  const templateRef = useRef(template);
  const redrawRef = useRef<() => void>(() => undefined);
  const initializedRef = useRef(false);
  const pointerRef = useRef<{ readonly id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
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
  templateRef.current = template;

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

  const fitSketch = () => {
    const metrics = metricsRef.current;
    if (metrics.width === 0 || metrics.height === 0) return;
    if (templateRef.current === 'spoke') {
      cameraRef.current.fitBounds(SPOKE_SKETCH.bounds, metrics, fitPadding(insetsRef.current));
    } else {
      cameraRef.current.resetView(metrics);
    }
    redrawRef.current();
    publishView();
  };

  const resetView = () => {
    const metrics = metricsRef.current;
    if (metrics.width === 0 || metrics.height === 0) return;
    cameraRef.current.resetView(metrics);
    redrawRef.current();
    publishView();
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
            if (templateRef.current === 'spoke') {
              cameraRef.current.fitBounds(
                SPOKE_SKETCH.bounds,
                metrics,
                fitPadding(insetsRef.current),
              );
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
              templateRef.current,
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
    };
  }, []);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
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
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    cameraRef.current.panBy(event.clientX - pointer.x, event.clientY - pointer.y);
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    redrawRef.current();
    publishView();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    pointerRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const cursor = editorCursorFor(dragging ? 'pan' : cursorMode);

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
      {renderComments?.(viewState)}
      <WorkspaceOrientationHud
        right={insets.right}
        gridStep={viewState.gridStep}
        zoom={viewState.zoom}
        onFit={fitSketch}
        onReset={resetView}
      />
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
