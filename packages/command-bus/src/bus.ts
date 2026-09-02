import {
  compileCapabilities,
  compileCapabilityFrontier,
  requiredCapability,
} from '@attune/capabilities';
import {
  changedFootprintReferences,
  hashSpecification,
  isSketchCommand,
  validateWorkspace,
  type AttuneCommand,
  type AttuneRole,
  type AttuneWorkspace,
  type ConstraintSolver,
  type DomainTransition,
} from '@attune/domain';

import { authorizationFailure, originForPath } from './authorization';
import { AttuneCommandError, type AttuneCommandErrorCode } from './errors';
import { forecastWorkspaceChange } from './forecast/forecast';
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
  readonly changedEntities?: readonly string[];
}

interface EnvelopeValidation {
  readonly rebasedFromWorkspaceSeq: number | null;
}

function sketchConflictMessage(command: AttuneCommand, workspace: AttuneWorkspace): string {
  if (command.type === 'apply_constraint') {
    const type = command.constraints[0]?.type ?? 'constraint';
    return `Adding ${type[0].toUpperCase()}${type.slice(1)} would over-constrain the selected geometry.`;
  }
  if (command.type === 'move_node') {
    const entityIds = new Set(
      workspace.sketchDocument.entities
        .filter((entity) =>
          'nodeId' in entity
            ? entity.nodeId === command.nodeId
            : 'startNodeId' in entity
              ? [
                  entity.startNodeId,
                  entity.endNodeId,
                  'centerNodeId' in entity ? entity.centerNodeId : undefined,
                ].includes(command.nodeId)
              : 'centerNodeId' in entity
                ? entity.centerNodeId === command.nodeId
                : 'controlNodeIds' in entity
                  ? entity.controlNodeIds?.includes(command.nodeId)
                  : false,
        )
        .map(({ id }) => id),
    );
    const blockers = workspace.sketchDocument.constraints
      .filter(({ refs }) => refs.some(({ entityId }) => entityIds.has(entityId)))
      .map(({ id, type }) => `${type[0].toUpperCase()}${type.slice(1)} (${id})`)
      .slice(0, 3);
    return blockers.length > 0
      ? `That point cannot move while ${blockers.join(' and ')} are locked.`
      : 'That point cannot move with the geometry’s current constraints.';
  }
  if (command.type === 'set_dimension') {
    const kind = command.dimensions[0]?.kind ?? 'dimension';
    return `That ${kind} conflicts with the geometry’s current constraints.`;
  }
  if (command.type === 'restore_sketch') {
    return 'That version cannot be restored because its constraints no longer form a valid sketch.';
  }
  return 'The sketch change conflicts with the geometry’s current constraints.';
}

export class AttuneCommandBus {
  readonly #clock: () => string;
  readonly #idempotency = new Map<string, IdempotencyRecord>();
  readonly #receipts: ChangeReceipt[];
  readonly #transitions: CapabilityTransition[] = [];
  readonly #rejections: CommandRejection[] = [];
  #workspace: AttuneWorkspace;

  constructor(
    initialWorkspace: AttuneWorkspace,
    clock: () => string = () => new Date().toISOString(),
    private readonly solver?: ConstraintSolver,
    history: { readonly receipts?: readonly ChangeReceipt[] } = {},
  ) {
    this.#workspace = immutableCopy(initialWorkspace);
    this.#clock = clock;
    this.#receipts = [...(history.receipts ?? [])];
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

  forecast(command: AttuneCommand, context: TrustedExecutionContext, commandId = 'forecast') {
    const now = this.#clock();
    const authorization = authorizationFailure(context, command.type, now);
    if (authorization) throw new AttuneCommandError(authorization.code, authorization.message);
    this.#ensureCapability(command.type, context.role, commandId, context);
    return immutableCopy(
      forecastWorkspaceChange({
        workspace: this.#workspace,
        command,
        role: context.role,
        metadata: { commandId, now },
        solver: this.solver,
      }).consequence,
    );
  }

  execute(
    command: AttuneCommand,
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
  ): CommandResult {
    const now = this.#clock();
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

    const envelopeValidation = this.#validateEnvelope(envelope, context, command, now);
    const before = this.#workspace;
    const validationBefore = validateWorkspace(before);
    let forecast;

    try {
      forecast = forecastWorkspaceChange({
        workspace: before,
        command,
        role: context.role,
        metadata: { commandId: envelope.commandId, now },
        solver: this.solver,
      });
    } catch {
      return this.#reject({
        code: 'COMMAND_CONFLICT',
        message: 'The command parameters do not match the current authoritative records.',
        commandType: command.type,
        envelope,
        context,
      });
    }

