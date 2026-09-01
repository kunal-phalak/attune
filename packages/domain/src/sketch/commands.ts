import { constraintEntityIds, validateConstraintInput, type ConstraintInput } from './constraints';
import { validateDimensionInput, type DimensionInput } from './dimensions';
import { publicReferenceVersion, type SketchDocument } from './document';
import { validateGeometryEntity, type GeometryInput, type GeometryPatch } from './geometry';
import { validateGroupInput, type GroupInput } from './groups';

export type SketchCommand =
  | {
      readonly type: 'create_geometry';
      readonly entities: readonly GeometryInput[];
      readonly groupId?: string;
    }
  | { readonly type: 'edit_geometry'; readonly entities: readonly GeometryPatch[] }
  | { readonly type: 'delete_geometry'; readonly entityIds: readonly string[] }
  | { readonly type: 'create_group'; readonly groups: readonly GroupInput[] }
  | {
      readonly type: 'move_to_group';
      readonly entityIds: readonly string[];
      readonly groupId: string;
    }
  | { readonly type: 'apply_constraint'; readonly constraints: readonly ConstraintInput[] }
  | { readonly type: 'remove_constraint'; readonly constraintIds: readonly string[] }
  | { readonly type: 'set_dimension'; readonly dimensions: readonly DimensionInput[] };

export type SketchCommandType = SketchCommand['type'];

export interface CommandFootprint {
  readonly documentId: string;
  readonly documentRevision: number;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly versions: Readonly<Record<string, number>>;
  readonly entityIds: readonly string[];
  readonly groupIds: readonly string[];
  readonly constraintIds: readonly string[];
  readonly dimensionIds: readonly string[];
  readonly authorityDependencies: readonly ['sketch:document', 'authority:workspace'];
}

export interface SketchCommandApplication {
  readonly document: SketchDocument;
  readonly affectedEntities: readonly string[];
  readonly addedConstraints: readonly string[];
  readonly removedConstraints: readonly string[];
}

