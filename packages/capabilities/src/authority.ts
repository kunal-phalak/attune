import { hashSpecification, type AttuneWorkspace } from '@attune/domain';

import type { CapabilityAuthority } from './types';

export function deriveCurrentAuthority(workspace: AttuneWorkspace): CapabilityAuthority {
  const specHash = hashSpecification(workspace);
  const revisionId = `r${workspace.draftVersion}`;
  const request = workspace.quoteRequests.find(
    (candidate) =>
      candidate.draftVersion === workspace.draftVersion && candidate.specHash === specHash,
  );
  const revision = workspace.frozenRevisions.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );
  const quote = workspace.quotes.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );
  const acceptance = workspace.acceptances.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );
  const commerce = workspace.commerceLinks.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );

  return { acceptance, commerce, quote, request, revision, revisionId, specHash };
}
