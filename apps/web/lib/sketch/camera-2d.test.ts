import { describe, expect, it } from 'vitest';

import { Camera2D } from './camera-2d';
import { adaptiveGridStep } from './grid';
import { viewportInsetsFor } from './viewport-insets';

describe('Camera2D', () => {
  it('round-trips points between world and screen coordinates', () => {
    const camera = new Camera2D({ x: 320, y: 240, zoom: 2.5 });
    const screen = camera.worldToScreen({ x: 12, y: -8 });
    expect(camera.screenToWorld(screen)).toEqual({ x: 12, y: -8 });
  });

  it('keeps the cursor world point fixed while zooming', () => {
    const camera = new Camera2D({ x: 100, y: 100, zoom: 1 });
    const cursor = { x: 225, y: 175 };
    const before = camera.screenToWorld(cursor);
    camera.zoomAt(cursor, 2);
    expect(camera.screenToWorld(cursor).x).toBeCloseTo(before.x);
    expect(camera.screenToWorld(cursor).y).toBeCloseTo(before.y);
  });

  it('fits bounds inside an inset viewport', () => {
    const camera = new Camera2D();
    camera.fitBounds(
      { minX: -100, minY: -50, maxX: 100, maxY: 50 },
      { width: 1000, height: 600 },
      { top: 50, right: 100, bottom: 50, left: 100 },
    );
    expect(camera.worldToScreen({ x: -100, y: 50 }).x).toBeGreaterThanOrEqual(100);
    expect(camera.worldToScreen({ x: 100, y: -50 }).x).toBeLessThanOrEqual(900);
  });

  it('interpolates pan linearly and zoom logarithmically', () => {
    const camera = new Camera2D({ x: 0, y: 0, zoom: 1 });
    camera.interpolate({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 50, zoom: 4 }, 0.5);
    expect(camera.state()).toEqual({ x: 50, y: 25, zoom: 2 });
  });
});

describe('adaptive sketch viewport helpers', () => {
  it('uses a 1 / 2 / 5 grid progression', () => {
    expect(adaptiveGridStep(1)).toBe(50);
    expect(adaptiveGridStep(2)).toBe(20);
    expect(adaptiveGridStep(10)).toBe(5);
  });

  it('reserves indicator space for overlay panels without changing canvas size', () => {
    expect(viewportInsetsFor({ leftPanel: 'items', rightPanel: null })).toEqual({
      top: 68,
      right: 152,
      bottom: 12,
      left: 448,
    });
    expect(viewportInsetsFor({ leftPanel: null, rightPanel: 'history' })).toEqual({
      top: 68,
      right: 448,
      bottom: 12,
      left: 152,
    });
  });
});
