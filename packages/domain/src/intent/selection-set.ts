import type { SketchDocument } from '../sketch/document';

export type SelectionKind = 'entity' | 'node' | 'constraint' | 'dimension' | 'group';

export interface SelectionSet {
  readonly entityIds: readonly string[];
  readonly nodeIds: readonly string[];
  readonly constraintIds: readonly string[];
  readonly dimensionIds: readonly string[];
  readonly groupIds: readonly string[];
}

export const EMPTY_SELECTION_SET: SelectionSet = {
  entityIds: [],
  nodeIds: [],
  constraintIds: [],
  dimensionIds: [],
  groupIds: [],
};

function key(kind: SelectionKind): keyof SelectionSet {
  if (kind === 'entity') return 'entityIds';
  if (kind === 'node') return 'nodeIds';
  if (kind === 'constraint') return 'constraintIds';
  if (kind === 'dimension') return 'dimensionIds';
  return 'groupIds';
}

function normalized(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)].toSorted();
}

export function replaceSelection(
  kind: SelectionKind,
  ids: readonly string[],
  preserveOtherKinds = false,
): SelectionSet {
  const result = preserveOtherKinds ? { ...EMPTY_SELECTION_SET } : { ...EMPTY_SELECTION_SET };
  return { ...result, [key(kind)]: normalized(ids) };
}

export function toggleSelection(
  selection: SelectionSet,
  kind: SelectionKind,
  id: string,
  additive: boolean,
): SelectionSet {
  const property = key(kind);
  if (!additive) return replaceSelection(kind, [id]);
  const current = new Set(selection[property]);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  return { ...selection, [property]: [...current].toSorted() };
}

export function addToSelection(
  selection: SelectionSet,
  kind: SelectionKind,
  ids: readonly string[],
): SelectionSet {
  const property = key(kind);
  return { ...selection, [property]: normalized([...selection[property], ...ids]) };
}

export function selectionCount(selection: SelectionSet): number {
  return (
    selection.entityIds.length +
    selection.nodeIds.length +
    selection.constraintIds.length +
    selection.dimensionIds.length +
    selection.groupIds.length
  );
}

export function pruneSelection(selection: SelectionSet, document: SketchDocument): SelectionSet {
  const available = {
    entityIds: new Set(document.entities.map(({ id }) => id)),
    nodeIds: new Set(document.nodes.map(({ id }) => id)),
    constraintIds: new Set(document.constraints.map(({ id }) => id)),
    dimensionIds: new Set(document.dimensions.map(({ id }) => id)),
    groupIds: new Set(document.groups.map(({ id }) => id)),
  };
  return {
    entityIds: selection.entityIds.filter((id) => available.entityIds.has(id)),
    nodeIds: selection.nodeIds.filter((id) => available.nodeIds.has(id)),
    constraintIds: selection.constraintIds.filter((id) => available.constraintIds.has(id)),
    dimensionIds: selection.dimensionIds.filter((id) => available.dimensionIds.has(id)),
    groupIds: selection.groupIds.filter((id) => available.groupIds.has(id)),
  };
}
