import { describe, expect, it } from 'vitest';

import { applySketchCommand } from './commands';
import { createSketchDocument } from './document';
import { arcPoint } from './geometry';
import { rectangleCreation, threePointArcCreation } from './primitives';
import { geometryIntersections, trimGeometryAtPoint, trimSegmentAtPoint } from './trim';

describe('primitive creation and topology operations', () => {
  it('creates one grouped, shared-node rectangle with persistent H/V relationships', () => {
    const creation = rectangleCreation('rectangle:1', { x: 0, y: 0 }, { x: 20, y: 10 });
    const source = createSketchDocument({
      id: 'sketch:rectangle',
      name: 'Rectangle',
      entities: [],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const result = applySketchCommand(source, {
      type: 'create_geometry',
      entities: creation.entities,
      constraints: creation.constraints,
      group: creation.group,
    });
    expect(result.document.entities).toHaveLength(4);
    expect(result.document.nodes).toHaveLength(4);
    expect(result.document.constraints).toHaveLength(4);
    expect(result.document.groups[0]).toEqual(
      expect.objectContaining({
        name: 'Rectangle',
        entityIds: expect.arrayContaining(['rectangle:1:line:1']),
      }),
    );
  });

  it('creates a true 3-point circular arc through the middle point', () => {
    const arc = threePointArcCreation('arc:1', { x: -10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 })
      .entities[0];
    expect(arc).toEqual(expect.objectContaining({ kind: 'arc', radius: 10 }));
  });

  it('transforms shared topology once and refuses to move fixed geometry', () => {
    const source = createSketchDocument({
      id: 'sketch:transform',
      name: 'Transform',
      entities: [
        { id: 'line:a', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { id: 'line:b', kind: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
      ],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const transformed = applySketchCommand(source, {
      type: 'transform_geometry',
      entityIds: ['line:a', 'line:b'],
      pivot: { x: 0, y: 0 },
      translation: { x: 5, y: 2 },
      rotation: Math.PI / 2,
      scale: 2,
    });
    expect(transformed.document.nodes).toHaveLength(3);
    const transformedLine = transformed.document.entities.find(({ id }) => id === 'line:a');
    expect(transformedLine?.kind).toBe('line');
    if (transformedLine?.kind === 'line') {
      expect(transformedLine.end.x).toBeCloseTo(5, 8);
      expect(transformedLine.end.y).toBeCloseTo(22, 8);
    }

    const fixed = createSketchDocument({
      ...source,
      constraints: [
        { id: 'constraint:fixed', version: 1, type: 'fixed', refs: [{ entityId: 'line:a' }] },
      ],
    });
    expect(() =>
      applySketchCommand(fixed, {
        type: 'move_node',
        nodeId: fixed.entities[0].kind === 'line' ? fixed.entities[0].startNodeId! : '',
        position: { x: 1, y: 1 },
      }),
    ).toThrow(/fixed node/i);
  });

  it('keeps a line → arc → line chain coincident while an arc endpoint moves', () => {
    const source = createSketchDocument({
      id: 'sketch:fillet-chain',
      name: 'Fillet chain',
      entities: [
        { id: 'line:in', kind: 'line', start: { x: 20, y: 0 }, end: { x: 10, y: 0 } },
        {
          id: 'arc:fillet',
          kind: 'arc',
          center: { x: 0, y: 0 },
          radius: 10,
          startAngle: 0,
          endAngle: Math.PI / 2,
        },
        { id: 'line:out', kind: 'line', start: { x: 0, y: 10 }, end: { x: 0, y: 20 } },
      ],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const arc = source.entities.find(({ id }) => id === 'arc:fillet');
    expect(arc?.kind).toBe('arc');
    if (arc?.kind !== 'arc') return;
    const moved = applySketchCommand(source, {
      type: 'move_node',
      nodeId: arc.startNodeId!,
      position: { x: 8, y: -2 },
    }).document;
    const nextArc = moved.entities.find(({ id }) => id === 'arc:fillet');
    const incoming = moved.entities.find(({ id }) => id === 'line:in');
    const outgoing = moved.entities.find(({ id }) => id === 'line:out');
    expect(nextArc?.kind).toBe('arc');
    expect(incoming?.kind).toBe('line');
    expect(outgoing?.kind).toBe('line');
    if (nextArc?.kind !== 'arc' || incoming?.kind !== 'line' || outgoing?.kind !== 'line') return;
    const start = arcPoint(nextArc, nextArc.startAngle);
    const end = arcPoint(nextArc, nextArc.endAngle);
    expect(Math.hypot(start.x - incoming.end.x, start.y - incoming.end.y)).toBeLessThan(1e-8);
    expect(Math.hypot(end.x - outgoing.start.x, end.y - outgoing.start.y)).toBeLessThan(1e-8);
    expect(nextArc.center).toEqual(
      moved.nodes.find(({ id }) => id === nextArc.centerNodeId)?.position,
    );
  });

  it('moves an arc center, both endpoints, and tangent-chain topology as one analytic arc', () => {
    const source = createSketchDocument({
      id: 'sketch:arc-tangent-line',
      name: 'Arc tangent line',
      entities: [
        {
          id: 'arc',
          kind: 'arc',
          center: { x: 0, y: 0 },
          radius: 10,
          startAngle: 0,
          endAngle: Math.PI / 2,
        },
        { id: 'line', kind: 'line', start: { x: 0, y: 10 }, end: { x: -10, y: 10 } },
      ],
      constraints: [
        {
          id: 'constraint:tangent',
          version: 1,
          type: 'tangent',
          refs: [{ entityId: 'arc' }, { entityId: 'line' }],
        },
      ],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const arc = source.entities.find(({ id }) => id === 'arc');
    expect(arc?.kind).toBe('arc');
    if (arc?.kind !== 'arc') return;
    const moved = applySketchCommand(source, {
      type: 'move_node',
      nodeId: arc.centerNodeId!,
      position: { x: 4, y: 3 },
    }).document;
    const nextArc = moved.entities.find(({ id }) => id === 'arc');
    const line = moved.entities.find(({ id }) => id === 'line');
    expect(nextArc?.kind).toBe('arc');
    expect(line?.kind).toBe('line');
    if (nextArc?.kind !== 'arc' || line?.kind !== 'line') return;
    const end = arcPoint(nextArc, nextArc.endAngle);
    expect(nextArc.center).toEqual({ x: 4, y: 3 });
    expect(Math.hypot(end.x - line.start.x, end.y - line.start.y)).toBeLessThan(1e-8);
    expect(moved.constraints.map(({ id }) => id)).toContain('constraint:tangent');
  });

  it('trims exact line and circle segments without polyline approximation', () => {
    const entities = createSketchDocument({
      id: 'sketch:trim',
      name: 'Trim',
      entities: [
        { id: 'line:target', kind: 'line', start: { x: -10, y: 0 }, end: { x: 10, y: 0 } },
        { id: 'line:cut-a', kind: 'line', start: { x: -3, y: -5 }, end: { x: -3, y: 5 } },
        { id: 'line:cut-b', kind: 'line', start: { x: 3, y: -5 }, end: { x: 3, y: 5 } },
        { id: 'circle:target', kind: 'circle', center: { x: 20, y: 0 }, radius: 5 },
        { id: 'line:circle-a', kind: 'line', start: { x: 17, y: -8 }, end: { x: 17, y: 8 } },
        { id: 'line:circle-b', kind: 'line', start: { x: 23, y: -8 }, end: { x: 23, y: 8 } },
      ],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    }).entities;
    const lineResult = trimGeometryAtPoint(entities, 'line:target', { x: 0, y: 0 });
    const circleResult = trimGeometryAtPoint(entities, 'circle:target', { x: 20, y: 5 });
    expect(lineResult).toHaveLength(2);
    expect(lineResult.every(({ kind }) => kind === 'line')).toBe(true);
    expect(circleResult.length).toBeGreaterThan(0);
    expect(circleResult.every(({ kind }) => kind === 'arc')).toBe(true);
    expect(trimSegmentAtPoint(entities, 'line:target', { x: 0, y: 0 })).toEqual(
      expect.objectContaining({ kind: 'line', start: { x: -3, y: 0 }, end: { x: 3, y: 0 } }),
    );
  });

  it('finds line-arc, circle-circle, and arc-arc boundaries analytically', () => {
    const document = createSketchDocument({
      id: 'sketch:pairwise-trim',
      name: 'Pairwise trim',
      entities: [
        { id: 'line', kind: 'line', start: { x: -8, y: 0 }, end: { x: 8, y: 0 } },
        { id: 'circle:a', kind: 'circle', center: { x: 0, y: 0 }, radius: 5 },
        { id: 'circle:b', kind: 'circle', center: { x: 6, y: 0 }, radius: 5 },
        {
          id: 'arc:a',
          kind: 'arc',
          center: { x: 0, y: 0 },
          radius: 5,
          startAngle: 0,
          endAngle: Math.PI,
        },
        {
          id: 'arc:b',
          kind: 'arc',
          center: { x: 6, y: 0 },
          radius: 5,
          startAngle: 0,
          endAngle: Math.PI,
        },
      ],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const byId = (id: string) => document.entities.find((entity) => entity.id === id)!;
    expect(geometryIntersections(byId('line'), byId('arc:a'))).toHaveLength(2);
    expect(geometryIntersections(byId('circle:a'), byId('circle:b'))).toHaveLength(2);
    expect(geometryIntersections(byId('arc:a'), byId('arc:b'))).toHaveLength(1);
  });

  it('restores one semantic snapshot with monotonic reference versions', () => {
    const source = createSketchDocument({
      id: 'sketch:restore',
      name: 'Current',
      entities: [{ id: 'circle', kind: 'circle', center: { x: 0, y: 0 }, radius: 4 }],
      constraints: [],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const restored = applySketchCommand(source, {
      type: 'restore_sketch',
      snapshot: {
        name: 'Earlier version',
        entities: [{ id: 'circle', kind: 'circle', center: { x: 2, y: 3 }, radius: 7 }],
        constraints: [],
        dimensions: [],
        groups: [],
        parameters: [],
      },
    }).document;
    expect(restored.name).toBe('Earlier version');
    expect(restored.revision).toBe(source.revision + 1);
    expect(restored.entities[0]).toEqual(
      expect.objectContaining({ center: { x: 2, y: 3 }, radius: 7, version: 2 }),
    );
  });
});
