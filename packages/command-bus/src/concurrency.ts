import {
  commandFootprint,
  hashSpecification,
  isSketchCommand,
  type AttuneCommand,
  type AttuneWorkspace,
} from '@attune/domain';

import type { CommandEnvelope } from './types';

/**
 * Build semantic preconditions from an authoritative observed snapshot. Browser/model supplied
 * hashes and footprints are deliberately not accepted here.
 */
export function authoritativeSemanticEnvelope(input: {
  readonly command: AttuneCommand;
  readonly commandId: string;
  readonly observed: AttuneWorkspace;
}): CommandEnvelope {
  if (!isSketchCommand(input.command)) {
    throw new TypeError('Only semantic sketch commands use footprint-aware envelopes.');
  }
  return {
    commandId: input.commandId,
    expectedWorkspaceSeq: input.observed.workspaceSeq,
    expectedCapabilityEpoch: input.observed.capabilityEpoch,
    expectedAuthorityEpoch: input.observed.authorityEpoch,
    expectedSpecHash: hashSpecification(input.observed),
    observationCursor: input.observed.workspaceSeq,
    footprint: commandFootprint(input.observed.sketchDocument, input.command),
  };
}
