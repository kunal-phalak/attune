import { instantiateMechanicalRecipe, mergeRecipeParameterChanges } from '../recipes/mechanical';
import type {
  DesignRequestContext,
  MechanicalRecipeId,
  RecipeParameterValues,
  RecipePlacement,
} from '../recipes/types';
import { constraintEntityIds, validateConstraintInput, type ConstraintInput } from './constraints';
import { validateDimensionInput, type DimensionInput } from './dimensions';
import {
  createSketchDocument,
  moveSketchNode,
  publicReferenceVersion,
  type SketchDocument,
} from './document';
import {
  arcPoint,
  ellipseFocusPoint,
  geometryNodeIds,
  synchronizeGeometryWithNodes,
  validateGeometryEntity,
  type GeometryInput,
  type GeometryPatch,
  type SketchPoint2D,
} from './geometry';
import { validateGroupInput, type GroupInput } from './groups';
import { ensureGeometryTopology, incidentEntityIds } from './topology';
import { trimGeometryAtPoint } from './trim';

export type SketchCommand =
  | {
      readonly type: 'instantiate_recipe';
      readonly sourceRef: string;
      readonly recipe: MechanicalRecipeId;
      readonly parameters: RecipeParameterValues;
      readonly placement?: RecipePlacement;
      readonly designRequest?: DesignRequestContext;
    }
  | {
      readonly type: 'update_recipe_parameters';
      readonly sourceRef: string;
      readonly expectedVersion?: number;
      readonly changes: RecipeParameterValues;
      readonly placement?: RecipePlacement;
    }
  | {
      readonly type: 'set_radius';
      readonly target: { readonly entityId: string; readonly expectedVersion: number };
      readonly radius: number;
    }
  | {
      readonly type: 'set_tangent';
      readonly targets: readonly [
        { readonly entityId: string; readonly expectedVersion: number },
        { readonly entityId: string; readonly expectedVersion: number },
      ];
      readonly constraintId: string;
    }
  | {
      readonly type: 'create_geometry';
      readonly entities: readonly GeometryInput[];
      readonly groupId?: string;
      readonly group?: GroupInput;
      readonly constraints?: readonly ConstraintInput[];
    }
  | { readonly type: 'edit_geometry'; readonly entities: readonly GeometryPatch[] }
  | { readonly type: 'move_node'; readonly nodeId: string; readonly position: SketchPoint2D }
  | {
      readonly type: 'transform_geometry';
      readonly entityIds: readonly string[];
      readonly pivot: SketchPoint2D;
      readonly translation?: SketchPoint2D;
      readonly rotation?: number;
      readonly scale?: number;
    }
  | { readonly type: 'trim_geometry'; readonly entityId: string; readonly pickPoint: SketchPoint2D }
  | { readonly type: 'delete_geometry'; readonly entityIds: readonly string[] }
  | {
      readonly type: 'set_construction';
      readonly entityIds: readonly string[];
      readonly construction: boolean;
    }
  | { readonly type: 'create_group'; readonly groups: readonly GroupInput[] }
  | { readonly type: 'rename_group'; readonly groupId: string; readonly name: string }
  | {
      readonly type: 'move_to_group';
      readonly entityIds: readonly string[];
      readonly groupId: string;
    }
  | { readonly type: 'apply_constraint'; readonly constraints: readonly ConstraintInput[] }
  | { readonly type: 'remove_constraint'; readonly constraintIds: readonly string[] }
  | { readonly type: 'set_dimension'; readonly dimensions: readonly DimensionInput[] }
  | { readonly type: 'remove_dimension'; readonly dimensionIds: readonly string[] }
  | { readonly type: 'restore_sketch'; readonly snapshot: SketchSnapshotInput };

export interface SketchSnapshotInput {
  readonly name: string;
  readonly entities: readonly GeometryInput[];
  readonly constraints: readonly ConstraintInput[];
  readonly dimensions: readonly DimensionInput[];
  readonly groups: readonly GroupInput[];
  readonly parameters: readonly {
    readonly id: string;
    readonly name: string;
    readonly value: number;
    readonly unit: 'mm' | 'deg' | 'unitless';
  }[];
}

function withIncrementedVersions<T extends { readonly id: string; readonly version: number }>(
  next: readonly T[],
  current: readonly T[],
): readonly T[] {
  return next.map((entry) => {
    const previous = current.find(({ id }) => id === entry.id);
    return Object.assign({}, entry, { version: (previous?.version ?? 0) + 1 });
  });
}

export type SketchCommandType = SketchCommand['type'];

export interface CommandFootprint {
  readonly documentId: string;
  readonly documentRevision: number;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly versions: Readonly<Record<string, number>>;
  readonly entityIds: readonly string[];
  readonly nodeIds: readonly string[];
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
    'instantiate_recipe',
    'update_recipe_parameters',
    'set_radius',
    'set_tangent',
    'create_geometry',
    'edit_geometry',
    'move_node',
    'transform_geometry',
    'trim_geometry',
    'delete_geometry',
    'set_construction',
    'create_group',
    'rename_group',
    'move_to_group',
    'apply_constraint',
    'remove_constraint',
    'set_dimension',
    'remove_dimension',
    'restore_sketch',
  ].includes(command.type);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].toSorted();
}

export function commandSemanticReferences(command: SketchCommand): readonly string[] {
  switch (command.type) {
    case 'instantiate_recipe':
      return [command.sourceRef];
    case 'update_recipe_parameters':
      return [command.sourceRef];
    case 'set_radius':
      return [command.target.entityId];
    case 'set_tangent':
      return unique([...command.targets.map(({ entityId }) => entityId), command.constraintId]);
    case 'create_geometry':
      return unique([
        ...command.entities.map(({ id }) => id),
        ...(command.groupId ? [command.groupId] : []),
        ...(command.group ? [command.group.id] : []),
        ...(command.constraints?.map(({ id }) => id) ?? []),
      ]);
    case 'edit_geometry':
      return unique(command.entities.map(({ id }) => id));
    case 'move_node':
      return [command.nodeId];
    case 'transform_geometry':
    case 'delete_geometry':
    case 'set_construction':
      return unique(command.entityIds);
    case 'trim_geometry':
      return [command.entityId];
    case 'create_group':
      return unique(command.groups.map(({ id }) => id));
    case 'rename_group':
      return [command.groupId];
    case 'move_to_group':
      return unique([...command.entityIds, command.groupId]);
    case 'apply_constraint':
      return unique([
        ...command.constraints.map(({ id }) => id),
        ...command.constraints.flatMap(constraintEntityIds),
      ]);
    case 'remove_constraint':
      return unique(command.constraintIds);
    case 'set_dimension':
      return unique([
        ...command.dimensions.map(({ id }) => id),
        ...command.dimensions.flatMap(({ refs }) => refs.map(({ entityId }) => entityId)),
      ]);
    case 'remove_dimension':
      return unique(command.dimensionIds);
    case 'restore_sketch':
      return ['sketch:document'];
    default:
      return assertNever(command);
  }
}

