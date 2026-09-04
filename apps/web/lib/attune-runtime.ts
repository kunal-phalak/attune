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
  buyerCommerceProfile,
  connectedShopifyInstallationForDomain,
  ensureJudgeWorkspace,
  executePersistedCommand,
  finishExternalMaterialization,
  grantWorkspaceProviderAuthority,
  issueAgentDelegation,
  JUDGE_WORKSPACE_ID,
  liveblocksRoomIdForWorkspace,
  readWorkspaceBundle,
  refreshAgentDelegation,
  reserveExternalMaterialization,
  revokeAgentDelegation,
  saveShopifyCustomerBinding,
  shopifyInstallationForDomain,
  shopifyCustomerBinding,
  userIdForPrincipalId,
  workspaceMemberUserIds,
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
  type AttuneWorkspace,
  type ProviderCapabilityProfile,
  type SavedDesignVersion,
  type SelectionContextRequest,
} from '@attune/domain';
import { getPlaneGcsSolver } from '@attune/domain/planegcs';
import {
  createAndVerifyDraftOrder,
  createAndVerifyDraftOrderWithAdmin,
  coreConfigurationFromEnvironment,
  materializeRevision,
  ShopifyIntegrationError,
  synchronizeCustomerWithAdmin,
  synchronizeShopifyCustomer,
} from '@attune/shopify';
import { compileAgentContext, compileAgentMutationResult } from '@attune/webmcp';

import {
  AGENT_ACCESS_CONSENT_MS,
  AGENT_DELEGATION_LEASE_MS,
  availableCapabilityIdsForWorkspaceAuthority,
  authorityRoleForCommand,
  capabilityIdsForWorkspaceAuthority,
  delegationLeaseExpired,
  delegationStatus,
  type AgentDelegationStatus,
} from './agent-delegation';
import { requireWorkspaceIdentity, workspaceIdentity } from './auth/session';
import { attuneActivityNotification } from './liveblocks/notifications';
import {
  getLiveblocks,
  grantLiveblocksWorkspaceProviderAccess,
  liveblocksConfigured,
  setAgentPresence,
  snapshotCollaborativeDraft,
  syncAuthoritativeWorkspace,
} from './liveblocks/server';
import { buyerCommerceProfileComplete } from './manufacturing/buyer-commerce';
import { workspaceForMakerReview } from './manufacturing/maker-review';
import {
  oauthShopifyProviderConnection,
  shopifyProviderProfile,
} from './manufacturing/marketplace';
import {
  PreviewStorage,
  PreviewStorageConfigurationError,
  previewStorageConfigured,
} from './manufacturing/preview-storage';
import { renderVersionPreview } from './manufacturing/version-preview';
import { measureServerPhase, type ServerTimingRecorder } from './server-timing';
import { adminForShopifyInstallation } from './shopify/installations';

export interface CommandExecutionInput {
  readonly command: AttuneCommand;
  readonly envelope: CommandEnvelope;
}

export interface CommerceMaterializationInput {
  readonly revisionId: string;
  readonly envelope: CommandEnvelope;
}

