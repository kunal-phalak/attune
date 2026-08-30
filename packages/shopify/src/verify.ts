import type { FrozenRevision } from '@attune/domain';

import { REQUIRED_ADMIN_SCOPES } from './config';
import { ShopifyIntegrationError } from './errors';
import {
  ADMIN_REREAD,
  PRODUCT_SET,
  PUBLISH_PRODUCT,
  RESOLVE_LOCATION,
  VERIFY_SCOPES,
} from './queries';
import type {
  GraphqlClient,
  MaterializedProduct,
  ProductExpectation,
  ShopifyLocation,
  ShopifyProduct,
} from './types';

export function expectation(revision: FrozenRevision): ProductExpectation {
  if (revision.revisionId !== 'r7') {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'The P0 Shopify contract only materializes exact revision r7.',
    );
  }
  return {
    title: 'Custom Equipment Panel — AT-1042 r7',
    handle: 'custom-equipment-panel-at-1042-r7',
    variantTitle: 'Fabrication lot — 4 panels',
    sku: 'AT-1042-R7-LOT4',
    price: '2400.00',
    panelCount: 4,
    inventoryLots: 10,
    metafields: {
      commitment_id: 'AT-1042',
      revision_id: revision.revisionId,
      spec_hash: revision.specHash,
      panel_count: '4',
    },
  };
}

function metafieldMap(metafields: readonly { key: string; value: string }[] | undefined) {
  return Object.fromEntries(
    (metafields ?? []).filter(Boolean).map(({ key, value }) => [key, value]),
  );
}

function productInput(expected: ProductExpectation, locationId: string) {
  return {
    title: expected.title,
    handle: expected.handle,
    status: 'ACTIVE',
    descriptionHtml:
      '<p>One verified revision-bound fabrication lot containing four acrylic equipment panels.</p>',
    productOptions: [
      { name: 'Configuration', position: 1, values: [{ name: expected.variantTitle }] },
    ],
    variants: [
      {
        optionValues: [{ optionName: 'Configuration', name: expected.variantTitle }],
        inventoryPolicy: 'DENY',
        inventoryQuantities: [{ locationId, name: 'available', quantity: expected.inventoryLots }],
        price: Number(expected.price),
        sku: expected.sku,
      },
    ],
    metafields: Object.entries(expected.metafields).map(([key, value]) => ({
      namespace: 'attune',
      key,
      type: key === 'panel_count' ? 'number_integer' : 'single_line_text_field',
      value,
    })),
  };
}

function assertUserErrors(
  result: { readonly userErrors?: readonly unknown[] },
  operationName: string,
) {
  if (result.userErrors?.length) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      `${operationName} returned user errors.`,
    );
  }
}

function inventoryConforms(
  variant: Record<string, any> | undefined,
  locationId: string,
  expected: ProductExpectation,
) {
  const level = variant?.inventoryItem?.inventoryLevels?.nodes?.find(
    (candidate: Record<string, any>) => candidate.location.id === locationId,
  );
  const available = level?.quantities?.find(
    (quantity: Record<string, any>) => quantity.name === 'available',
  );
  return (
    variant?.inventoryPolicy === 'DENY' &&
    variant?.inventoryItem?.tracked === true &&
    variant?.inventoryQuantity === expected.inventoryLots &&
    level?.location?.isActive === true &&
    level?.location?.fulfillsOnlineOrders === true &&
    available?.quantity === expected.inventoryLots
  );
}

function adminConforms(
  product: ShopifyProduct | null | undefined,
  locationId: string,
  expected: ProductExpectation,
) {
  const variant = product?.variants?.nodes?.[0];
  return (
    product?.title === expected.title &&
    product?.handle === expected.handle &&
    product?.status === 'ACTIVE' &&
    variant?.title === expected.variantTitle &&
    Number(variant?.price) === Number(expected.price) &&
    variant?.sku === expected.sku &&
    inventoryConforms(variant, locationId, expected) &&
    JSON.stringify(metafieldMap(product?.metafields?.nodes)) === JSON.stringify(expected.metafields)
  );
}

