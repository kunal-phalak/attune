import { describe, expect, it } from 'vitest';

import { ShopifyIntegrationError } from './errors';
import { createStorefrontAccessToken, resolveShopBrandLogo } from './shop';
import type { GraphqlClient } from './types';

function graphqlTestClient(result: unknown): GraphqlClient {
  return async <T>() => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each test owns the response fixture.
    return result as T;
  };
}

describe('Shopify Storefront branding', () => {
  it('creates a Storefront access token', async () => {
    const token = await createStorefrontAccessToken(
      graphqlTestClient({
        storefrontAccessTokenCreate: {
          storefrontAccessToken: {
            accessToken: 'storefront-token',
            accessScopes: [{ handle: 'unauthenticated_read_content' }],
          },
          userErrors: [],
        },
      }),
      'Attune marketplace',
    );

    expect(token).toBe('storefront-token');
  });

  it('throws when Shopify rejects Storefront token creation', async () => {
    await expect(
      createStorefrontAccessToken(
        graphqlTestClient({
          storefrontAccessTokenCreate: {
            storefrontAccessToken: null,
            userErrors: [{ code: 'ACCESS_DENIED', field: ['input'], message: 'Denied' }],
          },
        }),
        'Attune marketplace',
      ),
    ).rejects.toBeInstanceOf(ShopifyIntegrationError);
  });

  it('resolves the square Storefront brand logo', async () => {
    await expect(
      resolveShopBrandLogo(
        graphqlTestClient({
          shop: {
            brand: {
              squareLogo: { image: { url: 'https://cdn.shopify.com/store-logo.png' } },
            },
          },
        }),
      ),
    ).resolves.toBe('https://cdn.shopify.com/store-logo.png');
  });

  it('returns undefined when a square brand logo is unavailable', async () => {
    await expect(
      resolveShopBrandLogo(graphqlTestClient({ shop: { brand: { squareLogo: null } } })),
    ).resolves.toBeUndefined();
    await expect(
      resolveShopBrandLogo(
        (async () => {
          throw new Error('Storefront unavailable');
        }) as GraphqlClient,
      ),
    ).resolves.toBeUndefined();
  });
});