    if (isSketchCommand(command) && !forecast.consequence.valid) {
      return this.#reject({
        code: 'COMMAND_CONFLICT',
        message: sketchConflictMessage(command, before),
        commandType: command.type,
        envelope,
        context,
        changedEntities: forecast.consequence.solver.conflicts,
      });
    }

    const after = immutableCopy(forecast.workspaceAfter);
    const transition: DomainTransition = {
      workspace: after,
      affectedEntities: forecast.affectedEntities,
      addedConstraints: forecast.consequence.addedConstraints,
      removedConstraints: forecast.consequence.removedConstraints,
    };
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
      consequence: forecast.consequence,
      rebasedFromWorkspaceSeq: envelopeValidation.rebasedFromWorkspaceSeq,
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
      forecast: forecast.consequence,
    });
    this.#idempotency.set(envelope.commandId, { fingerprint, result });
    return result;
  }

  authorize(
    commandType: AttuneCommand['type'],
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
  ): AttuneWorkspace {
    this.#validateEnvelope(envelope, context, commandType, this.#clock());
    return immutableCopy(this.#workspace);
  }

  #validateEnvelope(
    envelope: CommandEnvelope,
    context: TrustedExecutionContext,
    command: AttuneCommand | AttuneCommand['type'],
    now: string,
  ): EnvelopeValidation {
    const commandType = typeof command === 'string' ? command : command.type;
    const authorization = authorizationFailure(context, commandType, now);
    if (authorization) {
      this.#reject({ ...authorization, commandType, envelope, context });
    }
    const semantic = typeof command !== 'string' && isSketchCommand(command);
    const currentSpecHash = hashSpecification(this.#workspace);
    if (semantic) {
      if (!envelope.footprint) {
        this.#reject({
          code: 'REVALIDATION_REQUIRED',
          message: 'Semantic sketch commands require an observed command footprint.',
          commandType,
          envelope,
          context,
          changedEntities: ['sketch:document'],
        });
      }
      const changedEntities = changedFootprintReferences(
        this.#workspace.sketchDocument,
        envelope.footprint,
      );
      if (changedEntities.length > 0) {
        this.#reject({
          code: 'REVALIDATION_REQUIRED',
          message: `Touched semantic references changed: ${changedEntities.join(', ')}.`,
          commandType,
          envelope,
          context,
          changedEntities,
        });
      }
      if (envelope.expectedAuthorityEpoch !== this.#workspace.authorityEpoch) {
        this.#reject({
          code: 'CONTEXT_CHANGED',
          message: 'Consequential authority changed after this command was observed.',
          commandType,
          envelope,
          context,
          changedEntities: ['authority:workspace'],
        });
      }
      if (envelope.expectedWorkspaceSeq > this.#workspace.workspaceSeq) {
        this.#reject({
          code: 'CONTEXT_CHANGED',
          message: 'The observed workspace sequence is ahead of authoritative state.',
          commandType,
          envelope,
          context,
        });
      }
      const exactSequence = envelope.expectedWorkspaceSeq === this.#workspace.workspaceSeq;
      if (exactSequence && envelope.expectedCapabilityEpoch !== this.#workspace.capabilityEpoch) {
        this.#reject({
          code: 'STALE_CAPABILITY',
          message: `Expected capability epoch ${envelope.expectedCapabilityEpoch}, current is ${this.#workspace.capabilityEpoch}.`,
          commandType,
          envelope,
          context,
        });
      }
      if (exactSequence && envelope.expectedSpecHash !== currentSpecHash) {
        this.#reject({
          code: 'SPEC_HASH_MISMATCH',
          message: 'The expected specification hash does not match authoritative state.',
          commandType,
          envelope,
          context,
        });
      }
      this.#ensureCapability(commandType, context.role, envelope.commandId, context, envelope);
      return {
        rebasedFromWorkspaceSeq: exactSequence ? null : envelope.expectedWorkspaceSeq,
      };
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
    if (envelope.expectedSpecHash !== currentSpecHash) {
      this.#reject({
        code: 'SPEC_HASH_MISMATCH',
        message: 'The expected specification hash does not match authoritative state.',
        commandType,
        envelope,
        context,
      });
    }
    if (envelope.expectedAuthorityEpoch !== this.#workspace.authorityEpoch) {
      this.#reject({
        code: 'CONTEXT_CHANGED',
        message: 'Consequential authority changed after this command was observed.',
        commandType,
        envelope,
        context,
        changedEntities: ['authority:workspace'],
      });
    }
    this.#ensureCapability(commandType, context.role, envelope.commandId, context, envelope);
    return { rebasedFromWorkspaceSeq: null };
  }

  #ensureCapability(
    commandType: AttuneCommand['type'],
    role: AttuneRole,
    commandId: string,
    context: TrustedExecutionContext,
    envelope?: CommandEnvelope,
  ): void {
    const required = requiredCapability(commandType);
    const available = compileCapabilities(this.#workspace, role);
    if (required && !available.some((candidate) => candidate.id === required)) {
      if (envelope) {
        this.#reject({
          code: 'CAPABILITY_UNAVAILABLE',
          message: `${required} is not available for the current role and authoritative state.`,
          commandType,
          envelope,
          context,
        });
      }
      throw new AttuneCommandError(
        'CAPABILITY_UNAVAILABLE',
        `${required} is not available for the current role and authoritative state.`,
      );
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
      changedEntities: input.changedEntities ?? [],
      createdAt: this.#clock(),
    });
    this.#rejections.push(rejection);
    throw new AttuneCommandError(code, message, input.changedEntities ?? []);
  }
}
