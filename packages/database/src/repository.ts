import {
  AttuneCommandBus,
  AttuneCommandError,
  authoritativeSemanticEnvelope,
  type CapabilityTransition,
  type ChangeReceipt,
  type CommandEnvelope,
  type CommandRejection,
  type CommandResult,
  type AgentDelegation,
  type InterventionSummary,
  type TrustedExecutionContext,
} from '@attune/command-bus';
import {
  createAt1042Workspace,
  createSketchDocument,
  createSpokeSeedDocument,
  createJudgeProviderCapabilityProfile,
  hashCanonical,
  hashSpecification,
  isSketchCommand,
  providerBinding,
  type AttuneCommand,
  type AttuneRole,
  type AttuneWorkspace,
  type SketchDocument,
} from '@attune/domain';
import { getPlaneGcsSolver } from '@attune/domain/planegcs';
import { and, asc, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';

import { getDatabase } from './client';
import {
  acceptances,
  agentInterventionObservations,
  capabilityTransitions,
  changeReceipts,
  commandIdempotencyRecords,
  commandRejections,
  commerceVerificationRecords,
  agentDelegations,
  externalCommerceRecords,
  externalActionAttempts,
  frozenRevisions,
  manufacturingRequests,
  organizationMemberships,
  organizations,
  projects,
  providerCapabilityProfiles,
  quoteRequests,
  quotes,
  users,
  workspaceFiles,
  workspaceMemberships,
  workspaceSnapshots,
  workspaces,
} from './schema';

export const JUDGE_WORKSPACE_ID = 'workspace:at-1042';
export const JUDGE_USER_ID = 'user:judge';
export const JUDGE_AUTH_USER_ID = 'judge:attune-challenge';

export interface WorkspaceIdentity {
  readonly userId: string;
  readonly principalId: string;
  readonly roles: readonly AttuneRole[];
  readonly displayName: string;
}

export interface LiveblocksWorkspaceMember {
  readonly userId: string;
  readonly roles: readonly AttuneRole[];
  readonly canComment: boolean;
}

export interface WorkspaceBundle {
  readonly workspaceId: string;
  readonly projectName: string;
  readonly fileName: string;
  readonly fileKind: string;
  readonly liveblocksRoomId: string;
  readonly needStartedAt: string;
  readonly workspace: AttuneWorkspace;
  readonly receipts: readonly ChangeReceipt[];
  readonly transitions: readonly CapabilityTransition[];
  readonly rejections: readonly CommandRejection[];
  readonly observation: InterventionSummary;
  readonly humanInterventionsDetected: number;
}

export interface CreateSketchProjectRecordInput {
  readonly userId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly roomId: string;
  readonly fileId: string;
  readonly projectCode: string;
  readonly commitmentId: string;
  readonly name: string;
  readonly template: 'blank' | 'spoke';
}

export interface ManagedSketchProjectRecord {
  readonly projectId: string;
  readonly workspaceIds: readonly string[];
  readonly roomIds: readonly string[];
}

export interface ExecutePersistedCommandInput {
  readonly workspaceId: string;
  readonly command: AttuneCommand;
  readonly envelope: CommandEnvelope;
  readonly context: TrustedExecutionContext;
  readonly timing?: (name: string, durationMs: number) => void;
}

export interface ExternalMaterializationInput {
  readonly workspaceId: string;
  readonly revisionId: string;
  readonly envelope: CommandEnvelope;
  readonly context: TrustedExecutionContext;
}

export type ExternalMaterializationReservation =
  | { readonly status: 'completed' }
  | {
      readonly status: 'reserved';
      readonly revision: AttuneWorkspace['frozenRevisions'][number];
    };

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['transaction']>[0]
>[0];

interface RepositoryCacheEntry<T> {
  readonly expiresAt: number;
  readonly value: T;
}

interface RepositoryGlobal {
  attuneProvisionedUsers?: Map<string, RepositoryCacheEntry<string>>;
  attuneWorkspaceIdentities?: Map<
    string,
    RepositoryCacheEntry<Omit<WorkspaceIdentity, 'principalId'>>
  >;
}

const REPOSITORY_CACHE_TTL_MS = 60_000;
const REPOSITORY_CACHE_LIMIT = 256;

function repositoryGlobal(): typeof globalThis & RepositoryGlobal {
  return globalThis;
}

function boundedCache<K, V>(cache: Map<K, V>): Map<K, V> {
  if (cache.size >= REPOSITORY_CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return cache;
}

function commandFingerprint(input: ExecutePersistedCommandInput): string {
  return hashCanonical({
    command: input.command,
    envelope: input.envelope,
    context: input.context,
  });
}

function externalFingerprint(input: ExternalMaterializationInput): string {
  return hashCanonical({
    type: 'materialize_for_commerce',
    revisionId: input.revisionId,
    envelope: input.envelope,
    context: input.context,
  });
}

function immutableCopy<T>(value: T): T {
  return structuredClone(value);
}

function sketchDocumentWithCurrentContract(workspace: AttuneWorkspace): SketchDocument {
  const stored = workspace.sketchDocument;
  const storedNodes = Reflect.get(stored, 'nodes');
  if (Array.isArray(storedNodes)) return stored;

  // The original, untouched judge seed predates shared topology. Upgrade that known fixture to the
  // exact current Maker.js source model; edited legacy sketches are topology-normalized in place.
  if (workspace.workspaceSeq === 0 && stored.id === 'sketch:spoke-wheel') {
    return createSpokeSeedDocument();
  }

  return createSketchDocument({
    id: stored.id,
    name: stored.name,
    revision: stored.revision,
    nodes: [],
    entities: stored.entities,
    constraints: stored.constraints ?? [],
    dimensions: stored.dimensions ?? [],
    groups: stored.groups ?? [],
    parameters: stored.parameters ?? [],
    ...(stored.source ? { source: stored.source } : {}),
    ...(stored.lastSolve ? { lastSolve: stored.lastSolve } : {}),
  });
}

function workspaceWithCurrentContract(workspace: AttuneWorkspace): AttuneWorkspace {
  const storedManufacturingRequests = Reflect.get(workspace, 'manufacturingRequests');
  const storedExternalCommerceRecords = Reflect.get(workspace, 'externalCommerceRecords');
  const storedGeometry = workspace.geometry;
  const current = {
    ...workspace,
    scenarioVersion: 3 as const,
    authorityEpoch: workspace.authorityEpoch ?? 0,
    providerCapabilityProfile:
      workspace.providerCapabilityProfile ?? createJudgeProviderCapabilityProfile(),
    geometry: {
      ...storedGeometry,
      rectangularCutouts: storedGeometry.rectangularCutouts ?? [],
      circularCutouts: storedGeometry.circularCutouts ?? [],
      ventSlots: storedGeometry.ventSlots ?? [],
    },
    sketchDocument: workspace.sketchDocument
      ? sketchDocumentWithCurrentContract(workspace)
      : createSpokeSeedDocument(),
  };
  const provider = providerBinding(current);
  return {
    ...current,
    quoteRequests: current.quoteRequests.map((request) => ({
      ...request,
      specRevision: Reflect.get(request, 'specRevision') ?? `r${request.draftVersion}`,
      provider: Reflect.get(request, 'provider') ?? provider,
    })),
    frozenRevisions: current.frozenRevisions.map((revision) => ({
      ...revision,
      provider: Reflect.get(revision, 'provider') ?? provider,
      sketchDocument: Reflect.get(revision, 'sketchDocument') ?? current.sketchDocument,
    })),
    quotes: current.quotes.map((quote) => ({
      ...quote,
      provider: Reflect.get(quote, 'provider') ?? provider,
    })),
    acceptances: current.acceptances.map((acceptance) => ({
      acceptanceId: acceptance.acceptanceId,
      quoteId: acceptance.quoteId,
      revisionId: acceptance.revisionId,
      specHash: acceptance.specHash,
      provider: Reflect.get(acceptance, 'provider') ?? provider,
      acceptedAt: acceptance.acceptedAt,
    })),
    manufacturingRequests: Array.isArray(storedManufacturingRequests)
      ? storedManufacturingRequests
      : [],
    externalCommerceRecords: Array.isArray(storedExternalCommerceRecords)
      ? storedExternalCommerceRecords
      : [],
  };
}

function interventionSummary(
  receipts: readonly ChangeReceipt[],
  cursor: number | undefined,
  workspaceSeq: number,
): InterventionSummary {
  const previousWorkspaceSeq = cursor ?? workspaceSeq;
  return {
    previousWorkspaceSeq,
    currentWorkspaceSeq: workspaceSeq,
    interventions: receipts
      .filter(
        ({ receiptSeq, origin }) =>
          cursor !== undefined && receiptSeq > cursor && origin === 'human_ui',
      )
      .map(({ receiptSeq, origin, command, affectedEntities, beforeHash, afterHash }) => ({
        receiptSeq,
        origin,
        command,
        affectedEntities,
        beforeHash,
        afterHash,
      })),
  };
}

async function persistDomainRecords(
  transaction: DatabaseTransaction,
  workspaceId: string,
  workspace: AttuneWorkspace,
  liveblocksVersionId?: string,
) {
  if (workspace.manufacturingRequests.length > 0) {
    await Promise.all(
      workspace.manufacturingRequests.map((request) =>
        transaction
          .insert(manufacturingRequests)
          .values({
            id: request.requestId,
            workspaceId,
            revisionId: request.specRevision,
            specHash: request.specHash,
            status: request.status,
            record: request,
            createdAt: request.requestedAt,
            updatedAt: request.updatedAt,
          })
          .onConflictDoUpdate({
            target: manufacturingRequests.id,
            set: {
              status: request.status,
              record: request,
              updatedAt: request.updatedAt,
            },
          }),
      ),
    );
  }
  if (workspace.externalCommerceRecords.length > 0) {
    await Promise.all(
      workspace.externalCommerceRecords.map((record) =>
        transaction
          .insert(externalCommerceRecords)
          .values({
            externalId: record.externalId,
            workspaceId,
            requestId: record.requestId,
            revisionId: record.specRevision,
            specHash: record.specHash,
            syncState: record.syncState,
            record,
            updatedAt: record.synchronizedAt,
          })
          .onConflictDoUpdate({
            target: externalCommerceRecords.externalId,
            set: {
              syncState: record.syncState,
              record,
              updatedAt: record.synchronizedAt,
            },
          }),
      ),
    );
  }
  if (workspace.quoteRequests.length > 0) {
    await transaction
      .insert(quoteRequests)
      .values(
        workspace.quoteRequests.map((request) => ({
          id: request.id,
          workspaceId,
          specHash: request.specHash,
          draftVersion: request.draftVersion,
          record: request,
        })),
      )
      .onConflictDoNothing();
  }
  if (workspace.frozenRevisions.length > 0) {
    await transaction
      .insert(frozenRevisions)
      .values(
        workspace.frozenRevisions.map((revision) => ({
          workspaceId,
          revisionId: revision.revisionId,
          specHash: revision.specHash,
          canonicalSpecification: revision,
          liveblocksVersionId,
          frozenAt: revision.frozenAt,
        })),
      )
      .onConflictDoNothing();
  }
  if (workspace.quotes.length > 0) {
    await transaction
      .insert(quotes)
      .values(
        workspace.quotes.map((quote) => ({
          id: quote.quoteId,
          workspaceId,
          revisionId: quote.revisionId,
          specHash: quote.specHash,
          record: quote,
        })),
      )
      .onConflictDoNothing();
  }
  if (workspace.acceptances.length > 0) {
    await transaction
      .insert(acceptances)
      .values(
        workspace.acceptances.map((acceptance) => ({
          id: acceptance.acceptanceId,
          workspaceId,
          quoteId: acceptance.quoteId,
          revisionId: acceptance.revisionId,
          specHash: acceptance.specHash,
          record: acceptance,
        })),
      )
      .onConflictDoNothing();
  }
  if (workspace.commerceLinks.length > 0) {
    await transaction
      .insert(commerceVerificationRecords)
      .values(
        workspace.commerceLinks.map((link) => ({
          id: link.commerceLinkId,
          workspaceId,
          revisionId: link.revisionId,
          specHash: link.specHash,
          status: link.status,
          record: link,
        })),
      )
      .onConflictDoNothing();
  }
}

async function clearWorkspaceRecords(
  transaction: DatabaseTransaction,
  workspaceId: string,
): Promise<void> {
  await transaction
    .delete(agentInterventionObservations)
    .where(eq(agentInterventionObservations.workspaceId, workspaceId));
  await transaction
    .delete(capabilityTransitions)
    .where(eq(capabilityTransitions.workspaceId, workspaceId));
  await transaction.delete(commandRejections).where(eq(commandRejections.workspaceId, workspaceId));
  await transaction
    .delete(commandIdempotencyRecords)
    .where(eq(commandIdempotencyRecords.workspaceId, workspaceId));
  await transaction
    .delete(externalActionAttempts)
    .where(eq(externalActionAttempts.workspaceId, workspaceId));
  await transaction
    .delete(commerceVerificationRecords)
    .where(eq(commerceVerificationRecords.workspaceId, workspaceId));
  await transaction
    .delete(externalCommerceRecords)
    .where(eq(externalCommerceRecords.workspaceId, workspaceId));
  await transaction
    .delete(manufacturingRequests)
    .where(eq(manufacturingRequests.workspaceId, workspaceId));
  await transaction.delete(acceptances).where(eq(acceptances.workspaceId, workspaceId));
  await transaction.delete(quotes).where(eq(quotes.workspaceId, workspaceId));
  await transaction.delete(quoteRequests).where(eq(quoteRequests.workspaceId, workspaceId));
  await transaction.delete(frozenRevisions).where(eq(frozenRevisions.workspaceId, workspaceId));
  await transaction.delete(changeReceipts).where(eq(changeReceipts.workspaceId, workspaceId));
  await transaction
    .delete(workspaceSnapshots)
    .where(eq(workspaceSnapshots.workspaceId, workspaceId));
}

async function persistRejection(
  workspaceId: string,
  rejection: CommandRejection | undefined,
): Promise<void> {
  if (!rejection) return;
  await getDatabase()
    .insert(commandRejections)
    .values({
      rejectionId: rejection.rejectionId,
      workspaceId,
      commandId: rejection.commandId,
      rejection,
      createdAt: rejection.createdAt,
    })
    .onConflictDoNothing();
}

let judgeWorkspaceReady = false;
let judgeWorkspaceSetupPromise: Promise<void> | undefined;

async function initializeJudgeWorkspace(): Promise<void> {
  const database = getDatabase();
  const currentRows = await database
    .select({ workspace: workspaces.currentSpecification })
    .from(workspaces)
    .where(eq(workspaces.id, JUDGE_WORKSPACE_ID))
    .limit(1);
  const current = currentRows[0]?.workspace;
  if (
    current &&
    Reflect.get(current, 'scenarioVersion') === 3 &&
    current.providerCapabilityProfile
  ) {
    return;
  }
  const initial = createAt1042Workspace();
  const providerProfile = createJudgeProviderCapabilityProfile();
  const now = new Date().toISOString();

  await database.transaction(async (transaction) => {
    await transaction
      .insert(organizations)
      .values({ id: 'organization:attune-demo', name: 'Attune Demo Fabrication' })
      .onConflictDoNothing();
    await transaction
      .insert(users)
      .values({
        id: JUDGE_USER_ID,
        authUserId: JUDGE_AUTH_USER_ID,
        displayName: 'Challenge Judge',
      })
      .onConflictDoNothing();
    await transaction
      .insert(organizationMemberships)
      .values({
        organizationId: 'organization:attune-demo',
        userId: JUDGE_USER_ID,
        roles: ['buyer', 'provider'],
      })
      .onConflictDoUpdate({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
        set: { roles: ['buyer', 'provider'] },
      });
    await transaction
      .insert(projects)
      .values({
        id: initial.projectId,
        organizationId: 'organization:attune-demo',
        name: 'Spoke sketch',
        code: initial.commitmentId,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: { name: 'Spoke sketch' },
      });
    await transaction
      .insert(workspaces)
      .values({
        id: JUDGE_WORKSPACE_ID,
        projectId: initial.projectId,
        name: 'Spoke sketch',
        commitmentId: initial.commitmentId,
        liveblocksRoomId: 'attune:workspace:at-1042',
        currentSpecification: initial,
        workspaceSeq: initial.workspaceSeq,
        draftVersion: initial.draftVersion,
        capabilityEpoch: initial.capabilityEpoch,
        needStartedAt: now,
      })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: { name: 'Spoke sketch' },
      });
    await transaction
      .insert(workspaceFiles)
      .values({
        id: 'file:at-1042-panel',
        workspaceId: JUDGE_WORKSPACE_ID,
        name: 'Spoke sketch.attune',
        kind: 'executable-specification',
      })
      .onConflictDoUpdate({
        target: workspaceFiles.id,
        set: { name: 'Spoke sketch.attune' },
      });
    await transaction
      .insert(workspaceMemberships)
      .values({
        workspaceId: JUDGE_WORKSPACE_ID,
        userId: JUDGE_USER_ID,
        roles: ['buyer', 'provider'],
      })
      .onConflictDoUpdate({
        target: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
        set: { roles: ['buyer', 'provider'] },
      });
    await transaction
      .insert(providerCapabilityProfiles)
      .values({
        profileId: providerProfile.profileId,
        providerId: providerProfile.providerId,
        version: providerProfile.version,
        profile: providerProfile,
        effectiveAt: providerProfile.effectiveAt,
      })
      .onConflictDoNothing();
    await transaction
      .insert(workspaceSnapshots)
      .values({
        id: `${JUDGE_WORKSPACE_ID}:snapshot:0`,
        workspaceId: JUDGE_WORKSPACE_ID,
        workspaceSeq: 0,
        specification: initial,
        specHash: hashSpecification(initial),
      })
      .onConflictDoNothing();
    const existing = await transaction
      .select({ workspace: workspaces.currentSpecification })
      .from(workspaces)
      .where(eq(workspaces.id, JUDGE_WORKSPACE_ID))
      .limit(1);
    const stored = existing[0]?.workspace;
    if (stored && Reflect.get(stored, 'scenarioVersion') !== 3) {
      await clearWorkspaceRecords(transaction, JUDGE_WORKSPACE_ID);
      await transaction
        .update(workspaces)
        .set({
          currentSpecification: initial,
          workspaceSeq: initial.workspaceSeq,
          draftVersion: initial.draftVersion,
          capabilityEpoch: initial.capabilityEpoch,
          needStartedAt: now,
          updatedAt: now,
        })
        .where(eq(workspaces.id, JUDGE_WORKSPACE_ID));
      await transaction.insert(workspaceSnapshots).values({
        id: `${JUDGE_WORKSPACE_ID}:snapshot:0`,
        workspaceId: JUDGE_WORKSPACE_ID,
        workspaceSeq: 0,
        specification: initial,
        specHash: hashSpecification(initial),
      });
    } else if (stored && !stored.providerCapabilityProfile) {
      await transaction
        .update(workspaces)
        .set({ currentSpecification: workspaceWithCurrentContract(stored), updatedAt: now })
        .where(eq(workspaces.id, JUDGE_WORKSPACE_ID));
    }
  });
}

