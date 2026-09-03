import type { CapabilityId } from '@attune/capabilities';
import type { CommandResult, ForecastConsequence, InterventionSummary } from '@attune/command-bus';
import {
  createSelectionContext,
  geometryBounds,
  hashCanonical,
  hashSpecification,
  mechanicalRecipeDefinition,
  rankConstraintCandidates,
  type AttuneRole,
  type AttuneWorkspace,
  type GeometryEntity,
  geometryNodeIds,
  type SelectionContextRequest,
} from '@attune/domain';

type PublicGeometryEntity = GeometryEntity extends infer Entity
  ? Entity extends GeometryEntity
    ? Omit<Entity, 'sourceRef'>
    : never
  : never;

export type AgentGeometryContext = PublicGeometryEntity & {
  readonly bounds: ReturnType<typeof geometryBounds>;
  readonly semanticRole: string;
  readonly parentGroup: { readonly id: string; readonly name: string } | null;
  readonly relationships: readonly {
    readonly type: string;
    readonly semanticRefs: readonly string[];
  }[];
  readonly dimensions: readonly {
    readonly id: string;
    readonly kind: string;
    readonly value: number | { readonly parameterId: string };
    readonly driving: boolean;
  }[];
  readonly remainingDegreesOfFreedom: number | null;
  readonly relevantActions: readonly string[];
};

export interface AgentContextSnapshot {
  readonly revision: number;
  readonly workspaceSequence: number;
  readonly specificationHash: string;
  readonly delegation: {
    readonly status: 'active' | 'required' | 'expired' | 'revalidation_required';
    readonly expiresAt?: string;
    readonly authorityEpoch: number;
  };
  readonly selection: {
    readonly entityIds: readonly string[];
    readonly nodeIds: readonly string[];
    readonly constraintIds: readonly string[];
    readonly groupIds: readonly string[];
    readonly hoveredEntityId: string | null;
    readonly activeGroupId: string | null;
    readonly activeHumanTool: string | null;
    readonly semanticEntities: readonly {
      readonly entityId: string;
      readonly semanticRole: string;
      readonly parentGroup: { readonly id: string; readonly name: string } | null;
    }[];
  };
  readonly documentSummary: {
    readonly entityCount: number;
    readonly groupCount: number;
    readonly constraintCount: number;
    readonly dimensionCount: number;
    readonly geometryTruncated: boolean;
  };
  readonly nearbySemanticRefs: readonly string[];
  readonly geometry: readonly AgentGeometryContext[];
  readonly nodes: readonly {
    readonly id: string;
    readonly version: number;
    readonly position: { readonly x: number; readonly y: number };
  }[];
  readonly groups: readonly {
    readonly id: string;
    readonly version: number;
    readonly name: string;
    readonly entityIds: readonly string[];
  }[];
  readonly constraints: readonly {
    readonly id: string;
    readonly version: number;
    readonly type: string;
    readonly refs: readonly { readonly entityId: string; readonly anchor?: string }[];
  }[];
  readonly solver: {
    readonly status: string;
    readonly degreesOfFreedom: number | null;
    readonly conflicts: readonly string[];
    readonly redundant: readonly string[];
  };
  readonly candidates: readonly {
    readonly type: string;
    readonly refs: readonly { readonly entityId: string; readonly anchor?: string }[];
    readonly score: number;
    readonly reason: string;
    readonly predictedEffect: string;
  }[];
  readonly unseenChanges: readonly {
    readonly sequence: number;
    readonly origin: string;
    readonly command: string;
    readonly semanticRefs: readonly string[];
  }[];
  readonly availableActions: readonly string[];
  readonly relevantActions: readonly string[];
  readonly recipes: readonly {
    readonly sourceRef: string;
    readonly groupId: string;
    readonly recipe: string;
    readonly title: string;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly placement: {
      readonly center: { readonly x: number; readonly y: number };
      readonly rotationDegrees?: number;
    };
    readonly status: string;
    readonly editableParameters: readonly string[];
    readonly designRequest?: unknown;
  }[];
}

