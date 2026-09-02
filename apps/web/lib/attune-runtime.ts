import {
  AttuneCommandBus,
  AttuneCommandError,
  type CommandEnvelope,
  type AgentDelegation,
  type TrustedExecutionContext,
} from '@attune/command-bus';
import {
  agentDelegationForWorkspace,
  advanceDelegationObservation,
  ensureJudgeWorkspace,
  executePersistedCommand,
  finishExternalMaterialization,
  issueAgentDelegation,
  JUDGE_WORKSPACE_ID,
  liveblocksRoomIdForWorkspace,
  readWorkspaceBundle,
  refreshAgentDelegation,
  reserveExternalMaterialization,
  revokeAgentDelegation,
  type WorkspaceBundle,
  type WorkspaceIdentity,
} from '@attune/database';
import {
  compareValidChanges,
  createSelectionContext,
  hashSpecification,
  isSketchCommand,
  rankConstraintCandidates,
  type AttuneCommand,
  type AttuneRole,
  type SelectionContextRequest,
} from '@attune/domain';
import { getPlaneGcsSolver } from '@attune/domain/planegcs';
import { materializeAt1042Revision } from '@attune/shopify';
import { compileAgentContext, compileAgentMutationResult } from '@attune/webmcp';

import {
  AGENT_ACCESS_CONSENT_MS,
  AGENT_DELEGATION_LEASE_MS,
  authorityRoleForCommand,
  capabilityIdsForWorkspaceAuthority,
  delegationLeaseExpired,
  delegationStatus,
  type AgentDelegationStatus,
} from './agent-delegation';
import { requireWorkspaceIdentity } from './auth/session';
import {
  setAgentPresence,
  snapshotCollaborativeDraft,
  syncAuthoritativeWorkspace,
} from './liveblocks/server';
import { measureServerPhase, type ServerTimingRecorder } from './server-timing';

export interface CommandExecutionInput {
  readonly command: AttuneCommand;
  readonly envelope: CommandEnvelope;
}

export interface CommerceMaterializationInput {
  readonly revisionId: string;
  readonly envelope: CommandEnvelope;
}

function agentActivity(command: AttuneCommand): string {
  if (command.type === 'apply_constraint') return 'Applying a constraint';
  if (command.type === 'remove_constraint') return 'Removing a constraint';
  if (command.type === 'set_dimension' || command.type === 'remove_dimension') {
    return 'Checking dimensions';
  }
  return 'Checking geometry';
}

function commandFocus(command: AttuneCommand) {
  if (!isSketchCommand(command)) return {};
  switch (command.type) {
    case 'create_geometry':
    case 'edit_geometry':
      return { entityIds: command.entities.map(({ id }) => id) };
    case 'move_node':
      return { nodeIds: [command.nodeId] };
    case 'transform_geometry':
    case 'delete_geometry':
    case 'set_construction':
    case 'move_to_group':
      return { entityIds: command.entityIds };
    case 'trim_geometry':
      return { entityIds: [command.entityId] };
    case 'apply_constraint':
      return {
        entityIds: command.constraints.flatMap(({ refs }) => refs.map(({ entityId }) => entityId)),
        constraintIds: command.constraints.map(({ id }) => id),
      };
    case 'remove_constraint':
      return { constraintIds: command.constraintIds };
    case 'set_dimension':
      return { dimensionIds: command.dimensions.map(({ id }) => id) };
    case 'remove_dimension':
      return { dimensionIds: command.dimensionIds };
    case 'create_group':
    case 'rename_group':
    case 'restore_sketch':
      return {};
  }
  return {};
}

async function trustedHumanContext(
  workspaceId: string,
  role: AttuneRole,
): Promise<TrustedExecutionContext> {
  const identity = await requireWorkspaceIdentity(workspaceId, role);
  return {
    path: 'human',
    workspaceId,
    role,
    perspective: role,
    authorityRoles: identity.roles,
    principalId: identity.principalId,
  };
}

interface AgentAccess {
  readonly identity: WorkspaceIdentity;
  readonly bundle: WorkspaceBundle;
  readonly delegation: AgentDelegation | null;
  readonly status: AgentDelegationStatus;
  readonly capabilityIds: AgentDelegation['capabilityIds'];
}

