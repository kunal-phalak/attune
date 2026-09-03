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
    {
      type: 'request_quote',
      configuration: {
        material: 'acrylic',
        thicknessMm: 5,
        finish: 'Polished',
        quantity: 7,
        toleranceMm: 0.25,
      },
    },
    {
      commandId: 'request',
      now: NOW,
    },
  ).workspace;
  return transitionWorkspace(
    requested,
    {
      type: 'freeze_and_quote_revision',
      amountMinor: 875_000,
      currency: 'INR',
      leadTimeDays: 12,
      validUntil: '2026-09-30T00:00:00.000Z',
    },
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

  it('binds one custom line item to the exact request, revision, configuration, provider, and customer', () => {
    const workspace = quotedRequest();
    const prepared = prepareDraftOrderInput({
      customerId: 'gid://shopify/Customer/1042',
      workspaceId: 'workspace:test-design',
      projectName: 'Test design',
      request: workspace.manufacturingRequests[0],
      quote: workspace.quotes[0],
    });

    expect(prepared.purchasingEntity).toEqual({ customerId: 'gid://shopify/Customer/1042' });
    expect(prepared.lineItems).toEqual([
      expect.objectContaining({ quantity: 1, originalUnitPrice: '8750.00' }),
    ]);
    expect(prepared.customAttributes).toEqual(
      expect.arrayContaining([
        { key: 'attune_workspace_id', value: 'workspace:test-design' },
        { key: 'attune_request_id', value: workspace.manufacturingRequests[0].requestId },
        { key: 'attune_revision', value: 'r7' },
        { key: 'attune_spec_hash', value: workspace.quotes[0].specHash },
        { key: 'attune_provider_profile_version', value: 'v1' },
        { key: 'attune_material', value: 'acrylic' },
        { key: 'attune_thickness', value: '5' },
        { key: 'attune_finish', value: 'Polished' },
        { key: 'attune_quantity', value: '7' },
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
