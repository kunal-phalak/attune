import {
  compileCapabilities,
  compileCapabilityFrontier,
  requiredCapability,
  type CapabilityFrontierEntry,
  type CapabilityId,
  type CompiledCapability,
} from '@attune/capabilities';
import {
  hashCanonical,
  hashSpecification,
  lockedMountIds,
  transitionWorkspace,
  validateWorkspace,
  type AttuneCommand,
  type AttuneRole,
  type AttuneWorkspace,
  type CommandOrigin,
  type ValidationResult,
} from '@attune/domain';

export type TrustedExecutionPath = 'human' | 'webmcp' | 'solver' | 'provider' | 'shopify';

export interface TrustedExecutionContext {
  readonly path: TrustedExecutionPath;
  readonly principalId: string;
  readonly role: AttuneRole;
}

export interface CommandEnvelope {
  readonly commandId: string;
  readonly expectedWorkspaceSeq: number;
  readonly expectedCapabilityEpoch: number;
  readonly expectedSpecHash: string;
  readonly observationCursor?: number;
}

export interface CapabilityReference {
  readonly role: AttuneRole;
  readonly capabilityId: CapabilityId;
}

export interface CapabilityTransition {
  readonly transitionId: string;
  readonly receiptId: string;
  readonly workspaceSeq: number;
  readonly capabilityEpoch: number;
  readonly gained: readonly CapabilityReference[];
  readonly lost: readonly CapabilityReference[];
}

export interface ChangeReceipt {
  readonly receiptSeq: number;
  readonly receiptId: string;
  readonly commandId: string;
  readonly command: AttuneCommand['type'];
  readonly origin: CommandOrigin;
  readonly principalId: string;
  readonly role: AttuneRole;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly specHashBefore: string;
  readonly specHashAfter: string;
  readonly affectedEntities: readonly string[];
  readonly preservedLocks: readonly string[];
  readonly validationBefore: ValidationResult;
  readonly validationAfter: ValidationResult;
  readonly workspaceSeq: number;
  readonly draftVersion: number;
  readonly capabilityEpoch: number;
  readonly capabilityTransition: CapabilityTransition;
  readonly createdAt: string;
}

export interface InterventionSummary {
  readonly previousWorkspaceSeq: number;
  readonly currentWorkspaceSeq: number;
  readonly interventions: readonly Pick<
    ChangeReceipt,
    'receiptSeq' | 'origin' | 'command' | 'affectedEntities' | 'beforeHash' | 'afterHash'
  >[];
}

export type AttuneCommandErrorCode =
  | 'STALE_WORKSPACE'
  | 'STALE_CAPABILITY'
  | 'SPEC_HASH_MISMATCH'
  | 'CAPABILITY_UNAVAILABLE'
  | 'ROLE_MISMATCH'
  | 'PRINCIPAL_MISMATCH'
  | 'IDEMPOTENCY_CONFLICT'
  | 'COMMAND_CONFLICT';

export interface CommandRejection {
  readonly rejectionId: string;
  readonly commandId: string;
  readonly command: AttuneCommand['type'];
  readonly origin: CommandOrigin;
  readonly principalId: string;
  readonly role: AttuneRole;
  readonly code: AttuneCommandErrorCode;
  readonly workspaceSeq: number;
  readonly capabilityEpoch: number;
  readonly currentSpecHash: string;
  readonly createdAt: string;
}

export interface CommandResult {
  readonly workspace: AttuneWorkspace;
  readonly receipt: ChangeReceipt;
  readonly capabilities: readonly CompiledCapability[];
  readonly frontier: readonly CapabilityFrontierEntry[];
  readonly observation: InterventionSummary;
}

export class AttuneCommandError extends Error {
  constructor(
    readonly code: AttuneCommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AttuneCommandError';
  }
}

const ORIGIN_BY_PATH: Readonly<Record<TrustedExecutionPath, CommandOrigin>> = {
  human: 'human_ui',
  webmcp: 'webmcp',
  solver: 'solver',
  provider: 'provider',
  shopify: 'shopify_verification',
};

const ROLE_BY_PATH: Readonly<Record<TrustedExecutionPath, AttuneRole>> = {
  human: 'buyer',
  webmcp: 'agent',
  solver: 'agent',
  provider: 'provider',
  shopify: 'agent',
};

const PRINCIPAL_PREFIX_BY_PATH: Readonly<Record<TrustedExecutionPath, string>> = {
  human: 'buyer:',
  webmcp: 'agent:',
  solver: 'solver:',
  provider: 'provider:',
  shopify: 'integration:',
};

