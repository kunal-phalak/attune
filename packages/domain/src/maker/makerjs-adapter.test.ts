import makerjs from 'makerjs';
import { describe, expect, it } from 'vitest';

import { hashCanonical } from '../hash';
import { arcPoint } from '../sketch/geometry';
import {
  createSpokeSeedDocument,
  createStraightSpokesModel,
  importMakerJsModel,
  measureSketch,
  STRAIGHT_SPOKES_FIXTURE,
  toMakerJsModel,
} from './makerjs-adapter';

function sourcePaths(model: MakerJs.IModel) {
  const paths = new Map<string, MakerJs.IWalkPath>();
  makerjs.model.walk(model, { onPath: (context) => paths.set(context.routeKey, context) });
  return paths;
}

function chainSignature(model: MakerJs.IModel) {
  const result: { readonly endless: readonly boolean[]; readonly loose: number }[] = [];
  makerjs.model.findChains(model, (chains, loose) => {
    result.push({
      endless: chains
        .map(({ endless }) => endless)
        .toSorted((left, right) => Number(left) - Number(right)),
      loose: loose.length,
    });
  });
  return result;
}

function isMakerLine(path: MakerJs.IPath): path is MakerJs.IPathLine {
  return makerjs.isPathLine(path);
}

function isMakerCircle(path: MakerJs.IPath): path is MakerJs.IPathCircle {
  return makerjs.isPathCircle(path);
}

function isMakerArc(path: MakerJs.IPath): path is MakerJs.IPathArc {
  return makerjs.isPathArc(path);
}

function expectPoint(
  actual: { readonly x: number; readonly y: number },
  expected: { readonly x: number; readonly y: number },
  precision = 6,
) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

describe('MakerJsImporter source parity', () => {
  it('imports the published StraightSpokes model deterministically without mutating it', () => {
    const model = createStraightSpokesModel();
    const before = JSON.stringify(model);
    importMakerJsModel(model, { sourceUnits: makerjs.unitType.Millimeter });
    const first = createSpokeSeedDocument();
    const second = createSpokeSeedDocument();

    expect(JSON.stringify(model)).toBe(before);
    expect(first.entities.map(({ id }) => id)).toEqual(second.entities.map(({ id }) => id));
    expect(first.nodes).toEqual(second.nodes);
    expect(hashCanonical(first)).toBe(hashCanonical(second));
    expect(first.source).toEqual(
      expect.objectContaining({
        kind: 'maker-generator',
        package: 'makerjs-spokes-straight',
        packageVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
        parameters: STRAIGHT_SPOKES_FIXTURE,
        units: { source: 'mm', internal: 'mm', scale: 1, assumed: true },
      }),
    );
  });

  it('preserves route provenance and converts every line, circle, and arc analytically', () => {
    const model = createStraightSpokesModel();
    const source = sourcePaths(model);
    const document = createSpokeSeedDocument();
    const accounting = { line: 0, circle: 0, arc: 0, other: 0 };

    expect(document.entities).toHaveLength(source.size);
    for (const entity of document.entities) {
      const routeKey = entity.sourceRef?.routeKey;
      expect(routeKey).toBeTypeOf('string');
      const walked = routeKey ? source.get(routeKey) : undefined;
      expect(walked).toBeDefined();
      if (!walked) continue;
      const path = walked.pathContext;
      const absolute = (point: MakerJs.IPoint) => ({
        x: point[0] + walked.offset[0],
        y: point[1] + walked.offset[1],
      });
      if (isMakerLine(path) && entity.kind === 'line') {
        accounting.line += 1;
        expectPoint(entity.start, absolute(path.origin));
        expectPoint(entity.end, absolute(path.end));
      } else if (isMakerCircle(path) && entity.kind === 'circle') {
        accounting.circle += 1;
        expectPoint(entity.center, absolute(path.origin), 8);
        expect(entity.radius).toBeCloseTo(path.radius, 8);
      } else if (isMakerArc(path) && entity.kind === 'arc') {
        accounting.arc += 1;
        const sourceEnds = makerjs.point.fromArc(path).map(absolute);
        expectPoint(entity.center, absolute(path.origin));
        expect(entity.radius).toBeCloseTo(path.radius, 6);
        expectPoint(arcPoint(entity, entity.startAngle), sourceEnds[0]);
        expectPoint(arcPoint(entity, entity.endAngle), sourceEnds[1]);
      } else {
        accounting.other += 1;
      }
    }
    expect(accounting).toEqual({ line: 12, circle: 2, arc: 36, other: 0 });
    expect(new Set(document.entities.map(({ sourceRef }) => sourceRef?.routeKey)).size).toBe(50);
  });

  it('applies nested absolute offsets, keeps model hierarchy, and preserves closed chains/extents', () => {
    const nested: MakerJs.IModel = {
      units: makerjs.unitType.Millimeter,
      origin: [2, 3],
      models: {
        child: {
          origin: [10, -4],
          paths: {
            line: new makerjs.paths.Line([1, 2], [3, 4]),
            circle: new makerjs.paths.Circle([5, 6], 2),
            arc: new makerjs.paths.Arc([8, 9], 4, 15, 85),
          },
        },
      },
    };
    const document = importMakerJsModel(nested);
    const line = document.entities.find((entity) => entity.kind === 'line');
    const circle = document.entities.find((entity) => entity.kind === 'circle');
    const arc = document.entities.find((entity) => entity.kind === 'arc');
    expect(line).toEqual(expect.objectContaining({ start: { x: 13, y: 1 }, end: { x: 15, y: 3 } }));
    expect(circle).toEqual(expect.objectContaining({ center: { x: 17, y: 5 }, radius: 2 }));
    expect(arc).toEqual(expect.objectContaining({ center: { x: 20, y: 8 }, radius: 4 }));
    expect(document.groups[0]?.childGroupIds).toHaveLength(1);
    expect(document.groups.find(({ name }) => name === 'child')?.entityIds).toHaveLength(3);

    const source = createStraightSpokesModel();
    const imported = createSpokeSeedDocument();
    const extents = makerjs.measure.modelExtents(source)!;
    expect(measureSketch(imported)).toEqual({
      minX: expect.closeTo(extents.low[0], 6),
      minY: expect.closeTo(extents.low[1], 6),
      maxX: expect.closeTo(extents.high[0], 6),
      maxY: expect.closeTo(extents.high[1], 6),
    });
    expect(chainSignature(toMakerJsModel(imported))).toEqual(chainSignature(source));
  });
});

