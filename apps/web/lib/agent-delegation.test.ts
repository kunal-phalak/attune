import { createAt1042Workspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import {
  availableCapabilityIdsForWorkspaceAuthority,
  authorityRoleForCommand,
  capabilityIdsForWorkspaceAuthority,
  delegationStatus,
} from './agent-delegation';

const NOW = Date.parse('2026-09-03T00:00:00.000Z');

function delegation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delegation:test',
    workspaceId: 'workspace:test',
    principalId: 'user:test',
    capabilityIds: ['edit_draft'] as const,
    authorityEpoch: 0,
    observationCursor: 0,
    issuedAt: '2026-09-02T23:59:00.000Z',
    expiresAt: '2026-09-03T00:09:00.000Z',
    consentExpiresAt: '2026-09-03T11:59:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

describe('agent delegation authority and perspective', () => {
  it('keeps buyer and provider capabilities for the same principal', () => {
    const workspace = createAt1042Workspace();
    const ids = capabilityIdsForWorkspaceAuthority(workspace, ['buyer', 'provider']);
    expect(ids).toEqual(
      expect.arrayContaining(['edit_draft', 'request_quote', 'freeze_and_quote_revision']),
    );
  });

  it('does not let provider perspective manufacture provider authority', () => {
    const workspace = createAt1042Workspace();
    expect(() =>
      authorityRoleForCommand(workspace, ['buyer'], 'freeze_and_quote_revision', 'provider'),
    ).toThrow('WORKSPACE_ROLE_REQUIRED');
  });

  it('keeps registered tools tied to available authority rather than the presented perspective', () => {
    const workspace = createAt1042Workspace();
    const available = availableCapabilityIdsForWorkspaceAuthority(workspace, ['buyer']);
    expect(available).toContain('edit_draft');
    expect(available).not.toContain('freeze_and_quote_revision');
    expect(availableCapabilityIdsForWorkspaceAuthority(workspace, ['buyer'])).toEqual(available);
  });

  it('uses possessed authority rather than perspective for a dual-role command', () => {
    const workspace = createAt1042Workspace();
    expect(
      authorityRoleForCommand(workspace, ['buyer', 'provider'], 'create_geometry', 'provider'),
    ).toBe('buyer');
  });

  it('requires revalidation after authority changes and reports expired consent', () => {
    expect(delegationStatus(delegation(), 1, NOW)).toMatchObject({
      status: 'revalidation_required',
      authorityEpoch: 0,
    });
    expect(
      delegationStatus(delegation({ consentExpiresAt: '2026-09-02T23:59:59.000Z' }), 0, NOW),
    ).toMatchObject({ status: 'expired' });
  });
});