export function commandExpectedVersions(command: SketchCommand): Readonly<Record<string, number>> {
  if (command.type === 'set_radius') {
    return { [command.target.entityId]: command.target.expectedVersion };
  }
  if (command.type === 'set_tangent') {
    return Object.fromEntries(
      command.targets.map(({ entityId, expectedVersion }) => [entityId, expectedVersion]),
    );
  }
  if (command.type === 'update_recipe_parameters' && command.expectedVersion !== undefined) {
    return { [command.sourceRef]: command.expectedVersion };
  }
  return {};
}

function solverAffectedEntityIds(
  document: SketchDocument,
  seedEntityIds: readonly string[],
): readonly string[] {
  const affectedEntities = new Set(seedEntityIds);
  const affectedNodes = new Set(
    document.entities.filter(({ id }) => affectedEntities.has(id)).flatMap(geometryNodeIds),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const entity of document.entities) {
      const entityNodes = geometryNodeIds(entity);
      if (
        !affectedEntities.has(entity.id) &&
        entityNodes.some((nodeId) => affectedNodes.has(nodeId))
      ) {
        affectedEntities.add(entity.id);
        entityNodes.forEach((nodeId) => affectedNodes.add(nodeId));
        changed = true;
      }
    }
    for (const constraint of document.constraints) {
      const refs = constraintEntityIds(constraint);
      if (refs.some((id) => affectedEntities.has(id))) {
        for (const id of refs) {
          if (!affectedEntities.has(id)) {
            affectedEntities.add(id);
            changed = true;
          }
        }
      }
    }
    for (const entity of document.entities) {
      if (!affectedEntities.has(entity.id)) continue;
      for (const nodeId of geometryNodeIds(entity)) {
        if (!affectedNodes.has(nodeId)) {
          affectedNodes.add(nodeId);
          changed = true;
        }
      }
    }
  }
  return unique([...affectedEntities]);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported sketch command value: ${String(value)}`);
}

function recipeRootGroupIds(
  document: SketchDocument,
  entityIds: readonly string[],
): readonly string[] {
  const selected = new Set(entityIds);
  const roots = new Set<string>();
  for (const root of document.groups.filter(
    ({ sourceRef }) => sourceRef?.kind === 'design-recipe',
  )) {
    const descendants = new Set([root.id]);
    let discovered = true;
    while (discovered) {
      discovered = false;
      for (const group of document.groups) {
        if (
          !descendants.has(group.id) &&
          group.parentGroupId &&
          descendants.has(group.parentGroupId)
        ) {
          descendants.add(group.id);
          discovered = true;
        }
      }
    }
    if (
      document.groups
        .filter(({ id }) => descendants.has(id))
        .some(({ entityIds: grouped }) => grouped.some((id) => selected.has(id)))
    ) {
      roots.add(root.id);
    }
  }
  return [...roots].toSorted();
}

function footprintReferences(document: SketchDocument, command: SketchCommand) {
  switch (command.type) {
    case 'instantiate_recipe': {
      const fragment = instantiateMechanicalRecipe(command).document;
      return {
        reads: [],
        writes: unique([
          ...fragment.nodes.map(({ id }) => id),
          ...fragment.entities.map(({ id }) => id),
          ...fragment.groups.map(({ id }) => id),
          ...fragment.parameters.map(({ id }) => id),
        ]),
      };
    }
    case 'update_recipe_parameters': {
      const root = document.groups.find(({ id }) => id === command.sourceRef);
      const groupIds = new Set([command.sourceRef]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const group of document.groups) {
          if (!groupIds.has(group.id) && group.parentGroupId && groupIds.has(group.parentGroupId)) {
            groupIds.add(group.id);
            changed = true;
          }
        }
      }
      const descendantEntityIds = document.groups
        .filter(({ id }) => groupIds.has(id))
        .flatMap(({ entityIds }) => entityIds);
      const regenerated =
        root?.sourceRef?.kind === 'design-recipe'
          ? instantiateMechanicalRecipe({
              sourceRef: root.sourceRef.sourceRef,
              recipe: root.sourceRef.recipeId,
              parameters: mergeRecipeParameterChanges(root.sourceRef.parameters, command.changes),
              placement: command.placement ?? root.sourceRef.placement,
              ...(root.sourceRef.designRequest
                ? { designRequest: root.sourceRef.designRequest }
                : {}),
              status: 'regenerated',
            }).document
          : undefined;
      return {
        reads: unique([command.sourceRef, ...descendantEntityIds]),
        writes: unique([
          command.sourceRef,
          ...groupIds,
          ...descendantEntityIds,
          ...document.parameters
            .filter(({ id }) => id.startsWith(`${command.sourceRef}:parameter:`))
            .map(({ id }) => id),
          ...(root?.childGroupIds ?? []),
          ...(regenerated?.nodes.map(({ id }) => id) ?? []),
          ...(regenerated?.entities.map(({ id }) => id) ?? []),
          ...(regenerated?.groups.map(({ id }) => id) ?? []),
          ...(regenerated?.parameters.map(({ id }) => id) ?? []),
        ]),
      };
    }
    case 'set_radius':
      return {
        reads: [command.target.entityId],
        writes: unique([
          ...solverAffectedEntityIds(document, [command.target.entityId]),
          ...recipeRootGroupIds(document, [command.target.entityId]),
        ]),
      };
    case 'set_tangent': {
      const targets = command.targets.map(({ entityId }) => entityId);
      const connected = solverAffectedEntityIds(document, targets);
      return {
        reads: connected,
        writes: unique([...connected, command.constraintId]),
      };
    }
    case 'create_geometry': {
      const referencedEntities = command.constraints?.flatMap(constraintEntityIds) ?? [];
      const existingRefs = referencedEntities.filter((id) =>
        document.entities.some((entity) => entity.id === id),
      );
      return {
        reads: unique([...(command.groupId ? [command.groupId] : []), ...existingRefs]),
        writes: unique([
          ...command.entities.map(({ id }) => id),
          ...solverAffectedEntityIds(document, existingRefs),
          ...(command.groupId ? [command.groupId] : []),
          ...(command.group ? [command.group.id] : []),
          ...(command.group?.parentGroupId ? [command.group.parentGroupId] : []),
          ...(command.constraints?.map(({ id }) => id) ?? []),
        ]),
      };
    }
    case 'edit_geometry': {
      const entityIds = command.entities.map(({ id }) => id);
      return {
        reads: [],
        writes: unique([...entityIds, ...recipeRootGroupIds(document, entityIds)]),
      };
    }
    case 'move_node': {
      const incident = incidentEntityIds(document.entities, command.nodeId);
      const connected = solverAffectedEntityIds(document, incident);
      return {
        reads: unique([...incident, ...connected]),
        writes: unique([
          command.nodeId,
          ...connected,
          ...document.entities.filter(({ id }) => connected.includes(id)).flatMap(geometryNodeIds),
        ]),
      };
    }
    case 'transform_geometry': {
      const connected = solverAffectedEntityIds(document, command.entityIds);
      const nodeIds = unique(
        document.entities.filter(({ id }) => connected.includes(id)).flatMap(geometryNodeIds),
      );
      return {
        reads: connected,
        writes: unique([
          ...connected,
          ...nodeIds,
          ...nodeIds.flatMap((id) => incidentEntityIds(document.entities, id)),
        ]),
      };
    }
    case 'trim_geometry': {
      const target = document.entities.find(({ id }) => id === command.entityId);
      const replacementIds = target
        ? trimGeometryAtPoint(document.entities, command.entityId, command.pickPoint).map(
            ({ id }) => id,
          )
        : [];
      return {
        reads: document.entities.map(({ id }) => id),
        writes: unique([
          command.entityId,
          ...replacementIds,
          ...(target ? geometryNodeIds(target) : []),
          ...document.groups
            .filter(({ entityIds }) => entityIds.includes(command.entityId))
            .map(({ id }) => id),
          ...document.constraints
            .filter(({ refs }) => refs.some(({ entityId }) => entityId === command.entityId))
            .map(({ id }) => id),
          ...document.dimensions
            .filter(({ refs }) => refs.some(({ entityId }) => entityId === command.entityId))
            .map(({ id }) => id),
        ]),
      };
    }
    case 'set_construction':
      return { reads: [], writes: command.entityIds };
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
        reads: command.groups.flatMap(({ entityIds, childGroupIds, parentGroupId }) => [
          ...entityIds,
          ...(childGroupIds ?? []),
          ...(parentGroupId ? [parentGroupId] : []),
        ]),
        writes: unique([
          ...command.groups.map(({ id }) => id),
          ...command.groups.flatMap(({ parentGroupId }) => (parentGroupId ? [parentGroupId] : [])),
        ]),
      };
    case 'rename_group':
      return { reads: [command.groupId], writes: [command.groupId] };
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
    case 'apply_constraint': {
      const referenced = unique(command.constraints.flatMap(constraintEntityIds));
      const connected = solverAffectedEntityIds(document, referenced);
      return {
        reads: connected,
        writes: unique([...connected, ...command.constraints.map(({ id }) => id)]),
      };
    }
    case 'remove_constraint':
      return { reads: [], writes: command.constraintIds };
    case 'set_dimension': {
      const referenced = unique(
        command.dimensions.flatMap(({ refs }) => refs.map(({ entityId }) => entityId)),
      );
      const connected = solverAffectedEntityIds(document, referenced);
      return {
        reads: connected,
        writes: unique([...connected, ...command.dimensions.map(({ id }) => id)]),
      };
    }
    case 'remove_dimension':
      return { reads: [], writes: command.dimensionIds };
    case 'restore_sketch':
      return {
        reads: unique([
          ...document.nodes.map(({ id }) => id),
          ...document.entities.map(({ id }) => id),
          ...document.constraints.map(({ id }) => id),
          ...document.dimensions.map(({ id }) => id),
          ...document.groups.map(({ id }) => id),
          ...document.parameters.map(({ id }) => id),
        ]),
        writes: unique([
          ...document.nodes.map(({ id }) => id),
          ...document.entities.map(({ id }) => id),
          ...document.constraints.map(({ id }) => id),
          ...document.dimensions.map(({ id }) => id),
          ...document.groups.map(({ id }) => id),
          ...document.parameters.map(({ id }) => id),
          ...command.snapshot.entities.map(({ id }) => id),
          ...command.snapshot.constraints.map(({ id }) => id),
          ...command.snapshot.dimensions.map(({ id }) => id),
          ...command.snapshot.groups.map(({ id }) => id),
          ...command.snapshot.parameters.map(({ id }) => id),
        ]),
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
  const nodeIds = new Set((document.nodes ?? []).map(({ id }) => id));
  const groupIds = new Set(document.groups.map(({ id }) => id));
  const constraintIds = new Set(document.constraints.map(({ id }) => id));
  const dimensionIds = new Set(document.dimensions.map(({ id }) => id));
  if (command.type === 'instantiate_recipe') {
    const fragment = instantiateMechanicalRecipe(command).document;
    fragment.entities.forEach(({ id }) => entityIds.add(id));
    fragment.nodes.forEach(({ id }) => nodeIds.add(id));
    fragment.groups.forEach(({ id }) => groupIds.add(id));
  }
  if (command.type === 'update_recipe_parameters') {
    const root = document.groups.find(({ id }) => id === command.sourceRef);
    if (root?.sourceRef?.kind === 'design-recipe') {
      const fragment = instantiateMechanicalRecipe({
        sourceRef: root.sourceRef.sourceRef,
        recipe: root.sourceRef.recipeId,
        parameters: mergeRecipeParameterChanges(root.sourceRef.parameters, command.changes),
        placement: command.placement ?? root.sourceRef.placement,
        ...(root.sourceRef.designRequest ? { designRequest: root.sourceRef.designRequest } : {}),
        status: 'regenerated',
      }).document;
      fragment.entities.forEach(({ id }) => entityIds.add(id));
      fragment.nodes.forEach(({ id }) => nodeIds.add(id));
      fragment.groups.forEach(({ id }) => groupIds.add(id));
    }
  }
  if (command.type === 'set_tangent') constraintIds.add(command.constraintId);
  if (command.type === 'create_geometry') command.entities.forEach(({ id }) => entityIds.add(id));
  if (command.type === 'trim_geometry') {
    trimGeometryAtPoint(document.entities, command.entityId, command.pickPoint).forEach(({ id }) =>
      entityIds.add(id),
    );
  }
  if (command.type === 'create_group') command.groups.forEach(({ id }) => groupIds.add(id));
  if (command.type === 'apply_constraint') {
    command.constraints.forEach(({ id }) => constraintIds.add(id));
  }
  if (command.type === 'set_dimension') {
    command.dimensions.forEach(({ id }) => dimensionIds.add(id));
  }
  if (command.type === 'create_geometry') {
    if (command.group) groupIds.add(command.group.id);
    command.constraints?.forEach(({ id }) => constraintIds.add(id));
  }
  if (command.type === 'restore_sketch') {
    command.snapshot.entities.forEach(({ id }) => entityIds.add(id));
    command.snapshot.constraints.forEach(({ id }) => constraintIds.add(id));
    command.snapshot.dimensions.forEach(({ id }) => dimensionIds.add(id));
    command.snapshot.groups.forEach(({ id }) => groupIds.add(id));
  }
  return {
    documentId: document.id,
    documentRevision: document.revision,
    reads,
    writes,
    versions,
    entityIds: allReferences.filter((id) => entityIds.has(id)),
    nodeIds: allReferences.filter((id) => nodeIds.has(id)),
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

function modifiedRecipeGroups(
  document: SketchDocument,
  entityIds: readonly string[],
): { readonly groups: SketchDocument['groups']; readonly changedGroupIds: readonly string[] } {
  const changed = new Set(recipeRootGroupIds(document, entityIds));
  return {
    groups: document.groups.map((group) =>
      changed.has(group.id) && group.sourceRef?.kind === 'design-recipe'
        ? {
            ...group,
            version: group.version + 1,
            sourceRef: { ...group.sourceRef, status: 'modified' as const },
          }
        : group,
    ),
    changedGroupIds: [...changed].toSorted(),
  };
}

function samePoint(first: SketchPoint2D, second: SketchPoint2D): boolean {
  return first.x === second.x && first.y === second.y;
}

function finitePoint(point: SketchPoint2D, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} requires finite coordinates.`);
  }
}

