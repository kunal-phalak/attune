import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createSelectionContext,
  createSketchDocument,
  createSpokeSeedDocument,
  rankConstraintCandidates,
  snapSketchPoint,
  type ConstraintSolver,
} from './index';
import { createPlaneGcsSolver } from './solver/planegcs-runtime';

let solver: ConstraintSolver;

beforeAll(async () => {
  solver = await createPlaneGcsSolver();
});

afterAll(() => solver.dispose());

describe('semantic spoke seed', () => {
  it('contains stable unique imported entity IDs, canonical nodes, and Maker groups', () => {
    const first = createSpokeSeedDocument();
    const second = createSpokeSeedDocument();
    const ids = first.entities.map(({ id }) => id);

    expect(ids).toEqual(second.entities.map(({ id }) => id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.entities).toHaveLength(50);
    expect(first.nodes.length).toBeGreaterThan(0);
    expect(first.nodes).toEqual(second.nodes);
    expect(first.entities.every((entity) => entity.sourceRef?.kind === 'maker-path')).toBe(true);
    expect(first.groups[0]).toEqual(
      expect.objectContaining({ id: 'maker:group:root', name: 'Maker.js source' }),
    );
    expect(first.groups.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['wedge0', 'wedge5', 'ring2']),
    );
    expect(first.source).toEqual(
      expect.objectContaining({
        kind: 'maker-generator',
        package: 'makerjs-spokes-straight',
        generator: 'StraightSpokes',
        status: 'pristine',
      }),
    );
  });
});

describe('PlaneGCS adapter', () => {
  it('projects and solves a basic horizontal line constraint', () => {
    const document = createSketchDocument({
      id: 'sketch:solver-basic',
      name: 'Solver basic',
      entities: [
        {
          id: 'line:test',
          version: 1,
          kind: 'line',
          start: { x: 0, y: 0 },
          end: { x: 20, y: 2 },
        },
      ],
      constraints: [
        {
          id: 'constraint:test:horizontal',
          version: 1,
          type: 'horizontal',
          refs: [{ entityId: 'line:test' }],
        },
      ],
      dimensions: [],
      groups: [],
      parameters: [],
    });

    const result = solver.solve(document);
    const line = result.document.entities[0];

    expect(['success', 'converged']).toContain(result.status);
    expect(line.kind).toBe('line');
    if (line.kind === 'line') expect(line.start.y).toBeCloseTo(line.end.y, 8);
    expect(result.degreesOfFreedom).toBeTypeOf('number');
    expect(result.conflicts).toEqual([]);
  });
});

describe('deterministic selection, snapping, and constraint candidates', () => {
  const document = createSketchDocument({
    id: 'sketch:intent',
    name: 'Intent test',
    entities: [
      {
        id: 'line:almost-horizontal',
        version: 1,
        kind: 'line',
        start: { x: 0, y: 0 },
        end: { x: 20, y: 0.2 },
      },
      {
        id: 'point:snap',
        version: 1,
        kind: 'point',
        position: { x: 10, y: 10 },
      },
    ],
    constraints: [],
    dimensions: [],
    groups: [
      {
        id: 'group:intent',
        version: 1,
        name: 'Intent',
        entityIds: ['line:almost-horizontal', 'point:snap'],
      },
    ],
    parameters: [],
  });

  it('ranks an obvious horizontal constraint first from entity IDs alone', () => {
    const context = createSelectionContext(document, {
      entityIds: ['line:almost-horizontal'],
    });
    expect(rankConstraintCandidates(document, context)[0]).toEqual(
      expect.objectContaining({ type: 'horizontal', score: expect.any(Number) }),
    );
  });

  it('prefers a nearby entity anchor over the grid when it is closer', () => {
    expect(snapSketchPoint(document, { x: 10.2, y: 10.1 }, { gridStep: 5, tolerance: 1 })).toEqual(
      expect.objectContaining({
        source: 'entity',
        entityId: 'point:snap',
        point: { x: 10, y: 10 },
      }),
    );
  });
});
