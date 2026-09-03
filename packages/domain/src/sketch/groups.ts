import type { DesignRecipeProvenance } from '../recipes/types';

export interface MakerModelGroupSourceRef {
  readonly kind: 'maker-model';
  readonly routeKey: string;
  readonly route: readonly string[];
  readonly layer?: string;
}

export interface SketchGroup {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly kind?: 'group' | 'section';
  readonly parentGroupId?: string;
  readonly entityIds: readonly string[];
  readonly childGroupIds?: readonly string[];
  readonly sourceRef?: MakerModelGroupSourceRef | DesignRecipeProvenance;
}

export type GroupInput = Omit<SketchGroup, 'version'>;

export function validateGroupInput(group: GroupInput): void {
  if (!group.id || !group.name.trim()) throw new TypeError('Groups require a stable ID and name.');
  if (new Set(group.entityIds).size !== group.entityIds.length) {
    throw new TypeError(`${group.id} contains duplicate entity references.`);
  }
  if (group.kind && group.kind !== 'group' && group.kind !== 'section') {
    throw new TypeError(`${group.id} has an invalid group kind.`);
  }
}
