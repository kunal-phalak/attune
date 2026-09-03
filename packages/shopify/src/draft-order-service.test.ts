import { describe, expect, it, vi } from 'vitest';

import {
  customerCheckoutHandoffWithAdmin,
  listRecentDraftOrdersWithAdmin,
} from './draft-order-service';
import type { GraphqlClient } from './types';

type GraphqlHandler = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

function graphqlTestClient(handler: GraphqlHandler): GraphqlClient {
  return async <T>(query: string, variables: Record<string, unknown>) => {
    const result = await handler(query, variables);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each test owns its mocked GraphQL shape.
    return result as T;
  };
}

function grantedScopes() {
  return {
    currentAppInstallation: { accessScopes: [{ handle: 'write_draft_orders' }] },
  };
}

function draftOrder(attributes: readonly { readonly key: string; readonly value: string }[]) {
  return {
    id: 'gid://shopify/DraftOrder/42',
    name: '#D42',
    status: 'OPEN',
    invoiceUrl: 'https://checkout.example.test/draft/42',
    invoiceSentAt: null,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
    order: null,
    customer: null,
    email: null,
    shippingAddress: null,
    billingAddress: null,
    customAttributes: attributes,
    lineItems: { nodes: [] },
  };
}

describe('Shopify Draft Order commerce inspection', () => {
  it('returns compact summaries with Attune binding and no checkout URL', async () => {
    const adminMock = vi.fn<GraphqlHandler>(async (query, variables) => {
      if (query.includes('currentAppInstallation')) return grantedScopes();
      expect(query).toContain('AttuneRecentDraftOrders');
      expect(variables).toEqual({ first: 20 });
      return {
        draftOrders: {
          nodes: [
            draftOrder([
              { key: 'attune_request_id', value: 'request:42' },
              { key: 'attune_version_id', value: 'version:7' },
              { key: 'attune_version_number', value: '7' },
              { key: 'attune_revision', value: 'r7' },
              { key: 'attune_spec_hash', value: 'a'.repeat(64) },
            ]),
          ],
        },
      };
    });

    const [summary] = await listRecentDraftOrdersWithAdmin(graphqlTestClient(adminMock), 99);

    expect(summary).toEqual(
      expect.objectContaining({
        externalId: 'gid://shopify/DraftOrder/42',
        name: '#D42',
        checkoutAvailable: true,
        attuneBinding: expect.objectContaining({
          requestId: 'request:42',
          versionId: 'version:7',
          specificationHash: 'a'.repeat(64),
        }),
      }),
    );
    expect(summary).not.toHaveProperty('invoiceUrl');
  });

  it('reveals checkout only for a reread Attune-managed Draft Order', async () => {
    const managed = draftOrder([{ key: 'attune_request_id', value: 'request:42' }]);
    const managedClient = graphqlTestClient(async (query, variables) => {
      if (query.includes('currentAppInstallation')) return grantedScopes();
      expect(query).toContain('RereadAttuneDraftOrder');
      expect(variables).toEqual({ id: managed.id });
      return { draftOrder: managed };
    });
    await expect(customerCheckoutHandoffWithAdmin(managedClient, managed.id)).resolves.toEqual({
      name: '#D42',
      invoiceUrl: 'https://checkout.example.test/draft/42',
    });

    const externalClient = graphqlTestClient(async (query) =>
      query.includes('currentAppInstallation') ? grantedScopes() : { draftOrder: draftOrder([]) },
    );
    await expect(
      customerCheckoutHandoffWithAdmin(externalClient, managed.id),
    ).rejects.toMatchObject({ code: 'CONFORMANCE_FAILED' });
  });
});
