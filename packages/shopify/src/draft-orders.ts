import type { ManufacturingRequest, Quote } from '@attune/domain';

import { ShopifyIntegrationError } from './errors';

export const DRAFT_ORDER_CREATE = `#graphql
  mutation CreateAttuneDraftOrder($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id name status invoiceUrl updatedAt
        customer { id }
        customAttributes { key value }
        lineItems(first: 10) {
          nodes { id title quantity originalUnitPriceSet { shopMoney { amount currencyCode } } }
        }
      }
      userErrors { field message }
    }
  }
`;

export const DRAFT_ORDER_UPDATE = `#graphql
  mutation UpdateAttuneDraftOrder($id: ID!, $input: DraftOrderInput!) {
    draftOrderUpdate(id: $id, input: $input) {
      draftOrder { id name status invoiceUrl updatedAt customAttributes { key value } }
      userErrors { field message }
    }
  }
`;

export const DRAFT_ORDER_REREAD = `#graphql
  query RereadAttuneDraftOrder($id: ID!) {
    draftOrder(id: $id) {
      id name status invoiceUrl updatedAt
      customer { id }
      customAttributes { key value }
      lineItems(first: 10) {
        nodes { id title quantity originalUnitPriceSet { shopMoney { amount currencyCode } } }
      }
    }
  }
`;

export const DRAFT_ORDER_TARGET_SCOPES = ['write_draft_orders', 'read_customers'] as const;
export const DRAFT_ORDER_WEBHOOK_TOPICS = [
  'draft_orders/create',
  'draft_orders/update',
  'draft_orders/delete',
] as const;

export interface DraftOrderPreparation {
  readonly customerId: string;
  readonly request: ManufacturingRequest;
  readonly quote: Quote;
}

function attributes(input: DraftOrderPreparation) {
  const { provider, requestId, specHash, specRevision, visibility } = input.request;
  return [
    { key: 'attune_commitment_id', value: 'AT-1042' },
    { key: 'attune_request_id', value: requestId },
    { key: 'attune_spec_revision', value: specRevision },
    { key: 'attune_spec_hash', value: specHash },
    { key: 'attune_provider_id', value: provider.providerId },
    { key: 'attune_provider_profile_id', value: provider.profileId },
    { key: 'attune_provider_profile_version', value: provider.profileVersion },
    { key: 'attune_visibility', value: visibility },
  ];
}

export function prepareDraftOrderInput(input: DraftOrderPreparation) {
  const { quote, request } = input;
  const exact =
    request.status === 'QUOTED' &&
    quote.revisionId === request.specRevision &&
    quote.specHash === request.specHash &&
    JSON.stringify(quote.provider) === JSON.stringify(request.provider);
  if (!exact) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'A Shopify Draft Order must bind the exact quoted Attune request, revision, provider, and profile.',
    );
  }

  return {
    purchasingEntity: { customerId: input.customerId },
    note: `Attune ${request.requestId} · ${request.specRevision}`,
    tags: ['attune', 'custom-manufacturing', request.specRevision],
    customAttributes: attributes(input),
    lineItems: [
      {
        title: `Custom control faceplate — ${request.specRevision} · lot of 4`,
        quantity: 1,
        originalUnitPrice: (quote.amountMinor / 100).toFixed(2),
        customAttributes: attributes(input),
      },
    ],
  } as const;
}
