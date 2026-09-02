import makerjs from 'makerjs';
// @ts-expect-error The published CommonJS generator does not include TypeScript declarations.
import StraightSpokesModule from 'makerjs-spokes-straight';
import straightSpokesMetadata from 'makerjs-spokes-straight/package.json';
import makerjsMetadata from 'makerjs/package.json';

import { hashCanonical } from '../hash';
import {
  createSketchDocument,
  type MakerGeneratorSource,
  type MakerModelSource,
  type SketchDocument,
  type SketchParameter,
  type SketchSource,
} from '../sketch/document';
import {
  arcPoint,
  normalizedAngle,
  positiveArcSweep,
  synchronizeGeometryWithNodes,
  type GeometryEntity,
  type GeometryInput,
  type MakerPathSourceRef,
  type SketchBounds,
  type SketchPoint2D,
} from '../sketch/geometry';
import type { SketchGroup } from '../sketch/groups';
import { TOPOLOGY_EPSILON_MM } from '../sketch/topology';

interface StraightSpokesConstructor {
  new (
    outerRadius: number,
    innerRadius: number,
    count: number,
    spokeWidth: number,
    offsetPercent: number,
    innerFillet: number,
    outerFillet: number,
    addRing: boolean,
  ): MakerJs.IModel;
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrow boundary for an untyped package.
const StraightSpokes = StraightSpokesModule as StraightSpokesConstructor;

export interface StraightSpokesParameters {
  readonly outerRadius: number;
  readonly innerRadius: number;
  readonly spokeCount: number;
  readonly spokeWidth: number;
  readonly offsetPercent: number;
  readonly innerFillet: number;
  readonly outerFillet: number;
  readonly addRing: boolean;
}

/** One exact, source-visible fixture for the editor seed and parity tests. */
export const STRAIGHT_SPOKES_FIXTURE: StraightSpokesParameters = {
  outerRadius: 100,
  innerRadius: 34,
  spokeCount: 6,
  spokeWidth: 9,
  offsetPercent: 62,
  innerFillet: 3,
  outerFillet: 3,
  addRing: true,
};

/** Compatibility alias retained for callers of the previous seed helper. */
export const DEFAULT_SPOKE_PARAMETERS = STRAIGHT_SPOKES_FIXTURE;

export interface MakerJsImportOptions {
  readonly documentId?: string;
  readonly name?: string;
  readonly sourceUnits?: string;
  readonly topologyEpsilon?: number;
  readonly source?:
    | Omit<MakerGeneratorSource, 'units' | 'status'>
    | Omit<MakerModelSource, 'units' | 'status'>;
  readonly parameters?: readonly SketchParameter[];
}

interface WalkedPath {
  readonly path: MakerJs.IPath;
  readonly sourceRef: MakerPathSourceRef;
  readonly offset: MakerJs.IPoint;
}

interface WalkedModel {
  readonly route: readonly string[];
  readonly routeKey: string;
  readonly layer?: string;
}

function safeSlug(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'path'
  );
}

function stableEntityId(sourceRef: MakerPathSourceRef): string {
  return `maker:path:${safeSlug(sourceRef.pathId ?? 'path')}:${hashCanonical(sourceRef.routeKey).slice(0, 16)}`;
}

function routeToken(route: readonly string[]): string {
  return route.join('\u001f');
}