const ROLES: readonly AttuneRole[] = ['buyer', 'provider', 'agent'];

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function hashWorkspace(workspace: AttuneWorkspace): string {
  return hashCanonical(workspace);
}

function interventionSummary(
  receipts: readonly ChangeReceipt[],
  cursor: number | undefined,
  currentWorkspaceSeq: number,
): InterventionSummary {
  const previousWorkspaceSeq = cursor ?? currentWorkspaceSeq;
  const interventions = receipts
    .filter((receipt) => receipt.receiptSeq > previousWorkspaceSeq && receipt.origin === 'human_ui')
    .map(({ receiptSeq, origin, command, affectedEntities, beforeHash, afterHash }) => ({
      receiptSeq,
      origin,
      command,
      affectedEntities,
      beforeHash,
      afterHash,
    }));

  return { previousWorkspaceSeq, currentWorkspaceSeq, interventions };
}

function capabilityReferences(workspace: AttuneWorkspace): readonly CapabilityReference[] {
  return ROLES.flatMap((role) =>
    compileCapabilities(workspace, role).map(({ id }) => ({ role, capabilityId: id })),
  );
}

function referenceKey(reference: CapabilityReference): string {
  return `${reference.role}:${reference.capabilityId}`;
}

function capabilityTransition(
  before: AttuneWorkspace,
  after: AttuneWorkspace,
  receiptId: string,
): CapabilityTransition {
  const beforeReferences = capabilityReferences(before);
  const afterReferences = capabilityReferences(after);
  const beforeKeys = new Set(beforeReferences.map(referenceKey));
  const afterKeys = new Set(afterReferences.map(referenceKey));

  return {
    transitionId: `capability-transition:${after.workspaceSeq}`,
    receiptId,
    workspaceSeq: after.workspaceSeq,
    capabilityEpoch: after.capabilityEpoch,
    gained: afterReferences.filter((reference) => !beforeKeys.has(referenceKey(reference))),
    lost: beforeReferences.filter((reference) => !afterKeys.has(referenceKey(reference))),
  };
}

interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly result: CommandResult;
}

export class AttuneCommandBus {
  readonly #clock: () => string;
  readonly #idempotency = new Map<string, IdempotencyRecord>();
  readonly #receipts: ChangeReceipt[] = [];
  readonly #transitions: CapabilityTransition[] = [];
  readonly #rejections: CommandRejection[] = [];
  #workspace: AttuneWorkspace;

  constructor(
    initialWorkspace: AttuneWorkspace,
    clock: () => string = () => new Date().toISOString(),
  ) {
    this.#workspace = immutableCopy(initialWorkspace);
    this.#clock = clock;
  }