function fixedNodeIds(document: SketchDocument): ReadonlySet<string> {
  const fixedEntities = new Set(
    document.constraints.filter(({ type }) => type === 'fixed').flatMap(constraintEntityIds),
  );
  return new Set(
    document.entities.filter(({ id }) => fixedEntities.has(id)).flatMap(geometryNodeIds),
  );
}

function transformPoint(
  point: SketchPoint2D,
  pivot: SketchPoint2D,
  translation: SketchPoint2D,
  rotation: number,
  scale: number,
): SketchPoint2D {
  const dx = (point.x - pivot.x) * scale;
  const dy = (point.y - pivot.y) * scale;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: pivot.x + dx * cosine - dy * sine + translation.x,
    y: pivot.y + dx * sine + dy * cosine + translation.y,
  };
}

function transformGeometryWithTopology(
  document: SketchDocument,
  command: Extract<SketchCommand, { type: 'transform_geometry' }>,
): { readonly document: SketchDocument; readonly affected: readonly string[] } {
  ensureUniqueCommandIds(command.entityIds, 'transform_geometry');
  ensureReferencedEntities(document, command.entityIds);
  finitePoint(command.pivot, 'transform_geometry.pivot');
  const translation = command.translation ?? { x: 0, y: 0 };
  finitePoint(translation, 'transform_geometry.translation');
  const rotation = command.rotation ?? 0;
  const scale = command.scale ?? 1;
  if (!Number.isFinite(rotation) || !Number.isFinite(scale) || scale <= 0) {
    throw new TypeError(
      'transform_geometry requires a finite rotation and positive uniform scale.',
    );
  }
  const selected = new Set(command.entityIds);
  const nodeIds = new Set(
    document.entities.filter(({ id }) => selected.has(id)).flatMap(geometryNodeIds),
  );
  const locked = fixedNodeIds(document);
  if ([...nodeIds].some((id) => locked.has(id))) {
    throw new TypeError(
      'Fixed geometry cannot be transformed until its Fix constraint is removed.',
    );
  }
  const nodes = document.nodes.map((node) =>
    nodeIds.has(node.id)
      ? {
          ...node,
          version: node.version + 1,
          position: transformPoint(node.position, command.pivot, translation, rotation, scale),
        }
      : node,
  );
  const incident = new Set(
    [...nodeIds].flatMap((nodeId) => incidentEntityIds(document.entities, nodeId)),
  );
  const intrinsic = document.entities.map((entity) => {
    if (!selected.has(entity.id) || scale === 1) return entity;
    if (entity.kind === 'circle' || entity.kind === 'arc') {
      return { ...entity, radius: entity.radius * scale };
    }
    if (entity.kind === 'ellipse') {
      return {
        ...entity,
        majorRadius: entity.majorRadius * scale,
        minorRadius: entity.minorRadius * scale,
      };
    }
    return entity;
  });
  const entities = synchronizeGeometryWithNodes(intrinsic, nodes).map((entity) =>
    incident.has(entity.id) || selected.has(entity.id)
      ? Object.assign({}, entity, { version: entity.version + 1 })
      : entity,
  );
  const source =
    document.source && nodeIds.size > 0
      ? {
          ...document.source,
          status: 'modified' as const,
          modifiedNodeIds: [
            ...new Set([...(document.source.modifiedNodeIds ?? []), ...nodeIds]),
          ].toSorted(),
        }
      : document.source;
  return {
    document: advance(document, { nodes, entities, source }),
    affected: unique([...command.entityIds, ...nodeIds, ...incident]),
  };
}

