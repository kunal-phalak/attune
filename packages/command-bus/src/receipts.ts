import {
  hashCanonical,
  hashSpecification,
  lockedMountIds,
  type AttuneCommand,
  type AttuneWorkspace,
  type DomainTransition,
  type ValidationResult,
} from '@attune/domain';

import { originForPath } from './authorization';
import type {
  CapabilityTransition,
  ChangeReceipt,
  CommandEnvelope,
  TrustedExecutionContext,
} from './types';

interface ReceiptInput {
  readonly before: AttuneWorkspace;
  readonly after: AttuneWorkspace;
  readonly command: AttuneCommand;
  readonly envelope: CommandEnvelope;
  readonly context: TrustedExecutionContext;
  readonly transition: DomainTransition;
  readonly capabilityTransition: CapabilityTransition;
  readonly validationBefore: ValidationResult;
  readonly validationAfter: ValidationResult;
  readonly createdAt: string;
}

export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function createReceipt(input: ReceiptInput): ChangeReceipt {
  const { after, before, capabilityTransition, command, context, createdAt, envelope, transition } =
    input;
  return immutableCopy({
    receiptSeq: after.workspaceSeq,
    receiptId: capabilityTransition.receiptId,
    commandId: envelope.commandId,
    command: command.type,
    origin: originForPath(context.path),
    principalId: context.principalId,
    role: context.role,
    delegationGrantId: context.delegation?.grantId ?? null,
    beforeHash: hashCanonical(before),
    afterHash: hashCanonical(after),
    specHashBefore: hashSpecification(before),
    specHashAfter: hashSpecification(after),
    affectedEntities: transition.affectedEntities,
    preservedLocks: lockedMountIds(),
    validationBefore: input.validationBefore,
    validationAfter: input.validationAfter,
    workspaceSeq: after.workspaceSeq,
    draftVersion: after.draftVersion,
    capabilityEpoch: after.capabilityEpoch,
    capabilityTransition,
    createdAt,
  });
}
