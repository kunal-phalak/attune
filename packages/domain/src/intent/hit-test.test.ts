import { describe, expect, it } from 'vitest';

import { createSketchDocument } from '../sketch/document';
import { bsplinePoint, ellipsePoint } from '../sketch/geometry';
import { distanceToGeometry, hitTestSketch } from './selection-context';

const document = createSketchDocument({
  id: 'sketch:hit-test',
  name: 'Hit test',
  entities: [
    { id: 'line:a', kind: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } },
    { id: 'circle:a', kind: 'circle', center: { x: 40, y: 0 }, radius: 8 },
  ],
  constraints: [],
  dimensions: [],
  groups: [],
  parameters: [],
});

describe('analytic sketch hit testing', () => {
  it('selects analytic edges without consulting rendered pixels', () => {
    expect(
      hitTestSketch(document, {
        screenPoint: { x: 110, y: 99 },
        camera: { x: 100, y: 100, zoom: 1 },
      }),
    ).toEqual(expect.objectContaining({ kind: 'entity', id: 'line:a' }));
  });

  it('keeps handle tolerance constant in screen space and ranks visible nodes first', () => {
    const line = document.entities.find(({ id }) => id === 'line:a')!;
    if (line.kind !== 'line') throw new TypeError('Expected line fixture.');
    for (const zoom of [0.5, 4]) {
      const screenPoint = { x: 103, y: 100 };
      expect(
        hitTestSketch(document, {
          screenPoint,
          camera: { x: 100, y: 100, zoom },
          screenTolerance: 9,
          selectedEntityId: line.id,
        }),
      ).toEqual(expect.objectContaining({ kind: 'node', id: line.startNodeId }));
    }
  });

  it('refines ellipse and B-spline proximity to document tolerance', () => {
    const curves = createSketchDocument({
      id: 'sketch:curve-hit-test',
      name: 'Curve hit test',
      entities: [
        {
          id: 'ellipse',
          kind: 'ellipse',
          center: { x: 4, y: -3 },
          majorRadius: 23,
          minorRadius: 2.5,
          rotation: 0.43,
        },
        {
          id: 'spline',
          kind: 'bspline',
          degree: 3,
          controlPoints: [
            { x: -10, y: 0 },
            { x: -4, y: 18 },
            { x: 9, y: -14 },
            { x: 20, y: 6 },
            { x: 27, y: 1 },
          ],
        },
      ],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const ellipse = curves.entities.find(({ id }) => id === 'ellipse');
    const spline = curves.entities.find(({ id }) => id === 'spline');
    expect(ellipse?.kind).toBe('ellipse');
    expect(spline?.kind).toBe('bspline');
    if (ellipse?.kind !== 'ellipse' || spline?.kind !== 'bspline') return;
    expect(distanceToGeometry(ellipsePoint(ellipse, 1.137), ellipse, 1e-7)).toBeLessThan(1e-6);
    expect(distanceToGeometry(bsplinePoint(spline, 0.53719), spline, 1e-7)).toBeLessThan(1e-6);
  });
});