function editGeometryWithTopology(
  document: SketchDocument,
  patches: ReadonlyMap<string, GeometryPatch>,
): {
  readonly entities: SketchDocument['entities'];
  readonly nodes: SketchDocument['nodes'];
  readonly source: SketchDocument['source'];
} {
  const positions = new Map<string, SketchPoint2D>();
  const patched = document.entities.map((entity) => {
    const patch = patches.get(entity.id);
    if (!patch) return entity;
    if (patch.kind !== entity.kind) throw new TypeError(`${entity.id} cannot change kind.`);
    const next = { ...entity, ...patch, version: entity.version + 1 } as typeof entity;
    validateGeometryEntity(next);
    if (next.kind === 'point' && next.nodeId) positions.set(next.nodeId, next.position);
    if (next.kind === 'line') {
      if (next.startNodeId) positions.set(next.startNodeId, next.start);
      if (next.endNodeId) positions.set(next.endNodeId, next.end);
    }
    if (next.kind === 'circle' && next.centerNodeId) positions.set(next.centerNodeId, next.center);
    if (next.kind === 'arc') {
      if (next.centerNodeId) positions.set(next.centerNodeId, next.center);
      if (next.startNodeId) positions.set(next.startNodeId, arcPoint(next, next.startAngle));
      if (next.endNodeId) positions.set(next.endNodeId, arcPoint(next, next.endAngle));
    }
    if (next.kind === 'ellipse') {
      if (next.centerNodeId) positions.set(next.centerNodeId, next.center);
      if (next.focusNodeId) positions.set(next.focusNodeId, ellipseFocusPoint(next));
    }
    if (next.kind === 'bspline') {
      next.controlNodeIds?.forEach((id, index) => {
        const point = next.controlPoints[index];
        if (point) positions.set(id, point);
      });
    }
    return next;
  });
  const modifiedNodeIds: string[] = [];
  const nodes = (document.nodes ?? []).map((node) => {
    const position = positions.get(node.id);
    if (!position || samePoint(position, node.position)) return node;
    modifiedNodeIds.push(node.id);
    return Object.assign({}, node, { position, version: node.version + 1 });
  });
  const source =
    document.source && modifiedNodeIds.length > 0
      ? {
          ...document.source,
          status: 'modified' as const,
          modifiedNodeIds: [
            ...new Set([...(document.source.modifiedNodeIds ?? []), ...modifiedNodeIds]),
          ].toSorted(),
        }
      : document.source;
  return { entities: synchronizeGeometryWithNodes(patched, nodes), nodes, source };
}

