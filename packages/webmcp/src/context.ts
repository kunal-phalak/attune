import type { CapabilityId } from '@attune/capabilities';
import type { CommandResult, ForecastConsequence, InterventionSummary } from '@attune/command-bus';
import {
  createSelectionContext,
  geometryBounds,
  hashCanonical,
  hashSpecification,
  rankConstraintCandidates,
  type AttuneRole,
  type AttuneWorkspace,
  type GeometryEntity,
  geometryNodeIds,
  type SelectionContextRequest,
} from '@attune/domain';

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
  };
  readonly nearbySemanticRefs: readonly string[];
  readonly geometry: readonly (GeometryEntity & {
    readonly bounds: ReturnType<typeof geometryBounds>;
  })[];
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
  readonly delegation: AgentContextSnapshot['delegation'];
  readonly availableCapabilities: readonly CapabilityId[];
  readonly solver: ForecastConsequence['solver'];
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
    workspace.sketchDocument.entities.forEach(({ id }) => ids.add(id));
  }
  return [...ids].toSorted();
}

function relevantActions(
  geometry: readonly GeometryEntity[],
  selection: ReturnType<typeof createSelectionContext>,
  available: readonly string[],
): readonly string[] {
  const actions = new Set(['inspect_context', 'check_design']);
  if (!available.includes('modify_geometry')) return [...actions];
  if (geometry.length > 0) actions.add('modify_geometry');
  if (selection.selectedEntityIds.length > 0 || selection.selectedNodeIds.length > 0) {
    actions.add('move_geometry');
    actions.add('delete_geometry');
  }
  if (selection.selectedEntityIds.length > 0) actions.add('constrain_geometry');
  if (selection.selectedConstraintIds.length > 0) actions.add('remove_constraint');
  if (selection.activeHumanTool) actions.add(`continue_${selection.activeHumanTool}`);
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
  const geometry = input.workspace.sketchDocument.entities
    .filter(({ id }) => relevantIds.has(id))
    .map((entity) => Object.assign({}, entity, { bounds: geometryBounds(entity) }));
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
      geometry,
      selection,
      meaningfulActions(new Set(input.capabilityIds)),
    ),
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
): AgentMutationResult {
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
    delegation: context.delegation,
    availableCapabilities: capabilityIds,
    solver: result.forecast.solver,
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
    },
  };
}