export function ensureJudgeWorkspace(): Promise<void> {
  if (judgeWorkspaceReady) return Promise.resolve();
  judgeWorkspaceSetupPromise ??= initializeJudgeWorkspace()
    .then(() => {
      judgeWorkspaceReady = true;
    })
    .catch((error: unknown) => {
      judgeWorkspaceSetupPromise = undefined;
      throw error;
    });
  return judgeWorkspaceSetupPromise;
}

function delegationSelection() {
  return {
    id: agentDelegations.id,
    workspaceId: agentDelegations.workspaceId,
    principalId: agentDelegations.principalId,
    capabilityIds: agentDelegations.capabilityIds,
    authorityEpoch: agentDelegations.authorityEpoch,
    observationCursor: agentDelegations.observationCursor,
    issuedAt: agentDelegations.issuedAt,
    expiresAt: agentDelegations.expiresAt,
    consentExpiresAt: agentDelegations.consentExpiresAt,
    revokedAt: agentDelegations.revokedAt,
  };
}

export async function agentDelegationForWorkspace(
  workspaceId: string,
  principalId: string,
): Promise<AgentDelegation | null> {
  const rows = await getDatabase()
    .select(delegationSelection())
    .from(agentDelegations)
    .where(
      and(
        eq(agentDelegations.workspaceId, workspaceId),
        eq(agentDelegations.principalId, principalId),
      ),
    )
    .orderBy(desc(agentDelegations.issuedAt))
    .limit(1);
  return rows[0] ? immutableCopy(rows[0]) : null;
}