export function applySketchCommand(
  source: SketchDocument,
  command: SketchCommand,
): SketchCommandApplication {
  const document = structuredClone(source);
  switch (command.type) {
    case 'instantiate_recipe': {
      const fragment = instantiateMechanicalRecipe(command).document;
      const existing = new Set([
        ...document.nodes.map(({ id }) => id),
        ...document.entities.map(({ id }) => id),
        ...document.groups.map(({ id }) => id),
        ...document.parameters.map(({ id }) => id),
      ]);
      const incoming = [
        ...fragment.nodes.map(({ id }) => id),
        ...fragment.entities.map(({ id }) => id),
        ...fragment.groups.map(({ id }) => id),
        ...fragment.parameters.map(({ id }) => id),
      ];
      if (incoming.some((id) => existing.has(id))) {
        throw new TypeError(`Recipe sourceRef ${command.sourceRef} already exists.`);
      }
      return {
        document: advance(document, {
          nodes: [...document.nodes, ...fragment.nodes].toSorted((left, right) =>
            left.id.localeCompare(right.id),
          ),
          entities: [...document.entities, ...fragment.entities].toSorted((left, right) =>
            left.id.localeCompare(right.id),
          ),
          groups: [...document.groups, ...fragment.groups].toSorted((left, right) =>
            left.id.localeCompare(right.id),
          ),
          parameters: [...document.parameters, ...fragment.parameters].toSorted((left, right) =>
            left.id.localeCompare(right.id),
          ),
        }),
        affectedEntities: unique(incoming),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'update_recipe_parameters': {
      const root = document.groups.find(({ id }) => id === command.sourceRef);
      if (!root || root.sourceRef?.kind !== 'design-recipe') {
        throw new TypeError(`Unknown recipe source reference ${command.sourceRef}.`);
      }
      if (root.sourceRef.status === 'modified') {
        throw new TypeError(
          `Recipe source ${command.sourceRef} has direct geometry edits and cannot be safely regenerated.`,
        );
      }
      if (command.expectedVersion !== undefined && root.version !== command.expectedVersion) {
        throw new TypeError(`Recipe source ${command.sourceRef} changed after inspection.`);
      }
      const groupIds = new Set([root.id]);
      let discovered = true;
      while (discovered) {
        discovered = false;
        for (const group of document.groups) {
          if (
            !groupIds.has(group.id) &&
            ((group.parentGroupId && groupIds.has(group.parentGroupId)) ||
              [...groupIds].some((id) =>
                document.groups
                  .find((candidate) => candidate.id === id)
                  ?.childGroupIds?.includes(group.id),
              ))
          ) {
            groupIds.add(group.id);
            discovered = true;
          }
        }
      }
      const replacedEntityIds = new Set(
        document.groups.filter(({ id }) => groupIds.has(id)).flatMap(({ entityIds }) => entityIds),
      );
      const fragment = instantiateMechanicalRecipe({
        sourceRef: root.sourceRef.sourceRef,
        recipe: root.sourceRef.recipeId,
        parameters: mergeRecipeParameterChanges(root.sourceRef.parameters, command.changes),
        placement: command.placement ?? root.sourceRef.placement,
        ...(root.sourceRef.designRequest ? { designRequest: root.sourceRef.designRequest } : {}),
        status: 'regenerated',
      }).document;
      const retainedEntities = document.entities.filter(({ id }) => !replacedEntityIds.has(id));
      const retainedNodeIds = new Set(retainedEntities.flatMap(geometryNodeIds));
      const retainedNodes = document.nodes.filter(({ id }) => retainedNodeIds.has(id));
      const previousEntities = new Map(document.entities.map((entity) => [entity.id, entity]));
      const previousNodes = new Map(document.nodes.map((node) => [node.id, node]));
      const previousGroups = new Map(document.groups.map((group) => [group.id, group]));
      const previousParameters = new Map(
        document.parameters.map((parameter) => [parameter.id, parameter]),
      );
      const nextEntities = fragment.entities.map((entity) => {
        const previous = previousEntities.get(entity.id);
        return previous ? { ...entity, version: previous.version + 1 } : entity;
      });
      const nextNodes = fragment.nodes.map((node) => {
        const previous = previousNodes.get(node.id);
        return previous ? { ...node, version: previous.version + 1 } : node;
      });
      const nextGroups = fragment.groups.map((group) => {
        const previous = previousGroups.get(group.id);
        return previous ? { ...group, version: previous.version + 1 } : group;
      });
      const nextParameters = fragment.parameters.map((parameter) => {
        const previous = previousParameters.get(parameter.id);
        return previous ? { ...parameter, version: previous.version + 1 } : parameter;
      });
      const currentRecipeParameterIds = new Set(
        document.parameters
          .filter(({ id }) => id.startsWith(`${command.sourceRef}:parameter:`))
          .map(({ id }) => id),
      );
      const currentConstraintIds = document.constraints
        .filter(({ refs }) =>
          refs.some(
            ({ entityId }) =>
              replacedEntityIds.has(entityId) && !nextEntities.some(({ id }) => id === entityId),
          ),
        )
        .map(({ id }) => id);
      return {
        document: advance(document, {
          nodes: [...retainedNodes, ...nextNodes].toSorted((left, right) =>
            left.id.localeCompare(right.id),
          ),
          entities: [...retainedEntities, ...nextEntities].toSorted((left, right) =>
            left.id.localeCompare(right.id),
          ),
          groups: [
            ...document.groups.filter(({ id }) => !groupIds.has(id)),
            ...nextGroups,
          ].toSorted((left, right) => left.id.localeCompare(right.id)),
          parameters: [
            ...document.parameters.filter(({ id }) => !currentRecipeParameterIds.has(id)),
            ...nextParameters,
          ].toSorted((left, right) => left.id.localeCompare(right.id)),
          constraints: document.constraints.filter(({ id }) => !currentConstraintIds.includes(id)),
          dimensions: document.dimensions.filter(
            ({ refs }) =>
              !refs.some(
                ({ entityId }) =>
                  replacedEntityIds.has(entityId) &&
                  !nextEntities.some(({ id }) => id === entityId),
              ),
          ),
        }),
        affectedEntities: unique([
          ...replacedEntityIds,
          ...fragment.entities.map(({ id }) => id),
          ...groupIds,
          ...currentRecipeParameterIds,
          ...fragment.parameters.map(({ id }) => id),
          ...currentConstraintIds,
        ]),
        addedConstraints: [],
        removedConstraints: currentConstraintIds,
      };
    }
    case 'set_radius': {
      const target = document.entities.find(({ id }) => id === command.target.entityId);
      if (!target || (target.kind !== 'circle' && target.kind !== 'arc')) {
        throw new TypeError(`Radius target ${command.target.entityId} must be a circle or arc.`);
      }
      if (target.version !== command.target.expectedVersion) {
        throw new TypeError(`Radius target ${target.id} changed after inspection.`);
      }
      if (!Number.isFinite(command.radius) || command.radius <= 0) {
        throw new TypeError('set_radius requires a positive finite radius.');
      }
      const patch =
        target.kind === 'circle'
          ? { id: target.id, kind: target.kind, center: target.center, radius: command.radius }
          : {
              id: target.id,
              kind: target.kind,
              center: target.center,
              radius: command.radius,
              startAngle: target.startAngle,
              endAngle: target.endAngle,
            };
      const edited = editGeometryWithTopology(document, new Map([[target.id, patch]]));
      const provenance = modifiedRecipeGroups(document, [target.id]);
      return {
        document: advance(document, { ...edited, groups: provenance.groups }),
        affectedEntities: unique([target.id, ...provenance.changedGroupIds]),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'set_tangent': {
      const targets = command.targets.map(({ entityId }) => entityId);
      ensureUniqueCommandIds(targets, 'set_tangent.targets');
      const entities = command.targets.map((expected) => {
        const entity = document.entities.find(({ id }) => id === expected.entityId);
        if (!entity) throw new TypeError(`Unknown tangent target ${expected.entityId}.`);
        if (entity.version !== expected.expectedVersion) {
          throw new TypeError(`Tangent target ${expected.entityId} changed after inspection.`);
        }
        return entity;
      });
      if (
        !entities.some(({ kind }) => kind === 'line') ||
        !entities.some(({ kind }) => kind === 'circle' || kind === 'arc')
      ) {
        throw new TypeError('set_tangent requires one line and one circle or arc.');
      }
      if (document.constraints.some(({ id }) => id === command.constraintId)) {
        throw new TypeError(`Constraint ${command.constraintId} already exists.`);
      }
      const constraint = {
        id: command.constraintId,
        version: 1,
        type: 'tangent' as const,
        refs: targets.map((entityId) => ({ entityId })),
      };
      validateConstraintInput(constraint);
      return {
        document: advance(document, {
          constraints: [...document.constraints, constraint],
        }),
        affectedEntities: unique([...targets, command.constraintId]),
        addedConstraints: [command.constraintId],
        removedConstraints: [],
      };
    }
    case 'create_geometry': {
      const ids = command.entities.map(({ id }) => id);
      ensureUniqueCommandIds(ids, 'create_geometry');
      const existing = new Set(document.entities.map(({ id }) => id));
      if (ids.some((id) => existing.has(id))) throw new TypeError('Geometry IDs must be new.');
      command.entities.forEach(validateGeometryEntity);
      if (command.groupId && command.group) {
        throw new TypeError('create_geometry accepts either groupId or a new group, not both.');
      }
      if (command.groupId && !document.groups.some(({ id }) => id === command.groupId)) {
        throw new TypeError(`Unknown target group ${command.groupId}.`);
      }
      if (command.group) {
        validateGroupInput(command.group);
        if (document.groups.some(({ id }) => id === command.group!.id)) {
          throw new TypeError('The create_geometry group ID must be new.');
        }
        const creatingIds = new Set(ids);
        if (command.group.entityIds.some((id) => !creatingIds.has(id))) {
          throw new TypeError(
            'A create_geometry group may only reference geometry in the same command.',
          );
        }
        if (
          command.group.parentGroupId &&
          !document.groups.some(({ id }) => id === command.group!.parentGroupId)
        ) {
          throw new TypeError(`Unknown parent group ${command.group.parentGroupId}.`);
        }
      }
      const combined = [
        ...document.entities,
        ...command.entities.map((entity) => ({ ...entity, version: 1 })),
      ] as typeof document.entities;
      const topology = ensureGeometryTopology(combined, document.nodes ?? []);
      const entities = topology.entities;
      let groups = command.groupId
        ? document.groups.map((group) =>
            group.id === command.groupId
              ? {
                  ...group,
                  entityIds: unique([...group.entityIds, ...ids]),
                  version: group.version + 1,
                }
              : group,
          )
        : command.group
          ? [...document.groups, { ...command.group, version: 1 }]
          : document.groups;
      if (command.group?.parentGroupId) {
        groups = groups.map((group) =>
          group.id === command.group!.parentGroupId
            ? {
                ...group,
                version: group.version + 1,
                childGroupIds: unique([...(group.childGroupIds ?? []), command.group!.id]),
              }
            : group,
        );
      }
      const nextDocument = { ...document, entities, nodes: topology.nodes, groups };
      const creatingConstraints = command.constraints ?? [];
      creatingConstraints.forEach(validateConstraintInput);
      ensureReferencedEntities(nextDocument, creatingConstraints.flatMap(constraintEntityIds));
      const constraintIds = creatingConstraints.map(({ id }) => id);
      if (constraintIds.length > 0) {
        ensureUniqueCommandIds(constraintIds, 'create_geometry.constraints');
      }
      if (
        constraintIds.some((id) => document.constraints.some((constraint) => constraint.id === id))
      ) {
        throw new TypeError('Constraint IDs must be new.');
      }
      const constraints = [
        ...document.constraints,
        ...creatingConstraints.map((constraint) => Object.assign({}, constraint, { version: 1 })),
      ];
      return {
        document: advance(document, { entities, nodes: topology.nodes, groups, constraints }),
        affectedEntities: unique([
          ...ids,
          ...(command.groupId ? [command.groupId] : []),
          ...(command.group ? [command.group.id] : []),
          ...constraintIds,
        ]),
        addedConstraints: constraintIds,
        removedConstraints: [],
      };
    }
    case 'edit_geometry': {
      const ids = command.entities.map(({ id }) => id);
      ensureUniqueCommandIds(ids, 'edit_geometry');
      ensureReferencedEntities(document, ids);
      const patches = new Map(command.entities.map((patch) => [patch.id, patch]));
      const edited = editGeometryWithTopology(document, patches);
      const provenance = modifiedRecipeGroups(document, ids);
      return {
        document: advance(document, { ...edited, groups: provenance.groups }),
        affectedEntities: unique([...ids, ...provenance.changedGroupIds]),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'move_node': {
      if (fixedNodeIds(document).has(command.nodeId)) {
        throw new TypeError('A fixed node cannot move until its Fix constraint is removed.');
      }
      const moved = moveSketchNode(document, command.nodeId, command.position);
      return {
        document: advance(document, {
          nodes: moved.nodes,
          entities: moved.entities,
          source: moved.source,
        }),
        affectedEntities: unique([
          command.nodeId,
          ...incidentEntityIds(document.entities, command.nodeId),
        ]),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'transform_geometry': {
      const transformed = transformGeometryWithTopology(document, command);
      return {
        document: transformed.document,
        affectedEntities: transformed.affected,
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'trim_geometry': {
      finitePoint(command.pickPoint, 'trim_geometry.pickPoint');
      const target = document.entities.find(({ id }) => id === command.entityId);
      if (!target) throw new TypeError(`Unknown trim target ${command.entityId}.`);
      const replacements = trimGeometryAtPoint(
        document.entities,
        command.entityId,
        command.pickPoint,
      ).map((entity) =>
        Object.assign({}, entity, {
          version: entity.id === command.entityId ? target.version + 1 : 1,
        }),
      ) as typeof document.entities;
      const replacementIds = replacements.map(({ id }) => id);
      const combined = [
        ...document.entities.filter(({ id }) => id !== command.entityId),
        ...replacements,
      ];
      const topology = ensureGeometryTopology(combined, document.nodes);
      const referencedNodes = new Set(topology.entities.flatMap(geometryNodeIds));
      const nodes = topology.nodes.filter(({ id }) => referencedNodes.has(id));
      const groups = document.groups.map((group) => {
        if (!group.entityIds.includes(command.entityId)) return group;
        return {
          ...group,
          version: group.version + 1,
          entityIds: unique(
            group.entityIds.flatMap((id) => (id === command.entityId ? replacementIds : [id])),
          ),
        };
      });
      return {
        document: advance(document, { nodes, entities: topology.entities, groups }),
        affectedEntities: unique([command.entityId, ...replacementIds]),
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
      const remainingEntities = document.entities.filter(({ id }) => !removing.has(id));
      const referencedNodes = new Set(remainingEntities.flatMap(geometryNodeIds));
      return {
        document: advance(document, {
          nodes: (document.nodes ?? []).filter(({ id }) => referencedNodes.has(id)),
          entities: remainingEntities,
          constraints,
          dimensions,
          groups,
        }),
        affectedEntities: unique([...command.entityIds, ...removedConstraints]),
        addedConstraints: [],
        removedConstraints,
      };
    }
    case 'set_construction': {
      ensureUniqueCommandIds(command.entityIds, 'set_construction');
      ensureReferencedEntities(document, command.entityIds);
      const selected = new Set(command.entityIds);
      return {
        document: advance(document, {
          entities: document.entities.map((entity) =>
            selected.has(entity.id) && entity.construction !== command.construction
              ? { ...entity, construction: command.construction, version: entity.version + 1 }
              : entity,
          ),
        }),
        affectedEntities: unique(command.entityIds),
        addedConstraints: [],
        removedConstraints: [],
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
      if (
        command.groups.some(
          ({ id, parentGroupId }) =>
            parentGroupId === id ||
            (parentGroupId !== undefined && !knownGroups.has(parentGroupId)),
        )
      ) {
        throw new TypeError('A parent group reference is unknown or self-referential.');
      }
      const parentById = new Map([
        ...document.groups.map((group) => [group.id, group.parentGroupId] as const),
        ...command.groups.map((group) => [group.id, group.parentGroupId] as const),
      ]);
      for (const id of ids) {
        const seen = new Set([id]);
        let parentId = parentById.get(id);
        while (parentId) {
          if (seen.has(parentId)) throw new TypeError('Group nesting cannot contain a cycle.');
          seen.add(parentId);
          parentId = parentById.get(parentId);
        }
      }
      const requestedParents = new Map<string, string[]>();
      for (const group of command.groups) {
        if (!group.parentGroupId) continue;
        requestedParents.set(group.parentGroupId, [
          ...(requestedParents.get(group.parentGroupId) ?? []),
          group.id,
        ]);
      }
      return {
        document: advance(document, {
          groups: [
            ...document.groups.map((group) => {
              const children = requestedParents.get(group.id);
              return children
                ? {
                    ...group,
                    version: group.version + 1,
                    childGroupIds: unique([...(group.childGroupIds ?? []), ...children]),
                  }
                : group;
            }),
            ...command.groups.map((group) => ({
              ...group,
              ...(requestedParents.has(group.id)
                ? {
                    childGroupIds: unique([
                      ...(group.childGroupIds ?? []),
                      ...(requestedParents.get(group.id) ?? []),
                    ]),
                  }
                : {}),
              version: 1,
            })),
          ],
        }),
        affectedEntities: ids,
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'rename_group': {
      const name = command.name.trim();
      if (!name) throw new TypeError('A group name is required.');
      if (name.length > 160) throw new TypeError('A group name cannot exceed 160 characters.');
      if (!document.groups.some(({ id }) => id === command.groupId)) {
        throw new TypeError(`Unknown group ${command.groupId}.`);
      }
      return {
        document: advance(document, {
          groups: document.groups.map((group) =>
            group.id === command.groupId && group.name !== name
              ? { ...group, name, version: group.version + 1 }
              : group,
          ),
        }),
        affectedEntities: [command.groupId],
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
    case 'remove_dimension': {
      ensureUniqueCommandIds(command.dimensionIds, 'remove_dimension');
      const existing = new Set(document.dimensions.map(({ id }) => id));
      if (command.dimensionIds.some((id) => !existing.has(id))) {
        throw new TypeError('A dimension reference is unknown.');
      }
      return {
        document: advance(document, {
          dimensions: document.dimensions.filter(({ id }) => !command.dimensionIds.includes(id)),
        }),
        affectedEntities: unique(command.dimensionIds),
        addedConstraints: [],
        removedConstraints: [],
      };
    }
    case 'restore_sketch': {
      const snapshot = command.snapshot;
      if (!snapshot.name.trim() || snapshot.name.length > 160) {
        throw new TypeError('A restored sketch requires a valid name.');
      }
      snapshot.entities.forEach(validateGeometryEntity);
      snapshot.constraints.forEach(validateConstraintInput);
      snapshot.dimensions.forEach(validateDimensionInput);
      snapshot.groups.forEach(validateGroupInput);
      if (
        snapshot.parameters.some(
          ({ id, name, value, unit }) =>
            !id ||
            !name.trim() ||
            !Number.isFinite(value) ||
            !['mm', 'deg', 'unitless'].includes(unit),
        )
      ) {
        throw new TypeError('The restored sketch contains an invalid parameter.');
      }
      const ids = [
        ...snapshot.entities.map(({ id }) => id),
        ...snapshot.constraints.map(({ id }) => id),
        ...snapshot.dimensions.map(({ id }) => id),
        ...snapshot.groups.map(({ id }) => id),
        ...snapshot.parameters.map(({ id }) => id),
      ];
      if (new Set(ids).size !== ids.length) {
        throw new TypeError('The restored sketch contains duplicate semantic references.');
      }
      const restored = createSketchDocument({
        id: document.id,
        name: snapshot.name.trim(),
        entities: snapshot.entities,
        constraints: snapshot.constraints.map((constraint) =>
          Object.assign({}, constraint, { version: 1 }),
        ),
        dimensions: snapshot.dimensions.map((dimension) =>
          Object.assign({}, dimension, { version: 1 }),
        ),
        groups: snapshot.groups.map((group) => Object.assign({}, group, { version: 1 })),
        parameters: snapshot.parameters.map((parameter) =>
          Object.assign({}, parameter, { version: 1 }),
        ),
        ...(document.source ? { source: document.source } : {}),
      });
      const nextDocument: SketchDocument = {
        ...restored,
        revision: document.revision + 1,
        nodes: withIncrementedVersions(restored.nodes, document.nodes),
        entities: withIncrementedVersions(restored.entities, document.entities),
        constraints: withIncrementedVersions(restored.constraints, document.constraints),
        dimensions: withIncrementedVersions(restored.dimensions, document.dimensions),
        groups: withIncrementedVersions(restored.groups, document.groups),
        parameters: withIncrementedVersions(restored.parameters, document.parameters),
      };
      return {
        document: nextDocument,
        affectedEntities: unique([
          ...ids,
          ...document.entities.map(({ id }) => id),
          ...document.constraints.map(({ id }) => id),
          ...document.dimensions.map(({ id }) => id),
          ...document.groups.map(({ id }) => id),
        ]),
        addedConstraints: nextDocument.constraints
          .filter(({ id }) => !document.constraints.some((constraint) => constraint.id === id))
          .map(({ id }) => id),
        removedConstraints: document.constraints
          .filter(({ id }) => !nextDocument.constraints.some((constraint) => constraint.id === id))
          .map(({ id }) => id),
      };
    }
  }
  return assertNever(command);
}