function leaseTimestamp(now: number): string {
  return new Date(now + AGENT_DELEGATION_LEASE_MS).toISOString();
}

async function accessForIdentity(
  identity: WorkspaceIdentity,
  bundle: WorkspaceBundle,
): Promise<AgentAccess> {
  const capabilityIds = capabilityIdsForWorkspaceAuthority(bundle.workspace, identity.roles);
  let delegation = await agentDelegationForWorkspace(bundle.workspaceId, identity.principalId);
  let status = delegationStatus(delegation, bundle.workspace.authorityEpoch);
  const now = Date.now();
  if (delegation && status.status === 'active' && delegationLeaseExpired(delegation, now)) {
    delegation = await refreshAgentDelegation({
      id: delegation.id,
      authorityEpoch: bundle.workspace.authorityEpoch,
      capabilityIds,
      issuedAt: new Date(now).toISOString(),
      expiresAt: leaseTimestamp(now),
    });
    status = delegationStatus(delegation, bundle.workspace.authorityEpoch, now);
  }
  return { identity, bundle, delegation, status, capabilityIds };
}

async function agentAccess(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  knownBundle?: WorkspaceBundle,
): Promise<AgentAccess> {
  const identity = await requireWorkspaceIdentity(workspaceId, perspective);
  const bundle = knownBundle ?? (await readWorkspaceBundle(workspaceId));
  return accessForIdentity(identity, bundle);
}

function requireActiveDelegation(access: AgentAccess): AgentDelegation {
  if (access.status.status === 'revalidation_required') {
    throw new AttuneCommandError(
      'REVALIDATION_REQUIRED',
      `Agent access was issued for authority epoch ${access.status.authorityEpoch}; the workspace is now epoch ${access.bundle.workspace.authorityEpoch}.`,
      ['authority:workspace'],
    );
  }
  if (access.status.status !== 'active' || !access.delegation) {
    throw new AttuneCommandError(
      'DELEGATION_REQUIRED',
      'Enable agent access for this workspace before invoking mutation capabilities.',
    );
  }
  return access.delegation;
}

async function trustedDelegatedContext(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  commandType: AttuneCommand['type'],
): Promise<TrustedExecutionContext> {
  const access = await agentAccess(workspaceId, perspective);
  const delegation = requireActiveDelegation(access);
  const role = authorityRoleForCommand(
    access.bundle.workspace,
    access.identity.roles,
    commandType,
    perspective,
  );
  return {
    path: 'webmcp',
    workspaceId,
    role,
    perspective,
    authorityRoles: access.identity.roles,
    principalId: access.identity.principalId,
    delegation,
  };
}

function trustedSystemContext(workspaceId: string): TrustedExecutionContext {
  return {
    path: 'system',
    workspaceId,
    role: 'provider',
    principalId: 'integration:shopify:attune',
  };
}

function impactMetrics(bundle: WorkspaceBundle) {
  const buildableReceipt = bundle.receipts.find(
    ({ validationBefore, validationAfter }) => !validationBefore.valid && validationAfter.valid,
  );
  const elapsed = buildableReceipt
    ? Math.max(0, Date.parse(buildableReceipt.createdAt) - Date.parse(bundle.needStartedAt))
    : null;
  const staleConsequentialBlocks = bundle.rejections.filter(
    ({ command, code }) =>
      command === 'materialize_for_commerce' &&
      [
        'STALE_WORKSPACE',
        'STALE_CAPABILITY',
        'SPEC_HASH_MISMATCH',
        'CAPABILITY_UNAVAILABLE',
      ].includes(code),
  ).length;
  const exactCommerceLinks = bundle.workspace.commerceLinks.filter((link) =>
    bundle.workspace.frozenRevisions.some(
      (revision) => revision.revisionId === link.revisionId && revision.specHash === link.specHash,
    ),
  );
  const goldenComplete =
    bundle.workspace.draftVersion >= 8 &&
    exactCommerceLinks.some(({ revisionId }) => revisionId === 'r7') &&
    staleConsequentialBlocks > 0;

  return {
    needToBuildableMs: elapsed,
    conflictsCaughtBeforeQuote: buildableReceipt ? 1 : 0,
    lockedRequirementsPreserved: {
      preserved: bundle.receipts.at(-1)?.preservedLocks.length ?? 4,
      total: 4,
    },
    humanInterventionsDetected: bundle.humanInterventionsDetected,
    staleConsequentialActionsBlocked: staleConsequentialBlocks,
    exactRevisionShopifyVerifications: exactCommerceLinks.length,
    goldenPath: { completedRuns: goldenComplete ? 1 : 0, startedRuns: 1 },
  };
}