export async function issueAgentDelegation(input: {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly capabilityIds: AgentDelegation['capabilityIds'];
  readonly authorityEpoch: number;
  readonly observationCursor: number;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly consentExpiresAt: string;
}): Promise<AgentDelegation> {
  const id = `delegation:${hashCanonical([input.workspaceId, input.principalId]).slice(0, 32)}`;
  const rows = await getDatabase()
    .insert(agentDelegations)
    .values({ id, ...input, revokedAt: null })
    .onConflictDoUpdate({
      target: agentDelegations.id,
      set: { ...input, revokedAt: null },
    })
    .returning(delegationSelection());
  const delegation = rows[0];
  if (!delegation) throw new Error('AGENT_DELEGATION_NOT_ISSUED');
  return immutableCopy(delegation);
}

export async function refreshAgentDelegation(input: {
  readonly id: string;
  readonly authorityEpoch: number;
  readonly capabilityIds: AgentDelegation['capabilityIds'];
  readonly issuedAt: string;
  readonly expiresAt: string;
}): Promise<AgentDelegation | null> {
  const rows = await getDatabase()
    .update(agentDelegations)
    .set({
      capabilityIds: input.capabilityIds,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    })
    .where(
      and(
        eq(agentDelegations.id, input.id),
        eq(agentDelegations.authorityEpoch, input.authorityEpoch),
        sql`${agentDelegations.revokedAt} is null`,
        sql`${agentDelegations.consentExpiresAt} > ${input.issuedAt}::timestamptz`,
      ),
    )
    .returning(delegationSelection());
  return rows[0] ? immutableCopy(rows[0]) : null;
}