export interface AgentMutationResult {
  readonly status: 'APPLIED';
  readonly receipt: {
    readonly id: string;
    readonly command: string;
    readonly origin: string;
  };
  readonly workspaceSequence: number;
  readonly draftVersion: number;
  readonly capabilityEpoch: number;
  readonly authorityEpoch: number;
  readonly specificationHash: string;
  readonly changedEntities: readonly string[];
  readonly changedSemanticRefs: readonly string[];
  readonly delegation: AgentContextSnapshot['delegation'];
  readonly availableCapabilities: readonly CapabilityId[];
  readonly availableAuthorityCapabilities: readonly CapabilityId[];
  readonly solver: ForecastConsequence['solver'];
  readonly recipeProvenance: AgentContextSnapshot['recipes'];
  readonly rebase: {
    readonly fromWorkspaceSequence: number | null;
    readonly unseenHumanChanges: AgentContextSnapshot['unseenChanges'];
  };
  readonly next: Pick<
    AgentContextSnapshot,
    | 'revision'
    | 'workspaceSequence'
    | 'specificationHash'
    | 'solver'
    | 'candidates'
    | 'availableActions'
    | 'relevantActions'
    | 'selection'
    | 'geometry'
    | 'recipes'
  >;
}

const MAX_CONTEXTS = 128;
const contextCache = new Map<string, AgentContextSnapshot>();

function geometryIds(
  workspace: AttuneWorkspace,
  request: SelectionContextRequest,
): readonly string[] {
  const selection = createSelectionContext(workspace.sketchDocument, request);
  const ids = new Set([
    ...selection.selectedEntityIds,
    ...selection.nearbyEntities.map(({ entityId }) => entityId),
    ...workspace.sketchDocument.entities
      .filter((entity) =>
        geometryNodeIds(entity).some((id) => selection.selectedNodeIds.includes(id)),
      )
      .map(({ id }) => id),
    ...selection.activeConstraints.flatMap(({ refs }) => refs.map(({ entityId }) => entityId)),
  ]);
  if (ids.size === 0 && Object.keys(request).length === 0) {
    workspace.sketchDocument.entities.slice(0, 32).forEach(({ id }) => ids.add(id));
  }
  return [...ids].toSorted();
}