async function viewForBundle(
  bundle: WorkspaceBundle,
  role: AttuneRole,
  delegation?: AgentDelegation,
  authorityRoles: readonly AttuneRole[] = [role],
  delegationState: AgentDelegationStatus = {
    status: 'required',
    authorityEpoch: bundle.workspace.authorityEpoch,
  },
  timing?: ServerTimingRecorder,
) {
  const { solve, solver } = await measureServerPhase(timing, 'plane_gcs_solve', async () => {
    const runtimeSolver = await getPlaneGcsSolver();
    return { solver: runtimeSolver, solve: runtimeSolver.solve(bundle.workspace.sketchDocument) };
  });
  const viewStartedAt = performance.now();
  const selection = createSelectionContext(solve.document);
  const bus = new AttuneCommandBus(bundle.workspace, undefined, solver);
  const inspection = bus.inspect(role);
  const delegatedCapabilities = delegation
    ? inspection.capabilities.filter(({ id }) => delegation.capabilityIds.includes(id))
    : inspection.capabilities;
  const authorityCapabilityIds = capabilityIdsForWorkspaceAuthority(
    bundle.workspace,
    authorityRoles,
  );
  const view = {
    ...inspection,
    capabilities: delegatedCapabilities,
    perspective: role,
    authority: {
      perspectives: authorityRoles.filter(
        (candidate): candidate is Extract<AttuneRole, 'buyer' | 'provider'> =>
          candidate === 'buyer' || candidate === 'provider',
      ),
      capabilityIds: authorityCapabilityIds,
      authorityEpoch: bundle.workspace.authorityEpoch,
    },
    delegation: delegationState,
    observation: bundle.observation,
    product: {
      workspaceId: bundle.workspaceId,
      projectName: bundle.projectName,
      fileName: bundle.fileName,
      liveblocksRoomId: bundle.liveblocksRoomId,
    },
    frontiers: {
      buyer: bus.inspect('buyer').frontier,
      provider: bus.inspect('provider').frontier,
      reviewer: bus.inspect('reviewer').frontier,
    },
    repairs: compareValidChanges(bundle.workspace),
    records: {
      receipts: bundle.receipts,
      capabilityTransitions: bundle.transitions,
      commandRejections: bundle.rejections,
      externalCommerce: bundle.workspace.externalCommerceRecords,
      externalVerifications: bundle.workspace.commerceLinks,
    },
    latestReceipt: bundle.receipts.at(-1) ?? null,
    latestCapabilityTransition: bundle.transitions.at(-1) ?? null,
    receiptCount: bundle.receipts.length,
    impact: impactMetrics(bundle),
    semantic: {
      documentRevision: bundle.workspace.sketchDocument.revision,
      selection,
      rankedConstraintCandidates: rankConstraintCandidates(solve.document, selection),
      availableActions: delegatedCapabilities.some(({ id }) => id === 'edit_draft')
        ? [
            'create_geometry',
            'edit_geometry',
            'move_node',
            'transform_geometry',
            'trim_geometry',
            'delete_geometry',
            'rename_group',
            'apply_constraint',
            'remove_constraint',
            'set_dimension',
            'remove_dimension',
            'restore_sketch',
            'forecast_change',
            'check_design',
          ]
        : ['forecast_change', 'check_design'],
      solve: solve.document.lastSolve ?? null,
    },
  };
  timing?.('view_compile', performance.now() - viewStartedAt);
  return view;
}

