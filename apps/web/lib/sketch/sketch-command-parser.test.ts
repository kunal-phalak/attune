import { describe, expect, it } from 'vitest';

import { parseSketchCommand } from './sketch-command-parser';

describe('move_node semantic command parser', () => {
  it('accepts only a stable Attune node reference and world position', () => {
    expect(
      parseSketchCommand({
        type: 'move_node',
        nodeId: 'sketch:node:stable',
        position: { x: 2, y: 4 },
      }),
    ).toEqual({
      type: 'move_node',
      nodeId: 'sketch:node:stable',
      position: { x: 2, y: 4 },
    });
  });

  it('parses a bounded unversioned restore snapshot', () => {
    expect(
      parseSketchCommand({
        type: 'restore_sketch',
        snapshot: {
          name: 'Earlier version',
          entities: [{ id: 'circle', kind: 'circle', center: { x: 2, y: 3 }, radius: 7 }],
          constraints: [],
          dimensions: [],
          groups: [],
          parameters: [],
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'restore_sketch',
        snapshot: expect.objectContaining({ name: 'Earlier version' }),
      }),
    );
  });
});
