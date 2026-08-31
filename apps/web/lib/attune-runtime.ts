import {
  AttuneCommandBus,
  AttuneCommandError,
  type CommandEnvelope,
  type DelegationGrant,
  type TrustedExecutionContext,
} from '@attune/command-bus';
import {
  activeDelegationForWorkspace,
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
  hashSpecification,
  type AttuneCommand,
  type AttuneRole,
} from '@attune/domain';
import { materializeAt1042Revision } from '@attune/shopify';

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

function viewForBundle(bundle: WorkspaceBundle, role: AttuneRole, delegation?: DelegationGrant) {
  const bus = new AttuneCommandBus(bundle.workspace);
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
      externalVerifications: bundle.workspace.commerceLinks,
    },
    latestReceipt: bundle.receipts.at(-1) ?? null,
    latestCapabilityTransition: bundle.transitions.at(-1) ?? null,
    receiptCount: bundle.receipts.length,
    impact: impactMetrics(bundle),
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
  observationCursor?: number,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const context = await trustedDelegatedContext(workspaceId, role);
  const bundle = await readWorkspaceBundle(
    workspaceId,
    observationCursor,
    observationCursor === undefined ? undefined : context.principalId,
  );
  return viewForBundle(bundle, role, context.delegation);
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