/** Builds the editor view after the caller has already established workspace membership. */
export async function viewForTrustedBundle(
  bundle: WorkspaceBundle,
  role: AttuneRole,
  identity?: WorkspaceIdentity,
) {
  if (!identity) return viewForBundle(bundle, role);
  const access = await accessForIdentity(identity, bundle);
  return viewForBundle(
    bundle,
    role,
    access.status.status === 'active' ? (access.delegation ?? undefined) : undefined,
    identity.roles,
    access.status,
  );
}

async function inspectHuman(workspaceId: string, role: AttuneRole, timing?: ServerTimingRecorder) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const identity = await measureServerPhase(timing, 'auth', () =>
    requireWorkspaceIdentity(workspaceId, role),
  );
  const bundle = await measureServerPhase(timing, 'neon_workspace_load', () =>
    readWorkspaceBundle(workspaceId, undefined, undefined, timing),
  );
  const access = await accessForIdentity(identity, bundle);
  return viewForBundle(
    bundle,
    role,
    access.status.status === 'active' ? (access.delegation ?? undefined) : undefined,
    identity.roles,
    access.status,
    timing,
  );
}

export async function inspectForDelegatedAgent(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const access = await agentAccess(workspaceId, perspective);
  const activeDelegation =
    access.status.status === 'active' ? (access.delegation ?? undefined) : undefined;
  const bundle = activeDelegation
    ? await readWorkspaceBundle(workspaceId, activeDelegation.observationCursor)
    : access.bundle;
  return viewForBundle(bundle, perspective, activeDelegation, access.identity.roles, access.status);
}

async function agentContextForBundle(
  bundle: WorkspaceBundle,
  context: TrustedExecutionContext,
  delegationState: AgentDelegationStatus,
  focus?: SelectionContextRequest,
) {
  const solver = await getPlaneGcsSolver();
  const solution = solver.solve(bundle.workspace.sketchDocument);
  const workspace = {
    ...bundle.workspace,
    sketchDocument: {
      ...bundle.workspace.sketchDocument,
      lastSolve: solution.document.lastSolve,
    },
  };
  const perspective = context.perspective ?? context.role;
  const inspection = new AttuneCommandBus(workspace, undefined, solver).inspect(perspective);
  const capabilityIds = inspection.capabilities
    .filter(({ id }) => !context.delegation || context.delegation.capabilityIds.includes(id))
    .map(({ id }) => id);
  return compileAgentContext({
    workspace,
    role: perspective,
    capabilityIds,
    observation: bundle.observation,
    delegation: delegationState,
    focus,
  });
}

export async function inspectAgentContext(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  focus?: SelectionContextRequest,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const access = await agentAccess(workspaceId, perspective);
  const activeDelegation =
    access.status.status === 'active' ? (access.delegation ?? undefined) : undefined;
  const context: TrustedExecutionContext = {
    path: 'webmcp',
    workspaceId,
    principalId: access.identity.principalId,
    role: perspective,
    perspective,
    authorityRoles: access.identity.roles,
    delegation: activeDelegation,
  };
  const bundle = activeDelegation
    ? await readWorkspaceBundle(
        workspaceId,
        activeDelegation.observationCursor,
        context.principalId,
      )
    : access.bundle;
  const snapshot = await agentContextForBundle(bundle, context, access.status, focus);
  if (context.delegation) {
    await advanceDelegationObservation(
      workspaceId,
      context.delegation.id,
      bundle.workspace.workspaceSeq,
    );
  }
  return snapshot;
}

export async function enableAgentAccess(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const identity = await requireWorkspaceIdentity(workspaceId, perspective);
  const bundle = await readWorkspaceBundle(workspaceId);
  const now = Date.now();
  const delegation = await issueAgentDelegation({
    workspaceId,
    principalId: identity.principalId,
    capabilityIds: capabilityIdsForWorkspaceAuthority(bundle.workspace, identity.roles),
    authorityEpoch: bundle.workspace.authorityEpoch,
    observationCursor: bundle.workspace.workspaceSeq,
    issuedAt: new Date(now).toISOString(),
    expiresAt: leaseTimestamp(now),
    consentExpiresAt: new Date(now + AGENT_ACCESS_CONSENT_MS).toISOString(),
  });
  return {
    delegation: delegationStatus(delegation, bundle.workspace.authorityEpoch, now),
  };
}

