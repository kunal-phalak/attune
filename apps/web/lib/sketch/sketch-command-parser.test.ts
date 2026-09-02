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
});
