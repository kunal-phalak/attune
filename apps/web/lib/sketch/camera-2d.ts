export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface FitPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Camera2DState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

const DEFAULT_PADDING: FitPadding = { top: 72, right: 72, bottom: 72, left: 72 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * A renderer-independent 2D camera. World Y points up while screen Y points down.
 * The mutable instance is intentionally suitable for refs and imperative render loops.
 */
export class Camera2D {
  x: number;
  y: number;
  zoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;

  constructor({
    x = 0,
    y = 0,
    zoom = 1,
    minZoom = 0.05,
    maxZoom = 24,
  }: Partial<{
    x: number;
    y: number;
    zoom: number;
    minZoom: number;
    maxZoom: number;
  }> = {}) {
    if (minZoom <= 0 || maxZoom <= minZoom) throw new Error('Invalid Camera2D zoom limits.');
    this.x = x;
    this.y = y;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.zoom = clamp(zoom, minZoom, maxZoom);
  }

  worldToScreen(point: Point2D): Point2D {
    return {
      x: this.x + point.x * this.zoom,
      y: this.y - point.y * this.zoom,
    };
  }

  screenToWorld(point: Point2D): Point2D {
    return {
      x: (point.x - this.x) / this.zoom,
      y: (this.y - point.y) / this.zoom,
    };
  }

  panBy(deltaX: number, deltaY: number): void {
    this.x += deltaX;
    this.y += deltaY;
  }

  zoomAt(screenPoint: Point2D, zoomFactor: number): void {
    const worldPoint = this.screenToWorld(screenPoint);
    this.zoom = clamp(this.zoom * zoomFactor, this.minZoom, this.maxZoom);
    this.x = screenPoint.x - worldPoint.x * this.zoom;
    this.y = screenPoint.y + worldPoint.y * this.zoom;
  }

  state(): Camera2DState {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  setState(state: Camera2DState): void {
    this.x = state.x;
    this.y = state.y;
    this.zoom = clamp(state.zoom, this.minZoom, this.maxZoom);
  }

  interpolate(from: Camera2DState, to: Camera2DState, progress: number): void {
    const amount = clamp(progress, 0, 1);
    this.x = from.x + (to.x - from.x) * amount;
    this.y = from.y + (to.y - from.y) * amount;
    this.zoom = clamp(
      Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * amount),
      this.minZoom,
      this.maxZoom,
    );
  }

  fitBounds(bounds: Bounds2D, viewport: ViewportSize, padding: FitPadding = DEFAULT_PADDING): void {
    const contentWidth = Math.max(1, viewport.width - padding.left - padding.right);
    const contentHeight = Math.max(1, viewport.height - padding.top - padding.bottom);
    const boundsWidth = Math.max(1e-6, bounds.maxX - bounds.minX);
    const boundsHeight = Math.max(1e-6, bounds.maxY - bounds.minY);
    this.zoom = clamp(
      Math.min(contentWidth / boundsWidth, contentHeight / boundsHeight),
      this.minZoom,
      this.maxZoom,
    );

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const viewportCenterX = padding.left + contentWidth / 2;
    const viewportCenterY = padding.top + contentHeight / 2;
    this.x = viewportCenterX - centerX * this.zoom;
    this.y = viewportCenterY + centerY * this.zoom;
  }

  resetView(viewport: ViewportSize): void {
    this.zoom = clamp(1, this.minZoom, this.maxZoom);
    this.x = viewport.width / 2;
    this.y = viewport.height / 2;
  }
}
