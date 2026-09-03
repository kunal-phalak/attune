import { createAdminClient } from './admin-client';
import {
  coreConfigurationFromEnvironment,
  CUSTOMER_LOOKUP_ADMIN_SCOPES,
  DRAFT_ORDER_ADMIN_SCOPES,
  PRODUCT_ADMIN_SCOPES,
  PROVIDER_IDENTITY_SCOPES,
} from './config';
import { ShopifyIntegrationError } from './errors';
import { INSPECT_PROVIDER } from './queries';
import type { ShopifyLocation, ShopifyProviderConnection, ShopifyShopIdentity } from './types';

function hasEvery(granted: ReadonlySet<string>, required: readonly string[]): boolean {
  return required.every(
    (scope) =>
      granted.has(scope) ||
      (scope.startsWith('read_') && granted.has(`write_${scope.slice(5)}`)),
  );
}

export async function inspectShopifyProviderWithAdmin(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
): Promise<ShopifyProviderConnection> {
  const data = await admin<{
    currentAppInstallation: { accessScopes: readonly { handle: string }[] };
    shop: ShopifyShopIdentity;
    locations: { nodes: readonly ShopifyLocation[] };
  }>(INSPECT_PROVIDER, {}, 'Inspect Shopify provider');
  const grantedScopes = data.currentAppInstallation.accessScopes.map(({ handle }) => handle);
  const granted = new Set(grantedScopes);
  if (!hasEvery(granted, PROVIDER_IDENTITY_SCOPES)) {
    throw new ShopifyIntegrationError(
      'MISSING_ADMIN_SCOPES',
      `Missing Shopify Admin access scopes: ${PROVIDER_IDENTITY_SCOPES.filter((scope) => !granted.has(scope)).join(', ')}.`,
    );
  }

  return {
    verifiedAt: new Date().toISOString(),
    shop: data.shop,
    locations: data.locations.nodes,
    grantedScopes,
    capabilities: {
      identity: true,
      locations: true,
      draftOrders: hasEvery(granted, DRAFT_ORDER_ADMIN_SCOPES),
      customerLookup: hasEvery(granted, CUSTOMER_LOOKUP_ADMIN_SCOPES),
      productMaterialization: hasEvery(granted, PRODUCT_ADMIN_SCOPES),
      storefront: Boolean(
        process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID?.trim() &&
        process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN?.trim() &&
        process.env.SHOPIFY_STOREFRONT_API_VERSION?.trim(),
      ),
    },
  };
}

export async function inspectShopifyProvider(): Promise<ShopifyProviderConnection> {
  const configuration = coreConfigurationFromEnvironment();
  return inspectShopifyProviderWithAdmin(await createAdminClient(configuration));
}
