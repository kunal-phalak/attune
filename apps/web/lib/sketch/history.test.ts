import { createSketchDocument } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { semanticHistoryLabel } from './history';

describe('semantic sketch history', () => {
  const document = createSketchDocument({
    id: 'sketch:history',
    name: 'History',
    entities: [],
    constraints: [],
    dimensions: [],
    groups: [{ id: 'group:1', version: 1, name: 'Spoke 1', entityIds: [] }],
    parameters: [],
  });

  it('describes rename and constraint receipts as user actions', () => {
    expect(
      semanticHistoryLabel(
        { type: 'rename_group', groupId: 'group:1', name: 'Front spoke' },
        document,
      ),
    ).toBe('Renamed Spoke 1 → Front spoke');
    expect(
      semanticHistoryLabel(
        {
          type: 'apply_constraint',
          constraints: [{ id: 'constraint:1', type: 'tangent', refs: [{ entityId: 'arc' }] }],
        },
        document,
      ),
    ).toBe('Added Tangent');
  });
});