export function storefrontConforms(
  product: ShopifyProduct | null | undefined,
  expected: ProductExpectation,
) {
  const variant = product?.variants?.nodes?.[0];
  return (
    product?.title === expected.title &&
    product?.handle === expected.handle &&
    variant?.title === expected.variantTitle &&
    variant?.sku === expected.sku &&
    variant?.availableForSale === true &&
    Number(variant?.price?.amount) === Number(expected.price) &&
    variant?.price?.currencyCode === 'INR' &&
    JSON.stringify(metafieldMap(product?.metafields)) === JSON.stringify(expected.metafields)
  );
}

export async function verifyScopes(admin: GraphqlClient) {
  const data = await admin<{
    currentAppInstallation: { accessScopes: readonly { handle: string }[] };
  }>(VERIFY_SCOPES, {}, 'Verify Admin scopes');
  const granted = new Set(data.currentAppInstallation.accessScopes.map(({ handle }) => handle));
  const missing = REQUIRED_ADMIN_SCOPES.filter((scope) => !granted.has(scope));
  if (missing.length > 0) {
    throw new ShopifyIntegrationError(
      'MISSING_ADMIN_SCOPES',
      `Missing Shopify Admin access scopes: ${missing.join(', ')}.`,
    );
  }
}

export async function resolveLocation(admin: GraphqlClient): Promise<ShopifyLocation> {
  const data = await admin<{ locations: { nodes: readonly ShopifyLocation[] } }>(
    RESOLVE_LOCATION,
    {},
    'Resolve inventory location',
  );
  const location = data.locations.nodes.find(
    ({ isActive, fulfillsOnlineOrders }) => isActive && fulfillsOnlineOrders,
  );
  if (!location) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'No active Shopify location can fulfill online orders.',
    );
  }
  return location;
}

function productIdentifiers(product: ShopifyProduct | null): MaterializedProduct {
  const productId: unknown = product?.id;
  const variantId: unknown = product?.variants?.nodes?.[0]?.id;
  if (typeof productId !== 'string' || typeof variantId !== 'string') {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Shopify returned invalid product or variant identifiers.',
    );
  }
  return { productId, variantId };
}

export async function upsertProduct(
  admin: GraphqlClient,
  locationId: string,
  expected: ProductExpectation,
): Promise<MaterializedProduct> {
  const created = await admin<{
    productSet: { product: ShopifyProduct | null; userErrors: readonly unknown[] };
  }>(
    PRODUCT_SET,
    { identifier: { handle: expected.handle }, input: productInput(expected, locationId) },
    'productSet',
  );
  assertUserErrors(created.productSet, 'productSet');
  if (!adminConforms(created.productSet.product, locationId, expected)) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Admin productSet response did not match the exact r7 lot contract.',
    );
  }
  return productIdentifiers(created.productSet.product);
}

async function adminReread(admin: GraphqlClient, productId: string, publicationId: string) {
  return admin<{ product: ShopifyProduct | null }>(
    ADMIN_REREAD,
    { id: productId, publicationId },
    'Admin product reread',
  );
}

export async function verifyAdminProduct(
  admin: GraphqlClient,
  productId: string,
  publicationId: string,
  locationId: string,
  expected: ProductExpectation,
) {
  const reread = await adminReread(admin, productId, publicationId);
  if (!adminConforms(reread.product, locationId, expected)) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Admin reread did not match the exact r7 lot contract.',
    );
  }
}

export async function publishAndVerify(
  admin: GraphqlClient,
  productId: string,
  publicationId: string,
) {
  const published = await admin<{
    publishablePublish: {
      publishable: { publishedOnPublication: boolean } | null;
      userErrors: readonly unknown[];
    };
  }>(PUBLISH_PRODUCT, { id: productId, publicationId }, 'publishablePublish');
  assertUserErrors(published.publishablePublish, 'publishablePublish');
  if (published.publishablePublish.publishable?.publishedOnPublication !== true) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Shopify did not verify publishedOnPublication.',
    );
  }
  const reread = await adminReread(admin, productId, publicationId);
  if (reread.product?.publishedOnPublication !== true) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Admin reread did not verify publication state.',
    );
  }
}
