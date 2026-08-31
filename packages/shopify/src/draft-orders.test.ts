import { transitionWorkspace } from '@attune/domain';
import { createAt1042Workspace } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import { REQUIRED_ADMIN_SCOPES, TARGET_ADMIN_SCOPES } from './config';
import { prepareDraftOrderInput } from './draft-orders';

const NOW = '2026-08-31T00:00:00.000Z';

function quotedRequest() {
  const initial = createAt1042Workspace();
  const repaired = transitionWorkspace(
    initial,
    { type: 'apply_deterministic_repair', repairId: 'move_slot_left_to_clearance' },
    { commandId: 'repair', now: NOW },
  ).workspace;
  const requested = transitionWorkspace(
    repaired,
    { type: 'request_quote' },
    {
      commandId: 'request',
      now: NOW,
    },
  ).workspace;
  return transitionWorkspace(
    requested,
    { type: 'freeze_and_quote_revision' },
    {
      commandId: 'quote',
      now: NOW,
    },
  ).workspace;
}

describe('Shopify Draft Order preparation', () => {
  it('keeps unimplemented Draft Order permissions out of the live product preflight', () => {
    expect(REQUIRED_ADMIN_SCOPES).not.toContain('write_draft_orders');
    expect(TARGET_ADMIN_SCOPES).toEqual(
      expect.arrayContaining(['write_draft_orders', 'read_customers', 'read_orders']),
    );
    expect(TARGET_ADMIN_SCOPES).not.toEqual(
      expect.arrayContaining(['write_orders', 'write_customers', 'write_inventory']),
    );
  });

  it('binds one custom lot to the exact private request, revision, hash, provider, and customer', () => {
    const workspace = quotedRequest();
    const prepared = prepareDraftOrderInput({
      customerId: 'gid://shopify/Customer/1042',
      request: workspace.manufacturingRequests[0],
      quote: workspace.quotes[0],
    });

    expect(prepared.purchasingEntity.customerId).toBe('gid://shopify/Customer/1042');
    expect(prepared.lineItems).toEqual([
      expect.objectContaining({ quantity: 1, originalUnitPrice: '2400.00' }),
    ]);
    expect(prepared.customAttributes).toEqual(
      expect.arrayContaining([
        { key: 'attune_spec_revision', value: 'r7' },
        { key: 'attune_spec_hash', value: workspace.quotes[0].specHash },
        { key: 'attune_visibility', value: 'PRIVATE' },
        { key: 'attune_provider_profile_version', value: 'v1' },
      ]),
    );
  });

  it('refuses a quote that does not exactly match the manufacturing request', () => {
    const workspace = quotedRequest();
    expect(() =>
      prepareDraftOrderInput({
        customerId: 'gid://shopify/Customer/1042',
        request: workspace.manufacturingRequests[0],
        quote: { ...workspace.quotes[0], specHash: 'drifted' },
      }),
    ).toThrow(/exact quoted Attune request/);
  });
});
