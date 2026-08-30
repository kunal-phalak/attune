import { graphqlClient } from './admin-client';
import { STOREFRONT_RETRY_DELAYS_MS } from './config';
import { ShopifyIntegrationError } from './errors';
import { STOREFRONT_REREAD } from './queries';
import type {
  GraphqlClient,
  ProductExpectation,
  ShopifyConfiguration,
  ShopifyProduct,
} from './types';
import { storefrontConforms } from './verify';

export function createStorefrontClient(configuration: ShopifyConfiguration): GraphqlClient {
  return graphqlClient(
    `https://${configuration.domain}/api/${configuration.storefrontVersion}/graphql.json`,
    { 'X-Shopify-Storefront-Access-Token': configuration.storefrontToken },
  );
}

export async function pollStorefront(
  storefront: GraphqlClient,
  expected: ProductExpectation,
): Promise<ShopifyProduct> {
  for (const delay of STOREFRONT_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const data = await storefront<{ product: ShopifyProduct | null }>(
      STOREFRONT_REREAD,
      { handle: expected.handle },
      'Storefront product(handle) verification',
    );
    if (storefrontConforms(data.product, expected)) return data.product!;
  }
  throw new ShopifyIntegrationError(
    'STOREFRONT_TIMEOUT',
    'Storefront product(handle) did not converge within 30 seconds.',
    true,
  );
}