export async function disableAgentAccess(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
) {
  const identity = await requireWorkspaceIdentity(workspaceId, perspective);
  await revokeAgentDelegation(workspaceId, identity.principalId);
  return {
    delegation: {
      status: 'required' as const,
      authorityEpoch: (await readWorkspaceBundle(workspaceId)).workspace.authorityEpoch,
    },
  };
}

export function inspectForHuman(
  workspaceId: string,
  role: AttuneRole = 'buyer',
  timing?: ServerTimingRecorder,
) {
  return inspectHuman(workspaceId, role, timing);
}

export function inspectForProvider(workspaceId: string) {
  return inspectHuman(workspaceId, 'provider');
}

async function executeWithContext(
  workspaceId: string,
  input: CommandExecutionInput,
  context: TrustedExecutionContext,
  liveblocksVersionId?: string,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  await executePersistedCommand(
    { workspaceId, command: input.command, envelope: input.envelope, context },
    liveblocksVersionId,
  );
  const bundle = await readWorkspaceBundle(
    workspaceId,
    input.envelope.observationCursor,
    context.path === 'webmcp' ? context.principalId : undefined,
  );
  return viewForBundle(
    bundle,
    context.perspective ?? context.role,
    context.delegation,
    context.authorityRoles,
    context.delegation
      ? delegationStatus(context.delegation, bundle.workspace.authorityEpoch)
      : { status: 'required', authorityEpoch: bundle.workspace.authorityEpoch },
  );
}

export async function executeAgentCommand(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  input: CommandExecutionInput,
) {
  return executeWithContext(
    workspaceId,
    input,
    await trustedDelegatedContext(workspaceId, perspective, input.command.type),
  );
}

export async function executeSemanticCommand(
  workspaceId: string,
  input: CommandExecutionInput,
  context: TrustedExecutionContext,
  timing?: ServerTimingRecorder,
) {
  if (!isSketchCommand(input.command)) {
    throw new TypeError('executeSemanticCommand accepts semantic sketch commands only.');
  }
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const roomId = await liveblocksRoomIdForWorkspace(workspaceId);
  if (context.path === 'webmcp') {
    await setAgentPresence(roomId, agentActivity(input.command), commandFocus(input.command)).catch(
      () => undefined,
    );
  }
  const result = await executePersistedCommand({
    workspaceId,
    command: input.command,
    envelope: input.envelope,
    context,
    timing,
  });
  await syncAuthoritativeWorkspace(roomId, result.workspace);
  if (context.path === 'webmcp') {
    await setAgentPresence(
      roomId,
      'Update applied',
      { entityIds: result.receipt.affectedEntities },
      2,
    ).catch(() => undefined);
  }
  const contextStartedAt = performance.now();
  const perspective = context.perspective ?? context.role;
  const capabilityIds = new AttuneCommandBus(result.workspace)
    .inspect(perspective)
    .capabilities.filter(
      ({ id }) => !context.delegation || context.delegation.capabilityIds.includes(id),
    )
    .map(({ id }) => id);
  const nextContext = compileAgentContext({
    workspace: result.workspace,
    role: perspective,
    capabilityIds,
    observation: result.observation,
    delegation: context.delegation
      ? delegationStatus(context.delegation, result.workspace.authorityEpoch)
      : { status: 'required', authorityEpoch: result.workspace.authorityEpoch },
  });
  timing?.('semantic_context', performance.now() - contextStartedAt);
  return {
    result,
    nextContext,
    mutation: compileAgentMutationResult(result, nextContext, capabilityIds),
  };
}

export async function executeAgentSemanticCommand(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  input: CommandExecutionInput,
) {
  const execution = await executeSemanticCommand(
    workspaceId,
    input,
    await trustedDelegatedContext(workspaceId, perspective, input.command.type),
  );
  return execution.mutation;
}

export async function executeHumanSemanticCommand(
  workspaceId: string,
  input: CommandExecutionInput,
  role: AttuneRole = 'buyer',
  timing?: ServerTimingRecorder,
) {
  const context = await measureServerPhase(timing, 'auth', () =>
    trustedHumanContext(workspaceId, role),
  );
  const execution = await executeSemanticCommand(workspaceId, input, context, timing);
  return { mutation: execution.mutation, workspace: execution.result.workspace };
}

