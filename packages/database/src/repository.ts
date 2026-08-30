import {
  AttuneCommandBus,
  AttuneCommandError,
  type CapabilityTransition,
  type ChangeReceipt,
  type CommandEnvelope,
  type CommandRejection,
  type CommandResult,
  type InterventionSummary,
  type TrustedExecutionContext,
} from '@attune/command-bus';
import {
  createAt1042Workspace,
  hashCanonical,
  hashSpecification,
  type AttuneCommand,
  type AttuneRole,
  type AttuneWorkspace,
} from '@attune/domain';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { getDatabase } from './client';
import {
  acceptances,
  agentInterventionObservations,
  capabilityTransitions,
  changeReceipts,
  commandIdempotencyRecords,
  commandRejections,
  commerceVerificationRecords,
  externalActionAttempts,
  frozenRevisions,
  organizationMemberships,
  organizations,
  projects,
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

export interface WorkspaceBundle {
  readonly workspaceId: string;
  readonly projectName: string;
  readonly fileName: string;
  readonly liveblocksRoomId: string;
  readonly needStartedAt: string;
  readonly workspace: AttuneWorkspace;
  readonly receipts: readonly ChangeReceipt[];
  readonly transitions: readonly CapabilityTransition[];
  readonly rejections: readonly CommandRejection[];
  readonly observation: InterventionSummary;
  readonly humanInterventionsDetected: number;
}

export interface ExecutePersistedCommandInput {
  readonly workspaceId: string;
  readonly command: AttuneCommand;
  readonly envelope: CommandEnvelope;
  readonly context: TrustedExecutionContext;
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
      .filter(({ receiptSeq }) => cursor !== undefined && receiptSeq > cursor)
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
  transaction: Parameters<Parameters<ReturnType<typeof getDatabase>['transaction']>[0]>[0],
  workspaceId: string,
  workspace: AttuneWorkspace,
  liveblocksVersionId?: string,
) {
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

export async function ensureJudgeWorkspace(): Promise<void> {
  const database = getDatabase();
  const initial = createAt1042Workspace();
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
        roles: ['buyer', 'provider', 'agent'],
      })
      .onConflictDoNothing();
    await transaction
      .insert(projects)
      .values({
        id: initial.projectId,
        organizationId: 'organization:attune-demo',
        name: 'Custom equipment enclosure',
        code: initial.commitmentId,
      })
      .onConflictDoNothing();
    await transaction
      .insert(workspaces)
      .values({
        id: JUDGE_WORKSPACE_ID,
        projectId: initial.projectId,
        name: 'Equipment panel specification',
        commitmentId: initial.commitmentId,
        liveblocksRoomId: 'attune:workspace:at-1042',
        currentSpecification: initial,
        workspaceSeq: initial.workspaceSeq,
        draftVersion: initial.draftVersion,
        capabilityEpoch: initial.capabilityEpoch,
        needStartedAt: now,
      })
      .onConflictDoNothing();
    await transaction
      .insert(workspaceFiles)
      .values({
        id: 'file:at-1042-panel',
        workspaceId: JUDGE_WORKSPACE_ID,
        name: 'Equipment panel.attune',
        kind: 'executable-specification',
      })
      .onConflictDoNothing();
    await transaction
      .insert(workspaceMemberships)
      .values({
        workspaceId: JUDGE_WORKSPACE_ID,
        userId: JUDGE_USER_ID,
        roles: ['buyer', 'provider', 'agent'],
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
  });
}