export async function revokeAgentDelegation(
  workspaceId: string,
  principalId: string,
): Promise<void> {
  await getDatabase()
    .update(agentDelegations)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(agentDelegations.workspaceId, workspaceId),
        eq(agentDelegations.principalId, principalId),
      ),
    );
}

export async function advanceDelegationObservation(
  workspaceId: string,
  delegationId: string,
  workspaceSeq: number,
): Promise<void> {
  await getDatabase()
    .update(agentDelegations)
    .set({
      observationCursor: sql`greatest(${agentDelegations.observationCursor}, ${workspaceSeq})`,
    })
    .where(
      and(eq(agentDelegations.workspaceId, workspaceId), eq(agentDelegations.id, delegationId)),
    );
}

export async function resetJudgeWorkspace(): Promise<void> {
  await ensureJudgeWorkspace();
  const database = getDatabase();
  const initial = createAt1042Workspace();
  const now = new Date().toISOString();

  await database.transaction(async (transaction) => {
    await clearWorkspaceRecords(transaction, JUDGE_WORKSPACE_ID);
    await transaction
      .update(workspaces)
      .set({
        currentSpecification: initial,
        workspaceSeq: initial.workspaceSeq,
        draftVersion: initial.draftVersion,
        capabilityEpoch: initial.capabilityEpoch,
        needStartedAt: now,
        updatedAt: now,
      })
      .where(eq(workspaces.id, JUDGE_WORKSPACE_ID));
    await transaction.insert(workspaceSnapshots).values({
      id: `${JUDGE_WORKSPACE_ID}:snapshot:0`,
      workspaceId: JUDGE_WORKSPACE_ID,
      workspaceSeq: 0,
      specification: initial,
      specHash: hashSpecification(initial),
    });
  });
}

