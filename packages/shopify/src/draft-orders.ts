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

export const DRAFT_ORDER_TARGET_SCOPES = ['write_draft_orders'] as const;
export const DRAFT_ORDER_WEBHOOK_TOPICS = [
  'draft_orders/create',
  'draft_orders/update',
  'draft_orders/delete',
] as const;

export interface DraftOrderPreparation {
  readonly customerId?: string;
  readonly workspaceId?: string;
  readonly projectName?: string;
  readonly request: ManufacturingRequest;
  readonly quote: Quote;
}

function attributes(input: DraftOrderPreparation) {
  const request = input.request;
  const { provider, requestId, specHash, specRevision } = request;
  const configuration = request.configuration;
  return [
    { key: 'attune_workspace_id', value: input.workspaceId ?? 'legacy-fixture' },
    { key: 'attune_request_id', value: requestId },
    { key: 'attune_revision', value: specRevision },
    { key: 'attune_spec_hash', value: specHash },
    { key: 'attune_provider_id', value: provider.providerId },
    { key: 'attune_provider_profile_version', value: provider.profileVersion },
    { key: 'attune_shopify_location_id', value: request.shopifyLocationId ?? '' },
    { key: 'attune_material', value: configuration?.material ?? '' },
    { key: 'attune_thickness', value: String(configuration?.thicknessMm ?? '') },
    { key: 'attune_finish', value: configuration?.finish ?? '' },
    { key: 'attune_quantity', value: String(configuration?.quantity ?? input.quote.panelCount) },
  ];
}

export function prepareDraftOrderInput(input: DraftOrderPreparation) {
  const { quote, request } = input;
  const exact =
    (request.status === 'QUOTED' || request.status === 'QUOTE_READY') &&
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
    ...(input.customerId ? { purchasingEntity: { customerId: input.customerId } } : {}),
    note: `Attune ${request.requestId} · ${request.specRevision}`,
    tags: ['attune', 'custom-manufacturing', request.specRevision],
    customAttributes: attributes(input),
    lineItems: [
      {
        title: `Custom fabrication — ${input.projectName ?? 'Attune design'} — ${request.specRevision}`,
        quantity: 1,
        originalUnitPrice: (quote.amountMinor / 100).toFixed(2),
        customAttributes: attributes(input),
      },
    ],
  } as const;
}
