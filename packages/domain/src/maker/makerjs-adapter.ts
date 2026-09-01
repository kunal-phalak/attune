import makerjs from 'makerjs';

import { createSketchDocument, type SketchDocument } from '../sketch/document';
import type { GeometryEntity, GeometryInput, SketchBounds } from '../sketch/geometry';

export interface SpokeSeedParameters {
  readonly outerRadius: number;
  readonly innerRimRadius: number;
  readonly hubRadius: number;
  readonly boreRadius: number;
  readonly spokeCount: 6;
  readonly spokeWidth: number;
}

export const DEFAULT_SPOKE_PARAMETERS: SpokeSeedParameters = {
  outerRadius: 150,
  innerRimRadius: 132,
  hubRadius: 38,
  boreRadius: 16,
  spokeCount: 6,
  spokeWidth: 12,
};

function createMakerSpokeModel(parameters: SpokeSeedParameters): MakerJs.IModel {
  const halfWidth = parameters.spokeWidth / 2;
  const baseSpoke: MakerJs.IModel = {
    layer: 'Spokes',
    paths: {
      left: new makerjs.paths.Line(
        [parameters.hubRadius, -halfWidth],
        [parameters.innerRimRadius, -halfWidth],
      ),
      right: new makerjs.paths.Line(
        [parameters.hubRadius, halfWidth],
        [parameters.innerRimRadius, halfWidth],
      ),
    },
  };
  return {
    paths: {
      outer: new makerjs.paths.Circle([0, 0], parameters.outerRadius),
      innerRim: new makerjs.paths.Circle([0, 0], parameters.innerRimRadius),
      hub: new makerjs.paths.Circle([0, 0], parameters.hubRadius),
      bore: new makerjs.paths.Circle([0, 0], parameters.boreRadius),
    },
    models: {
      spokes: makerjs.layout.cloneToRadial(
        baseSpoke,
        parameters.spokeCount,
        360 / parameters.spokeCount,
      ),
    },
  };
}

function point(value: MakerJs.IPoint, offset: MakerJs.IPoint) {
  return { x: value[0] + offset[0], y: value[1] + offset[1] };
}