function stableGroupId(model: WalkedModel): string {
  if (model.route.length === 0) return 'maker:group:root';
  const name = model.route.at(-1) ?? 'model';
  return `maker:group:${safeSlug(name)}:${hashCanonical(model.routeKey).slice(0, 12)}`;
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

function worldPoint(value: MakerJs.IPoint, offset: MakerJs.IPoint, scale: number): SketchPoint2D {
  return { x: (value[0] + offset[0]) * scale, y: (value[1] + offset[1]) * scale };
}

function walkMakerModel(model: MakerJs.IModel): {
  readonly paths: readonly WalkedPath[];
  readonly models: readonly WalkedModel[];
} {
  const paths: WalkedPath[] = [];
  const models: WalkedModel[] = [{ route: [], routeKey: '$' }];
  makerjs.model.walk(model, {
    beforeChildWalk(context) {
      models.push({
        route: [...context.route],
        routeKey: context.routeKey,
        ...(context.layer ? { layer: context.layer } : {}),
      });
      return true;
    },
    onPath(context) {
      paths.push({
        path: context.pathContext,
        sourceRef: {
          kind: 'maker-path',
          routeKey: context.routeKey,
          route: [...context.route],
          ...(context.layer ? { layer: context.layer } : {}),
          ...(context.pathId ? { pathId: context.pathId } : {}),
        },
        offset: [context.offset[0], context.offset[1]],
      });
    },
  });
  return {
    paths: paths.toSorted((left, right) =>
      left.sourceRef.routeKey.localeCompare(right.sourceRef.routeKey),
    ),
    models: models
      .filter(
        (modelContext, index, all) =>
          all.findIndex(({ route }) => routeToken(route) === routeToken(modelContext.route)) ===
          index,
      )
      .toSorted(
        (left, right) =>
          left.route.length - right.route.length || left.routeKey.localeCompare(right.routeKey),
      ),
  };
}

function geometryFromWalkedPath(walked: WalkedPath, scale: number): GeometryInput {
  const id = stableEntityId(walked.sourceRef);
  const name = walked.sourceRef.pathId ?? id;
  const base = { id, name, sourceRef: walked.sourceRef };
  if (isMakerLine(walked.path)) {
    return {
      ...base,
      kind: 'line',
      start: worldPoint(walked.path.origin, walked.offset, scale),
      end: worldPoint(walked.path.end, walked.offset, scale),
    };
  }
  if (isMakerCircle(walked.path)) {
    return {
      ...base,
      kind: 'circle',
      center: worldPoint(walked.path.origin, walked.offset, scale),
      radius: walked.path.radius * scale,
    };
  }
  if (isMakerArc(walked.path)) {
    const startAngle = normalizedAngle(makerjs.angle.toRadians(walked.path.startAngle));
    const sweep = makerjs.angle.toRadians(makerjs.angle.ofArcSpan(walked.path));
    return {
      ...base,
      kind: 'arc',
      center: worldPoint(walked.path.origin, walked.offset, scale),
      radius: walked.path.radius * scale,
      startAngle,
      endAngle: startAngle + sweep,
    };
  }
  throw new TypeError(`Unsupported Maker.js path at ${walked.sourceRef.routeKey}.`);
}

function groupsFromWalk(
  walked: ReturnType<typeof walkMakerModel>,
  entities: readonly GeometryEntity[],
): readonly SketchGroup[] {
  const models = walked.models;
  const groupIdByRoute = new Map(
    models.map((model) => [routeToken(model.route), stableGroupId(model)]),
  );
  const entityIdByRouteKey = new Map(
    entities.flatMap((entity) =>
      entity.sourceRef ? [[entity.sourceRef.routeKey, entity.id] as const] : [],
    ),
  );
  return models.map((model): SketchGroup => {
    const childModels = models.filter(
      ({ route }) =>
        route.length === model.route.length + 2 &&
        routeToken(route.slice(0, -2)) === routeToken(model.route),
    );
    const entityIds = walked.paths
      .filter(
        ({ sourceRef }) => routeToken(sourceRef.route.slice(0, -2)) === routeToken(model.route),
      )
      .flatMap(({ sourceRef }) => {
        const id = entityIdByRouteKey.get(sourceRef.routeKey);
        return id ? [id] : [];
      })
      .toSorted();
    const childGroupIds = childModels
      .flatMap((child) => {
        const id = groupIdByRoute.get(routeToken(child.route));
        return id ? [id] : [];
      })
      .toSorted();
    const group: SketchGroup = {
      id: stableGroupId(model),
      version: 1,
      name: model.route.length === 0 ? 'Maker.js source' : (model.route.at(-1) ?? 'Model'),
      entityIds,
      sourceRef: {
        kind: 'maker-model',
        routeKey: model.routeKey,
        route: model.route,
        ...(model.layer ? { layer: model.layer } : {}),
      },
    };
    return childGroupIds.length > 0 ? Object.assign({}, group, { childGroupIds }) : group;
  });
}

function importUnits(model: MakerJs.IModel, options: MakerJsImportOptions) {
  const source = model.units ?? options.sourceUnits ?? makerjs.unitType.Millimeter;
  const assumed = model.units === undefined;
  const scale = makerjs.units.conversionScale(source, makerjs.unitType.Millimeter);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new TypeError(`Unsupported Maker.js units: ${source}.`);
  }
  return { source, internal: 'mm' as const, scale, assumed };
}