function agentActivity(command: AttuneCommand): string {
  if (command.type === 'instantiate_recipe' || command.type === 'update_recipe_parameters') {
    return 'Building mechanical geometry';
  }
  if (command.type === 'set_tangent') return 'Applying tangency';
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
    case 'instantiate_recipe':
    case 'update_recipe_parameters':
      return { groupIds: [command.sourceRef] };
    case 'set_radius':
      return { entityIds: [command.target.entityId] };
    case 'set_tangent':
      return {
        entityIds: command.targets.map(({ entityId }) => entityId),
        constraintIds: [command.constraintId],
      };
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
  const shouldEnableByDefault = !delegation;
  const shouldRevalidateJudge =
    bundle.workspaceId === JUDGE_WORKSPACE_ID &&
    identity.roles.includes('buyer') &&
    identity.roles.includes('provider') &&
    status.status === 'revalidation_required' &&
    !delegation?.revokedAt &&
    Date.parse(delegation?.consentExpiresAt ?? '') > now;
  if (shouldEnableByDefault || shouldRevalidateJudge) {
    delegation = await issueAgentDelegation({
      workspaceId: bundle.workspaceId,
      principalId: identity.principalId,
      capabilityIds,
      authorityEpoch: bundle.workspace.authorityEpoch,
      observationCursor: bundle.workspace.workspaceSeq,
      issuedAt: new Date(now).toISOString(),
      expiresAt: leaseTimestamp(now),
      consentExpiresAt: new Date(now + AGENT_ACCESS_CONSENT_MS).toISOString(),
    });
    status = delegationStatus(delegation, bundle.workspace.authorityEpoch, now);
  }
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

function trustedShopifyReconciliationContext(workspaceId: string): TrustedExecutionContext {
  return {
    path: 'shopify_reconciliation',
    workspaceId,
    role: 'provider',
    principalId: 'shopify:reconciliation:attune',
  };
}

async function notifyWorkspace(input: {
  readonly workspaceId: string;
  readonly title: string;
  readonly description: string;
  readonly subjectId: string;
  readonly route?: string;
}): Promise<void> {
  if (!liveblocksConfigured()) return;
  const [bundle, userIds] = await Promise.all([
    readWorkspaceBundle(input.workspaceId),
    workspaceMemberUserIds(input.workspaceId),
  ]);
  await Promise.all(
    userIds.map((userId) =>
      getLiveblocks().triggerInboxNotification(
        attuneActivityNotification({
          userId,
          roomId: bundle.liveblocksRoomId,
          workspaceId: input.workspaceId,
          subjectId: input.subjectId,
          title: input.title,
          description: input.description,
          route: input.route,
        }),
      ),
    ),
  );
}

async function notifyMakerForRequest(
  shopDomain: string,
  input: {
    readonly workspaceId: string;
    readonly title: string;
    readonly description: string;
    readonly subjectId: string;
  },
): Promise<void> {
  if (!liveblocksConfigured()) return;
  try {
    const installation = await shopifyInstallationForDomain(shopDomain);
    if (!installation) return;
    const maker = await userIdForPrincipalId(installation.ownerPrincipalId);
    if (!maker) return;
    const bundle = await readWorkspaceBundle(input.workspaceId);
    await getLiveblocks().triggerInboxNotification(
      attuneActivityNotification({
        userId: maker.userId,
        roomId: bundle.liveblocksRoomId,
        workspaceId: input.workspaceId,
        subjectId: input.subjectId,
        title: input.title,
        description: input.description,
        route: `/dashboard?workspace_id=${encodeURIComponent(input.workspaceId)}&perspective=provider&surface=provider_requests`,
      }),
    );
  } catch {
    // Best-effort delivery to the maker; never block the request flow.
  }
}

async function ensureVersionPreview(
  workspaceId: string,
  version: SavedDesignVersion | undefined,
): Promise<void> {
  if (!version || version.preview.status === 'STORED') return;
  let command: Extract<AttuneCommand, { type: 'set_version_preview' }>;
  try {
    const body = await renderVersionPreview(version);
    const key = await new PreviewStorage().putVersionPreview({ workspaceId, version, body });
    command = {
      type: 'set_version_preview',
      versionId: version.versionId,
      status: 'STORED',
      key,
      storedAt: new Date().toISOString(),
    };
  } catch (error) {
    command = {
      type: 'set_version_preview',
      versionId: version.versionId,
      status: error instanceof PreviewStorageConfigurationError ? 'UNCONFIGURED' : 'FAILED',
      errorCode:
        error instanceof PreviewStorageConfigurationError
          ? error.code
          : 'PREVIEW_STORAGE_WRITE_FAILED',
    };
  }
  const current = await readWorkspaceBundle(workspaceId);
  await executePersistedCommand({
    workspaceId,
    command,
    envelope: {
      commandId: `version-preview-${crypto.randomUUID()}`,
      expectedWorkspaceSeq: current.workspace.workspaceSeq,
      expectedCapabilityEpoch: current.workspace.capabilityEpoch,
      expectedAuthorityEpoch: current.workspace.authorityEpoch,
      expectedSpecHash: hashSpecification(current.workspace),
    },
    context: trustedSystemContext(workspaceId),
  });
}

async function ensurePendingVersionPreviews(
  workspaceId: string,
  bundle: WorkspaceBundle,
): Promise<WorkspaceBundle> {
  const pending = bundle.workspace.savedVersions.filter(
    ({ preview }) => preview.status === 'PENDING',
  );
  if (pending.length === 0) return bundle;
  await pending.reduce(
    (previous, version) => previous.then(() => ensureVersionPreview(workspaceId, version)),
    Promise.resolve(),
  );
  return readWorkspaceBundle(workspaceId);
}

function versionForCommand(
  workspace: AttuneWorkspace,
  command: AttuneCommand,
): SavedDesignVersion | undefined {
  if (command.type === 'request_quote' && command.versionId) {
    return workspace.savedVersions.find(({ versionId }) => versionId === command.versionId);
  }
  if (
    command.type === 'save_design_version' ||
    command.type === 'request_quote' ||
    command.type === 'request_changes'
  ) {
    return workspace.savedVersions.at(-1);
  }
  return undefined;
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
  const bus = new AttuneCommandBus(bundle.workspace, undefined, solver, {}, timing);
  const inspection = bus.inspect(role);
  const authorityCapabilityIds = availableCapabilityIdsForWorkspaceAuthority(
    bundle.workspace,
    authorityRoles,
  );
  const authorityCapabilityIdSet = new Set(authorityCapabilityIds);
  const authorizedCapabilities = inspection.capabilities.filter(({ id }) =>
    authorityCapabilityIdSet.has(id),
  );
  const delegatedCapabilities = delegation
    ? authorizedCapabilities.filter(({ id }) => delegation.capabilityIds.includes(id))
    : authorizedCapabilities;
  const buyerPerspective = role === 'buyer';
  const providerPerspective = role === 'provider';
  const makerWorkspace = workspaceForMakerReview(bundle.workspace);
  const visibleWorkspace = buyerPerspective
    ? bundle.workspace
    : providerPerspective
      ? makerWorkspace
      : {
          ...bundle.workspace,
          quoteRequests: [],
          frozenRevisions: [],
          quotes: [],
          acceptances: [],
          manufacturingRequests: [],
          changeRequests: [],
          externalCommerceRecords: [],
          commerceLinks: [],
        };
  const visibleSolve =
    visibleWorkspace.sketchDocument === bundle.workspace.sketchDocument
      ? solve
      : solver.solve(visibleWorkspace.sketchDocument);
  const selection = createSelectionContext(visibleSolve.document);
  const previewStorage = new PreviewStorage();
  const versionPreviews = await Promise.all(
    visibleWorkspace.savedVersions.map(async (version) => {
      if (!previewStorageConfigured()) {
        return {
          versionId: version.versionId,
          status: 'UNCONFIGURED' as const,
          errorCode: 'PREVIEW_STORAGE_UNCONFIGURED',
        };
      }
      if (version.preview.status !== 'STORED' || !version.preview.key) {
        return {
          versionId: version.versionId,
          status: version.preview.status,
          ...(version.preview.errorCode ? { errorCode: version.preview.errorCode } : {}),
        };
      }
      return {
        versionId: version.versionId,
        status: 'STORED' as const,
        url: await previewStorage.getSignedPreviewUrl(version.preview.key),
      };
    }),
  );
  const view = {
    ...inspection,
    workspace: visibleWorkspace,
    capabilities: delegatedCapabilities,
    perspective: role,
    authority: {
      perspectives: authorityRoles.filter(
        (candidate): candidate is Extract<AttuneRole, 'buyer' | 'provider'> =>
          candidate === 'buyer' || candidate === 'provider',
      ),
      possessedCapabilityIds: capabilityIdsForWorkspaceAuthority(bundle.workspace, authorityRoles),
      capabilityIds: authorityCapabilityIds,
      authorityEpoch: bundle.workspace.authorityEpoch,
    },
    delegation: delegationState,
    observation: bundle.observation,
    product: {
      workspaceId: bundle.workspaceId,
      agentToolsEnabled: true,
      judgeMode: bundle.workspaceId === JUDGE_WORKSPACE_ID,
      projectName: bundle.projectName,
      fileName: bundle.fileName,
      liveblocksRoomId: bundle.liveblocksRoomId,
    },
    versionPreviews,
    frontiers: {
      buyer: bus.inspect('buyer').frontier,
      provider: bus.inspect('provider').frontier,
      editor: bus.inspect('editor').frontier,
      reviewer: bus.inspect('reviewer').frontier,
    },
    repairs: compareValidChanges(visibleWorkspace),
    records: {
      receipts: bundle.receipts,
      capabilityTransitions: bundle.transitions,
      commandRejections: bundle.rejections,
      externalCommerce: visibleWorkspace.externalCommerceRecords,
      externalVerifications: visibleWorkspace.commerceLinks,
    },
    latestReceipt: bundle.receipts.at(-1) ?? null,
    latestCapabilityTransition: bundle.transitions.at(-1) ?? null,
    receiptCount: bundle.receipts.length,
    impact: impactMetrics(bundle),
    semantic: {
      documentRevision: visibleWorkspace.sketchDocument.revision,
      selection,
      rankedConstraintCandidates: rankConstraintCandidates(visibleSolve.document, selection),
      availableActions: delegatedCapabilities.some(({ id }) => id === 'edit_draft')
        ? [
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
      solve: visibleSolve.document.lastSolve ?? null,
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
  let bundle = await measureServerPhase(timing, 'neon_workspace_load', () =>
    readWorkspaceBundle(workspaceId, undefined, undefined, timing),
  );
  bundle = await measureServerPhase(timing, 'version_preview_backfill', () =>
    ensurePendingVersionPreviews(workspaceId, bundle),
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
  timing?: ServerTimingRecorder,
) {
  const solver = await getPlaneGcsSolver();
  const perspective = context.perspective ?? context.role;
  const visibleWorkspace =
    perspective === 'provider' ? workspaceForMakerReview(bundle.workspace) : bundle.workspace;
  const solution = await measureServerPhase(timing, 'plane_gcs', async () =>
    solver.solve(visibleWorkspace.sketchDocument),
  );
  const workspace = {
    ...visibleWorkspace,
    sketchDocument: {
      ...visibleWorkspace.sketchDocument,
      lastSolve: solution.document.lastSolve,
    },
  };
  const inspection = new AttuneCommandBus(workspace, undefined, solver).inspect(perspective);
  const capabilityIds = inspection.capabilities
    .filter(({ id }) => !context.delegation || context.delegation.capabilityIds.includes(id))
    .map(({ id }) => id);
  return measureServerPhase(timing, 'context_compilation', async () =>
    compileAgentContext({
      workspace,
      role: perspective,
      capabilityIds,
      observation: bundle.observation,
      delegation: delegationState,
      focus,
    }),
  );
}

export async function inspectAgentContext(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  focus?: SelectionContextRequest,
  timing?: ServerTimingRecorder,
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
  const snapshot = await agentContextForBundle(bundle, context, access.status, focus, timing);
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

export async function inspectForCurrentHuman(workspaceId: string, timing?: ServerTimingRecorder) {
  const identity = await workspaceIdentity(workspaceId);
  const role: AttuneRole = identity.roles.includes('buyer')
    ? 'buyer'
    : identity.roles.includes('provider')
      ? 'provider'
      : identity.roles.includes('editor')
        ? 'editor'
        : 'reviewer';
  const bundle = await readWorkspaceBundle(workspaceId, undefined, undefined, timing);
  return viewForTrustedBundle(bundle, role, identity);
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

async function requireProfileForLiveRequest(workspaceId: string, principalId: string) {
  const bundle = await readWorkspaceBundle(workspaceId);
  const profile = bundle.workspace.providerCapabilityProfile;
  if (profile.source !== 'SHOPIFY_AND_ATTUNE' || !profile.shopify) return null;
  const buyer = await buyerCommerceProfile(principalId);
  if (!buyerCommerceProfileComplete(buyer)) {
    throw new ShopifyIntegrationError(
      'BUYER_COMMERCE_PROFILE_REQUIRED',
      'Complete buyer details before sending this request to a live Shopify maker.',
    );
  }
  return buyer;
}

async function persistProviderProfile(
  workspaceId: string,
  profile: ProviderCapabilityProfile,
): Promise<WorkspaceBundle> {
  const bundle = await readWorkspaceBundle(workspaceId);
  if (JSON.stringify(bundle.workspace.providerCapabilityProfile) === JSON.stringify(profile)) {
    return bundle;
  }
  await executePersistedCommand({
    workspaceId,
    command: { type: 'synchronize_provider_profile', profile },
    envelope: {
      commandId: `shopify-provider-${crypto.randomUUID()}`,
      expectedWorkspaceSeq: bundle.workspace.workspaceSeq,
      expectedCapabilityEpoch: bundle.workspace.capabilityEpoch,
      expectedAuthorityEpoch: bundle.workspace.authorityEpoch,
      expectedSpecHash: hashSpecification(bundle.workspace),
    },
    context: trustedSystemContext(workspaceId),
  });
  return readWorkspaceBundle(workspaceId);
}

async function synchronizeLiveMakerForRequest(
  workspaceId: string,
  targetShopDomain?: string,
): Promise<WorkspaceBundle> {
  const bundle = await readWorkspaceBundle(workspaceId);
  const existing = bundle.workspace.providerCapabilityProfile;
  const targetDomain = targetShopDomain?.trim().toLowerCase() || undefined;
  if (!targetDomain) {
    throw new ShopifyIntegrationError(
      'MAKER_NOT_SELECTED',
      'Select a Maker store before sending a request.',
    );
  }
  const installation = await shopifyInstallationForDomain(targetDomain);
  if (!installation || installation.connectionStatus !== 'connected') {
    throw new ShopifyIntegrationError(
      'ADMIN_AUTH_FAILED',
      'The selected Maker store must reconnect Shopify before receiving a request.',
    );
  }
  const connection = await oauthShopifyProviderConnection(installation);
  const profile = shopifyProviderProfile(
    connection,
    installation.selectedLocationId ?? existing.shopify?.locationId,
    installation.makerProfile ?? existing,
  );
  const maker = await userIdForPrincipalId(installation.ownerPrincipalId);
  if (!maker) {
    throw new ShopifyIntegrationError(
      'ADMIN_AUTH_FAILED',
      'The selected Maker store owner could not receive this request.',
    );
  }
  const access = await grantWorkspaceProviderAuthority(workspaceId, maker.userId);
  await grantLiveblocksWorkspaceProviderAccess(access.liveblocksRoomId, maker.userId);
  if (access.changed) {
    await syncAuthoritativeWorkspace(access.liveblocksRoomId, access.workspace);
  }
  return persistProviderProfile(workspaceId, profile);
}

function rebaseInputToBundle(
  input: CommandExecutionInput,
  bundle: WorkspaceBundle,
): CommandExecutionInput {
  return {
    ...input,
    envelope: {
      ...input.envelope,
      expectedWorkspaceSeq: bundle.workspace.workspaceSeq,
      expectedCapabilityEpoch: bundle.workspace.capabilityEpoch,
      expectedAuthorityEpoch: bundle.workspace.authorityEpoch,
      expectedSpecHash: hashSpecification(bundle.workspace),
      observationCursor: bundle.workspace.workspaceSeq,
    },
  };
}

export async function executeAgentCommand(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  input: CommandExecutionInput,
) {
  const context = await trustedDelegatedContext(workspaceId, perspective, input.command.type);
  let preparedInput = input;
  if (input.command.type === 'request_quote') {
    preparedInput = rebaseInputToBundle(
      input,
      await synchronizeLiveMakerForRequest(workspaceId, input.command.shopDomain),
    );
    await requireProfileForLiveRequest(workspaceId, context.principalId);
  }
  const executionInput: CommandExecutionInput =
    input.command.type === 'request_quote'
      ? {
          ...preparedInput,
          command: { ...input.command, buyerPrincipalId: context.principalId },
        }
      : preparedInput;
  const result = await executeWithContext(workspaceId, executionInput, context);
  const version = versionForCommand(result.workspace, input.command);
  if (version) await ensureVersionPreview(workspaceId, version);
  if (input.command.type === 'request_quote') {
    const request = result.workspace.manufacturingRequests.at(-1);
    const subjectId = `request:${request?.requestId ?? input.envelope.commandId}`;
    if (request?.provider.shopDomain) {
      await notifyMakerForRequest(request.provider.shopDomain, {
        workspaceId,
        title: 'New request received',
        description: 'A buyer sent you a manufacturing request ready for review.',
        subjectId,
      });
    }
  }
  if (input.command.type === 'accept_revision') {
    await notifyWorkspace({
      workspaceId,
      title: 'Checkout ready',
      description: 'The exact quoted revision was accepted and can continue to Shopify.',
      subjectId: `acceptance:${input.command.quoteId}`,
      route: `/dashboard?workspace_id=${encodeURIComponent(workspaceId)}&surface=buyer_orders`,
    }).catch(() => undefined);
  }
  return version ? inspectForDelegatedAgent(workspaceId, perspective) : result;
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
  const authorityCapabilityIds = availableCapabilityIdsForWorkspaceAuthority(
    result.workspace,
    context.authorityRoles ?? [perspective],
  ).filter((id) => !context.delegation || context.delegation.capabilityIds.includes(id));
  const changedEntityIds = result.receipt.affectedEntities
    .filter((id) => result.workspace.sketchDocument.entities.some((entity) => entity.id === id))
    .slice(0, 16);
  const nextContext = compileAgentContext({
    workspace: result.workspace,
    role: perspective,
    capabilityIds,
    observation: result.observation,
    delegation: context.delegation
      ? delegationStatus(context.delegation, result.workspace.authorityEpoch)
      : { status: 'required', authorityEpoch: result.workspace.authorityEpoch },
    focus: { entityIds: changedEntityIds },
  });
  timing?.('context_compilation', performance.now() - contextStartedAt);
  return {
    result,
    nextContext,
    mutation: compileAgentMutationResult(
      result,
      nextContext,
      capabilityIds,
      authorityCapabilityIds,
    ),
  };
}

export async function executeAgentSemanticCommand(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  input: CommandExecutionInput,
  timing?: ServerTimingRecorder,
) {
  const execution = await executeSemanticCommand(
    workspaceId,
    input,
    await trustedDelegatedContext(workspaceId, perspective, input.command.type),
    timing,
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
  timing?: ServerTimingRecorder,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const bundle = await readWorkspaceBundle(
    workspaceId,
    context.delegation?.observationCursor,
    context.path === 'webmcp' ? context.principalId : undefined,
  );
  const solver = await getPlaneGcsSolver();
  const bus = new AttuneCommandBus(bundle.workspace, undefined, solver, {}, timing);
  const forecast = await measureServerPhase(timing, 'forecast', async () =>
    bus.forecast(command, context, `forecast-${crypto.randomUUID()}`),
  );
  const agentContext = await agentContextForBundle(
    bundle,
    context,
    context.delegation
      ? delegationStatus(context.delegation, bundle.workspace.authorityEpoch)
      : { status: 'required', authorityEpoch: bundle.workspace.authorityEpoch },
    undefined,
    timing,
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
  timing?: ServerTimingRecorder,
) {
  return forecastWithContext(
    workspaceId,
    command,
    await trustedDelegatedContext(workspaceId, perspective, command.type),
    timing,
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
  const context = await trustedHumanContext(workspaceId, role);
  let preparedInput = input;
  if (input.command.type === 'request_quote') {
    preparedInput = rebaseInputToBundle(
      input,
      await synchronizeLiveMakerForRequest(workspaceId, input.command.shopDomain),
    );
    await requireProfileForLiveRequest(workspaceId, context.principalId);
  }
  const executionInput: CommandExecutionInput =
    input.command.type === 'request_quote'
      ? {
          ...preparedInput,
          command: { ...input.command, buyerPrincipalId: context.principalId },
        }
      : preparedInput;
  const result = await executeWithContext(workspaceId, executionInput, context);
  const version = versionForCommand(result.workspace, input.command);
  if (version) await ensureVersionPreview(workspaceId, version);
  if (input.command.type === 'request_quote') {
    const request = result.workspace.manufacturingRequests.at(-1);
    const subjectId = `request:${request?.requestId ?? input.envelope.commandId}`;
    if (request?.provider.shopDomain) {
      await notifyMakerForRequest(request.provider.shopDomain, {
        workspaceId,
        title: 'New request received',
        description: 'A buyer sent you a manufacturing request ready for review.',
        subjectId,
      });
    }
  }
  if (input.command.type === 'accept_revision') {
    await notifyWorkspace({
      workspaceId,
      title: 'Checkout ready',
      description: 'The exact quoted revision was accepted and can continue to Shopify.',
      subjectId: `acceptance:${input.command.quoteId}`,
      route: `/dashboard?workspace_id=${encodeURIComponent(workspaceId)}&surface=buyer_orders`,
    }).catch(() => undefined);
  }
  return version ? inspectHuman(workspaceId, role) : result;
}

export async function synchronizeProviderProfile(
  workspaceId: string,
  profile: ProviderCapabilityProfile,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  await persistProviderProfile(workspaceId, profile);
  return inspectForHuman(workspaceId);
}

async function executeProviderCommandWithContext(
  workspaceId: string,
  input: CommandExecutionInput,
  context: TrustedExecutionContext,
) {
  if (workspaceId === JUDGE_WORKSPACE_ID) await ensureJudgeWorkspace();
  const current = await readWorkspaceBundle(workspaceId);
  let liveblocksVersionId: string | undefined;
  try {
    // Bring the collaborative canvas up to the authoritative workspace before validating the
    // snapshot. syncAuthoritativeWorkspace only overwrites the room when the canvas is behind
    // the authoritative seq, so genuine un-committed canvas edits (a real drift) are preserved
    // and still surfaced, but a stale canvas that simply never got re-synced no longer produces
    // a false COLLABORATIVE_DRAFT_DRIFT on quote finalization.
    await syncAuthoritativeWorkspace(current.liveblocksRoomId, current.workspace);
    const collaboration = await snapshotCollaborativeDraft(
      current.liveblocksRoomId,
      current.workspace,
    );
    liveblocksVersionId = collaboration.versionId;
  } catch (error) {
    // The Liveblocks canvas version is a non-critical annotation on the frozen revision. The
    // canonical frozen revision (with its own full spec and spec hash) is persisted independently
    // and is the source of truth for the quote. A canvas that is out of sync (or unversioned)
    // must never block quote finalization, so tolerate both MISSING and DRIFT here and simply
    // persist the quote without the canvas version binding.
    const message = error instanceof Error ? error.message : '';
    if (message !== 'COLLABORATIVE_DRAFT_MISSING' && message !== 'COLLABORATIVE_DRAFT_DRIFT') {
      throw error;
    }
  }
  return executeWithContext(workspaceId, input, context, liveblocksVersionId);
}

export async function executeProviderCommand(workspaceId: string, input: CommandExecutionInput) {
  return executeProviderCommandWithContext(
    workspaceId,
    input,
    await trustedHumanContext(workspaceId, 'provider'),
  );
}

const DEFAULT_DEMO_CURRENCY = 'INR';

async function finalizeProviderQuoteWithContext(
  workspaceId: string,
  input: CommandExecutionInput,
  context: TrustedExecutionContext,
) {
  if (input.command.type !== 'freeze_and_quote_revision') {
    throw new TypeError('Provider quote finalization requires quote terms.');
  }
  let stage = 'Shopify currency resolution';
  try {
    const currentBeforeQuote = await readWorkspaceBundle(workspaceId);
    const activeRequest = currentBeforeQuote.workspace.manufacturingRequests.findLast((candidate) =>
      ['REQUESTED', 'UNDER_REVIEW', 'PROVIDER_REVIEW_REQUESTED', 'CHANGES_REQUESTED'].includes(
        candidate.status,
      ),
    );
    // The judge review workspace must be able to finalize a quote end-to-end without a real
    // connected Shopify maker store so the demo can be exercised standalone. Any other workspace
    // still requires a selected maker bound to a connected store.
    const judgeDemo = workspaceId === JUDGE_WORKSPACE_ID;
    const quoteInstallation = activeRequest?.shopDomain
      ? await connectedShopifyInstallationForDomain(activeRequest.shopDomain)
      : undefined;
    if (!judgeDemo) {
      if (!activeRequest?.shopDomain) {
        throw new ShopifyIntegrationError(
          'MAKER_NOT_SELECTED',
          'A connected Shopify Maker store must be selected before finalizing a quote.',
        );
      }
      if (!quoteInstallation) {
        throw new ShopifyIntegrationError(
          'ADMIN_AUTH_FAILED',
          'The selected Maker store must reconnect Shopify before a quote can be finalized.',
        );
      }
    }
    const resolvedCurrency =
      quoteInstallation?.currencyCode?.trim().toUpperCase() ?? DEFAULT_DEMO_CURRENCY;
    if (!/^[A-Z]{3}$/.test(resolvedCurrency)) {
      throw new ShopifyIntegrationError(
        'CONFORMANCE_FAILED',
        'The connected Maker store did not provide a valid three-letter currency code.',
      );
    }
    const resolvedInput: CommandExecutionInput = {
      ...input,
      command: { ...input.command, currency: resolvedCurrency },
    };
    stage = 'quote persistence';
    const quotedView = await executeProviderCommandWithContext(workspaceId, resolvedInput, context);
    const quote = quotedView.workspace.quotes.at(-1);
    const request = quote
      ? quotedView.workspace.manufacturingRequests.find(
          (candidate) =>
            candidate.specRevision === quote.revisionId && candidate.specHash === quote.specHash,
        )
      : undefined;
    if (!quote || !request) throw new Error('The finalized quote is not bound to a request.');
    await ensureVersionPreview(
      workspaceId,
      quotedView.workspace.savedVersions.find(({ versionId }) => versionId === request.versionId),
    );
    if (request.shopDomain && quoteInstallation) {
      stage = 'buyer customer synchronization';
      if (!request.buyerPrincipalId) {
        throw new ShopifyIntegrationError(
          'BUYER_COMMERCE_PROFILE_REQUIRED',
          'The manufacturing request is missing its buyer identity.',
        );
      }
      const buyerProfile = await buyerCommerceProfile(request.buyerPrincipalId);
      if (!buyerCommerceProfileComplete(buyerProfile)) {
        throw new ShopifyIntegrationError(
          'BUYER_COMMERCE_PROFILE_REQUIRED',
          'Complete buyer details before a Shopify Draft Order can be prepared.',
        );
      }
      const existingBinding = await shopifyCustomerBinding(
        request.buyerPrincipalId,
        request.shopDomain,
      );
      const knownInstallation = await shopifyInstallationForDomain(request.shopDomain);
      if (knownInstallation && knownInstallation.connectionStatus !== 'connected') {
        throw new ShopifyIntegrationError(
          'ADMIN_AUTH_FAILED',
          'The selected Maker store must reconnect Shopify before receiving commerce.',
        );
      }
      const installation = await connectedShopifyInstallationForDomain(request.shopDomain);
      if (!installation && coreConfigurationFromEnvironment().domain !== request.shopDomain) {
        throw new ShopifyIntegrationError(
          'ADMIN_AUTH_FAILED',
          'The selected Maker store must reconnect Shopify before receiving commerce.',
        );
      }
      const shopCurrency = installation?.currencyCode?.trim().toUpperCase();
      if (!shopCurrency || shopCurrency !== quote.currency) {
        throw new ShopifyIntegrationError(
          'CONFORMANCE_FAILED',
          `The quote currency ${quote.currency} does not match the Maker store currency ${shopCurrency ?? 'unknown'}.`,
        );
      }
      const admin = installation ? await adminForShopifyInstallation(installation) : null;
      const binding = admin
        ? await synchronizeCustomerWithAdmin(admin, {
            profile: buyerProfile,
            existingBinding,
            shopDomain: request.shopDomain,
          })
        : await synchronizeShopifyCustomer({ profile: buyerProfile, existingBinding });
      if (binding.shopDomain !== request.shopDomain) {
        throw new ShopifyIntegrationError(
          'CONFORMANCE_FAILED',
          'The Shopify customer belongs to a different maker store.',
        );
      }
      await saveShopifyCustomerBinding(binding);
      stage = 'Shopify Draft Order creation and reread';
      const draftOrderInput = {
        workspaceId,
        projectName: quotedView.product.projectName,
        request,
        quote,
        customerId: binding.customerId,
        buyerProfile,
      };
      const snapshot = admin
        ? await createAndVerifyDraftOrderWithAdmin(admin, draftOrderInput)
        : await createAndVerifyDraftOrder(draftOrderInput);
      stage = 'Draft Order reconciliation';
      const current = await readWorkspaceBundle(workspaceId);
      await executePersistedCommand({
        workspaceId,
        command: { type: 'synchronize_shopify_draft_order', snapshot },
        envelope: {
          commandId: `shopify-draft-order-${crypto.randomUUID()}`,
          expectedWorkspaceSeq: current.workspace.workspaceSeq,
          expectedCapabilityEpoch: current.workspace.capabilityEpoch,
          expectedAuthorityEpoch: current.workspace.authorityEpoch,
          expectedSpecHash: hashSpecification(current.workspace),
        },
        context: trustedShopifyReconciliationContext(workspaceId),
      });
    }
    stage = 'buyer notification';
    await notifyWorkspace({
      workspaceId,
      title: 'Quote ready',
      description: `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: quote.currency }).format(quote.amountMinor / 100)} · ${quote.leadTimeDays ?? '—'} day lead time`,
      subjectId: `quote:${quote.quoteId}`,
      route: `/dashboard?workspace_id=${encodeURIComponent(workspaceId)}&surface=buyer_orders`,
    }).catch(() => undefined);
    return context.path === 'webmcp'
      ? inspectForDelegatedAgent(
          workspaceId,
          context.perspective === 'buyer' ? 'buyer' : 'provider',
        )
      : inspectForProvider(workspaceId);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
    process.stderr.write(`[attune] Provider quote failed during ${stage}: ${detail}\n`);
    if (error instanceof ShopifyIntegrationError) throw error;
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      `Provider quote failed during ${stage}: ${detail}`,
    );
  }
}

export async function finalizeProviderQuote(workspaceId: string, input: CommandExecutionInput) {
  return finalizeProviderQuoteWithContext(
    workspaceId,
    input,
    await trustedHumanContext(workspaceId, 'provider'),
  );
}

export async function finalizeProviderQuoteForAgent(
  workspaceId: string,
  perspective: Extract<AttuneRole, 'buyer' | 'provider'>,
  input: CommandExecutionInput,
) {
  return finalizeProviderQuoteWithContext(
    workspaceId,
    input,
    await trustedDelegatedContext(workspaceId, perspective, 'freeze_and_quote_revision'),
  );
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
    const reservedBundle = await readWorkspaceBundle(workspaceId);
    const reservedQuote = reservedBundle.workspace.quotes.find(
      ({ revisionId, specHash }) =>
        revisionId === reservation.revision.revisionId &&
        specHash === reservation.revision.specHash,
    );
    const reservedRequest = reservedBundle.workspace.manufacturingRequests.find(
      ({ specRevision, specHash }) =>
        specRevision === reservation.revision.revisionId &&
        specHash === reservation.revision.specHash,
    );
    if (!reservedQuote || !reservedRequest) {
      throw new Error('Product materialization requires the exact quoted manufacturing request.');
    }
    const exactVersion = reservedBundle.workspace.savedVersions.find(
      ({ versionId }) => versionId === reservation.revision.versionId,
    );
    if (!exactVersion || exactVersion.preview.status !== 'STORED' || !exactVersion.preview.key) {
      throw new ShopifyIntegrationError(
        'MISSING_CONFIGURATION',
        'Exact saved-version preview storage must be available before storefront publishing.',
      );
    }
    const previewUrl = await new PreviewStorage().getSignedPreviewUrl(
      exactVersion.preview.key,
      600,
    );
    const verification = await materializeRevision({
      commitmentId: reservedBundle.workspace.commitmentId,
      projectName: reservedBundle.projectName,
      revision: reservation.revision,
      request: reservedRequest,
      quote: reservedQuote,
      previewUrl,
    });
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