function semanticRole(entity: GeometryEntity): string {
  const source = [
    entity.name,
    entity.sourceRef?.pathId,
    entity.sourceRef?.layer,
    entity.sourceRef?.routeKey,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_');
  if (source.includes('center_bore')) return 'center_bore';
  if (source.includes('mounting_hole')) return 'mounting_hole';
  if (source.includes('inner_fillet')) return 'inner_fillet';
  if (source.includes('outer_fillet')) return 'outer_fillet';
  if (source.includes('inner_rim')) return 'inner_rim';
  if (source.includes('outer_rim') || source.includes('outer_ring')) return 'outer_rim';
  if (source.includes('plate_boundary') && entity.kind === 'line') return 'side';
  if (source.includes('plate_boundary')) return 'plate_boundary';
  if (source.includes('slot_side')) return 'side';
  if (source.includes('slot')) return 'slot_boundary';
  if (source.includes('spoke')) return entity.kind === 'arc' ? 'spoke_fillet' : 'spoke_side';
  if (source.includes('shape_line')) return 'spoke_side';
  if (source.includes('radial_feature')) return 'radial_feature';
  return entity.kind;
}

function parentGroup(
  document: AttuneWorkspace['sketchDocument'],
  entityId: string,
): { readonly id: string; readonly name: string } | null {
  const containing = document.groups.filter(({ entityIds }) => entityIds.includes(entityId));
  const group = containing.toSorted((left, right) => {
    const depth = (candidate: (typeof containing)[number]) => {
      let count = 0;
      let parentId = candidate.parentGroupId;
      while (parentId) {
        count += 1;
        parentId = document.groups.find(({ id }) => id === parentId)?.parentGroupId;
      }
      return count;
    };
    return depth(right) - depth(left) || left.id.localeCompare(right.id);
  })[0];
  return group ? { id: group.id, name: group.name } : null;
}

function recipeGroupForEntity(document: AttuneWorkspace['sketchDocument'], entityId: string) {
  let group = document.groups.find(({ entityIds }) => entityIds.includes(entityId));
  while (group) {
    if (group.sourceRef?.kind === 'design-recipe') return group;
    group = group.parentGroupId
      ? document.groups.find(({ id }) => id === group!.parentGroupId)
      : undefined;
  }
  return undefined;
}

function entityActions(entity: GeometryEntity, recipeSourceRef?: string): readonly string[] {
  const actions: string[] = [];
  if (entity.kind === 'circle' || entity.kind === 'arc') actions.push('set_radius');
  if (entity.kind === 'line' || entity.kind === 'arc') actions.push('move_endpoint');
  if (entity.kind !== 'point') actions.push('trim_geometry');
  actions.push('transform_geometry', 'delete_geometry');
  if (recipeSourceRef) actions.push('update_recipe_parameters');
  return actions;
}

function relevantActions(
  document: AttuneWorkspace['sketchDocument'],
  geometry: readonly GeometryEntity[],
  selection: ReturnType<typeof createSelectionContext>,
  available: readonly string[],
): readonly string[] {
  const actions = new Set<string>();
  const selected = geometry.filter(({ id }) => selection.selectedEntityIds.includes(id));
  if (
    selected.some(({ kind }) => kind === 'line') &&
    selected.some(({ kind }) => kind === 'arc' || kind === 'circle')
  ) {
    actions.add('set_tangent');
  }
  if (selected.some(({ kind }) => kind === 'circle' || kind === 'arc')) {
    actions.add('set_radius');
  }
  for (const entity of selected) {
    entityActions(entity, recipeGroupForEntity(document, entity.id)?.id).forEach((action) =>
      actions.add(action),
    );
  }
  if (selection.selectedConstraintIds.length > 0) actions.add('remove_constraint');
  if (selection.activeHumanTool) actions.add(`continue_${selection.activeHumanTool}`);
  actions.add('instantiate_recipe');
  actions.add('inspect_context');
  actions.add('check_design');
  if (!available.includes('modify_geometry')) return [...actions];
  actions.add('forecast_change');
  return [...actions];
}

function meaningfulActions(capabilityIds: ReadonlySet<CapabilityId>): readonly string[] {
  const actions = ['inspect_context', 'forecast_change', 'check_design'];
  if (capabilityIds.has('edit_draft')) {
    actions.push('modify_geometry', 'constrain_geometry');
  }
  return actions;
}

function interventionContext(
  observation: InterventionSummary,
): AgentContextSnapshot['unseenChanges'] {
  return observation.interventions.map((intervention) => ({
    sequence: intervention.receiptSeq,
    origin: intervention.origin,
    command: intervention.command,
    semanticRefs: intervention.affectedEntities,
  }));
}

export function compileAgentContext(input: {
  readonly workspace: AttuneWorkspace;
  readonly role: AttuneRole;
  readonly capabilityIds: readonly CapabilityId[];
  readonly observation: InterventionSummary;
  readonly delegation: AgentContextSnapshot['delegation'];
  readonly focus?: SelectionContextRequest;
}): AgentContextSnapshot {
  const focus = input.focus ?? {};
  const cacheKey = hashCanonical({
    documentId: input.workspace.sketchDocument.id,
    workspaceSequence: input.workspace.workspaceSeq,
    role: input.role,
    capabilityIds: input.capabilityIds,
    focus,
    observation: input.observation,
    delegation: input.delegation,
  });
  const cached = contextCache.get(cacheKey);
  if (cached) return structuredClone(cached);

  const selection = createSelectionContext(input.workspace.sketchDocument, focus);
  const relevantIds = new Set(geometryIds(input.workspace, focus));
  const relevantGeometry = input.workspace.sketchDocument.entities.filter(({ id }) =>
    relevantIds.has(id),
  );
  const recipeGroups = input.workspace.sketchDocument.groups.filter(
    (group) => group.sourceRef?.kind === 'design-recipe',
  );
  const recipeForEntity = (entityId: string) =>
    recipeGroupForEntity(input.workspace.sketchDocument, entityId);
  const geometry: AgentGeometryContext[] = relevantGeometry.map((entity) => {
    const { sourceRef: _sourceRef, ...publicEntity } = entity;
    const relationships = [
      ...input.workspace.sketchDocument.constraints
        .filter(({ refs }) => refs.some(({ entityId }) => entityId === entity.id))
        .map(({ type, refs }) => ({
          type,
          semanticRefs: refs.map(({ entityId }) => entityId).filter((id) => id !== entity.id),
        })),
      ...geometryNodeIds(entity).flatMap((nodeId) => {
        const incident = input.workspace.sketchDocument.entities
          .filter(
            (candidate) =>
              candidate.id !== entity.id && geometryNodeIds(candidate).includes(nodeId),
          )
          .map(({ id }) => id);
        return incident.length > 0
          ? [{ type: 'shared_topology', semanticRefs: [nodeId, ...incident] }]
          : [];
      }),
    ];
    return {
      ...publicEntity,
      bounds: geometryBounds(entity),
      semanticRole: semanticRole(entity),
      parentGroup: parentGroup(input.workspace.sketchDocument, entity.id),
      relationships,
      dimensions: input.workspace.sketchDocument.dimensions
        .filter(({ refs }) => refs.some(({ entityId }) => entityId === entity.id))
        .map(({ id, kind, value, driving }) => ({ id, kind, value, driving })),
      remainingDegreesOfFreedom: selection.relevantDegreesOfFreedom,
      relevantActions: entityActions(entity, recipeForEntity(entity.id)?.id),
    };
  });
  const relevantNodeIds = new Set(geometry.flatMap(geometryNodeIds));
  const nodes = (input.workspace.sketchDocument.nodes ?? [])
    .filter(({ id }) => relevantNodeIds.has(id))
    .map(({ id, version, position }) => ({ id, version, position }));
  const groups = input.workspace.sketchDocument.groups
    .filter((group) => relevantIds.size === 0 || group.entityIds.some((id) => relevantIds.has(id)))
    .map(({ id, version, name, entityIds }) => ({ id, version, name, entityIds }));
  const constraints = input.workspace.sketchDocument.constraints
    .filter((constraint) => constraint.refs.some(({ entityId }) => relevantIds.has(entityId)))
    .map(({ id, version, type, refs }) => ({ id, version, type, refs }));
  const solve = input.workspace.sketchDocument.lastSolve;
  const snapshot: AgentContextSnapshot = {
    revision: input.workspace.sketchDocument.revision,
    workspaceSequence: input.workspace.workspaceSeq,
    specificationHash: hashSpecification(input.workspace),
    delegation: input.delegation,
    selection: {
      entityIds: selection.selectedEntityIds,
      nodeIds: selection.selectedNodeIds,
      constraintIds: selection.selectedConstraintIds,
      groupIds: selection.selectedGroupIds,
      hoveredEntityId: selection.hoveredEntity?.entityId ?? null,
      activeGroupId: selection.activeGroupId,
      activeHumanTool: selection.activeHumanTool,
      semanticEntities: relevantGeometry
        .filter(({ id }) => selection.selectedEntityIds.includes(id))
        .map((entity) => ({
          entityId: entity.id,
          semanticRole: semanticRole(entity),
          parentGroup: parentGroup(input.workspace.sketchDocument, entity.id),
        })),
    },
    documentSummary: {
      entityCount: input.workspace.sketchDocument.entities.length,
      groupCount: input.workspace.sketchDocument.groups.length,
      constraintCount: input.workspace.sketchDocument.constraints.length,
      dimensionCount: input.workspace.sketchDocument.dimensions.length,
      geometryTruncated: relevantGeometry.length < input.workspace.sketchDocument.entities.length,
    },
    nearbySemanticRefs: [
      ...selection.nearbyEntities.map(({ entityId }) => entityId),
      ...nodes.map(({ id }) => id),
      ...constraints.map(({ id }) => id),
      ...groups.map(({ id }) => id),
    ].filter((id, index, all) => all.indexOf(id) === index),
    geometry,
    nodes,
    groups,
    constraints,
    solver: {
      status: solve?.status ?? 'unknown',
      degreesOfFreedom: solve?.degreesOfFreedom ?? null,
      conflicts: solve?.conflicts ?? [],
      redundant: solve?.redundant ?? [],
    },
    candidates: rankConstraintCandidates(input.workspace.sketchDocument, selection).slice(0, 8),
    unseenChanges: interventionContext(input.observation),
    availableActions: meaningfulActions(new Set(input.capabilityIds)),
    relevantActions: relevantActions(
      input.workspace.sketchDocument,
      relevantGeometry,
      selection,
      meaningfulActions(new Set(input.capabilityIds)),
    ),
    recipes: recipeGroups.map((group) => {
      const source = group.sourceRef;
      if (!source || source.kind !== 'design-recipe') {
        throw new TypeError('Recipe provenance disappeared during context compilation.');
      }
      return Object.assign(
        {},
        {
          sourceRef: source.sourceRef,
          groupId: group.id,
          recipe: source.recipeId,
          title: source.title,
          parameters: source.parameters,
          placement: source.placement,
          status: source.status,
          editableParameters: mechanicalRecipeDefinition(source.recipeId).editableParameters,
          ...(source.designRequest ? { designRequest: source.designRequest } : {}),
        },
      );
    }),
  };
  if (contextCache.size >= MAX_CONTEXTS) {
    contextCache.delete(contextCache.keys().next().value ?? '');
  }
  contextCache.set(cacheKey, structuredClone(snapshot));
  return snapshot;
}

export function compileAgentMutationResult(
  result: CommandResult,
  context: AgentContextSnapshot,
  capabilityIds: readonly CapabilityId[] = result.capabilities.map(({ id }) => id),
  authorityCapabilityIds: readonly CapabilityId[] = capabilityIds,
): AgentMutationResult {
  const changedSemanticRefs = new Set(result.receipt.affectedEntities);
  return {
    status: 'APPLIED',
    receipt: {
      id: result.receipt.receiptId,
      command: result.receipt.command,
      origin: result.receipt.origin,
    },
    workspaceSequence: result.workspace.workspaceSeq,
    draftVersion: result.workspace.draftVersion,
    capabilityEpoch: result.workspace.capabilityEpoch,
    authorityEpoch: result.workspace.authorityEpoch,
    specificationHash: result.receipt.specHashAfter,
    changedEntities: result.receipt.affectedEntities,
    changedSemanticRefs: result.receipt.affectedEntities,
    delegation: context.delegation,
    availableCapabilities: capabilityIds,
    availableAuthorityCapabilities: authorityCapabilityIds,
    solver: result.forecast.solver,
    recipeProvenance: context.recipes.filter(
      ({ sourceRef, groupId }) =>
        changedSemanticRefs.has(sourceRef) || changedSemanticRefs.has(groupId),
    ),
    rebase: {
      fromWorkspaceSequence: result.receipt.rebasedFromWorkspaceSeq,
      unseenHumanChanges: context.unseenChanges,
    },
    next: {
      revision: context.revision,
      workspaceSequence: context.workspaceSequence,
      specificationHash: context.specificationHash,
      solver: context.solver,
      candidates: context.candidates,
      availableActions: context.availableActions,
      relevantActions: context.relevantActions,
      selection: context.selection,
      geometry: context.geometry,
      recipes: context.recipes,
    },
  };
}