function stableEntityId(route: readonly string[]): string {
  const pathId = route.at(-1);
  if (route[0] === 'paths') {
    const named: Readonly<Record<string, string>> = {
      outer: 'sketch:rim:outer',
      innerRim: 'sketch:rim:inner',
      hub: 'sketch:hub:outer',
      bore: 'sketch:hub:bore',
    };
    return named[pathId ?? ''] ?? `sketch:path:${pathId}`;
  }
  const radialModelIndex = route.find((part) => /^\d+$/.test(part));
  if (radialModelIndex === undefined || !pathId) {
    throw new TypeError(`Maker.js produced an unexpected spoke route: ${route.join('/')}.`);
  }
  const spokeIndex = Number(radialModelIndex) + 1;
  return `sketch:spoke:${spokeIndex}:${pathId}`;
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

function attuneGeometryFromMaker(model: MakerJs.IModel): readonly GeometryInput[] {
  const entities: GeometryInput[] = [];
  makerjs.model.walk(model, {
    onPath(context) {
      const id = stableEntityId(context.route);
      const path = context.pathContext;
      if (isMakerLine(path)) {
        entities.push({
          id,
          kind: 'line',
          name: id.split(':').slice(-2).join(' '),
          start: point(path.origin, context.offset),
          end: point(path.end, context.offset),
        });
      } else if (isMakerCircle(path)) {
        entities.push({
          id,
          kind: 'circle',
          name: id.split(':').slice(-2).join(' '),
          center: point(path.origin, context.offset),
          radius: path.radius,
        });
      } else if (isMakerArc(path)) {
        entities.push({
          id,
          kind: 'arc',
          name: id.split(':').slice(-2).join(' '),
          center: point(path.origin, context.offset),
          radius: path.radius,
          startAngle: makerjs.angle.toRadians(path.startAngle),
          endAngle: makerjs.angle.toRadians(path.endAngle),
        });
      }
    },
  });
  return entities;
}

export function createSpokeSeedDocument(
  parameters: SpokeSeedParameters = DEFAULT_SPOKE_PARAMETERS,
): SketchDocument {
  const entities = attuneGeometryFromMaker(createMakerSpokeModel(parameters)).map((entity) =>
    Object.assign({}, entity, { version: 1 }),
  ) as GeometryEntity[];
  const rimIds = ['sketch:rim:outer', 'sketch:rim:inner'];
  const hubIds = ['sketch:hub:outer', 'sketch:hub:bore'];
  const spokeIds = entities.filter(({ id }) => id.startsWith('sketch:spoke:')).map(({ id }) => id);
  const concentricIds = ['sketch:rim:inner', 'sketch:hub:outer', 'sketch:hub:bore'];

  return createSketchDocument({
    id: 'sketch:spoke-wheel',
    name: 'Parametric six-spoke wheel',
    entities,
    constraints: concentricIds.map((entityId, index) => ({
      id: `constraint:spoke-seed:concentric:${index + 1}`,
      version: 1,
      type: 'concentric' as const,
      refs: [
        { entityId: 'sketch:rim:outer', anchor: 'center' },
        { entityId, anchor: 'center' },
      ],
    })),
    dimensions: [],
    groups: [
      { id: 'group:rim', version: 1, name: 'Rim', entityIds: rimIds },
      { id: 'group:hub', version: 1, name: 'Hub', entityIds: hubIds },
      { id: 'group:spokes', version: 1, name: 'Spokes', entityIds: spokeIds },
    ],
    parameters: [
      {
        id: 'parameter:outer-radius',
        version: 1,
        name: 'Outer radius',
        value: parameters.outerRadius,
        unit: 'mm',
      },
      {
        id: 'parameter:inner-rim-radius',
        version: 1,
        name: 'Inner rim radius',
        value: parameters.innerRimRadius,
        unit: 'mm',
      },
      {
        id: 'parameter:hub-radius',
        version: 1,
        name: 'Hub radius',
        value: parameters.hubRadius,
        unit: 'mm',
      },
      {
        id: 'parameter:bore-radius',
        version: 1,
        name: 'Bore radius',
        value: parameters.boreRadius,
        unit: 'mm',
      },
      {
        id: 'parameter:spoke-width',
        version: 1,
        name: 'Spoke width',
        value: parameters.spokeWidth,
        unit: 'mm',
      },
    ],
  });
}

export function toMakerJsModel(document: SketchDocument): MakerJs.IModel {
  const paths: MakerJs.IPathMap = {};
  for (const entity of document.entities) {
    switch (entity.kind) {
      case 'point':
        break;
      case 'line':
        paths[entity.id] = new makerjs.paths.Line(
          [entity.start.x, entity.start.y],
          [entity.end.x, entity.end.y],
        );
        break;
      case 'circle':
        paths[entity.id] = new makerjs.paths.Circle(
          [entity.center.x, entity.center.y],
          entity.radius,
        );
        break;
      case 'arc':
        paths[entity.id] = new makerjs.paths.Arc(
          [entity.center.x, entity.center.y],
          entity.radius,
          makerjs.angle.toDegrees(entity.startAngle),
          makerjs.angle.toDegrees(entity.endAngle),
        );
        break;
    }
  }
  return { paths };
}

export function measureSketch(document: SketchDocument): SketchBounds | null {
  const extents = makerjs.measure.modelExtents(toMakerJsModel(document));
  if (!extents) return null;
  return {
    minX: extents.low[0],
    minY: extents.low[1],
    maxX: extents.high[0],
    maxY: extents.high[1],
  };
}

export function sketchToSvg(document: SketchDocument): string {
  return makerjs.exporter.toSVG(toMakerJsModel(document));
}

/** Future preview/export seam; current Attune editing remains strictly semantic 2D. */
export interface Sketch3DExporter {
  export(
    document: SketchDocument,
  ): Promise<{ readonly mimeType: string; readonly data: Uint8Array }>;
}
