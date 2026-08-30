import {
  AttuneCommandBus,
  AttuneCommandError,
  type CommandEnvelope,
  type TrustedExecutionContext,
} from '@attune/command-bus';
import {
  compareValidChanges,
  createAt1042Workspace,
  hashCanonical,
  type AttuneCommand,
  type AttuneRole,
} from '@attune/domain';
import { materializeAt1042Revision } from '@attune/shopify';

const contexts = {
  agent: {
    path: 'webmcp',
    principalId: 'agent:webmcp-session',
    role: 'agent',
  },
  buyer: {
    path: 'human',
    principalId: 'buyer:browser-session',
    role: 'buyer',
  },
  provider: {
    path: 'provider',
    principalId: 'provider:attune-fabricator',
    role: 'provider',
  },
  shopify: {
    path: 'shopify',
    principalId: 'integration:shopify',
    role: 'agent',
  },
} as const satisfies Readonly<Record<string, TrustedExecutionContext>>;

interface RuntimeGlobal {
  attuneAt1042Bus?: AttuneCommandBus;
  attuneAt1042StartedAt?: string;
  attuneObservedHumanReceipts?: Set<number>;
  attuneMaterializationRequests?: Map<
    string,
    { readonly fingerprint: string; readonly promise: Promise<ReturnType<typeof viewFor>> }
  >;
}

export interface CommandExecutionInput {
  readonly command: AttuneCommand;
  readonly envelope: CommandEnvelope;
}

export interface CommerceMaterializationInput {
  readonly revisionId: string;
  readonly envelope: CommandEnvelope;
}

function runtimeGlobal(): typeof globalThis & RuntimeGlobal {
  return globalThis;
}

function observedHumanReceipts(): Set<number> {
  const root = runtimeGlobal();
  root.attuneObservedHumanReceipts ??= new Set();
  return root.attuneObservedHumanReceipts;
}

export function getAt1042CommandBus(): AttuneCommandBus {
  const root = runtimeGlobal();
  if (!root.attuneAt1042Bus) {
    root.attuneAt1042StartedAt = new Date().toISOString();
    root.attuneAt1042Bus = new AttuneCommandBus(createAt1042Workspace());
  }
  return root.attuneAt1042Bus;
}

function impactMetrics(bus: AttuneCommandBus) {
  const workspace = bus.inspect('buyer').workspace;
  const receipts = bus.receipts();
  const rejections = bus.rejections();
  const buildableReceipt = receipts.find(
    ({ validationBefore, validationAfter }) => !validationBefore.valid && validationAfter.valid,
  );
  const startedAt = runtimeGlobal().attuneAt1042StartedAt;
  const buildableAt = buildableReceipt?.createdAt;
  const elapsed =
    startedAt && buildableAt ? Math.max(0, Date.parse(buildableAt) - Date.parse(startedAt)) : null;
  const staleConsequentialBlocks = rejections.filter(
    ({ command, code }) =>
      command === 'materialize_for_commerce' &&
      [
        'STALE_WORKSPACE',
        'STALE_CAPABILITY',
        'SPEC_HASH_MISMATCH',
        'CAPABILITY_UNAVAILABLE',
      ].includes(code),
  ).length;
  const exactCommerceLinks = workspace.commerceLinks.filter((link) =>
    workspace.frozenRevisions.some(
      (revision) => revision.revisionId === link.revisionId && revision.specHash === link.specHash,
    ),
  );
  const goldenComplete =
    workspace.draftVersion >= 8 &&
    exactCommerceLinks.some(({ revisionId }) => revisionId === 'r7') &&
    staleConsequentialBlocks > 0;

  return {
    needToBuildableMs: elapsed,
    conflictsCaughtBeforeQuote: buildableReceipt ? 1 : 0,
    lockedRequirementsPreserved: {
      preserved: receipts.at(-1)?.preservedLocks.length ?? 4,
      total: 4,
    },
    humanInterventionsDetected: observedHumanReceipts().size,
    staleConsequentialActionsBlocked: staleConsequentialBlocks,
    exactRevisionShopifyVerifications: exactCommerceLinks.length,
    goldenPath: { completedRuns: goldenComplete ? 1 : 0, startedRuns: 1 },
  };
}