describe('MakerJsImporter topology and units', () => {
  it('interns coincident source endpoints but not merely nearby endpoints', () => {
    const model: MakerJs.IModel = {
      paths: {
        first: new makerjs.paths.Line([0, 0], [10, 10]),
        second: new makerjs.paths.Line([10, 10], [20, 10]),
        nearby: new makerjs.paths.Line([10.0000005, 10], [10.0000005, 20]),
      },
    };
    const document = importMakerJsModel(model, { sourceUnits: makerjs.unitType.Millimeter });
    const byPath = new Map(document.entities.map((entity) => [entity.sourceRef?.pathId, entity]));
    const first = byPath.get('first');
    const second = byPath.get('second');
    const nearby = byPath.get('nearby');
    expect(first?.kind).toBe('line');
    expect(second?.kind).toBe('line');
    expect(nearby?.kind).toBe('line');
    if (first?.kind === 'line' && second?.kind === 'line' && nearby?.kind === 'line') {
      expect(first.endNodeId).toBe(second.startNodeId);
      expect(nearby.startNodeId).not.toBe(first.endNodeId);
      expect(
        document.nodes
          .find(({ id }) => id === first.endNodeId)
          ?.sourceRefs?.map(({ routeKey, anchor }) => `${routeKey}:${anchor}`),
      ).toHaveLength(2);
    }
  });

  it('converts declared source units once into canonical millimetres', () => {
    const model: MakerJs.IModel = {
      units: makerjs.unitType.Inch,
      paths: { circle: new makerjs.paths.Circle([1, 2], 0.5) },
    };
    const document = importMakerJsModel(model);
    const circle = document.entities[0];
    expect(circle?.kind).toBe('circle');
    if (circle?.kind === 'circle') {
      expect(circle.center.x).toBeCloseTo(25.4, 10);
      expect(circle.center.y).toBeCloseTo(50.8, 10);
      expect(circle.radius).toBeCloseTo(12.7, 10);
    }
    expect(document.source?.units).toEqual({
      source: 'inch',
      internal: 'mm',
      scale: 25.4,
      assumed: false,
    });
  });
});
