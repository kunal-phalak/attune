import { createAdminClient, graphqlClient } from './admin-client';
import {
  coreConfigurationFromEnvironment,
  CUSTOMER_LOOKUP_ADMIN_SCOPES,
  DRAFT_ORDER_ADMIN_SCOPES,
  PRODUCT_ADMIN_SCOPES,
  PROVIDER_IDENTITY_SCOPES,
} from './config';
import { ShopifyIntegrationError } from './errors';
import {
  INSPECT_PROVIDER,
  STOREFRONT_ACCESS_TOKEN_CREATE,
  STOREFRONT_ACCESS_TOKENS,
  STOREFRONT_BRANDING,
} from './queries';
import type {
  GraphqlClient,
  ShopifyLocation,
  ShopifyProviderConnection,
  ShopifyShopIdentity,
} from './types';

function hasEvery(granted: ReadonlySet<string>, required: readonly string[]): boolean {
  return required.every(
    (scope) =>
      granted.has(scope) || (scope.startsWith('read_') && granted.has(`write_${scope.slice(5)}`)),
  );
}

async function storefrontLogoUrl(
  admin: GraphqlClient,
  shopDomain: string,
): Promise<string | undefined> {
  const version =
    process.env.SHOPIFY_STOREFRONT_API_VERSION?.trim() ||
    process.env.SHOPIFY_ADMIN_API_VERSION?.trim();
  if (!version) return undefined;
  try {
    const listed = await admin<{
      shop: { storefrontAccessTokens: { nodes: readonly { accessToken: string }[] } };
    }>(STOREFRONT_ACCESS_TOKENS, {}, 'List Shopify Storefront access tokens');
    let token = listed.shop.storefrontAccessTokens.nodes[0]?.accessToken;
    if (!token) {
      const created = await admin<{
        storefrontAccessTokenCreate: {
          storefrontAccessToken: { accessToken: string } | null;
          userErrors: readonly { message: string }[];
        };
      }>(
        STOREFRONT_ACCESS_TOKEN_CREATE,
        { input: { title: 'Attune marketplace branding' } },
        'Create Shopify Storefront access token',
      );
      if (created.storefrontAccessTokenCreate.userErrors.length > 0) return undefined;
      token = created.storefrontAccessTokenCreate.storefrontAccessToken?.accessToken;
    }
    if (!token) return undefined;
    const storefront = graphqlClient(`https://${shopDomain}/api/${version}/graphql.json`, {
      'X-Shopify-Storefront-Access-Token': token,
    });
    const branding = await storefront<{
      shop: {
        brand: {
          squareLogo: { image: { url: string } | null } | null;
          logo: { image: { url: string } | null } | null;
        } | null;
      };
    }>(STOREFRONT_BRANDING, {}, 'Inspect Shopify Storefront branding');
    return branding.shop.brand?.squareLogo?.image?.url ?? branding.shop.brand?.logo?.image?.url;
  } catch {
    return undefined;
  }
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

  const logoUrl = granted.has('unauthenticated_read_product_listings')
    ? await storefrontLogoUrl(admin, data.shop.myshopifyDomain)
    : undefined;
  return {
    verifiedAt: new Date().toISOString(),
    shop: { ...data.shop, ...(logoUrl ? { logoUrl } : {}) },
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
