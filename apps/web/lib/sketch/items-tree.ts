import type { SketchDocument } from '@attune/domain/editor';

export function humanizeSketchItemName(value: string): string {
  const source = value.split(':').at(-1) ?? value;
  const spoke = source.match(/^wedge(\d+)$/i);
  if (spoke) return `Spoke ${Number(spoke[1]) + 1}`;
  const spaced = source
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d+)/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return spaced ? `${spaced[0].toUpperCase()}${spaced.slice(1).toLowerCase()}` : 'Sketch item';
}

export function recursiveGroupEntityIds(
  document: SketchDocument,
  groupId: string,
): readonly string[] {
  const ids = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const group = document.groups.find(({ id: candidate }) => candidate === id);
    if (!group) return;
    group.entityIds.forEach((entityId) => ids.add(entityId));
    group.childGroupIds?.forEach(visit);
  };
  visit(groupId);
  return [...ids].toSorted();
}
