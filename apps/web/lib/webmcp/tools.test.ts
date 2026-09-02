import { describe, expect, it } from 'vitest';

import { parseModifyGeometryToolInput } from './tools';

describe('compact WebMCP geometry mutation surface', () => {
  it('represents a shared-node movement without exposing renderer or solver objects', () => {
    expect(
      parseModifyGeometryToolInput({
        operation: 'move_node',
        node_id: 'sketch:node:stable',
        position: { x: 12.5, y: -3 },
      }),
    ).toEqual({
      type: 'move_node',
      nodeId: 'sketch:node:stable',
      position: { x: 12.5, y: -3 },
    });
  });

  it('rejects transient editor and PlaneGCS state', () => {
    expect(() =>
      parseModifyGeometryToolInput({
        operation: 'move_node',
        node_id: 'sketch:node:stable',
        position: { x: 12.5, y: -3 },
        temporary_constraint: { type: 'coordinate_x' },
      }),
    ).toThrow(/unsupported fields/);
  });
});
