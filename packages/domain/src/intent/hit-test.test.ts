import { describe, expect, it } from 'vitest';

import { createSketchDocument } from '../sketch/document';
import { hitTestSketch } from './selection-context';

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
});
