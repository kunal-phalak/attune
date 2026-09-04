import { graphqlClient } from './admin-client';
import { ShopifyIntegrationError } from './errors';
import { RESOLVE_SHOP_BRAND, RESOLVE_STOREFRONT_TOKEN } from './queries';
import type { GraphqlClient } from './types';

export async function createStorefrontAccessToken(
  admin: GraphqlClient,
  title: string,
): Promise<string> {
  const data = await admin<{
    storefrontAccessTokenCreate: {
      storefrontAccessToken: {
        accessToken: string;
        accessScopes: readonly { handle: string }[];
      } | null;
      userErrors: readonly { code?: string | null; field?: readonly string[] | null; message: string }[];
    };
  }>(RESOLVE_STOREFRONT_TOKEN, { title }, 'Resolve Shopify Storefront token');
  const result = data.storefrontAccessTokenCreate;
  if (result.userErrors.length > 0) {
    throw new ShopifyIntegrationError(
      'GRAPHQL_FAILED',
      `Shopify Storefront token creation failed: ${result.userErrors.map(({ message }) => message).join('; ')}.`,
    );
  }
  const token = result.storefrontAccessToken?.accessToken;
  if (!token) {
    throw new ShopifyIntegrationError(
      'GRAPHQL_FAILED',
      'Shopify Storefront token creation returned no access token.',
    );
  }
  return token;
}

export function createStorefrontClientForDomain(
  domain: string,
  token: string,
): GraphqlClient {
  const version =
    process.env.SHOPIFY_STOREFRONT_API_VERSION?.trim() ||
    process.env.SHOPIFY_ADMIN_API_VERSION?.trim();
  if (!version) {
    throw new ShopifyIntegrationError(
      'MISSING_CONFIGURATION',
      'SHOPIFY_STOREFRONT_API_VERSION is required.',
    );
  }
  return graphqlClient(`https://${domain}/api/${version}/graphql.json`, {
    'X-Shopify-Storefront-Access-Token': token,
  });
}

export async function resolveShopBrandLogo(
  storefront: GraphqlClient,
): Promise<string | undefined> {
  try {
    const data = await storefront<{
      shop: { brand: { squareLogo: { image: { url: string } | null } | null } | null };
    }>(RESOLVE_SHOP_BRAND, {}, 'Resolve Shopify shop brand');
    return data.shop.brand?.squareLogo?.image?.url;
  } catch {
    return undefined;
  }
}
