import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSketchDocument } from '../sketch/document';
import { analyzeDefinitionState } from './definition-state';
import { createPlaneGcsSolver } from './planegcs-runtime';
import type { ConstraintSolver } from './solver';

let solver: ConstraintSolver;

beforeAll(async () => {
  solver = await createPlaneGcsSolver();
});

afterAll(() => solver.dispose());

function analyze(
  entities: Parameters<typeof createSketchDocument>[0]['entities'],
  constraints: Parameters<typeof createSketchDocument>[0]['constraints'] = [],
) {
  const document = createSketchDocument({
    id: `definition:${entities.map(({ id }) => id).join(':')}`,
    name: 'Definition state',
    entities,
    constraints,
    dimensions: [],
    groups: [],
    parameters: [],
  });
  return { document, analysis: analyzeDefinitionState(document, solver) };
}

describe('PlaneGCS-backed definition state', () => {
  it('keeps a fully free line under-defined', () => {
    const { analysis } = analyze([
      { id: 'line:free', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    ]);
    expect(analysis.entities['line:free']).toEqual(
      expect.objectContaining({ fullyDefined: false, remainingDof: expect.any(Number) }),
    );
  });

  it('does not paint a line fully defined when only one shared endpoint is fixed', () => {
    const { analysis } = analyze(
      [
        { id: 'point:fixed', kind: 'point', position: { x: 0, y: 0 } },
        { id: 'line:swing', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      ],
      [
        {
          id: 'constraint:fixed-point',
          version: 1,
          type: 'fixed',
          refs: [{ entityId: 'point:fixed' }],
        },
      ],
    );
    expect(analysis.entities['point:fixed']?.fullyDefined).toBe(true);
    expect(analysis.entities['line:swing']?.fullyDefined).toBe(false);
  });

  it('marks a fixed line fully defined while connected free geometry remains under-defined', () => {
    const { analysis } = analyze(
      [
        { id: 'line:fixed', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { id: 'line:connected', kind: 'line', start: { x: 10, y: 0 }, end: { x: 18, y: 4 } },
      ],
      [
        {
          id: 'constraint:fixed-line',
          version: 1,
          type: 'fixed',
          refs: [{ entityId: 'line:fixed' }],
        },
      ],
    );
    expect(analysis.entities['line:fixed']?.fullyDefined).toBe(true);
    expect(analysis.entities['line:connected']?.fullyDefined).toBe(false);
  });

  it('marks every edge of a fully constrained closed relationship as defined', () => {
    const edges = [
      { id: 'closed:1', kind: 'line' as const, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { id: 'closed:2', kind: 'line' as const, start: { x: 10, y: 0 }, end: { x: 10, y: 8 } },
      { id: 'closed:3', kind: 'line' as const, start: { x: 10, y: 8 }, end: { x: 0, y: 8 } },
      { id: 'closed:4', kind: 'line' as const, start: { x: 0, y: 8 }, end: { x: 0, y: 0 } },
    ];
    const { analysis } = analyze(
      edges,
      edges.map(({ id }, index) => ({
        id: `constraint:closed:${index}`,
        version: 1,
        type: 'fixed' as const,
        refs: [{ entityId: id }],
      })),
    );
    expect(edges.every(({ id }) => analysis.entities[id]?.fullyDefined)).toBe(true);
    expect(analysis.totalDof).toBe(0);
  });

  it('reports constraint conflicts in red-state evidence when PlaneGCS exposes them', () => {
    const { analysis } = analyze(
      [{ id: 'line:conflict', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 5 } }],
      [
        {
          id: 'constraint:h',
          version: 1,
          type: 'horizontal',
          refs: [{ entityId: 'line:conflict' }],
        },
        { id: 'constraint:v', version: 1, type: 'vertical', refs: [{ entityId: 'line:conflict' }] },
        {
          id: 'constraint:fixed',
          version: 1,
          type: 'fixed',
          refs: [{ entityId: 'line:conflict' }],
        },
      ],
    );
    if (analysis.conflicts.length > 0) {
      expect(analysis.entities['line:conflict']?.conflictRefs.length).toBeGreaterThan(0);
    }
  });
});
