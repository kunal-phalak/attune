import type { SketchConstraint } from './constraints';
import type { SketchDimension } from './dimensions';
import {
  synchronizeGeometryWithNodes,
  type GeometryEntity,
  type GeometryInput,
  type SketchNode,
  type SketchPoint2D,
} from './geometry';
import type { SketchGroup } from './groups';
import { ensureGeometryTopology, incidentEntityIds } from './topology';

export interface SketchParameter {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly value: number;
  readonly unit: 'mm' | 'deg' | 'unitless';
}

export type SketchSolveStatus =
  | 'success'
  | 'converged'
  | 'failed'
  | 'invalid_solution'
  | 'unsupported';

export interface SketchSolveSnapshot {
  readonly status: SketchSolveStatus;
  readonly degreesOfFreedom: number | null;
  readonly conflicts: readonly string[];
  readonly redundant: readonly string[];
  readonly diagnostics: readonly string[];
}

export interface MakerGeneratorSource {
  readonly kind: 'maker-generator';
  readonly package: string;
  readonly packageVersion: string;
  readonly generator: string;
  readonly parameters: Readonly<Record<string, number | boolean | string>>;
  readonly units: {
    readonly source: string;
    readonly internal: 'mm';
    readonly scale: number;
    readonly assumed: boolean;
  };
  readonly status: 'pristine' | 'modified' | 'regenerated' | 'reconciled';
  readonly modifiedNodeIds?: readonly string[];
}

export interface MakerModelSource {
  readonly kind: 'maker-model';
  readonly package: 'makerjs';
  readonly packageVersion: string;
  readonly units: MakerGeneratorSource['units'];
  readonly status: MakerGeneratorSource['status'];
  readonly modifiedNodeIds?: readonly string[];
}

export type SketchSource = MakerGeneratorSource | MakerModelSource;

export interface SketchDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly nodes: readonly SketchNode[];
  readonly entities: readonly GeometryEntity[];
  readonly constraints: readonly SketchConstraint[];
  readonly dimensions: readonly SketchDimension[];
  readonly groups: readonly SketchGroup[];
  readonly parameters: readonly SketchParameter[];
  readonly source?: SketchSource;
  readonly lastSolve?: SketchSolveSnapshot;
}

type SketchDocumentInput = Omit<
  SketchDocument,
  'schemaVersion' | 'revision' | 'nodes' | 'entities'
> & {
  readonly revision?: number;
  readonly nodes?: readonly SketchNode[];
  readonly entities: readonly (GeometryInput | GeometryEntity)[];
};

export function createSketchDocument(input: SketchDocumentInput): SketchDocument {
  const versioned = input.entities.map((entity) => ({
    ...entity,
    version: 'version' in entity ? entity.version : 1,
  })) as GeometryEntity[];
  const topology = ensureGeometryTopology(versioned, input.nodes ?? []);
  return {
    schemaVersion: 1,
    revision: input.revision ?? 0,
    id: input.id,
    name: input.name,
    nodes: topology.nodes,
    entities: topology.entities,
    constraints: input.constraints,
    dimensions: input.dimensions,
    groups: input.groups,
    parameters: input.parameters,
    ...(input.source ? { source: input.source } : {}),
    ...(input.lastSolve ? { lastSolve: input.lastSolve } : {}),
  };
}

export function emptySketchDocument(id = 'sketch:blank'): SketchDocument {
  return createSketchDocument({
    id,
    name: 'Blank sketch',
    nodes: [],
    entities: [],
    constraints: [],
    dimensions: [],
    groups: [],
    parameters: [],
  });
}

/** Derived solver evidence is not part of the authored semantic specification. */
export function sketchSpecification(document: SketchDocument): Omit<SketchDocument, 'lastSolve'> {
  const { lastSolve: _lastSolve, ...specification } = document;
  return specification;
}

export function publicReferenceVersion(document: SketchDocument, id: string): number {
  const collections: readonly (readonly { readonly id: string; readonly version: number }[])[] = [
    document.nodes,
    document.entities,
    document.constraints,
    document.dimensions,
    document.groups,
    document.parameters,
  ];
  for (const collection of collections) {
    const reference = collection.find((candidate) => candidate.id === id);
    if (reference) return reference.version;
  }
  return 0;
}

export function nodeById(document: SketchDocument, id: string): SketchNode | undefined {
  return document.nodes?.find((candidate) => candidate.id === id);
}

export function moveSketchNode(
  document: SketchDocument,
  nodeId: string,
  position: SketchPoint2D,
): SketchDocument {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new TypeError('Node movement requires finite coordinates.');
  }
  const current = nodeById(document, nodeId);
  if (!current) throw new TypeError(`Unknown sketch node ${nodeId}.`);
  const touched = new Set(incidentEntityIds(document.entities, nodeId));
  const nodes = document.nodes.map((node) =>
    node.id === nodeId ? { ...node, position, version: node.version + 1 } : node,
  );
  const entities = synchronizeGeometryWithNodes(document.entities, nodes).map((entity) =>
    touched.has(entity.id) ? Object.assign({}, entity, { version: entity.version + 1 }) : entity,
  );
  const source = document.source
    ? {
        ...document.source,
        status: 'modified' as const,
        modifiedNodeIds: [
          ...new Set([...(document.source.modifiedNodeIds ?? []), nodeId]),
        ].toSorted(),
      }
    : undefined;
  return { ...document, nodes, entities, ...(source ? { source } : {}) };
}

export function geometryById(document: SketchDocument, id: string): GeometryEntity | undefined {
  return document.entities.find((candidate) => candidate.id === id);
}

export function groupById(document: SketchDocument, id: string): SketchGroup | undefined {
  return document.groups.find((candidate) => candidate.id === id);
}
