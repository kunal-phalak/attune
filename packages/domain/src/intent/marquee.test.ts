import { describe, expect, it } from 'vitest';

import { createSketchDocument } from '../sketch/document';
import { selectEntitiesInMarquee } from './marquee';

const document = createSketchDocument({
  id: 'sketch:marquee',
  name: 'Marquee',
  entities: [
    { id: 'line:inside', kind: 'line', start: { x: 2, y: 2 }, end: { x: 8, y: 8 } },
    { id: 'line:crossing', kind: 'line', start: { x: -4, y: 5 }, end: { x: 14, y: 5 } },
    { id: 'circle:inside', kind: 'circle', center: { x: 5, y: 5 }, radius: 2 },
    { id: 'circle:outside', kind: 'circle', center: { x: 20, y: 20 }, radius: 3 },
  ],
  constraints: [],
  dimensions: [],
  groups: [],
  parameters: [],
});

describe('directional analytic marquee selection', () => {
  it('left-to-right selects only fully enclosed geometry', () => {
    expect(selectEntitiesInMarquee(document, { x: 0, y: 0 }, { x: 10, y: 10 })).toEqual(
      expect.objectContaining({
        mode: 'enclosed',
        entityIds: ['circle:inside', 'line:inside'],
      }),
    );
  });

  it('right-to-left includes geometry touched by the box', () => {
    expect(selectEntitiesInMarquee(document, { x: 10, y: 10 }, { x: 0, y: 0 })).toEqual(
      expect.objectContaining({
        mode: 'crossing',
        entityIds: ['circle:inside', 'line:crossing', 'line:inside'],
      }),
    );
  });
});
