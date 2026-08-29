import {
  compileCapabilities,
  requiredCapability,
  type CompiledCapability,
} from '@attune/capabilities';
import {
  hashCanonical,
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
  readonly observationCursor?: number;
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
  readonly affectedEntities: readonly string[];
  readonly preservedLocks: readonly string[];
  readonly validationBefore: ValidationResult;
  readonly validationAfter: ValidationResult;
  readonly workspaceSeq: number;
  readonly draftVersion: number;
  readonly capabilityEpoch: number;
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

export interface CommandResult {
  readonly workspace: AttuneWorkspace;
  readonly receipt: ChangeReceipt;
  readonly capabilities: readonly CompiledCapability[];
  readonly observation: InterventionSummary;
}

export class AttuneCommandError extends Error {
  constructor(
    readonly code:
      | 'STALE_WORKSPACE'
      | 'STALE_CAPABILITY'
      | 'CAPABILITY_UNAVAILABLE'
      | 'ROLE_MISMATCH',
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

export class AttuneCommandBus {
  readonly #clock: () => string;
  readonly #idempotency = new Map<string, CommandResult>();
  readonly #receipts: ChangeReceipt[] = [];
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
      validation: immutableCopy(validateWorkspace(workspace)),
      capabilities: immutableCopy(compileCapabilities(workspace, role)),
      observation: immutableCopy(
        interventionSummary(this.#receipts, observationCursor, workspace.workspaceSeq),
      ),
    };
  }

  receipts(): readonly ChangeReceipt[] {
    return immutableCopy(this.#receipts);
  }

  execute(
    command: AttuneCommand,
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
  ): CommandResult {
    const idempotent = this.#idempotency.get(envelope.commandId);
    if (idempotent) {
      return idempotent;
    }

    this.#validateEnvelope(envelope, context, command);
    const before = this.#workspace;
    const validationBefore = validateWorkspace(before);
    const transition = transitionWorkspace(before, command, {
      commandId: envelope.commandId,
      now: this.#clock(),
    });
    const after = immutableCopy(transition.workspace);
    const validationAfter = validateWorkspace(after);
    const receipt = immutableCopy<ChangeReceipt>({
      receiptSeq: after.workspaceSeq,
      receiptId: `receipt:${after.workspaceSeq}:${envelope.commandId}`,
      commandId: envelope.commandId,
      command: command.type,
      origin: ORIGIN_BY_PATH[context.path],
      principalId: context.principalId,
      role: context.role,
      beforeHash: hashWorkspace(before),
      afterHash: hashWorkspace(after),
      affectedEntities: transition.affectedEntities,
      preservedLocks: lockedMountIds(),
      validationBefore,
      validationAfter,
      workspaceSeq: after.workspaceSeq,
      draftVersion: after.draftVersion,
      capabilityEpoch: after.capabilityEpoch,
      createdAt: this.#clock(),
    });

    this.#workspace = after;
    this.#receipts.push(receipt);

    const result = immutableCopy<CommandResult>({
      workspace: after,
      receipt,
      capabilities: compileCapabilities(after, context.role),
      observation: interventionSummary(
        this.#receipts,
        envelope.observationCursor,
        after.workspaceSeq,
      ),
    });
    this.#idempotency.set(envelope.commandId, result);
    return result;
  }

  #validateEnvelope(
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
    command: AttuneCommand,
  ): void {
    if (ROLE_BY_PATH[context.path] !== context.role) {
      throw new AttuneCommandError(
        'ROLE_MISMATCH',
        `Execution path ${context.path} cannot assert role ${context.role}.`,
      );
    }

    if (envelope.expectedWorkspaceSeq !== this.#workspace.workspaceSeq) {
      throw new AttuneCommandError(
        'STALE_WORKSPACE',
        `Expected workspace sequence ${envelope.expectedWorkspaceSeq}, current is ${this.#workspace.workspaceSeq}.`,
      );
    }

    if (envelope.expectedCapabilityEpoch !== this.#workspace.capabilityEpoch) {
      throw new AttuneCommandError(
        'STALE_CAPABILITY',
        `Expected capability epoch ${envelope.expectedCapabilityEpoch}, current is ${this.#workspace.capabilityEpoch}.`,
      );
    }

    const required = requiredCapability(command.type);
    const available = compileCapabilities(this.#workspace, context.role);
    if (required && !available.some((candidate) => candidate.id === required)) {
      throw new AttuneCommandError(
        'CAPABILITY_UNAVAILABLE',
        `${required} is not available for the current role and authoritative state.`,
      );
    }
  }
}
