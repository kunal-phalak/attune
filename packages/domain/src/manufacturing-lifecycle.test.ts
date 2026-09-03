import { describe, expect, it } from 'vitest';

import { createAt1042Workspace, transitionWorkspace } from './workspace';

const configuration = {
  material: 'aluminium' as const,
  thicknessMm: 3,
  finish: 'As cut',
  quantity: 4,
  toleranceMm: 0.2,
};

function transition(
  workspace: ReturnType<typeof createAt1042Workspace>,
  command: Parameters<typeof transitionWorkspace>[1],
  commandId: string,
) {
  return transitionWorkspace(workspace, command, {
    commandId,
    now: `2026-09-03T00:00:${commandId.length.toString().padStart(2, '0')}.000Z`,
  }).workspace;
}

function validWorkspace() {
  return transition(
    createAt1042Workspace(),
    { type: 'apply_deterministic_repair', repairId: 'move_slot_left_to_clearance' },
    'repair',
  );
}

describe('manufacturing request lifecycle', () => {
  it('binds a request, quote, and acceptance to one immutable user-facing version', () => {
    const saved = transition(validWorkspace(), { type: 'save_design_version', name: 'Plate' }, 'save');
    const version = saved.savedVersions[0];
    const requested = transition(
      saved,
      {
        type: 'request_quote',
        versionId: version.versionId,
        configuration,
        buyerPrincipalId: 'user:buyer',
      },
      'request',
    );
    const quoted = transition(
      requested,
      { type: 'freeze_and_quote_revision', amountMinor: 245_000, currency: 'INR' },
      'quote',
    );
    const request = quoted.manufacturingRequests[0];
    const quote = quoted.quotes[0];
    const frozen = quoted.frozenRevisions[0];

    expect([request.versionId, quote.versionId, frozen.versionId]).toEqual([
      version.versionId,
      version.versionId,
      version.versionId,
    ]);
    expect([request.versionNumber, quote.versionNumber, frozen.versionNumber]).toEqual([1, 1, 1]);
    expect(request.reviewAccess).toEqual({
      providerId: request.provider.providerId,
      versionId: version.versionId,
      permission: 'VIEW_FROZEN_VERSION',
      reason: 'Shared for manufacturing review',
      grantedAt: expect.any(String),
    });

    const accepted = transition(
      quoted,
      { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
      'accept',
    );
    expect(accepted.acceptances[0]).toMatchObject({
      requestId: request.requestId,
      versionId: version.versionId,
      versionNumber: 1,
      quoteId: quote.quoteId,
    });
  });

  it('marks an unaccepted quote stale when the live draft changes without mutating the saved version', () => {
    const requested = transition(
      validWorkspace(),
      { type: 'request_quote', configuration, buyerPrincipalId: 'user:buyer' },
      'request',
    );
    const quoted = transition(
      requested,
      { type: 'freeze_and_quote_revision', amountMinor: 245_000, currency: 'INR' },
      'quote',
    );
    const exactGeometry = structuredClone(quoted.savedVersions[0].geometry);
    const changed = transition(
      quoted,
      { type: 'move_slot', centerX: 35, centerY: 90 },
      'geometry-change',
    );

    expect(changed.quotes[0].status).toBe('STALE');
    expect(changed.manufacturingRequests[0].status).toBe('STALE');
    expect(changed.savedVersions[0].geometry).toEqual(exactGeometry);
    expect(changed.savedVersions[0].geometry).not.toEqual(changed.geometry);
  });

  it('creates a linked version and request revision while superseding the prior quote', () => {
    const requested = transition(
      validWorkspace(),
      { type: 'request_quote', configuration, buyerPrincipalId: 'user:buyer' },
      'request',
    );
    const quoted = transition(
      requested,
      { type: 'freeze_and_quote_revision', amountMinor: 245_000, currency: 'INR' },
      'quote',
    );
    const changed = transition(
      quoted,
      {
        type: 'request_changes',
        requestId: quoted.manufacturingRequests[0].requestId,
        note: 'Move the connector slot.',
        configuration: { ...configuration, quantity: 6 },
      },
      'change-request',
    );

    expect(changed.savedVersions.map(({ versionNumber }) => versionNumber)).toEqual([1, 2]);
    expect(changed.manufacturingRequests[0].status).toBe('SUPERSEDED');
    expect(changed.manufacturingRequests[1]).toMatchObject({
      requestRevision: 2,
      supersedesRequestId: changed.manufacturingRequests[0].requestId,
      versionNumber: 2,
      buyerPrincipalId: 'user:buyer',
    });
    expect(changed.quotes[0].status).toBe('SUPERSEDED');
    expect(changed.changeRequests[0]).toMatchObject({
      requestId: changed.manufacturingRequests[0].requestId,
      fromVersionId: changed.savedVersions[0].versionId,
    });
  });

  it('preserves accepted history when the buyer starts a new change lifecycle', () => {
    const requested = transition(
      validWorkspace(),
      { type: 'request_quote', configuration, buyerPrincipalId: 'user:buyer' },
      'request',
    );
    const quoted = transition(
      requested,
      { type: 'freeze_and_quote_revision', amountMinor: 245_000, currency: 'INR' },
      'quote',
    );
    const quote = quoted.quotes[0];
    const accepted = transition(
      quoted,
      { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
      'accept',
    );
    const changed = transition(
      accepted,
      { type: 'request_changes', requestId: accepted.manufacturingRequests[0].requestId },
      'accepted-change',
    );

    expect(changed.manufacturingRequests[0].status).toBe('ACCEPTED');
    expect(changed.quotes[0].status).toBe('ACCEPTED');
    expect(changed.acceptances).toHaveLength(1);
    expect(changed.manufacturingRequests[1]).toMatchObject({
      status: 'CHANGES_REQUESTED',
      versionNumber: 2,
      supersedesRequestId: changed.manufacturingRequests[0].requestId,
      reviewAccess: {
        permission: 'VIEW_FROZEN_VERSION',
        reason: 'Shared for manufacturing review',
      },
    });
  });
});
