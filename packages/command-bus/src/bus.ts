import {
  compileCapabilities,
  compileCapabilityFrontier,
  requiredCapability,
} from '@attune/capabilities';
import {
  hashSpecification,
  transitionWorkspace,
  validateWorkspace,
  type AttuneCommand,
  type AttuneRole,
  type AttuneWorkspace,
} from '@attune/domain';

import { authorizationFailure, originForPath } from './authorization';
import { AttuneCommandError, type AttuneCommandErrorCode } from './errors';
import { commandFingerprint, type IdempotencyRecord } from './idempotency';
import { interventionSummary } from './interventions';
import { createReceipt, immutableCopy } from './receipts';
import { capabilityTransition } from './transitions';
import type {
  CapabilityTransition,
  ChangeReceipt,
  CommandEnvelope,
  CommandRejection,
  CommandResult,
  TrustedExecutionContext,
} from './types';

interface RejectionInput {
  readonly code: AttuneCommandErrorCode;
  readonly message: string;
  readonly commandType: AttuneCommand['type'];
  readonly envelope: CommandEnvelope;
  readonly context: TrustedExecutionContext;
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
    const fingerprint = commandFingerprint(command, envelope, context);
    const idempotent = this.#idempotency.get(envelope.commandId);
    if (idempotent) {
      if (idempotent.fingerprint === fingerprint) return idempotent.result;
      return this.#reject({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'This command identifier is already bound to a different authoritative request.',
        commandType: command.type,
        envelope,
        context,
      });
    }

    this.#validateEnvelope(envelope, context, command.type);
    const before = this.#workspace;
    const validationBefore = validateWorkspace(before);
    const now = this.#clock();
    let transition;

    try {
      transition = transitionWorkspace(before, command, { commandId: envelope.commandId, now });
    } catch {
      return this.#reject({
        code: 'COMMAND_CONFLICT',
        message: 'The command parameters do not match the current authoritative records.',
        commandType: command.type,
        envelope,
        context,
      });
    }

    const after = immutableCopy(transition.workspace);
    const validationAfter = validateWorkspace(after);
    const receiptId = `receipt:${after.workspaceSeq}:${envelope.commandId}`;
    const transitionRecord = immutableCopy(capabilityTransition(before, after, receiptId));
    const receipt = createReceipt({
      before,
      after,
      command,
      envelope,
      context,
      transition,
      capabilityTransition: transitionRecord,
      validationBefore,
      validationAfter,
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
    const authorization = authorizationFailure(context);
    if (authorization) {
      this.#reject({ ...authorization, commandType, envelope, context });
    }
    if (envelope.expectedWorkspaceSeq !== this.#workspace.workspaceSeq) {
      this.#reject({
        code: 'STALE_WORKSPACE',
        message: `Expected workspace sequence ${envelope.expectedWorkspaceSeq}, current is ${this.#workspace.workspaceSeq}.`,
        commandType,
        envelope,
        context,
      });
    }
    if (envelope.expectedCapabilityEpoch !== this.#workspace.capabilityEpoch) {
      this.#reject({
        code: 'STALE_CAPABILITY',
        message: `Expected capability epoch ${envelope.expectedCapabilityEpoch}, current is ${this.#workspace.capabilityEpoch}.`,
        commandType,
        envelope,
        context,
      });
    }
    const currentSpecHash = hashSpecification(this.#workspace);
    if (envelope.expectedSpecHash !== currentSpecHash) {
      this.#reject({
        code: 'SPEC_HASH_MISMATCH',
        message: 'The expected specification hash does not match authoritative state.',
        commandType,
        envelope,
        context,
      });
    }
    const required = requiredCapability(commandType);
    const available = compileCapabilities(this.#workspace, context.role);
    if (required && !available.some((candidate) => candidate.id === required)) {
      this.#reject({
        code: 'CAPABILITY_UNAVAILABLE',
        message: `${required} is not available for the current role and authoritative state.`,
        commandType,
        envelope,
        context,
      });
    }
  }

  #reject(input: RejectionInput): never {
    const { code, commandType, context, envelope, message } = input;
    const rejection = immutableCopy<CommandRejection>({
      rejectionId: `rejection:${this.#rejections.length + 1}:${envelope.commandId}`,
      commandId: envelope.commandId,
      command: commandType,
      origin: originForPath(context.path),
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