  inspect(role: AttuneRole, observationCursor?: number) {
    const workspace = immutableCopy(this.#workspace);
    return {
      workspace,
      specHash: hashSpecification(workspace),
      validation: immutableCopy(validateWorkspace(workspace)),
      capabilities: immutableCopy(compileCapabilities(workspace, role)),
      frontier: immutableCopy(compileCapabilityFrontier(workspace, role)),
      observation: immutableCopy(
        interventionSummary(this.#receipts, observationCursor, workspace.workspaceSeq),
      ),
    };
  }

  receipts(): readonly ChangeReceipt[] {
    return immutableCopy(this.#receipts);
  }

  transitions(): readonly CapabilityTransition[] {
    return immutableCopy(this.#transitions);
  }

  rejections(): readonly CommandRejection[] {
    return immutableCopy(this.#rejections);
  }

  execute(
    command: AttuneCommand,
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
  ): CommandResult {
    const fingerprint = hashCanonical({ command, envelope, context });
    const idempotent = this.#idempotency.get(envelope.commandId);
    if (idempotent) {
      if (idempotent.fingerprint === fingerprint) return idempotent.result;
      return this.#reject(
        'IDEMPOTENCY_CONFLICT',
        'This command identifier is already bound to a different authoritative request.',
        command.type,
        envelope,
        context,
      );
    }

    this.#validateEnvelope(envelope, context, command.type);
    const before = this.#workspace;
    const validationBefore = validateWorkspace(before);
    const now = this.#clock();
    let transition;

    try {
      transition = transitionWorkspace(before, command, {
        commandId: envelope.commandId,
        now,
      });
    } catch {
      return this.#reject(
        'COMMAND_CONFLICT',
        'The command parameters do not match the current authoritative records.',
        command.type,
        envelope,
        context,
      );
    }

    const after = immutableCopy(transition.workspace);
    const validationAfter = validateWorkspace(after);
    const receiptId = `receipt:${after.workspaceSeq}:${envelope.commandId}`;
    const transitionRecord = immutableCopy(capabilityTransition(before, after, receiptId));
    const receipt = immutableCopy<ChangeReceipt>({
      receiptSeq: after.workspaceSeq,
      receiptId,
      commandId: envelope.commandId,
      command: command.type,
      origin: ORIGIN_BY_PATH[context.path],
      principalId: context.principalId,
      role: context.role,
      beforeHash: hashWorkspace(before),
      afterHash: hashWorkspace(after),
      specHashBefore: hashSpecification(before),
      specHashAfter: hashSpecification(after),
      affectedEntities: transition.affectedEntities,
      preservedLocks: lockedMountIds(),
      validationBefore,
      validationAfter,
      workspaceSeq: after.workspaceSeq,
      draftVersion: after.draftVersion,
      capabilityEpoch: after.capabilityEpoch,
      capabilityTransition: transitionRecord,
      createdAt: now,
    });

    this.#workspace = after;
    this.#receipts.push(receipt);
    this.#transitions.push(transitionRecord);

    const result = immutableCopy<CommandResult>({
      workspace: after,
      receipt,
      capabilities: compileCapabilities(after, context.role),
      frontier: compileCapabilityFrontier(after, context.role),
      observation: interventionSummary(
        this.#receipts,
        envelope.observationCursor,
        after.workspaceSeq,
      ),
    });
    this.#idempotency.set(envelope.commandId, { fingerprint, result });
    return result;
  }

  authorize(
    commandType: AttuneCommand['type'],
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
  ): AttuneWorkspace {
    this.#validateEnvelope(envelope, context, commandType);
    return immutableCopy(this.#workspace);
  }

  #validateEnvelope(
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
    commandType: AttuneCommand['type'],
  ): void {
    if (ROLE_BY_PATH[context.path] !== context.role) {
      this.#reject(
        'ROLE_MISMATCH',
        `Execution path ${context.path} cannot assert role ${context.role}.`,
        commandType,
        envelope,
        context,
      );
    }

    if (!context.principalId.startsWith(PRINCIPAL_PREFIX_BY_PATH[context.path])) {
      this.#reject(
        'PRINCIPAL_MISMATCH',
        `Execution path ${context.path} cannot assert this principal.`,
        commandType,
        envelope,
        context,
      );
    }

    if (envelope.expectedWorkspaceSeq !== this.#workspace.workspaceSeq) {
      this.#reject(
        'STALE_WORKSPACE',
        `Expected workspace sequence ${envelope.expectedWorkspaceSeq}, current is ${this.#workspace.workspaceSeq}.`,
        commandType,
        envelope,
        context,
      );
    }

    if (envelope.expectedCapabilityEpoch !== this.#workspace.capabilityEpoch) {
      this.#reject(
        'STALE_CAPABILITY',
        `Expected capability epoch ${envelope.expectedCapabilityEpoch}, current is ${this.#workspace.capabilityEpoch}.`,
        commandType,
        envelope,
        context,
      );
    }

    const currentSpecHash = hashSpecification(this.#workspace);
    if (envelope.expectedSpecHash !== currentSpecHash) {
      this.#reject(
        'SPEC_HASH_MISMATCH',
        'The expected specification hash does not match authoritative state.',
        commandType,
        envelope,
        context,
      );
    }

    const required = requiredCapability(commandType);
    const available = compileCapabilities(this.#workspace, context.role);
    if (required && !available.some((candidate) => candidate.id === required)) {
      this.#reject(
        'CAPABILITY_UNAVAILABLE',
        `${required} is not available for the current role and authoritative state.`,
        commandType,
        envelope,
        context,
      );
    }
  }

  #reject(
    code: AttuneCommandErrorCode,
    message: string,
    commandType: AttuneCommand['type'],
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
  ): never {
    const rejection = immutableCopy<CommandRejection>({
      rejectionId: `rejection:${this.#rejections.length + 1}:${envelope.commandId}`,
      commandId: envelope.commandId,
      command: commandType,
      origin: ORIGIN_BY_PATH[context.path],
      principalId: context.principalId,
      role: context.role,
      code,
      workspaceSeq: this.#workspace.workspaceSeq,
      capabilityEpoch: this.#workspace.capabilityEpoch,
      currentSpecHash: hashSpecification(this.#workspace),
      createdAt: this.#clock(),
    });
    this.#rejections.push(rejection);
    throw new AttuneCommandError(code, message);
  }
}
