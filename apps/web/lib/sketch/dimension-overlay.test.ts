import { createSketchDocument } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { projectDimensionOverlay } from './dimension-overlay';

const camera = { worldToScreen: ({ x, y }: { x: number; y: number }) => ({ x, y: -y }) };

describe('dimension overlay layout', () => {
  const document = createSketchDocument({
    id: 'sketch:dimensions',
    name: 'Dimensions',
    entities: [
      {
        id: 'arc',
        kind: 'arc',
        center: { x: 100, y: -100 },
        radius: 25,
        startAngle: 0,
        endAngle: Math.PI / 2,
      },
      { id: 'line', kind: 'line', start: { x: 20, y: -20 }, end: { x: 60, y: -20 } },
    ],
    constraints: [],
    dimensions: [],
    groups: [],
    parameters: [],
  });

  it('places arc radius and sweep as separate reference annotations', () => {
    const labels = projectDimensionOverlay(
      document,
      camera,
      { entityIds: ['arc'], dimensionIds: [] },
      [],
      { width: 320, height: 240 },
    );
    expect(labels.map(({ text }) => text)).toEqual(expect.arrayContaining(['R 25 mm', '90°']));
    expect(labels).toHaveLength(2);
    expect(labels.every(({ screen }) => screen.x >= 54 && screen.y >= 22)).toBe(true);
  });

  it('hides ordinary per-entity references for multi-selection', () => {
    expect(
      projectDimensionOverlay(document, camera, {
        entityIds: ['arc', 'line'],
        dimensionIds: [],
      }),
    ).toEqual([]);
  });
});
