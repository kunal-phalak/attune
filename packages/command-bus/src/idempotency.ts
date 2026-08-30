import { hashCanonical, type AttuneCommand } from '@attune/domain';

import type { CommandEnvelope, CommandResult, TrustedExecutionContext } from './types';

export interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly result: CommandResult;
}

export function commandFingerprint(
  command: AttuneCommand,
  envelope: CommandEnvelope,
  context: TrustedExecutionContext,
): string {
  return hashCanonical({ command, envelope, context });
}