function recordAgentObservation(
  observation: ReturnType<AttuneCommandBus['inspect']>['observation'],
) {
  const observed = observedHumanReceipts();
  for (const intervention of observation.interventions) {
    observed.add(intervention.receiptSeq);
  }
}

function viewFor(role: AttuneRole, observationCursor?: number) {
  const bus = getAt1042CommandBus();
  const inspection = bus.inspect(role, observationCursor);
  if (role === 'agent' && observationCursor !== undefined) {
    recordAgentObservation(inspection.observation);
  }
  const receipts = bus.receipts();
  const transitions = bus.transitions();

  return {
    ...inspection,
    frontiers: {
      buyer: bus.inspect('buyer').frontier,
      provider: bus.inspect('provider').frontier,
      agent: bus.inspect('agent').frontier,
    },
    repairs: compareValidChanges(inspection.workspace),
    records: {
      receipts,
      capabilityTransitions: transitions,
      commandRejections: bus.rejections(),
      externalVerifications: inspection.workspace.commerceLinks,
    },
    latestReceipt: receipts.at(-1) ?? null,
    latestCapabilityTransition: transitions.at(-1) ?? null,
    receiptCount: receipts.length,
    impact: impactMetrics(bus),
  };
}

export function inspectForAgent(observationCursor?: number) {
  return viewFor('agent', observationCursor);
}

export function inspectForHuman() {
  return viewFor('buyer');
}

export function inspectForProvider() {
  return viewFor('provider');
}

function executeWithContext(input: CommandExecutionInput, context: TrustedExecutionContext) {
  const bus = getAt1042CommandBus();
  bus.execute(input.command, input.envelope, context);
  return viewFor(context.role, input.envelope.observationCursor);
}

export function executeAgentCommand(input: CommandExecutionInput) {
  return executeWithContext(input, contexts.agent);
}

export function executeHumanCommand(input: CommandExecutionInput) {
  return executeWithContext(input, contexts.buyer);
}

export function executeProviderCommand(input: CommandExecutionInput) {
  return executeWithContext(input, contexts.provider);
}

export function executeVerifiedCommerceCommand(input: CommandExecutionInput) {
  return executeWithContext(input, contexts.shopify);
}

function materializationRequests() {
  const root = runtimeGlobal();
  root.attuneMaterializationRequests ??= new Map();
  return root.attuneMaterializationRequests;
}

export async function executeCommerceMaterialization(input: CommerceMaterializationInput) {
  const requests = materializationRequests();
  const fingerprint = hashCanonical(input);
  const existing = requests.get(input.envelope.commandId);
  if (existing) {
    if (existing.fingerprint === fingerprint) return existing.promise;
    throw new AttuneCommandError(
      'IDEMPOTENCY_CONFLICT',
      'This command identifier is already bound to a different commerce request.',
    );
  }

  const promise = (async () => {
    const bus = getAt1042CommandBus();
    const workspace = bus.authorize('materialize_for_commerce', input.envelope, contexts.shopify);
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
    const verification = await materializeAt1042Revision(revision);
    return executeWithContext(
      {
        command: {
          type: 'materialize_for_commerce',
          revisionId: input.revisionId,
          verification,
        },
        envelope: input.envelope,
      },
      contexts.shopify,
    );
  })();

  requests.set(input.envelope.commandId, { fingerprint, promise });
  try {
    return await promise;
  } catch (error) {
    requests.delete(input.envelope.commandId);
    throw error;
  }
}

export function isAttuneCommandError(error: unknown): error is AttuneCommandError {
  return error instanceof AttuneCommandError;
}
