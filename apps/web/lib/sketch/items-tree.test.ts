import { createSketchDocument } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { humanizeSketchItemName, recursiveGroupEntityIds } from './items-tree';

describe('Items tree semantics', () => {
  it('normalizes Maker aliases without changing provenance IDs', () => {
    expect(humanizeSketchItemName('wedge0')).toBe('Spoke 1');
    expect(humanizeSketchItemName('maker:innerFillet1')).toBe('Inner fillet 1');
  });

  it('uses one recursive contained-entity count for group rows', () => {
    const document = createSketchDocument({
      id: 'sketch:items',
      name: 'Items',
      entities: [
        { id: 'line:a', kind: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
        { id: 'line:b', kind: 'line', start: { x: 1, y: 0 }, end: { x: 2, y: 0 } },
      ],
      constraints: [],
      dimensions: [],
      groups: [
        {
          id: 'group:root',
          version: 1,
          name: 'Spokes',
          entityIds: ['line:a'],
          childGroupIds: ['group:child'],
        },
        {
          id: 'group:child',
          version: 1,
          name: 'Spoke 1',
          parentGroupId: 'group:root',
          entityIds: ['line:b'],
        },
      ],
      parameters: [],
    });
    expect(recursiveGroupEntityIds(document, 'group:root')).toEqual(['line:a', 'line:b']);
  });
});
