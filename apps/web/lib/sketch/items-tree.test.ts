import { createSketchDocument } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import {
  humanizeSketchItemName,
  recursiveGroupEntityIds,
  sketchEntityDisplayName,
} from './items-tree';

describe('Items tree semantics', () => {
  it('normalizes Maker aliases without changing provenance IDs', () => {
    expect(humanizeSketchItemName('wedge0')).toBe('Spoke 1');
    expect(humanizeSketchItemName('maker:innerFillet1')).toBe('Inner fillet 1');
    expect(humanizeSketchItemName('maker:path:innerFillet1:e471a315f9e22b40')).toBe(
      'Inner fillet 1',
    );
    expect(humanizeSketchItemName('42c3e8aa12f9407eb56e1572af535cc6')).toBe('Sketch item');
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
    expect(sketchEntityDisplayName(document, document.entities[0])).toBe('Line 1');
    expect(recursiveGroupEntityIds(document, 'group:root')).toEqual(['line:a', 'line:b']);
  });

  it('generates stable human type names for opaque entity IDs', () => {
    const document = createSketchDocument({
      id: 'sketch:opaque',
      name: 'Opaque IDs',
      entities: [
        {
          id: '42c3e8aa12f9407eb56e1572af535cc6',
          kind: 'arc',
          center: { x: 0, y: 0 },
          radius: 2,
          startAngle: 0,
          endAngle: Math.PI,
        },
      ],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    expect(sketchEntityDisplayName(document, document.entities[0])).toBe('Arc 1');
  });
});