export async function resetJudgeWorkspace(): Promise<void> {
  await ensureJudgeWorkspace();
  const database = getDatabase();
  const initial = createAt1042Workspace();
  const now = new Date().toISOString();

  await database.transaction(async (transaction) => {
    await transaction
      .delete(agentInterventionObservations)
      .where(eq(agentInterventionObservations.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(capabilityTransitions)
      .where(eq(capabilityTransitions.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(commandRejections)
      .where(eq(commandRejections.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(commandIdempotencyRecords)
      .where(eq(commandIdempotencyRecords.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(externalActionAttempts)
      .where(eq(externalActionAttempts.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(commerceVerificationRecords)
      .where(eq(commerceVerificationRecords.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction.delete(acceptances).where(eq(acceptances.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction.delete(quotes).where(eq(quotes.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(quoteRequests)
      .where(eq(quoteRequests.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(frozenRevisions)
      .where(eq(frozenRevisions.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(changeReceipts)
      .where(eq(changeReceipts.workspaceId, JUDGE_WORKSPACE_ID));
    await transaction
      .delete(workspaceSnapshots)
      .where(eq(workspaceSnapshots.workspaceId, JUDGE_WORKSPACE_ID));
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
  return row ? { ...row, principalId } : null;
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

export async function ensureAuthenticatedUser(input: {
  readonly authUserId: string;
  readonly email?: string;
  readonly displayName: string;
}): Promise<string> {
  const userId = `user:${hashCanonical(input.authUserId).slice(0, 24)}`;
  await getDatabase()
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
  return userId;
}

export async function listProjectsForUser(userId: string) {
  return getDatabase()
    .select({
      projectId: projects.id,
      projectName: projects.name,
      projectCode: projects.code,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      fileName: workspaceFiles.name,
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
    .orderBy(desc(workspaces.updatedAt));
}

export async function readWorkspaceBundle(
  workspaceId: string,
  observationCursor?: number,
  observingAgentPrincipal?: string,
): Promise<WorkspaceBundle> {
  const database = getDatabase();
  const workspaceRows = await database
    .select({
      workspace: workspaces.currentSpecification,
      projectName: projects.name,
      fileName: workspaceFiles.name,
      liveblocksRoomId: workspaces.liveblocksRoomId,
      needStartedAt: workspaces.needStartedAt,
    })
    .from(workspaces)
    .innerJoin(projects, eq(projects.id, workspaces.projectId))
    .innerJoin(workspaceFiles, eq(workspaceFiles.workspaceId, workspaces.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const row = workspaceRows[0];
  if (!row) throw new Error(`Attune workspace ${workspaceId} was not found.`);

  const [receiptRows, transitionRows, rejectionRows] = await Promise.all([
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
  ]);
  const receipts = receiptRows.map(({ receipt }) => receipt);
  const observation = interventionSummary(receipts, observationCursor, row.workspace.workspaceSeq);

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

  const detectedRows = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(agentInterventionObservations)
    .where(eq(agentInterventionObservations.workspaceId, workspaceId));

  return immutableCopy({
    workspaceId,
    projectName: row.projectName,
    fileName: row.fileName,
    liveblocksRoomId: row.liveblocksRoomId,
    needStartedAt: row.needStartedAt,
    workspace: row.workspace,
    receipts,
    transitions: transitionRows.map(({ transition }) => transition),
    rejections: rejectionRows.map(({ rejection }) => rejection),
    observation,
    humanInterventionsDetected: detectedRows[0]?.count ?? 0,
  });
}

export async function executePersistedCommand(
  input: ExecutePersistedCommandInput,
  liveblocksVersionId?: string,
): Promise<CommandResult> {
  const database = getDatabase();
  const fingerprint = commandFingerprint(input);
  let rejection: CommandRejection | undefined;

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
        if (existing[0].fingerprint === fingerprint) return immutableCopy(existing[0].result);
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
      const current = rows[0]?.workspace;
      if (!current) throw new Error(`Attune workspace ${input.workspaceId} was not found.`);

      const bus = new AttuneCommandBus(current);
      let result: CommandResult;
      try {
        result = bus.execute(input.command, input.envelope, input.context);
      } catch (error) {
        rejection = bus.rejections().at(-1);
        throw error;
      }

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
      return immutableCopy(result);
    });
  } catch (error) {
    await persistRejection(input.workspaceId, rejection);
    throw error;
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
      const workspace = rows[0]?.workspace;
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
