import type { SketchDocument, SketchSnapshotInput } from '@attune/domain';
import * as Y from 'yjs';

function isSketchDocument(value: unknown): value is SketchDocument {
  if (typeof value !== 'object' || value === null) return false;
  return (
    Reflect.get(value, 'schemaVersion') === 1 &&
    typeof Reflect.get(value, 'id') === 'string' &&
    Array.isArray(Reflect.get(value, 'entities')) &&
    Array.isArray(Reflect.get(value, 'nodes'))
  );
}

export function sketchDocumentFromYjsVersion(update: Uint8Array): SketchDocument | null {
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, update);
    const draft = document.getMap('attune').get('draft');
    const sketch =
      typeof draft === 'object' && draft !== null ? Reflect.get(draft, 'sketchDocument') : null;
    return isSketchDocument(sketch) ? structuredClone(sketch) : null;
  } finally {
    document.destroy();
  }
}

export function sketchSnapshotFromDocument(document: SketchDocument): SketchSnapshotInput {
  return {
    name: document.name,
    entities: document.entities.map((entity) => {
      const common = {
        id: entity.id,
        ...(entity.name ? { name: entity.name } : {}),
        ...(entity.construction !== undefined ? { construction: entity.construction } : {}),
      };
      switch (entity.kind) {
        case 'point':
          return { ...common, kind: entity.kind, position: entity.position };
        case 'line':
          return { ...common, kind: entity.kind, start: entity.start, end: entity.end };
        case 'circle':
          return { ...common, kind: entity.kind, center: entity.center, radius: entity.radius };
        case 'arc':
          return {
            ...common,
            kind: entity.kind,
            center: entity.center,
            radius: entity.radius,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle,
          };
        case 'ellipse':
          return {
            ...common,
            kind: entity.kind,
            center: entity.center,
            majorRadius: entity.majorRadius,
            minorRadius: entity.minorRadius,
            rotation: entity.rotation,
          };
        case 'bspline':
          return {
            ...common,
            kind: entity.kind,
            degree: entity.degree,
            controlPoints: entity.controlPoints,
          };
      }
      throw new TypeError(`Unsupported geometry: ${JSON.stringify(entity)}`);
    }),
    constraints: document.constraints.map(({ version: _version, ...constraint }) => constraint),
    dimensions: document.dimensions.map(({ version: _version, ...dimension }) => dimension),
    groups: document.groups.map(({ version: _version, ...group }) => group),
    parameters: document.parameters.map(({ version: _version, ...parameter }) => parameter),
  };
}