export async function identityForWorkspace(
  workspaceId: string,
  userId: string,
  principalId: string,
): Promise<WorkspaceIdentity | null> {
  const cache = (repositoryGlobal().attuneWorkspaceIdentities ??= new Map());
  const cacheKey = `${workspaceId}\u0000${userId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return immutableCopy({ ...cached.value, principalId });
  }
  if (cached) cache.delete(cacheKey);
  const rows = await getDatabase()
    .select({
      userId: users.id,
      displayName: users.displayName,
      roles: workspaceMemberships.roles,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(users.id, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  boundedCache(cache).set(cacheKey, {
    expiresAt: Date.now() + REPOSITORY_CACHE_TTL_MS,
    value: immutableCopy(row),
  });
  return { ...row, principalId };
}

export async function identityForLiveblocksRoom(
  roomId: string,
  userId: string,
  principalId: string,
): Promise<(WorkspaceIdentity & { readonly workspaceId: string }) | null> {
  const rows = await getDatabase()
    .select({
      workspaceId: workspaces.id,
      userId: users.id,
      displayName: users.displayName,
      roles: workspaceMemberships.roles,
    })
    .from(workspaces)
    .innerJoin(workspaceMemberships, eq(workspaceMemberships.workspaceId, workspaces.id))
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(and(eq(workspaces.liveblocksRoomId, roomId), eq(users.id, userId)))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, principalId } : null;
}

export async function usersForLiveblocksRoom(
  roomId: string,
  userIds: readonly string[],
): Promise<readonly { readonly id: string; readonly name: string }[]> {
  if (userIds.length === 0) return [];
  return getDatabase()
    .select({ id: users.id, name: users.displayName })
    .from(workspaces)
    .innerJoin(workspaceMemberships, eq(workspaceMemberships.workspaceId, workspaces.id))
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(and(eq(workspaces.liveblocksRoomId, roomId), inArray(users.id, [...userIds])));
}

export async function workspaceMembersForLiveblocksRoom(
  roomId: string,
): Promise<readonly LiveblocksWorkspaceMember[]> {
  return getDatabase()
    .select({
      userId: workspaceMemberships.userId,
      roles: workspaceMemberships.roles,
      canComment: workspaceMemberships.canComment,
    })
    .from(workspaces)
    .innerJoin(workspaceMemberships, eq(workspaceMemberships.workspaceId, workspaces.id))
    .where(eq(workspaces.liveblocksRoomId, roomId));
}

export async function attuneUsersByIds(
  userIds: readonly string[],
): Promise<readonly { readonly id: string; readonly name: string }[]> {
  if (userIds.length === 0) return [];
  return getDatabase()
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, [...userIds]));
}

export async function attuneUserForSharing(
  identifier: string,
): Promise<{ readonly id: string; readonly name: string; readonly email: string | null } | null> {
  const rows = await getDatabase()
    .select({ id: users.id, name: users.displayName, email: users.email })
    .from(users)
    .where(or(eq(users.id, identifier), eq(users.email, identifier.toLowerCase())))
    .limit(1);
  return rows[0] ?? null;
}

export async function liveblocksRoomIdForWorkspace(workspaceId: string): Promise<string> {
  const rows = await getDatabase()
    .select({ roomId: workspaces.liveblocksRoomId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const roomId = rows[0]?.roomId;
  if (!roomId) throw new Error(`Attune workspace ${workspaceId} was not found.`);
  return roomId;
}

export async function bumpWorkspaceAuthorityEpochForRoom(roomId: string): Promise<AttuneWorkspace> {
  return getDatabase().transaction(async (transaction) => {
    const rows = await transaction
      .select({ workspace: workspaces.currentSpecification })
      .from(workspaces)
      .where(eq(workspaces.liveblocksRoomId, roomId))
      .for('update')
      .limit(1);
    const current = rows[0]?.workspace;
    if (!current) throw new Error(`Attune room ${roomId} was not found.`);
    const workspace = workspaceWithCurrentContract(current);
    const next = { ...workspace, authorityEpoch: workspace.authorityEpoch + 1 };
    await transaction
      .update(workspaces)
      .set({ currentSpecification: next, updatedAt: new Date().toISOString() })
      .where(eq(workspaces.liveblocksRoomId, roomId));
    return immutableCopy(next);
  });
}

export async function workspaceMemberUserIds(workspaceId: string): Promise<readonly string[]> {
  const rows = await getDatabase()
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, workspaceId));
  return rows.map(({ userId }) => userId);
}

export async function ensureAuthenticatedUser(input: {
  readonly authUserId: string;
  readonly email?: string;
  readonly displayName: string;
}): Promise<string> {
  const userId = `user:${hashCanonical(input.authUserId).slice(0, 24)}`;
  const cache = (repositoryGlobal().attuneProvisionedUsers ??= new Map());
  const cacheKey = hashCanonical(input);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) cache.delete(cacheKey);
  const organizationId = `organization:personal:${hashCanonical(input.authUserId).slice(0, 20)}`;
  await getDatabase().transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values({
        id: userId,
        authUserId: input.authUserId,
        email: input.email,
        displayName: input.displayName,
      })
      .onConflictDoUpdate({
        target: users.authUserId,
        set: { email: input.email, displayName: input.displayName },
      });
    await transaction
      .insert(organizations)
      .values({ id: organizationId, name: `${input.displayName} projects` })
      .onConflictDoNothing();
    await transaction
      .insert(organizationMemberships)
      .values({ organizationId, userId, roles: ['buyer'] })
      .onConflictDoUpdate({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
        set: { roles: ['buyer'] },
      });
  });
  boundedCache(cache).set(cacheKey, {
    expiresAt: Date.now() + REPOSITORY_CACHE_TTL_MS,
    value: userId,
  });
  return userId;
}

export async function canCreateProjectsForUser(userId: string): Promise<boolean> {
  const rows = await getDatabase()
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, userId))
    .limit(1);
  return rows.length > 0;
}

export async function createSketchProjectRecord(
  input: CreateSketchProjectRecordInput,
): Promise<void> {
  const database = getDatabase();
  const memberships = await database
    .select({
      organizationId: organizationMemberships.organizationId,
      roles: organizationMemberships.roles,
    })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, input.userId))
    .orderBy(asc(organizationMemberships.organizationId))
    .limit(1);
  const membership = memberships[0];
  if (!membership) throw new Error('PROJECT_CREATE_FORBIDDEN');

  const initial = createAt1042Workspace({ sketchTemplate: input.template });
  const now = new Date().toISOString();
  const creatorRoles: AttuneRole[] = membership.roles.includes('buyer')
    ? [...membership.roles]
    : ['buyer', ...membership.roles];

  await database.transaction(async (transaction) => {
    await transaction.insert(projects).values({
      id: input.projectId,
      organizationId: membership.organizationId,
      name: input.name,
      code: input.projectCode,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(workspaces).values({
      id: input.workspaceId,
      projectId: input.projectId,
      name: input.name,
      commitmentId: input.commitmentId,
      liveblocksRoomId: input.roomId,
      currentSpecification: initial,
      workspaceSeq: initial.workspaceSeq,
      draftVersion: initial.draftVersion,
      capabilityEpoch: initial.capabilityEpoch,
      needStartedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(workspaceFiles).values({
      id: input.fileId,
      workspaceId: input.workspaceId,
      name: `${input.name}.attune`,
      kind: `sketch:${input.template}`,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(workspaceMemberships).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      roles: creatorRoles,
      canComment: true,
      createdAt: now,
    });
    await transaction.insert(workspaceSnapshots).values({
      id: `${input.workspaceId}:snapshot:0`,
      workspaceId: input.workspaceId,
      workspaceSeq: initial.workspaceSeq,
      specification: initial,
      specHash: hashSpecification(initial),
    });
  });
}

async function managedSketchProject(
  userId: string,
  workspaceId: string,
): Promise<ManagedSketchProjectRecord> {
  const database = getDatabase();
  const targets = await database
    .select({ projectId: projects.id })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .innerJoin(projects, eq(projects.id, workspaces.projectId))
    .innerJoin(workspaceFiles, eq(workspaceFiles.workspaceId, workspaces.id))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.organizationId, projects.organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaceMemberships.userId, userId),
        sql`${workspaceFiles.kind} like 'sketch:%'`,
      ),
    )
    .limit(1);
  const target = targets[0];
  if (!target) throw new Error('PROJECT_MANAGE_FORBIDDEN');

  const projectWorkspaces = await database
    .select({ workspaceId: workspaces.id, roomId: workspaces.liveblocksRoomId })
    .from(workspaces)
    .where(eq(workspaces.projectId, target.projectId));
  return {
    projectId: target.projectId,
    workspaceIds: projectWorkspaces.map(({ workspaceId: id }) => id),
    roomIds: projectWorkspaces.map(({ roomId }) => roomId),
  };
}

export async function renameSketchProjectRecord(input: {
  readonly userId: string;
  readonly workspaceId: string;
  readonly name: string;
}): Promise<ManagedSketchProjectRecord> {
  const target = await managedSketchProject(input.userId, input.workspaceId);
  const database = getDatabase();
  const now = new Date().toISOString();
  await database.transaction(async (transaction) => {
    await transaction
      .update(projects)
      .set({ name: input.name, updatedAt: now })
      .where(eq(projects.id, target.projectId));
    await transaction
      .update(workspaces)
      .set({ name: input.name, updatedAt: now })
      .where(inArray(workspaces.id, [...target.workspaceIds]));
    await transaction
      .update(workspaceFiles)
      .set({ name: `${input.name}.attune`, updatedAt: now })
      .where(inArray(workspaceFiles.workspaceId, [...target.workspaceIds]));
  });
  return target;
}

export async function deleteSketchProjectRecord(input: {
  readonly userId: string;
  readonly workspaceId: string;
}): Promise<ManagedSketchProjectRecord> {
  const target = await managedSketchProject(input.userId, input.workspaceId);
  const database = getDatabase();
  await database.transaction(async (transaction) => {
    await Promise.all(target.workspaceIds.map((id) => clearWorkspaceRecords(transaction, id)));
    await transaction
      .delete(agentDelegations)
      .where(inArray(agentDelegations.workspaceId, [...target.workspaceIds]));
    await transaction
      .delete(workspaceMemberships)
      .where(inArray(workspaceMemberships.workspaceId, [...target.workspaceIds]));
    await transaction
      .delete(workspaceFiles)
      .where(inArray(workspaceFiles.workspaceId, [...target.workspaceIds]));
    await transaction.delete(workspaces).where(inArray(workspaces.id, [...target.workspaceIds]));
    await transaction.delete(projects).where(eq(projects.id, target.projectId));
  });
  return target;
}

export async function listProjectsForUser(userId: string) {
  const database = getDatabase();
  const [projectRows, organizationRows] = await Promise.all([
    database
      .select({
        projectId: projects.id,
        projectName: projects.name,
        projectCode: projects.code,
        organizationId: projects.organizationId,
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        fileName: workspaceFiles.name,
        fileKind: workspaceFiles.kind,
        liveblocksRoomId: workspaces.liveblocksRoomId,
        workspaceSeq: workspaces.workspaceSeq,
        draftVersion: workspaces.draftVersion,
        capabilityEpoch: workspaces.capabilityEpoch,
        updatedAt: workspaces.updatedAt,
      })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .innerJoin(projects, eq(projects.id, workspaces.projectId))
      .innerJoin(workspaceFiles, eq(workspaceFiles.workspaceId, workspaces.id))
      .where(eq(workspaceMemberships.userId, userId))
      .orderBy(desc(workspaces.updatedAt)),
    database
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, userId)),
  ]);
  const ownedOrganizations = new Set(organizationRows.map(({ organizationId }) => organizationId));
  return projectRows.map((row) => ({
    projectId: row.projectId,
    projectName: row.projectName,
    projectCode: row.projectCode,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    fileName: row.fileName,
    fileKind: row.fileKind,
    liveblocksRoomId: row.liveblocksRoomId,
    workspaceSeq: row.workspaceSeq,
    draftVersion: row.draftVersion,
    capabilityEpoch: row.capabilityEpoch,
    updatedAt: row.updatedAt,
    access: ownedOrganizations.has(row.organizationId) ? ('owned' as const) : ('shared' as const),
    canManage: ownedOrganizations.has(row.organizationId) && row.fileKind.startsWith('sketch:'),
    template: row.fileKind === 'sketch:blank' ? ('blank' as const) : ('spoke' as const),
  }));
}

export async function listProjectsForLiveblocksRooms(roomIds: readonly string[]) {
  if (roomIds.length === 0) return [];
  const projectRows = await getDatabase()
    .select({
      projectId: projects.id,
      projectName: projects.name,
      projectCode: projects.code,
      organizationId: projects.organizationId,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      fileName: workspaceFiles.name,
      fileKind: workspaceFiles.kind,
      liveblocksRoomId: workspaces.liveblocksRoomId,
      workspaceSeq: workspaces.workspaceSeq,
      draftVersion: workspaces.draftVersion,
      capabilityEpoch: workspaces.capabilityEpoch,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .innerJoin(projects, eq(projects.id, workspaces.projectId))
    .innerJoin(workspaceFiles, eq(workspaceFiles.workspaceId, workspaces.id))
    .where(inArray(workspaces.liveblocksRoomId, [...roomIds]))
    .orderBy(desc(workspaces.updatedAt));
  return projectRows.map((row) => ({
    projectId: row.projectId,
    projectName: row.projectName,
    projectCode: row.projectCode,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    fileName: row.fileName,
    fileKind: row.fileKind,
    liveblocksRoomId: row.liveblocksRoomId,
    workspaceSeq: row.workspaceSeq,
    draftVersion: row.draftVersion,
    capabilityEpoch: row.capabilityEpoch,
    updatedAt: row.updatedAt,
    access: 'shared' as const,
    canManage: false,
    template: row.fileKind === 'sketch:blank' ? ('blank' as const) : ('spoke' as const),
  }));
}

export async function readWorkspaceBundle(
  workspaceId: string,
  observationCursor?: number,
  observingAgentPrincipal?: string,
  timing?: (name: string, durationMs: number) => void,
): Promise<WorkspaceBundle> {
  const database = getDatabase();
  const parallelLoadStartedAt = performance.now();
  const [workspaceRows, receiptRows, transitionRows, rejectionRows, initialDetectedRows] =
    await Promise.all([
      database
        .select({
          workspace: workspaces.currentSpecification,
          projectName: projects.name,
          fileName: workspaceFiles.name,
          fileKind: workspaceFiles.kind,
          liveblocksRoomId: workspaces.liveblocksRoomId,
          needStartedAt: workspaces.needStartedAt,
        })
        .from(workspaces)
        .innerJoin(projects, eq(projects.id, workspaces.projectId))
        .innerJoin(workspaceFiles, eq(workspaceFiles.workspaceId, workspaces.id))
        .where(eq(workspaces.id, workspaceId))
        .limit(1),
      database
        .select({ receipt: changeReceipts.receipt })
        .from(changeReceipts)
        .where(eq(changeReceipts.workspaceId, workspaceId))
        .orderBy(asc(changeReceipts.receiptSeq)),
      database
        .select({ transition: capabilityTransitions.transition })
        .from(capabilityTransitions)
        .where(eq(capabilityTransitions.workspaceId, workspaceId))
        .orderBy(asc(capabilityTransitions.workspaceSeq)),
      database
        .select({ rejection: commandRejections.rejection })
        .from(commandRejections)
        .where(eq(commandRejections.workspaceId, workspaceId))
        .orderBy(asc(commandRejections.createdAt)),
      database
        .select({ count: sql<number>`count(*)::int` })
        .from(agentInterventionObservations)
        .where(eq(agentInterventionObservations.workspaceId, workspaceId)),
    ]);
  timing?.('neon_parallel_load', performance.now() - parallelLoadStartedAt);
  const row = workspaceRows[0];
  if (!row) throw new Error(`Attune workspace ${workspaceId} was not found.`);
  const normalizationStartedAt = performance.now();
  const authoritativeWorkspace = workspaceWithCurrentContract(row.workspace);
  timing?.('document_normalization', performance.now() - normalizationStartedAt);

  const historyStartedAt = performance.now();
  const receipts = receiptRows.map(({ receipt }) => receipt);
  const observation = interventionSummary(
    receipts,
    observationCursor,
    authoritativeWorkspace.workspaceSeq,
  );

  if (observingAgentPrincipal && observation.interventions.length > 0) {
    const humanReceiptIds = receipts
      .filter(
        ({ receiptSeq, origin }) =>
          origin === 'human_ui' &&
          observation.interventions.some((item) => item.receiptSeq === receiptSeq),
      )
      .map(({ receiptId }) => receiptId);
    if (humanReceiptIds.length > 0) {
      await database
        .insert(agentInterventionObservations)
        .values(
          humanReceiptIds.map((receiptId) => ({
            workspaceId,
            principalId: observingAgentPrincipal,
            receiptId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  const detectedRows = observingAgentPrincipal
    ? await database
        .select({ count: sql<number>`count(*)::int` })
        .from(agentInterventionObservations)
        .where(eq(agentInterventionObservations.workspaceId, workspaceId))
    : initialDetectedRows;
  timing?.('receipt_history', performance.now() - historyStartedAt);

  const serializationStartedAt = performance.now();
  const result = immutableCopy({
    workspaceId,
    projectName: row.projectName,
    fileName: row.fileName,
    fileKind: row.fileKind,
    liveblocksRoomId: row.liveblocksRoomId,
    needStartedAt: row.needStartedAt,
    workspace: authoritativeWorkspace,
    receipts,
    transitions: transitionRows.map(({ transition }) => transition),
    rejections: rejectionRows.map(({ rejection }) => rejection),
    observation,
    humanInterventionsDetected: detectedRows[0]?.count ?? 0,
  });
  timing?.('serialization', performance.now() - serializationStartedAt);
  return result;
}

export async function executePersistedCommand(
  input: ExecutePersistedCommandInput,
  liveblocksVersionId?: string,
): Promise<CommandResult> {
  if (input.context.workspaceId !== input.workspaceId) {
    throw new AttuneCommandError(
      'DELEGATION_INVALID',
      'The trusted execution context does not match the target workspace.',
    );
  }
  const database = getDatabase();
  const hashStartedAt = performance.now();
  const fingerprint = commandFingerprint(input);
  input.timing?.('hash', performance.now() - hashStartedAt);
  let rejection: CommandRejection | undefined;
  const transactionStartedAt = performance.now();

  try {
    return await database.transaction(async (transaction) => {
      const existing = await transaction
        .select({
          fingerprint: commandIdempotencyRecords.fingerprint,
          result: commandIdempotencyRecords.result,
        })
        .from(commandIdempotencyRecords)
        .where(
          and(
            eq(commandIdempotencyRecords.workspaceId, input.workspaceId),
            eq(commandIdempotencyRecords.commandId, input.envelope.commandId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        if (existing[0].fingerprint === fingerprint) {
          if (input.context.path === 'webmcp' && input.context.delegation) {
            await transaction
              .update(agentDelegations)
              .set({
                observationCursor: sql`greatest(${agentDelegations.observationCursor}, ${existing[0].result.workspace.workspaceSeq})`,
              })
              .where(eq(agentDelegations.id, input.context.delegation.id));
          }
          return immutableCopy(existing[0].result);
        }
        throw new AttuneCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This command identifier is already bound to a different authoritative request.',
        );
      }

      const rows = await transaction
        .select({ workspace: workspaces.currentSpecification })
        .from(workspaces)
        .where(eq(workspaces.id, input.workspaceId))
        .for('update')
        .limit(1);
      const stored = rows[0]?.workspace;
      const current = stored ? workspaceWithCurrentContract(stored) : undefined;
      if (!current) throw new Error(`Attune workspace ${input.workspaceId} was not found.`);

      let authoritativeEnvelope = input.envelope;
      let receiptHistory: readonly ChangeReceipt[] = [];
      if (isSketchCommand(input.command)) {
        const observedWorkspaceSeq =
          input.context.path === 'webmcp'
            ? input.context.delegation?.observationCursor
            : input.envelope.expectedWorkspaceSeq;
        if (observedWorkspaceSeq === undefined || observedWorkspaceSeq > current.workspaceSeq) {
          throw new AttuneCommandError(
            'CONTEXT_CHANGED',
            'The server could not establish the command observation snapshot.',
            ['sketch:document'],
          );
        }
        const observedRows =
          observedWorkspaceSeq === current.workspaceSeq
            ? [{ workspace: current }]
            : await transaction
                .select({ workspace: workspaceSnapshots.specification })
                .from(workspaceSnapshots)
                .where(
                  and(
                    eq(workspaceSnapshots.workspaceId, input.workspaceId),
                    eq(workspaceSnapshots.workspaceSeq, observedWorkspaceSeq),
                  ),
                )
                .limit(1);
        const observed = observedRows[0]?.workspace;
        if (!observed) {
          throw new AttuneCommandError(
            'CONTEXT_CHANGED',
            'The authoritative observation snapshot is no longer available.',
            ['sketch:document'],
          );
        }
        authoritativeEnvelope = authoritativeSemanticEnvelope({
          command: input.command,
          commandId: input.envelope.commandId,
          observed: workspaceWithCurrentContract(observed),
        });
        const priorReceipts =
          observedWorkspaceSeq === current.workspaceSeq
            ? []
            : await transaction
                .select({ receipt: changeReceipts.receipt })
                .from(changeReceipts)
                .where(
                  and(
                    eq(changeReceipts.workspaceId, input.workspaceId),
                    gt(changeReceipts.receiptSeq, observedWorkspaceSeq),
                  ),
                )
                .orderBy(asc(changeReceipts.receiptSeq));
        receiptHistory = priorReceipts.map(({ receipt }) => receipt);
      }

      const commandBusStartedAt = performance.now();
      const bus = new AttuneCommandBus(
        current,
        undefined,
        isSketchCommand(input.command) ? await getPlaneGcsSolver() : undefined,
        { receipts: receiptHistory },
      );
      let result: CommandResult;
      try {
        result = bus.execute(input.command, authoritativeEnvelope, input.context);
      } catch (error) {
        rejection = bus.rejections().at(-1);
        throw error;
      } finally {
        input.timing?.('command_bus_solver', performance.now() - commandBusStartedAt);
      }

      const persistenceStartedAt = performance.now();
      const updated = await transaction
        .update(workspaces)
        .set({
          currentSpecification: result.workspace,
          workspaceSeq: result.workspace.workspaceSeq,
          draftVersion: result.workspace.draftVersion,
          capabilityEpoch: result.workspace.capabilityEpoch,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(workspaces.id, input.workspaceId),
            eq(workspaces.workspaceSeq, current.workspaceSeq),
            eq(workspaces.capabilityEpoch, current.capabilityEpoch),
          ),
        )
        .returning({ id: workspaces.id });
      if (updated.length !== 1) {
        throw new AttuneCommandError('STALE_WORKSPACE', 'The workspace changed during execution.');
      }

      await transaction.insert(changeReceipts).values({
        receiptId: result.receipt.receiptId,
        workspaceId: input.workspaceId,
        receiptSeq: result.receipt.receiptSeq,
        commandId: result.receipt.commandId,
        origin: result.receipt.origin,
        principalId: result.receipt.principalId,
        role: result.receipt.role,
        beforeHash: result.receipt.beforeHash,
        afterHash: result.receipt.afterHash,
        specificationBeforeHash: result.receipt.specHashBefore,
        specificationAfterHash: result.receipt.specHashAfter,
        receipt: result.receipt,
        createdAt: result.receipt.createdAt,
      });
      await transaction.insert(capabilityTransitions).values({
        transitionId: result.receipt.capabilityTransition.transitionId,
        workspaceId: input.workspaceId,
        receiptId: result.receipt.receiptId,
        workspaceSeq: result.workspace.workspaceSeq,
        capabilityEpoch: result.workspace.capabilityEpoch,
        transition: result.receipt.capabilityTransition,
        createdAt: result.receipt.createdAt,
      });
      await transaction.insert(workspaceSnapshots).values({
        id: `${input.workspaceId}:snapshot:${result.workspace.workspaceSeq}`,
        workspaceId: input.workspaceId,
        workspaceSeq: result.workspace.workspaceSeq,
        specification: result.workspace,
        specHash: hashSpecification(result.workspace),
        createdAt: result.receipt.createdAt,
      });
      await persistDomainRecords(
        transaction,
        input.workspaceId,
        result.workspace,
        liveblocksVersionId,
      );
      await transaction.insert(commandIdempotencyRecords).values({
        workspaceId: input.workspaceId,
        commandId: input.envelope.commandId,
        fingerprint,
        principalId: input.context.principalId,
        role: input.context.role,
        result,
        createdAt: result.receipt.createdAt,
      });
      if (input.context.path === 'webmcp' && input.context.delegation) {
        const humanReceiptIds = receiptHistory
          .filter(({ origin }) => origin === 'human_ui')
          .map(({ receiptId }) => receiptId);
        if (humanReceiptIds.length > 0) {
          await transaction
            .insert(agentInterventionObservations)
            .values(
              humanReceiptIds.map((receiptId) => ({
                workspaceId: input.workspaceId,
                principalId: input.context.principalId,
                receiptId,
              })),
            )
            .onConflictDoNothing();
        }
        await transaction
          .update(agentDelegations)
          .set({ observationCursor: result.workspace.workspaceSeq })
          .where(eq(agentDelegations.id, input.context.delegation.id));
      }
      input.timing?.('receipt_history_persist', performance.now() - persistenceStartedAt);
      const serializationStartedAt = performance.now();
      const copied = immutableCopy(result);
      input.timing?.('serialization', performance.now() - serializationStartedAt);
      return copied;
    });
  } catch (error) {
    await persistRejection(input.workspaceId, rejection);
    throw error;
  } finally {
    input.timing?.('neon_transaction', performance.now() - transactionStartedAt);
  }
}

export async function currentFrozenRevision(
  workspaceId: string,
  revisionId: string,
): Promise<AttuneWorkspace['frozenRevisions'][number] | null> {
  const rows = await getDatabase()
    .select({ revision: frozenRevisions.canonicalSpecification })
    .from(frozenRevisions)
    .where(
      and(eq(frozenRevisions.workspaceId, workspaceId), eq(frozenRevisions.revisionId, revisionId)),
    )
    .limit(1);
  return rows[0]?.revision ?? null;
}

export async function reserveExternalMaterialization(
  input: ExternalMaterializationInput,
): Promise<ExternalMaterializationReservation> {
  const fingerprint = externalFingerprint(input);
  let rejection: CommandRejection | undefined;
  try {
    return await getDatabase().transaction(async (transaction) => {
      const attempts = await transaction
        .select()
        .from(externalActionAttempts)
        .where(
          and(
            eq(externalActionAttempts.workspaceId, input.workspaceId),
            eq(externalActionAttempts.commandId, input.envelope.commandId),
          ),
        )
        .for('update')
        .limit(1);
      const attempt = attempts[0];
      if (attempt?.fingerprint !== undefined && attempt.fingerprint !== fingerprint) {
        throw new AttuneCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This command identifier is already bound to another external execution.',
        );
      }
      if (attempt?.status === 'completed') return { status: 'completed' };
      const leaseIsCurrent =
        attempt?.status === 'in_progress' &&
        Date.now() - new Date(attempt.updatedAt).getTime() < 5 * 60 * 1000;
      if (leaseIsCurrent) {
        throw new AttuneCommandError(
          'COMMAND_CONFLICT',
          'The same external execution is already in progress.',
        );
      }

      const rows = await transaction
        .select({ workspace: workspaces.currentSpecification })
        .from(workspaces)
        .where(eq(workspaces.id, input.workspaceId))
        .for('update')
        .limit(1);
      const stored = rows[0]?.workspace;
      const workspace = stored ? workspaceWithCurrentContract(stored) : undefined;
      if (!workspace) throw new Error(`Attune workspace ${input.workspaceId} was not found.`);
      const bus = new AttuneCommandBus(workspace);
      try {
        bus.authorize('materialize_for_commerce', input.envelope, input.context);
      } catch (error) {
        rejection = bus.rejections().at(-1);
        throw error;
      }
      const revision = workspace.frozenRevisions.find(
        (candidate) =>
          candidate.revisionId === input.revisionId &&
          candidate.specHash === input.envelope.expectedSpecHash,
      );
      if (!revision) {
        throw new AttuneCommandError(
          'COMMAND_CONFLICT',
          'Commerce must target the exact current frozen revision.',
        );
      }

      await transaction
        .insert(externalActionAttempts)
        .values({
          workspaceId: input.workspaceId,
          commandId: input.envelope.commandId,
          fingerprint,
          status: 'in_progress',
        })
        .onConflictDoUpdate({
          target: [externalActionAttempts.workspaceId, externalActionAttempts.commandId],
          set: { status: 'in_progress', failureCode: null, updatedAt: new Date().toISOString() },
        });
      return { status: 'reserved', revision };
    });
  } catch (error) {
    await persistRejection(input.workspaceId, rejection);
    throw error;
  }
}

export async function finishExternalMaterialization(
  workspaceId: string,
  commandId: string,
  status: 'completed' | 'failed',
  failureCode?: string,
): Promise<void> {
  await getDatabase()
    .update(externalActionAttempts)
    .set({ status, failureCode, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(externalActionAttempts.workspaceId, workspaceId),
        eq(externalActionAttempts.commandId, commandId),
      ),
    );
}

export async function workspaceRoles(workspaceId: string, userId: string) {
  const rows = await getDatabase()
    .select({ roles: workspaceMemberships.roles })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .limit(1);
  return rows[0]?.roles ?? [];
}