export function isSketchCommand(command: { readonly type: string }): command is SketchCommand {
  return [
    'create_geometry',
    'edit_geometry',
    'delete_geometry',
    'create_group',
    'move_to_group',
    'apply_constraint',
    'remove_constraint',
    'set_dimension',
  ].includes(command.type);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].toSorted();
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported sketch command value: ${String(value)}`);
}

function footprintReferences(document: SketchDocument, command: SketchCommand) {
  switch (command.type) {
    case 'create_geometry':
      return {
        reads: command.groupId ? [command.groupId] : [],
        writes: [
          ...command.entities.map(({ id }) => id),
          ...(command.groupId ? [command.groupId] : []),
        ],
      };
    case 'edit_geometry':
      return { reads: [], writes: command.entities.map(({ id }) => id) };
    case 'delete_geometry': {
      const entitySet = new Set(command.entityIds);
      const dependentConstraints = document.constraints.filter((constraint) =>
        constraint.refs.some(({ entityId }) => entitySet.has(entityId)),
      );
      const dependentDimensions = document.dimensions.filter((dimension) =>
        dimension.refs.some(({ entityId }) => entitySet.has(entityId)),
      );
      const dependentGroups = document.groups.filter((group) =>
        group.entityIds.some((entityId) => entitySet.has(entityId)),
      );
      return {
        reads: [],
        writes: [
          ...command.entityIds,
          ...dependentConstraints.map(({ id }) => id),
          ...dependentDimensions.map(({ id }) => id),
          ...dependentGroups.map(({ id }) => id),
        ],
      };
    }
    case 'create_group':
      return {
        reads: command.groups.flatMap(({ entityIds, childGroupIds }) => [
          ...entityIds,
          ...(childGroupIds ?? []),
        ]),
        writes: command.groups.map(({ id }) => id),
      };
    case 'move_to_group':
      return {
        reads: command.entityIds,
        writes: [
          command.groupId,
          ...document.groups
            .filter((group) => group.entityIds.some((id) => command.entityIds.includes(id)))
            .map(({ id }) => id),
        ],
      };
    case 'apply_constraint':
      return {
        reads: command.constraints.flatMap(constraintEntityIds),
        writes: command.constraints.map(({ id }) => id),
      };
    case 'remove_constraint':
      return { reads: [], writes: command.constraintIds };
    case 'set_dimension':
      return {
        reads: command.dimensions.flatMap(({ refs }) => refs.map(({ entityId }) => entityId)),
        writes: command.dimensions.map(({ id }) => id),
      };
  }
  return assertNever(command);
}

export function commandFootprint(
  document: SketchDocument,
  command: SketchCommand,
): CommandFootprint {
  const references = footprintReferences(document, command);
  const reads = unique(references.reads);
  const writes = unique(references.writes);
  const versions = Object.fromEntries(
    unique([...reads, ...writes]).map((id) => [id, publicReferenceVersion(document, id)]),
  );
  const allReferences = unique([...reads, ...writes]);
  const entityIds = new Set(document.entities.map(({ id }) => id));
  const groupIds = new Set(document.groups.map(({ id }) => id));
  const constraintIds = new Set(document.constraints.map(({ id }) => id));
  const dimensionIds = new Set(document.dimensions.map(({ id }) => id));
  if (command.type === 'create_geometry') command.entities.forEach(({ id }) => entityIds.add(id));
  if (command.type === 'create_group') command.groups.forEach(({ id }) => groupIds.add(id));
  if (command.type === 'apply_constraint') {
    command.constraints.forEach(({ id }) => constraintIds.add(id));
  }
  if (command.type === 'set_dimension') {
    command.dimensions.forEach(({ id }) => dimensionIds.add(id));
  }
  return {
    documentId: document.id,
    documentRevision: document.revision,
    reads,
    writes,
    versions,
    entityIds: allReferences.filter((id) => entityIds.has(id)),
    groupIds: allReferences.filter((id) => groupIds.has(id)),
    constraintIds: allReferences.filter((id) => constraintIds.has(id)),
    dimensionIds: allReferences.filter((id) => dimensionIds.has(id)),
    authorityDependencies: ['sketch:document', 'authority:workspace'],
  };
}

export function changedFootprintReferences(
  document: SketchDocument,
  footprint: CommandFootprint,
): readonly string[] {
  if (footprint.documentId !== document.id) return ['sketch:document'];
  return Object.entries(footprint.versions)
    .filter(([id, version]) => publicReferenceVersion(document, id) !== version)
    .map(([id]) => id)
    .toSorted();
}

function ensureUniqueCommandIds(ids: readonly string[], label: string): void {
  if (ids.length === 0) throw new TypeError(`${label} requires at least one item.`);
  if (new Set(ids).size !== ids.length) throw new TypeError(`${label} contains duplicate IDs.`);
}

function ensureReferencedEntities(document: SketchDocument, entityIds: readonly string[]): void {
  const available = new Set(document.entities.map(({ id }) => id));
  const missing = unique(entityIds).filter((id) => !available.has(id));
  if (missing.length > 0)
    throw new TypeError(`Unknown geometry references: ${missing.join(', ')}.`);
}

function advance(document: SketchDocument, changes: Partial<SketchDocument>): SketchDocument {
  return { ...document, ...changes, revision: document.revision + 1, lastSolve: undefined };
}

export function applySketchCommand(
  source: SketchDocument,
  command: SketchCommand,
): SketchCommandApplication {
  const document = structuredClone(source);
  switch (command.type) {
    case 'create_geometry': {
      const ids = command.entities.map(({ id }) => id);
      ensureUniqueCommandIds(ids, 'create_geometry');
      const existing = new Set(document.entities.map(({ id }) => id));
      if (ids.some((id) => existing.has(id))) throw new TypeError('Geometry IDs must be new.');
      command.entities.forEach(validateGeometryEntity);
      if (command.groupId && !document.groups.some(({ id }) => id === command.groupId)) {
        throw new TypeError(`Unknown target group ${command.groupId}.`);
      }
      const entities = [
        ...document.entities,
        ...command.entities.map((entity) => ({ ...entity, version: 1 })),
      ];
      const groups = command.groupId
        ? document.groups.map((group) =>
            group.id === command.groupId
              ? {
                  ...group,
                  entityIds: unique([...group.entityIds, ...ids]),
                  version: group.version + 1,
                }
              : group,
          )
        : document.groups;
      return {
        document: advance(document, { entities, groups }),
        affectedEntities: unique([...ids, ...(command.groupId ? [command.groupId] : [])]),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'edit_geometry': {
      const ids = command.entities.map(({ id }) => id);
      ensureUniqueCommandIds(ids, 'edit_geometry');
      ensureReferencedEntities(document, ids);
      const patches = new Map(command.entities.map((patch) => [patch.id, patch]));
      const entities = document.entities.map((entity) => {
        const patch = patches.get(entity.id);
        if (!patch) return entity;
        if (patch.kind !== entity.kind) throw new TypeError(`${entity.id} cannot change kind.`);
        const next = { ...entity, ...patch, version: entity.version + 1 } as typeof entity;
        validateGeometryEntity(next);
        return next;
      });
      return {
        document: advance(document, { entities }),
        affectedEntities: unique(ids),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'delete_geometry': {
      ensureUniqueCommandIds(command.entityIds, 'delete_geometry');
      ensureReferencedEntities(document, command.entityIds);
      const removing = new Set(command.entityIds);
      const removedConstraints = document.constraints
        .filter((constraint) => constraint.refs.some(({ entityId }) => removing.has(entityId)))
        .map(({ id }) => id);
      const constraints = document.constraints.filter(
        (constraint) => !removedConstraints.includes(constraint.id),
      );
      const dimensions = document.dimensions.filter(
        (dimension) => !dimension.refs.some(({ entityId }) => removing.has(entityId)),
      );
      const groups = document.groups.map((group) => {
        const entityIds = group.entityIds.filter((id) => !removing.has(id));
        return entityIds.length === group.entityIds.length
          ? group
          : { ...group, entityIds, version: group.version + 1 };
      });
      return {
        document: advance(document, {
          entities: document.entities.filter(({ id }) => !removing.has(id)),
          constraints,
          dimensions,
          groups,
        }),
        affectedEntities: unique([...command.entityIds, ...removedConstraints]),
        addedConstraints: [],
        removedConstraints,
      };
    }
    case 'create_group': {
      const ids = command.groups.map(({ id }) => id);
      ensureUniqueCommandIds(ids, 'create_group');
      if (ids.some((id) => document.groups.some((group) => group.id === id))) {
        throw new TypeError('Group IDs must be new.');
      }
      command.groups.forEach(validateGroupInput);
      ensureReferencedEntities(
        document,
        command.groups.flatMap(({ entityIds }) => entityIds),
      );
      const knownGroups = new Set([...document.groups.map(({ id }) => id), ...ids]);
      if (
        command.groups.some(({ childGroupIds }) =>
          childGroupIds?.some((id) => !knownGroups.has(id)),
        )
      ) {
        throw new TypeError('A child group reference is unknown.');
      }
      return {
        document: advance(document, {
          groups: [
            ...document.groups,
            ...command.groups.map((group) => ({ ...group, version: 1 })),
          ],
        }),
        affectedEntities: ids,
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'move_to_group': {
      ensureUniqueCommandIds(command.entityIds, 'move_to_group');
      ensureReferencedEntities(document, command.entityIds);
      if (!document.groups.some(({ id }) => id === command.groupId)) {
        throw new TypeError(`Unknown target group ${command.groupId}.`);
      }
      const moving = new Set(command.entityIds);
      const changedGroups: string[] = [];
      const groups = document.groups.map((group) => {
        const without = group.entityIds.filter((id) => !moving.has(id));
        const entityIds =
          group.id === command.groupId ? unique([...without, ...command.entityIds]) : without;
        if (entityIds.join('|') === group.entityIds.join('|')) return group;
        changedGroups.push(group.id);
        return { ...group, entityIds, version: group.version + 1 };
      });
      return {
        document: advance(document, { groups }),
        affectedEntities: unique([...command.entityIds, ...changedGroups]),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'apply_constraint': {
      const ids = command.constraints.map(({ id }) => id);
      ensureUniqueCommandIds(ids, 'apply_constraint');
      if (ids.some((id) => document.constraints.some((constraint) => constraint.id === id))) {
        throw new TypeError('Constraint IDs must be new.');
      }
      command.constraints.forEach(validateConstraintInput);
      ensureReferencedEntities(document, command.constraints.flatMap(constraintEntityIds));
      const parameterIds = new Set(document.parameters.map(({ id }) => id));
      if (
        command.constraints.some(
          ({ value }) => typeof value === 'object' && !parameterIds.has(value.parameterId),
        )
      ) {
        throw new TypeError('A constraint parameter reference is unknown.');
      }
      return {
        document: advance(document, {
          constraints: [
            ...document.constraints,
            ...command.constraints.map((constraint) => ({ ...constraint, version: 1 })),
          ],
        }),
        affectedEntities: unique([...ids, ...command.constraints.flatMap(constraintEntityIds)]),
        addedConstraints: ids,
        removedConstraints: [],
      };
    }
    case 'remove_constraint': {
      ensureUniqueCommandIds(command.constraintIds, 'remove_constraint');
      const existing = new Set(document.constraints.map(({ id }) => id));
      if (command.constraintIds.some((id) => !existing.has(id))) {
        throw new TypeError('A constraint reference is unknown.');
      }
      return {
        document: advance(document, {
          constraints: document.constraints.filter(({ id }) => !command.constraintIds.includes(id)),
        }),
        affectedEntities: unique(command.constraintIds),
        addedConstraints: [],
        removedConstraints: unique(command.constraintIds),
      };
    }
    case 'set_dimension': {
      const ids = command.dimensions.map(({ id }) => id);
      ensureUniqueCommandIds(ids, 'set_dimension');
      command.dimensions.forEach(validateDimensionInput);
      ensureReferencedEntities(
        document,
        command.dimensions.flatMap(({ refs }) => refs.map(({ entityId }) => entityId)),
      );
      const updates = new Map(command.dimensions.map((dimension) => [dimension.id, dimension]));
      const existingIds = new Set(document.dimensions.map(({ id }) => id));
      const dimensions = [
        ...document.dimensions.map((dimension) => {
          const update = updates.get(dimension.id);
          return update ? { ...update, version: dimension.version + 1 } : dimension;
        }),
        ...command.dimensions
          .filter(({ id }) => !existingIds.has(id))
          .map((dimension) => Object.assign({}, dimension, { version: 1 })),
      ];
      return {
        document: advance(document, { dimensions }),
        affectedEntities: unique([
          ...ids,
          ...command.dimensions.flatMap(({ refs }) => refs.map(({ entityId }) => entityId)),
        ]),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
  }
  return assertNever(command);
}
