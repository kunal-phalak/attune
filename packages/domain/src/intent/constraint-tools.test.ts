import { describe, expect, it } from 'vitest';

import { createSketchDocument } from '../sketch/document';
import { constraintToolApplicability, dimensionInputForTool } from './constraint-tools';
import { EMPTY_SELECTION_SET } from './selection-set';

const document = createSketchDocument({
  id: 'sketch:constraint-tools',
  name: 'Constraint tools',
  entities: [
    { id: 'line:a', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { id: 'line:b', kind: 'line', start: { x: 0, y: 5 }, end: { x: 10, y: 5 } },
    { id: 'point:a', kind: 'point', position: { x: 4, y: 3 } },
    { id: 'circle:a', kind: 'circle', center: { x: 20, y: 0 }, radius: 5 },
  ],
  constraints: [],
  dimensions: [],
  groups: [],
  parameters: [],
});

describe('constraint toolbar applicability', () => {
  it('keeps tools discoverable while reporting incomplete selection', () => {
    expect(constraintToolApplicability(document, EMPTY_SELECTION_SET, 'perpendicular')).toEqual(
      expect.objectContaining({
        status: 'incomplete',
        message: 'Perpendicular — choose two lines.',
      }),
    );
  });

  it('builds refs only for compatible geometry', () => {
    const selected = { ...EMPTY_SELECTION_SET, entityIds: ['line:a', 'line:b'] };
    expect(constraintToolApplicability(document, selected, 'parallel')).toEqual(
      expect.objectContaining({
        status: 'ready',
        refs: [{ entityId: 'line:a' }, { entityId: 'line:b' }],
      }),
    );
    expect(
      constraintToolApplicability(
        document,
        { ...EMPTY_SELECTION_SET, entityIds: ['line:a', 'circle:a'] },
        'parallel',
      ).status,
    ).toBe('unsupported');
  });

  it('creates a line-length dimension from the line endpoints', () => {
    expect(
      dimensionInputForTool(
        document,
        { ...EMPTY_SELECTION_SET, entityIds: ['line:a'] },
        'distance',
        'dimension:1',
        10,
      ),
    ).toEqual(
      expect.objectContaining({
        refs: [
          { entityId: 'line:a', anchor: 'start' },
          { entityId: 'line:a', anchor: 'end' },
        ],
      }),
    );
  });

  it('accepts a point and a line as a point-on-line coincident relationship', () => {
    const selected = { ...EMPTY_SELECTION_SET, entityIds: ['point:a', 'line:a'] };
    expect(constraintToolApplicability(document, selected, 'coincident')).toEqual(
      expect.objectContaining({
        status: 'ready',
        refs: [{ entityId: 'point:a' }, { entityId: 'line:a' }],
      }),
    );
  });
});
