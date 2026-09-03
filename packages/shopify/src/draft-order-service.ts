import type {
  BuyerCommerceProfile,
  ExternalCommerceSnapshot,
  ManufacturingRequest,
  Quote,
} from '@attune/domain';

import { createAdminClient } from './admin-client';
import { coreConfigurationFromEnvironment, DRAFT_ORDER_ADMIN_SCOPES } from './config';
import { DRAFT_ORDER_CREATE, DRAFT_ORDER_REREAD, prepareDraftOrderInput } from './draft-orders';
import { ShopifyIntegrationError } from './errors';
import { VERIFY_SCOPES } from './queries';
import type { GraphqlClient } from './types';

interface DraftOrderNode {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly invoiceUrl?: string | null;
  readonly updatedAt: string;
  readonly customer?: { readonly id: string } | null;
  readonly email?: string | null;
  readonly shippingAddress?: {
    readonly address1?: string | null;
    readonly city?: string | null;
    readonly countryCodeV2?: string | null;
    readonly zip?: string | null;
  } | null;
  readonly billingAddress?: {
    readonly address1?: string | null;
    readonly city?: string | null;
    readonly countryCodeV2?: string | null;
    readonly zip?: string | null;
  } | null;
  readonly customAttributes: readonly { readonly key: string; readonly value: string }[];
  readonly lineItems: {
    readonly nodes: readonly {
      readonly title: string;
      readonly quantity: number;
      readonly originalUnitPriceSet: {
        readonly shopMoney: { readonly amount: string; readonly currencyCode: string };
      };
    }[];
  };
}

async function requireDraftOrderScope(admin: GraphqlClient): Promise<void> {
  const data = await admin<{
    currentAppInstallation: { accessScopes: readonly { handle: string }[] };
  }>(VERIFY_SCOPES, {}, 'Verify Draft Order scope');
  const granted = new Set(data.currentAppInstallation.accessScopes.map(({ handle }) => handle));
  const missing = DRAFT_ORDER_ADMIN_SCOPES.filter((scope) => !granted.has(scope));
  if (missing.length) {
    throw new ShopifyIntegrationError(
      'MISSING_ADMIN_SCOPES',
      `Missing Shopify Admin access scopes: ${missing.join(', ')}.`,
    );
  }
}

function assertUserErrors(errors: readonly unknown[] | undefined, operation: string): void {
  if (errors?.length) {
    throw new ShopifyIntegrationError('CONFORMANCE_FAILED', `${operation} returned user errors.`);
  }
}

function attributeMap(node: DraftOrderNode): Readonly<Record<string, string>> {
  return Object.fromEntries(node.customAttributes.map(({ key, value }) => [key, value]));
}

function assertDraftOrderConforms(
  node: DraftOrderNode | null,
  prepared: ReturnType<typeof prepareDraftOrderInput>,
  request: ManufacturingRequest,
  quote: Quote,
): asserts node is DraftOrderNode {
  const line = node?.lineItems.nodes[0];
  const attributes = node ? attributeMap(node) : {};
  const expected = Object.fromEntries(
    prepared.customAttributes.map(({ key, value }) => [key, value]),
  );
  const exactAttributes = Object.entries(expected).every(
    ([key, value]) => attributes[key] === value,
  );
  if (
    !node ||
    !line ||
    node.lineItems.nodes.length !== 1 ||
    line.title !== prepared.lineItems[0].title ||
    line.quantity !== 1 ||
    Number(line.originalUnitPriceSet.shopMoney.amount) !== quote.amountMinor / 100 ||
    line.originalUnitPriceSet.shopMoney.currencyCode !== quote.currency ||
    attributes.attune_request_id !== request.requestId ||
    attributes.attune_version_id !== request.versionId ||
    attributes.attune_version_number !== String(request.versionNumber) ||
    attributes.attune_revision !== request.specRevision ||
    attributes.attune_spec_hash !== request.specHash ||
    node.customer?.id !== prepared.purchasingEntity.customerId ||
    node.email?.toLocaleLowerCase() !== prepared.email.toLocaleLowerCase() ||
    node.shippingAddress?.address1 !== prepared.shippingAddress.address1 ||
    node.shippingAddress?.city !== prepared.shippingAddress.city ||
    node.shippingAddress?.countryCodeV2 !== prepared.shippingAddress.countryCode ||
    node.shippingAddress?.zip !== prepared.shippingAddress.zip ||
    node.billingAddress?.address1 !== prepared.billingAddress.address1 ||
    node.billingAddress?.city !== prepared.billingAddress.city ||
    node.billingAddress?.countryCodeV2 !== prepared.billingAddress.countryCode ||
    node.billingAddress?.zip !== prepared.billingAddress.zip ||
    !exactAttributes
  ) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'The Shopify Draft Order reread did not match the exact Attune request, quote, and configuration.',
    );
  }
}

export async function createAndVerifyDraftOrder(input: {
  readonly workspaceId: string;
  readonly projectName: string;
  readonly request: ManufacturingRequest;
  readonly quote: Quote;
  readonly customerId: string;
  readonly buyerProfile: BuyerCommerceProfile;
}): Promise<ExternalCommerceSnapshot> {
  const configuration = coreConfigurationFromEnvironment();
  const admin = await createAdminClient(configuration);
  await requireDraftOrderScope(admin);
  const prepared = prepareDraftOrderInput(input);
  const created = await admin<{
    draftOrderCreate: {
      readonly draftOrder: DraftOrderNode | null;
      readonly userErrors: readonly unknown[];
    };
  }>(DRAFT_ORDER_CREATE, { input: prepared }, 'draftOrderCreate');
  assertUserErrors(created.draftOrderCreate.userErrors, 'draftOrderCreate');
  const draftOrderId = created.draftOrderCreate.draftOrder?.id;
  if (!draftOrderId) {
    throw new ShopifyIntegrationError('CONFORMANCE_FAILED', 'Shopify returned no Draft Order ID.');
  }
  const reread = await admin<{ readonly draftOrder: DraftOrderNode | null }>(
    DRAFT_ORDER_REREAD,
    { id: draftOrderId },
    'Draft Order reread',
  );
  assertDraftOrderConforms(reread.draftOrder, prepared, input.request, input.quote);
  const node = reread.draftOrder;
  return {
    externalId: node.id,
    kind: 'SHOPIFY_DRAFT_ORDER',
    status: node.status,
    requestId: input.request.requestId,
    versionId: input.request.versionId,
    versionNumber: input.request.versionNumber,
    specRevision: input.request.specRevision,
    specHash: input.request.specHash,
    provider: input.request.provider,
    amountMinor: input.quote.amountMinor,
    currency: input.quote.currency,
    customerId: node.customer!.id,
    name: node.name,
    ...(node.invoiceUrl ? { invoiceUrl: node.invoiceUrl } : {}),
    updatedAt: node.updatedAt,
  };
}
