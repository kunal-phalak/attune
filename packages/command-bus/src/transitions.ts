import { compileCapabilities } from '@attune/capabilities';
import type { AttuneRole, AttuneWorkspace } from '@attune/domain';

import type { CapabilityReference, CapabilityTransition } from './types';

const ROLES: readonly AttuneRole[] = ['buyer', 'provider', 'agent'];

function capabilityReferences(workspace: AttuneWorkspace): readonly CapabilityReference[] {
  return ROLES.flatMap((role) =>
    compileCapabilities(workspace, role).map(({ id }) => ({ role, capabilityId: id })),
  );
}

function referenceKey(reference: CapabilityReference): string {
  return `${reference.role}:${reference.capabilityId}`;
}

export function capabilityTransition(
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