export function importMakerJsModel(
  model: MakerJs.IModel,
  options: MakerJsImportOptions = {},
): SketchDocument {
  if ((options.topologyEpsilon ?? TOPOLOGY_EPSILON_MM) !== TOPOLOGY_EPSILON_MM) {
    throw new TypeError('Attune documents use one canonical topology epsilon.');
  }
  const walked = walkMakerModel(model);
  const units = importUnits(model, options);
  const source: SketchSource = options.source
    ? { ...options.source, units, status: 'pristine' }
    : {
        kind: 'maker-model',
        package: 'makerjs',
        packageVersion: makerjsMetadata.version,
        units,
        status: 'pristine',
      };
  const versioned = walked.paths.map((path) => ({
    ...geometryFromWalkedPath(path, units.scale),
    version: 1,
  })) as GeometryEntity[];
  const document = createSketchDocument({
    id:
      options.documentId ??
      `sketch:maker:${hashCanonical(walked.paths.map(({ sourceRef }) => sourceRef.routeKey)).slice(0, 16)}`,
    name: options.name ?? 'Imported Maker.js model',
    entities: versioned,
    constraints: [],
    dimensions: [],
    groups: [],
    parameters: options.parameters ?? [],
    source,
  });
  return { ...document, groups: groupsFromWalk(walked, document.entities) };
}

export function createStraightSpokesModel(
  parameters: StraightSpokesParameters = STRAIGHT_SPOKES_FIXTURE,
): MakerJs.IModel {
  return new StraightSpokes(
    parameters.outerRadius,
    parameters.innerRadius,
    parameters.spokeCount,
    parameters.spokeWidth,
    parameters.offsetPercent,
    parameters.innerFillet,
    parameters.outerFillet,
    parameters.addRing,
  );
}

function seedParameters(parameters: StraightSpokesParameters): readonly SketchParameter[] {
  const values: readonly (readonly [
    id: string,
    name: string,
    value: number,
    unit: SketchParameter['unit'],
  ])[] = [
    ['outer-radius', 'Outer radius', parameters.outerRadius, 'mm'],
    ['inner-radius', 'Inner radius', parameters.innerRadius, 'mm'],
    ['spoke-count', 'Spoke count', parameters.spokeCount, 'unitless'],
    ['spoke-width', 'Spoke width', parameters.spokeWidth, 'mm'],
    ['offset-percent', 'Spoke offset percent', parameters.offsetPercent, 'unitless'],
    ['inner-fillet', 'Inner fillet', parameters.innerFillet, 'mm'],
    ['outer-fillet', 'Outer fillet', parameters.outerFillet, 'mm'],
    ['add-ring', 'Add ring', parameters.addRing ? 1 : 0, 'unitless'],
  ];
  return values.map(([id, name, value, unit]) => ({
    id: `parameter:${id}`,
    version: 1,
    name,
    value,
    unit,
  }));
}

export function createSpokeSeedDocument(
  parameters: StraightSpokesParameters = STRAIGHT_SPOKES_FIXTURE,
): SketchDocument {
  return importMakerJsModel(createStraightSpokesModel(parameters), {
    documentId: 'sketch:spoke-wheel',
    name: 'Exact Maker.js straight-spokes wheel',
    sourceUnits: makerjs.unitType.Millimeter,
    source: {
      kind: 'maker-generator',
      package: straightSpokesMetadata.name,
      packageVersion: straightSpokesMetadata.version,
      generator: 'StraightSpokes',
      parameters: { ...parameters },
    },
    parameters: seedParameters(parameters),
  });
}

export function toMakerJsModel(document: SketchDocument): MakerJs.IModel {
  const paths: MakerJs.IPathMap = {};
  const entities = synchronizeGeometryWithNodes(document.entities, document.nodes ?? []);
  for (const entity of entities) {
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
          makerjs.angle.toDegrees(normalizedAngle(entity.startAngle)),
          makerjs.angle.toDegrees(
            normalizedAngle(entity.startAngle) +
              positiveArcSweep(entity.startAngle, entity.endAngle),
          ),
        );
        break;
    }
  }
  return { paths, units: makerjs.unitType.Millimeter };
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

export function importedArcEndpoints(entity: Extract<GeometryEntity, { kind: 'arc' }>) {
  return {
    start: arcPoint(entity, entity.startAngle),
    end: arcPoint(entity, entity.endAngle),
  };
}

/** Future preview/export seam; current Attune editing remains strictly semantic 2D. */
export interface Sketch3DExporter {
  export(
    document: SketchDocument,
  ): Promise<{ readonly mimeType: string; readonly data: Uint8Array }>;
}
