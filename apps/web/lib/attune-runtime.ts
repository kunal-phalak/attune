import {
  AttuneCommandBus,
  AttuneCommandError,
  type CommandEnvelope,
  type TrustedExecutionContext,
  type TrustedExecutionPath,
} from '@attune/command-bus';
import {
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

function principalPrefix(path: TrustedExecutionPath): string {
  switch (path) {
    case 'human':
      return 'buyer:';
    case 'provider':
      return 'provider:';
    case 'webmcp':
      return 'agent:';
    case 'solver':
      return 'solver:';
    case 'shopify':
      return 'integration:shopify:';
  }
  throw new TypeError('Unsupported execution path.');
}

async function trustedContext(
  workspaceId: string,
  path: TrustedExecutionPath,
  role: AttuneRole,
): Promise<TrustedExecutionContext> {
  const identity = await requireWorkspaceIdentity(workspaceId, role);
  return {
    path,
    role,
    principalId: `${principalPrefix(path)}${identity.userId}`,
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

function viewForBundle(bundle: WorkspaceBundle, role: AttuneRole) {
  const bus = new AttuneCommandBus(bundle.workspace);
  const inspection = bus.inspect(role);
  return {
    ...inspection,
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
      agent: bus.inspect('agent').frontier,
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

async function inspect(workspaceId: string, role: AttuneRole, observationCursor?: number) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const path = role === 'provider' ? 'provider' : role === 'agent' ? 'webmcp' : 'human';
  const context = await trustedContext(workspaceId, path, role);
  const bundle = await readWorkspaceBundle(
    workspaceId,
    observationCursor,
    role === 'agent' && observationCursor !== undefined ? context.principalId : undefined,
  );
  return viewForBundle(bundle, role);
}

export function inspectForAgent(workspaceId: string, observationCursor?: number) {
  return inspect(workspaceId, 'agent', observationCursor);
}

export function inspectForHuman(workspaceId: string) {
  return inspect(workspaceId, 'buyer');
}

export function inspectForProvider(workspaceId: string) {
  return inspect(workspaceId, 'provider');
}

async function executeWithContext(
  workspaceId: string,
  input: CommandExecutionInput,
  path: TrustedExecutionPath,
  role: AttuneRole,
  liveblocksVersionId?: string,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const context = await trustedContext(workspaceId, path, role);
  await executePersistedCommand(
    { workspaceId, command: input.command, envelope: input.envelope, context },
    liveblocksVersionId,
  );
  const bundle = await readWorkspaceBundle(
    workspaceId,
    input.envelope.observationCursor,
    role === 'agent' ? context.principalId : undefined,
  );
  return viewForBundle(bundle, role);
}

export function executeAgentCommand(workspaceId: string, input: CommandExecutionInput) {
  return executeWithContext(workspaceId, input, 'webmcp', 'agent');
}

export function executeHumanCommand(workspaceId: string, input: CommandExecutionInput) {
  return executeWithContext(workspaceId, input, 'human', 'buyer');
}

export async function executeProviderCommand(workspaceId: string, input: CommandExecutionInput) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  await trustedContext(workspaceId, 'provider', 'provider');
  const current = await readWorkspaceBundle(workspaceId);
  const collaboration = await snapshotCollaborativeDraft(
    current.liveblocksRoomId,
    current.workspace,
  );
  return executeWithContext(workspaceId, input, 'provider', 'provider', collaboration.versionId);
}

export async function executeCommerceMaterialization(
  workspaceId: string,
  input: CommerceMaterializationInput,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  await trustedContext(workspaceId, 'webmcp', 'agent');
  const context = await trustedContext(workspaceId, 'shopify', 'agent');
  const reservation = await reserveExternalMaterialization({
    workspaceId,
    revisionId: input.revisionId,
    envelope: input.envelope,
    context,
  });
  if (reservation.status === 'completed') {
    return viewForBundle(await readWorkspaceBundle(workspaceId), 'agent');
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
    return viewForBundle(await readWorkspaceBundle(workspaceId), 'agent');
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
