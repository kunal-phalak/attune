import {
  AttuneCommandBus,
  AttuneCommandError,
  type CommandEnvelope,
  type DelegationGrant,
  type TrustedExecutionContext,
} from '@attune/command-bus';
import {
  activeDelegationForWorkspace,
  advanceDelegationObservation,
  ensureJudgeWorkspace,
  executePersistedCommand,
  finishExternalMaterialization,
  JUDGE_WORKSPACE_ID,
  readWorkspaceBundle,
  reserveExternalMaterialization,
  type WorkspaceBundle,
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

import { requireWorkspaceIdentity } from './auth/session';
import { snapshotCollaborativeDraft } from './liveblocks/server';

export interface CommandExecutionInput {
  readonly command: AttuneCommand;
  readonly envelope: CommandEnvelope;
}

export interface CommerceMaterializationInput {
  readonly revisionId: string;
  readonly envelope: CommandEnvelope;
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
    principalId: `${role}:${identity.userId}`,
  };
}

async function trustedDelegatedContext(
  workspaceId: string,
  role: Extract<AttuneRole, 'buyer' | 'provider'>,
): Promise<TrustedExecutionContext> {
  const identity = await requireWorkspaceIdentity(workspaceId, role);
  const delegation = await activeDelegationForWorkspace(workspaceId, role);
  if (!delegation || delegation.delegatingPrincipalId !== `${role}:${identity.userId}`) {
    throw new Error('ACTIVE_DELEGATION_REQUIRED');
  }
  return {
    path: 'webmcp',
    workspaceId,
    role,
    principalId: delegation.delegatedPrincipalId,
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
  delegation?: DelegationGrant,
) {
  const solver = await getPlaneGcsSolver();
  const solve = solver.solve(bundle.workspace.sketchDocument);
  const selection = createSelectionContext(solve.document);
  const bus = new AttuneCommandBus(bundle.workspace, undefined, solver);
  const inspection = bus.inspect(role);
  const delegatedCapabilities = delegation
    ? inspection.capabilities.filter(({ id }) => delegation.capabilityIds.includes(id))
    : inspection.capabilities;
  return {
    ...inspection,
    capabilities: delegatedCapabilities,
    perspective: role,
    delegation: delegation
      ? {
          grantId: delegation.grantId,
          role: delegation.role,
          capabilityIds: delegation.capabilityIds,
          expiresAt: delegation.expiresAt,
          observationCursor: delegation.observationCursor,
        }
      : null,
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
}

async function inspectHuman(workspaceId: string, role: AttuneRole) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  await trustedHumanContext(workspaceId, role);
  const bundle = await readWorkspaceBundle(workspaceId);
  return viewForBundle(bundle, role);
}

export async function inspectForDelegatedAgent(
  workspaceId: string,
  role: Extract<AttuneRole, 'buyer' | 'provider'>,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const context = await trustedDelegatedContext(workspaceId, role);
  const bundle = await readWorkspaceBundle(
    workspaceId,
    context.delegation?.observationCursor,
    undefined,
  );
  return viewForBundle(bundle, role, context.delegation);
}

async function agentContextForBundle(
  bundle: WorkspaceBundle,
  context: TrustedExecutionContext,
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
  const inspection = new AttuneCommandBus(workspace, undefined, solver).inspect(context.role);
  const capabilityIds = inspection.capabilities
    .filter(({ id }) => !context.delegation || context.delegation.capabilityIds.includes(id))
    .map(({ id }) => id);
  return compileAgentContext({
    workspace,
    role: context.role,
    capabilityIds,
    observation: bundle.observation,
    focus,
  });
}

export async function inspectAgentContext(
  workspaceId: string,
  role: Extract<AttuneRole, 'buyer' | 'provider'>,
  focus?: SelectionContextRequest,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const context = await trustedDelegatedContext(workspaceId, role);
  const bundle = await readWorkspaceBundle(
    workspaceId,
    context.delegation?.observationCursor,
    context.principalId,
  );
  const snapshot = await agentContextForBundle(bundle, context, focus);
  if (context.delegation) {
    await advanceDelegationObservation(
      workspaceId,
      context.delegation.grantId,
      bundle.workspace.workspaceSeq,
    );
  }
  return snapshot;
}

export function inspectForHuman(workspaceId: string, role: AttuneRole = 'buyer') {
  return inspectHuman(workspaceId, role);
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
  return viewForBundle(bundle, context.role, context.delegation);
}

export async function executeAgentCommand(
  workspaceId: string,
  role: Extract<AttuneRole, 'buyer' | 'provider'>,
  input: CommandExecutionInput,
) {
  return executeWithContext(workspaceId, input, await trustedDelegatedContext(workspaceId, role));
}

export async function executeSemanticCommand(
  workspaceId: string,
  input: CommandExecutionInput,
  context: TrustedExecutionContext,
) {
  if (!isSketchCommand(input.command)) {
    throw new TypeError('executeSemanticCommand accepts semantic sketch commands only.');
  }
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const result = await executePersistedCommand({
    workspaceId,
    command: input.command,
    envelope: input.envelope,
    context,
  });
  const capabilityIds = result.capabilities
    .filter(({ id }) => !context.delegation || context.delegation.capabilityIds.includes(id))
    .map(({ id }) => id);
  const nextContext = compileAgentContext({
    workspace: result.workspace,
    role: context.role,
    capabilityIds,
    observation: result.observation,
  });
  return {
    result,
    nextContext,
    mutation: compileAgentMutationResult(result, nextContext, capabilityIds),
  };
}

export async function executeAgentSemanticCommand(
  workspaceId: string,
  role: Extract<AttuneRole, 'buyer' | 'provider'>,
  input: CommandExecutionInput,
) {
  const execution = await executeSemanticCommand(
    workspaceId,
    input,
    await trustedDelegatedContext(workspaceId, role),
  );
  return execution.mutation;
}

export async function executeHumanSemanticCommand(
  workspaceId: string,
  input: CommandExecutionInput,
  role: AttuneRole = 'buyer',
) {
  const execution = await executeSemanticCommand(
    workspaceId,
    input,
    await trustedHumanContext(workspaceId, role),
  );
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
  const agentContext = await agentContextForBundle(bundle, context);
  if (context.path === 'webmcp' && context.delegation) {
    await advanceDelegationObservation(
      workspaceId,
      context.delegation.grantId,
      bundle.workspace.workspaceSeq,
    );
  }
  return { status: 'FORECAST' as const, forecast, context: agentContext };
}

export async function forecastAgentCommand(
  workspaceId: string,
  role: Extract<AttuneRole, 'buyer' | 'provider'>,
  command: AttuneCommand,
) {
  return forecastWithContext(
    workspaceId,
    command,
    await trustedDelegatedContext(workspaceId, role),
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
  const delegatedContext = await trustedDelegatedContext(workspaceId, role);
  const context = trustedSystemContext(workspaceId);
  const reservation = await reserveExternalMaterialization({
    workspaceId,
    revisionId: input.revisionId,
    envelope: input.envelope,
    context: delegatedContext,
  });
  if (reservation.status === 'completed') {
    return viewForBundle(await readWorkspaceBundle(workspaceId), role, delegatedContext.delegation);
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
    return viewForBundle(await readWorkspaceBundle(workspaceId), role, delegatedContext.delegation);
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
