import { createSketchDocument, hashCanonical } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { Camera2D } from './camera-2d';
import { projectSketchForCanvas } from './canvaskit-projection';

describe('Attune to CanvasKit projection', () => {
  it('keeps circular arcs analytic and renderer-only', () => {
    const document = createSketchDocument({
      id: 'sketch:render',
      name: 'Render',
      entities: [
        {
          id: 'arc:a',
          kind: 'arc',
          center: { x: 1, y: 2 },
          radius: 10,
          startAngle: Math.PI / 4,
          endAngle: Math.PI,
        },
      ],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    expect(projectSketchForCanvas(document)).toEqual([
      expect.objectContaining({
        id: 'arc:a',
        kind: 'arc',
        center: { x: 1, y: 2 },
        radius: 10,
        startAngle: Math.PI / 4,
        sweepAngle: (Math.PI * 3) / 4,
      }),
    ]);
  });

  it('does not let camera operations mutate world geometry', () => {
    const document = createSketchDocument({
      id: 'sketch:camera-authority',
      name: 'Camera authority',
      entities: [{ id: 'line:a', kind: 'line', start: { x: 2, y: 3 }, end: { x: 8, y: 9 } }],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const before = hashCanonical(document);
    const camera = new Camera2D({ x: 100, y: 80, zoom: 2 });
    camera.panBy(40, -20);
    camera.zoomAt({ x: 30, y: 60 }, 3);
    camera.screenToWorld(camera.worldToScreen({ x: 2, y: 3 }));
    projectSketchForCanvas(document);
    expect(hashCanonical(document)).toBe(before);
  });
});
