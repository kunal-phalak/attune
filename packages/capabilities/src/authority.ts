import { hashSpecification, type AttuneWorkspace } from '@attune/domain';

import type { CapabilityAuthority } from './types';

function currentProvider(workspace: AttuneWorkspace) {
  const profile = workspace.providerCapabilityProfile;
  return {
    providerId: profile.providerId,
    profileId: profile.profileId,
    profileVersion: profile.version,
  };
}

function providerMatches(
  candidate: { readonly provider: ReturnType<typeof currentProvider> },
  workspace: AttuneWorkspace,
) {
  return JSON.stringify(candidate.provider) === JSON.stringify(currentProvider(workspace));
}

export function deriveCurrentAuthority(workspace: AttuneWorkspace): CapabilityAuthority {
  const specHash = hashSpecification(workspace);
  const revisionId = `r${workspace.draftVersion}`;
  const request = workspace.quoteRequests.find(
    (candidate) =>
      candidate.draftVersion === workspace.draftVersion &&
      candidate.specHash === specHash &&
      providerMatches(candidate, workspace),
  );
  const revision = workspace.frozenRevisions.find(
    (candidate) =>
      candidate.revisionId === revisionId &&
      candidate.specHash === specHash &&
      providerMatches(candidate, workspace),
  );
  const quote = workspace.quotes.find(
    (candidate) =>
      candidate.revisionId === revisionId &&
      candidate.specHash === specHash &&
      providerMatches(candidate, workspace),
  );
  const externalDrift = workspace.externalCommerceRecords.some(
    (candidate) =>
      candidate.specRevision === revisionId &&
      candidate.specHash === specHash &&
      candidate.syncState === 'EXTERNAL_DRIFT',
  );
  const acceptance = externalDrift
    ? undefined
    : workspace.acceptances.find(
        (candidate) =>
          candidate.revisionId === revisionId &&
          candidate.specHash === specHash &&
          providerMatches(candidate, workspace),
      );
  const commerce = workspace.commerceLinks.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );

  return { acceptance, commerce, quote, request, revision, revisionId, specHash };
}
