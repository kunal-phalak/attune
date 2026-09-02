import { constraintEntityIds } from '../sketch/constraints';
import type { SketchDocument } from '../sketch/document';
import { geometryNodeIds } from '../sketch/geometry';
import type { ConstraintSolver } from './solver';

export interface DefinitionState {
  readonly ref: { readonly kind: 'node' | 'entity'; readonly id: string };
  readonly fullyDefined: boolean;
  readonly remainingDof: number | null;
  readonly reasons: readonly string[];
  readonly constrainingRefs: readonly string[];
  readonly conflictRefs: readonly string[];
}

export interface DefinitionStateAnalysis {
  readonly nodes: Readonly<Record<string, DefinitionState>>;
  readonly entities: Readonly<Record<string, DefinitionState>>;
  readonly totalDof: number | null;
  readonly conflicts: readonly string[];
}

function components(document: SketchDocument): readonly string[][] {
  const parents = new Map(document.entities.map(({ id }) => [id, id]));
  const find = (id: string): string => {
    const parent = parents.get(id) ?? id;
    if (parent === id) return id;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const first = find(left);
    const second = find(right);
    if (first !== second) parents.set(second, first);
  };
  const byNode = new Map<string, string[]>();
  for (const entity of document.entities) {
    for (const nodeId of geometryNodeIds(entity)) {
      byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), entity.id]);
    }
  }
  for (const ids of byNode.values()) {
    for (const id of ids.slice(1)) union(ids[0], id);
  }
  for (const relation of [...document.constraints, ...document.dimensions]) {
    const ids = relation.refs.map(({ entityId }) => entityId).filter((id) => parents.has(id));
    for (const id of ids.slice(1)) union(ids[0], id);
  }
  const grouped = new Map<string, string[]>();
  for (const entity of document.entities) {
    const root = find(entity.id);
    grouped.set(root, [...(grouped.get(root) ?? []), entity.id]);
  }
  return [...grouped.values()].map((ids) => ids.toSorted());
}

function componentDocument(document: SketchDocument, entityIds: readonly string[]): SketchDocument {
  const included = new Set(entityIds);
  const entities = document.entities.filter(({ id }) => included.has(id));
  const nodeIds = new Set(entities.flatMap(geometryNodeIds));
  return {
    ...document,
    id: `${document.id}:definition:${entityIds.join('|')}`,
    nodes: document.nodes.filter(({ id }) => nodeIds.has(id)),
    entities,
    constraints: document.constraints.filter((constraint) =>
      constraint.refs.every(({ entityId }) => included.has(entityId)),
    ),
    dimensions: document.dimensions.filter((dimension) =>
      dimension.refs.every(({ entityId }) => included.has(entityId)),
    ),
    groups: [],
    parameters: document.parameters,
    source: undefined,
    lastSolve: undefined,
  };
}

/**
 * Uses PlaneGCS DOF per topologically/relationally connected component. Direct fixed geometry is
 * retained as fully defined inside a mixed component, so a fixed endpoint never paints a free line
 * green merely because topology connects them.
 */
export function analyzeDefinitionState(
  document: SketchDocument,
  solver: Pick<ConstraintSolver, 'solve'>,
): DefinitionStateAnalysis {
  const nodeStates: Record<string, DefinitionState> = {};
  const entityStates: Record<string, DefinitionState> = {};
  const fixedEntityIds = new Set(
    document.constraints.filter(({ type }) => type === 'fixed').flatMap(constraintEntityIds),
  );
  const fixedNodeIds = new Set(
    document.entities.filter(({ id }) => fixedEntityIds.has(id)).flatMap(geometryNodeIds),
  );
  const globalConflicts = new Set<string>();
  let totalDof = 0;
  let unknownDof = false;

  for (const entityIds of components(document)) {
    const result = solver.solve(componentDocument(document, entityIds));
    if (result.degreesOfFreedom === null) unknownDof = true;
    else totalDof += result.degreesOfFreedom;
    result.conflicts.forEach((id) => globalConflicts.add(id));
    const constraintIds = document.constraints
      .filter((constraint) => constraint.refs.some(({ entityId }) => entityIds.includes(entityId)))
      .map(({ id }) => id)
      .toSorted();
    const conflictIds = constraintIds.filter((id) => result.conflicts.includes(id));
    const componentFullyDefined = result.degreesOfFreedom === 0 && conflictIds.length === 0;
    const componentNodeIds = new Set(
      document.entities.filter(({ id }) => entityIds.includes(id)).flatMap(geometryNodeIds),
    );

    for (const entityId of entityIds) {
      const fixed = fixedEntityIds.has(entityId);
      const fullyDefined = (componentFullyDefined || fixed) && conflictIds.length === 0;
      entityStates[entityId] = {
        ref: { kind: 'entity', id: entityId },
        fullyDefined,
        remainingDof: fullyDefined ? 0 : result.degreesOfFreedom,
        reasons:
          conflictIds.length > 0
            ? ['Conflicting constraints prevent a valid definition.']
            : fixed
              ? ['A Fix constraint locks this geometry.']
              : componentFullyDefined
                ? ['PlaneGCS reports zero remaining degrees of freedom for this relationship.']
                : [
                    `PlaneGCS reports ${result.degreesOfFreedom ?? 'unknown'} remaining degrees of freedom in this connected relationship.`,
                  ],
        constrainingRefs: constraintIds,
        conflictRefs: conflictIds,
      };
    }
    for (const nodeId of componentNodeIds) {
      const fixed = fixedNodeIds.has(nodeId);
      const fullyDefined = (componentFullyDefined || fixed) && conflictIds.length === 0;
      nodeStates[nodeId] = {
        ref: { kind: 'node', id: nodeId },
        fullyDefined,
        remainingDof: fullyDefined ? 0 : result.degreesOfFreedom,
        reasons:
          conflictIds.length > 0
            ? ['A related constraint is conflicting.']
            : fixed
              ? ['An incident Fix constraint locks this node.']
              : componentFullyDefined
                ? ['PlaneGCS reports zero remaining degrees of freedom.']
                : ['This node belongs to an under-defined relationship.'],
        constrainingRefs: constraintIds,
        conflictRefs: conflictIds,
      };
    }
  }

  return {
    nodes: nodeStates,
    entities: entityStates,
    totalDof: unknownDof ? null : totalDof,
    conflicts: [...globalConflicts].toSorted(),
  };
}