async function forecastWithContext(
  workspaceId: string,
  command: AttuneCommand,
  context: TrustedExecutionContext,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const bundle = await readWorkspaceBundle(
    workspaceId,
    context.delegation?.observationCursor,
    context.path === 'webmcp' ? context.principalId : undefined,
  );
  const solver = await getPlaneGcsSolver();
  const bus = new AttuneCommandBus(bundle.workspace, undefined, solver);
  const forecast = bus.forecast(command, context, `forecast-${crypto.randomUUID()}`);
  const agentContext = await agentContextForBundle(
    bundle,
    context,
    context.delegation
      ? delegationStatus(context.delegation, bundle.workspace.authorityEpoch)
      : { status: 'required', authorityEpoch: bundle.workspace.authorityEpoch },
  );
  if (context.path === 'webmcp' && context.delegation) {
    await advanceDelegationObservation(
      workspaceId,
      context.delegation.id,
      bundle.workspace.workspaceSeq,
    );
  }
  return { status: 'FORECAST' as const, forecast, context: agentContext };
}

export async function forecastAgentCommand(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  command: AttuneCommand,
) {
  return forecastWithContext(
    workspaceId,
    command,
    await trustedDelegatedContext(workspaceId, perspective, command.type),
  );
}

export async function forecastHumanCommand(
  workspaceId: string,
  command: AttuneCommand,
  role: AttuneRole = 'buyer',
) {
  return forecastWithContext(workspaceId, command, await trustedHumanContext(workspaceId, role));
}

export async function executeHumanCommand(
  workspaceId: string,
  input: CommandExecutionInput,
  role: AttuneRole = 'buyer',
) {
  return executeWithContext(workspaceId, input, await trustedHumanContext(workspaceId, role));
}

export async function executeProviderCommand(workspaceId: string, input: CommandExecutionInput) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const context = await trustedHumanContext(workspaceId, 'provider');
  const current = await readWorkspaceBundle(workspaceId);
  const collaboration = await snapshotCollaborativeDraft(
    current.liveblocksRoomId,
    current.workspace,
  );
  return executeWithContext(workspaceId, input, context, collaboration.versionId);
}

export async function executeCommerceMaterialization(
  workspaceId: string,
  role: Extract<AttuneRole, 'provider'>,
  input: CommerceMaterializationInput,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const delegatedContext = await trustedDelegatedContext(
    workspaceId,
    role,
    'materialize_for_commerce',
  );
  const context = trustedSystemContext(workspaceId);
  const reservation = await reserveExternalMaterialization({
    workspaceId,
    revisionId: input.revisionId,
    envelope: input.envelope,
    context: delegatedContext,
  });
  if (reservation.status === 'completed') {
    const bundle = await readWorkspaceBundle(workspaceId);
    return viewForBundle(
      bundle,
      role,
      delegatedContext.delegation,
      delegatedContext.authorityRoles,
      delegationStatus(delegatedContext.delegation!, bundle.workspace.authorityEpoch),
    );
  }
  try {
    const verification = await materializeAt1042Revision(reservation.revision);
    await executePersistedCommand({
      workspaceId,
      command: { type: 'materialize_for_commerce', revisionId: input.revisionId, verification },
      envelope: input.envelope,
      context,
    });
    await finishExternalMaterialization(workspaceId, input.envelope.commandId, 'completed');
    const bundle = await readWorkspaceBundle(workspaceId);
    return viewForBundle(
      bundle,
      role,
      delegatedContext.delegation,
      delegatedContext.authorityRoles,
      delegationStatus(delegatedContext.delegation!, bundle.workspace.authorityEpoch),
    );
  } catch (error) {
    await finishExternalMaterialization(
      workspaceId,
      input.envelope.commandId,
      'failed',
      error instanceof Error ? error.name : 'UnknownError',
    );
    throw error;
  }
}

export function isAttuneCommandError(error: unknown): error is AttuneCommandError {
  return error instanceof AttuneCommandError;
}

export function currentSpecificationHash(
  view: Awaited<ReturnType<typeof inspectForHuman>>,
): string {
  return hashSpecification(view.workspace);
}
