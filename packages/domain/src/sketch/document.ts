import type { SketchConstraint } from './constraints';
import type { SketchDimension } from './dimensions';
import type { GeometryEntity } from './geometry';
import type { SketchGroup } from './groups';

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

export interface SketchDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly entities: readonly GeometryEntity[];
  readonly constraints: readonly SketchConstraint[];
  readonly dimensions: readonly SketchDimension[];
  readonly groups: readonly SketchGroup[];
  readonly parameters: readonly SketchParameter[];
  readonly lastSolve?: SketchSolveSnapshot;
}

export function createSketchDocument(
  input: Omit<SketchDocument, 'schemaVersion' | 'revision'> & { readonly revision?: number },
): SketchDocument {
  return {
    schemaVersion: 1,
    revision: input.revision ?? 0,
    id: input.id,
    name: input.name,
    entities: input.entities,
    constraints: input.constraints,
    dimensions: input.dimensions,
    groups: input.groups,
    parameters: input.parameters,
    ...(input.lastSolve ? { lastSolve: input.lastSolve } : {}),
  };
}

export function emptySketchDocument(id = 'sketch:blank'): SketchDocument {
  return createSketchDocument({
    id,
    name: 'Blank sketch',
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
  return (
    document.entities.find((candidate) => candidate.id === id)?.version ??
    document.constraints.find((candidate) => candidate.id === id)?.version ??
    document.dimensions.find((candidate) => candidate.id === id)?.version ??
    document.groups.find((candidate) => candidate.id === id)?.version ??
    document.parameters.find((candidate) => candidate.id === id)?.version ??
    0
  );
}

export function geometryById(document: SketchDocument, id: string): GeometryEntity | undefined {
  return document.entities.find((candidate) => candidate.id === id);
}

export function groupById(document: SketchDocument, id: string): SketchGroup | undefined {
  return document.groups.find((candidate) => candidate.id === id);
}
