import { describe, expect, it } from 'vitest';

import { createSketchDocument } from '../sketch/document';
import { chooseSnapCandidateWithHysteresis, rankSnapCandidates, snapSketchPoint } from './snap';

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
  it('retains a captured candidate through a larger release radius', () => {
    const captured = {
      kind: 'endpoint' as const,
      point: { x: 10, y: 0 },
      distance: 8,
      score: 1,
      label: 'Endpoint',
      entityId: 'line',
      anchor: 'end' as const,
    };
    const outsideCapture = { ...captured, distance: 12 };
    expect(chooseSnapCandidateWithHysteresis(captured, [outsideCapture], { cameraZoom: 1 })).toBe(
      outsideCapture,
    );
    expect(chooseSnapCandidateWithHysteresis(null, [outsideCapture], { cameraZoom: 1 })).toBeNull();
  });

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
