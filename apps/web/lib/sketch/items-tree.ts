import type { GeometryEntity, SketchDocument } from '@attune/domain/editor';

function isOpaqueReference(value: string): boolean {
  return /^[0-9a-f]{16,}$/i.test(value.replaceAll('-', ''));
}

export function humanizeSketchItemName(value: string): string {
  const segments = value.split(':');
  const source = segments.findLast((segment) => segment.length > 0 && !isOpaqueReference(segment));
  if (!source) return 'Sketch item';
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

export function sketchEntityDisplayName(document: SketchDocument, entity: GeometryEntity): string {
  if (entity.name?.trim()) return entity.name.trim();
  const semantic = humanizeSketchItemName(entity.id);
  if (semantic !== 'Sketch item' && semantic.length > 1 && semantic.toLowerCase() !== entity.kind)
    return semantic;
  const label =
    entity.kind === 'bspline'
      ? 'B-spline'
      : `${entity.kind[0].toUpperCase()}${entity.kind.slice(1)}`;
  const ordinal =
    document.entities
      .filter(({ kind }) => kind === entity.kind)
      .findIndex(({ id }) => id === entity.id) + 1;
  return `${label} ${Math.max(1, ordinal)}`;
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
