import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashCanonical } from '../hash';
import { createSpokeSeedDocument } from '../maker/makerjs-adapter';
import { createSketchDocument } from '../sketch/document';
import { geometryNodeIds } from '../sketch/geometry';
import { toPlaneGcs } from './planegcs-adapter';
import { createPlaneGcsSolver } from './planegcs-runtime';
import type { ConstraintSolver } from './solver';

let solver: ConstraintSolver;

beforeAll(async () => {
  solver = await createPlaneGcsSolver();
});

afterAll(() => solver.dispose());

describe('point-on-line PlaneGCS projection', () => {
  it('projects point-line coincident relationships as point-on-line constraints', () => {
    const document = createSketchDocument({
      id: 'sketch:point-on-line',
      name: 'Point on line',
      entities: [
        { id: 'line:a', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { id: 'point:a', kind: 'point', position: { x: 4, y: 3 } },
      ],
      constraints: [
        {
          id: 'constraint:coincident',
          version: 1,
          type: 'coincident',
          refs: [{ entityId: 'point:a' }, { entityId: 'line:a' }],
        },
      ],
      dimensions: [],
      groups: [],
      parameters: [],
    });
    const projection = toPlaneGcs(document);

    expect(projection.primitives).toContainEqual(
      expect.objectContaining({
        id: 'constraint:coincident',
        type: 'point_on_line_pl',
        l_id: 'line:a',
      }),
    );
    expect(projection.diagnostics).toEqual([]);
  });
});

describe('shared-topology PlaneGCS projection', () => {
  it('projects every Attune node once and makes incident entities reference it', () => {
    const document = createSpokeSeedDocument();
    const projection = toPlaneGcs(document);
    const points = projection.primitives.filter(({ type }) => type === 'point');
    const shared = document.nodes.find((node) => (node.sourceRefs?.length ?? 0) > 1);

    expect(projection.diagnostics).toEqual([]);
    expect(points).toHaveLength(document.nodes.length);
    expect(Object.keys(projection.map.nodeToPrimitive).toSorted()).toEqual(
      document.nodes.map(({ id }) => id).toSorted(),
    );
    expect(shared).toBeDefined();
    if (!shared) return;
    const incident = document.entities.filter((entity) =>
      geometryNodeIds(entity).includes(shared.id),
    );
    expect(incident.length).toBeGreaterThan(1);
    expect(points.filter((point) => 'id' in point && point.id === shared.id)).toHaveLength(1);
    for (const entity of incident) {
      const primitive = projection.primitives.find(
        (candidate) => 'id' in candidate && candidate.id === entity.id,
      );
      expect(JSON.stringify(primitive)).toContain(shared.id);
    }
  });

  it('round-trips the imported sketch without identity, semantic metadata, or visual drift', () => {
    const document = createSpokeSeedDocument();
    const result = solver.solve(document);
    const beforeNodes = new Map(document.nodes.map((node) => [node.id, node.position]));

    expect(['success', 'converged']).toContain(result.status);
    expect(result.document.nodes.map(({ id }) => id)).toEqual(document.nodes.map(({ id }) => id));
    expect(result.document.entities.map(({ id }) => id)).toEqual(
      document.entities.map(({ id }) => id),
    );
    expect(result.document.source).toEqual(document.source);
    expect(result.document.groups).toEqual(document.groups);
    expect(result.document.parameters).toEqual(document.parameters);
    for (const node of result.document.nodes) {
      const before = beforeNodes.get(node.id)!;
      expect(node.position.x).toBeCloseTo(before.x, 8);
      expect(node.position.y).toBeCloseTo(before.y, 8);
    }
    expect(
      hashCanonical({
        nodes: result.document.nodes.map(({ version: _version, ...node }) => node),
        entities: result.document.entities.map(({ version: _version, ...entity }) => entity),
        groups: result.document.groups,
        source: result.document.source,
      }),
    ).toBe(
      hashCanonical({
        nodes: document.nodes.map(({ version: _version, ...node }) => node),
        entities: document.entities.map(({ version: _version, ...entity }) => entity),
        groups: document.groups,
        source: document.source,
      }),
    );
  });
});

describe('temporary PlaneGCS node drivers', () => {
  it('uses non-persistent temporary coordinate drivers for one shared-node preview', () => {
    const document = createSpokeSeedDocument();
    const node = document.nodes.find((candidate) => (candidate.sourceRefs?.length ?? 0) > 1)!;
    const target = { x: node.position.x + 1.25, y: node.position.y - 0.75 };
    const temporary = [{ kind: 'node_target' as const, nodeId: node.id, position: target }];
    const projection = toPlaneGcs(document, temporary);
    const projectedDrivers = projection.primitives.filter(
      (primitive) => 'temporary' in primitive && primitive.temporary === true,
    );
    const beforeHash = hashCanonical(document);
    const result = solver.solve(document, temporary);
    const previewNode = result.document.nodes.find(({ id }) => id === node.id)!;

    expect(projectedDrivers).toHaveLength(2);
    expect(projectedDrivers.map(({ type }) => type).toSorted()).toEqual([
      'coordinate_x',
      'coordinate_y',
    ]);
    expect(['success', 'converged']).toContain(result.status);
    expect(previewNode.position.x).toBeCloseTo(target.x, 5);
    expect(previewNode.position.y).toBeCloseTo(target.y, 5);
    expect(result.document.constraints).toEqual(document.constraints);
    expect(result.document.source).toEqual(document.source);
    expect(hashCanonical(document)).toBe(beforeHash);
    const nodePositions = new Map(
      result.document.nodes.map((candidate) => [candidate.id, candidate.position]),
    );
    for (const arc of result.document.entities.filter(({ kind }) => kind === 'arc')) {
      if (arc.kind !== 'arc') continue;
      const center = nodePositions.get(arc.centerNodeId!);
      const start = nodePositions.get(arc.startNodeId!);
      const end = nodePositions.get(arc.endNodeId!);
      expect(center && start && end).toBeTruthy();
      if (!center || !start || !end) continue;
      expect(Math.hypot(start.x - center.x, start.y - center.y)).toBeCloseTo(arc.radius, 6);
      expect(Math.hypot(end.x - center.x, end.y - center.y)).toBeCloseTo(arc.radius, 6);
    }
  });
});
