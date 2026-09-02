import { describe, expect, it } from 'vitest';

import { createSketchDocument } from '../sketch/document';
import { rankSnapCandidates, snapSketchPoint } from './snap';

const document = createSketchDocument({
  id: 'sketch:snap-candidates',
  name: 'Snaps',
  entities: [
    { id: 'line:a', kind: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } },
    { id: 'circle:a', kind: 'circle', center: { x: 30, y: 10 }, radius: 5 },
  ],
  constraints: [],
  dimensions: [],
  groups: [],
  parameters: [],
});

describe('ranked screen-space snap candidates', () => {
  it('ranks an endpoint above a nearby grid point', () => {
    const result = snapSketchPoint(
      document,
      { x: 0.4, y: 0.2 },
      {
        gridStep: 5,
        screenTolerance: 10,
        cameraZoom: 2,
        currentTool: 'line',
      },
    );
    expect(result).toEqual(expect.objectContaining({ kind: 'endpoint', point: { x: 0, y: 0 } }));
  });

  it('offers horizontal and vertical guides from the active origin', () => {
    const kinds = rankSnapCandidates(
      document,
      { x: 12, y: 0.4 },
      {
        gridStep: 5,
        tolerance: 1,
        origin: { x: 3, y: 0 },
        currentTool: 'line',
      },
    ).map(({ kind }) => kind);
    expect(kinds).toContain('horizontal');
  });

  it('converts the fixed screen target through zoom', () => {
    const zoomedOut = rankSnapCandidates(
      document,
      { x: 22, y: 0 },
      {
        gridStep: 100,
        screenTolerance: 10,
        cameraZoom: 0.5,
      },
    );
    const zoomedIn = rankSnapCandidates(
      document,
      { x: 22, y: 0 },
      {
        gridStep: 100,
        screenTolerance: 10,
        cameraZoom: 10,
      },
    );
    expect(zoomedOut.some(({ kind }) => kind === 'endpoint')).toBe(true);
    expect(zoomedIn.some(({ kind }) => kind === 'endpoint')).toBe(false);
  });
});
