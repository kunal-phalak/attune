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

  it('represents semantic create, transform, and trim operations without pointer events', () => {
    expect(
      parseModifyGeometryToolInput({
        operation: 'create_geometry',
        entities: [{ id: 'circle:1', kind: 'circle', center: { x: 50, y: 40 }, radius: 20 }],
      }),
    ).toEqual({
      type: 'create_geometry',
      entities: [{ id: 'circle:1', kind: 'circle', center: { x: 50, y: 40 }, radius: 20 }],
    });
    expect(
      parseModifyGeometryToolInput({
        operation: 'transform_geometry',
        entity_ids: ['circle:1'],
        pivot: { x: 50, y: 40 },
        rotation: Math.PI / 6,
        scale: 1.2,
      }),
    ).toEqual({
      type: 'transform_geometry',
      entityIds: ['circle:1'],
      pivot: { x: 50, y: 40 },
      rotation: Math.PI / 6,
      scale: 1.2,
    });
    expect(
      parseModifyGeometryToolInput({
        operation: 'trim_geometry',
        entity_id: 'circle:1',
        pick_point: { x: 50, y: 60 },
      }),
    ).toEqual({
      type: 'trim_geometry',
      entityId: 'circle:1',
      pickPoint: { x: 50, y: 60 },
    });
  });
});
