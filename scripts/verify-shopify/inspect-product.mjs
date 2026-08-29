import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) {
    loadEnvFile(path);
  }
}

const [productId, handle] = process.argv.slice(2);
const required = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ONLINE_STORE_PUBLICATION_ID',
  'SHOPIFY_ADMIN_API_VERSION',
  'SHOPIFY_STOREFRONT_API_VERSION',
  'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
];
const missing = required.filter((key) => !process.env[key]?.trim());

if (!productId || !handle) {
  throw new Error('Usage: node scripts/verify-shopify/inspect-product.mjs <product-id> <handle>');
}

if (missing.length > 0) {
  throw new Error(`Missing Shopify configuration: ${missing.join(', ')}`);
}

const domain = process.env.SHOPIFY_STORE_DOMAIN.trim()
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');
const adminVersion = process.env.SHOPIFY_ADMIN_API_VERSION.trim();
const storefrontVersion = process.env.SHOPIFY_STOREFRONT_API_VERSION.trim();
const publicationId = process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID.trim();

async function readJson(response, label) {
  const body = await response.json().catch(() => null);

  if (!response.ok || body?.errors?.length > 0) {
    throw new Error(
      `${label} failed: ${JSON.stringify(body?.errors ?? { status: response.status })}`,
    );
  }

  return body.data ?? body;
}

const tokenResponse = await fetch(`https://${domain}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SHOPIFY_CLIENT_ID.trim(),
    client_secret: process.env.SHOPIFY_CLIENT_SECRET.trim(),
  }),
});
const tokenBody = await readJson(tokenResponse, 'Shopify Admin authentication');

if (typeof tokenBody.access_token !== 'string' || tokenBody.access_token.length === 0) {
  throw new Error('Shopify Admin authentication returned no access token.');
}

const adminQuery = `#graphql
  query InspectAttuneProduct($id: ID!, $publicationId: ID!) {
    product(id: $id) {
      id
      handle
      status
      title
      publishedAt
      onlineStoreUrl
      onlineStorePreviewUrl
      publishedOnPublication(publicationId: $publicationId)
      variants(first: 5) {
        nodes {
          id
          inventoryPolicy
          inventoryQuantity
          inventoryItem {
            id
            tracked
            inventoryLevels(first: 20) {
              nodes {
                id
                location { id name isActive fulfillsOnlineOrders shipsInventory }
                quantities(names: ["available", "on_hand"]) { name quantity }
              }
            }
          }
        }
      }
      resourcePublicationsV2(first: 20, onlyPublished: false) {
        nodes {
          isPublished
          publishDate
          publication { id name }
        }
      }
    }
  }
`;
const adminResponse = await fetch(`https://${domain}/admin/api/${adminVersion}/graphql.json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': tokenBody.access_token,
  },
  body: JSON.stringify({
    query: adminQuery,
    variables: { id: productId, publicationId },
  }),
});
const adminData = await readJson(adminResponse, 'Admin product inspection');

const storefrontQuery = `#graphql
  query InspectAttuneStorefrontProduct($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      onlineStoreUrl
      variants(first: 1) {
        nodes {
          id
          title
          sku
          availableForSale
          price { amount currencyCode }
        }
      }
    }
  }
`;
const storefrontResponse = await fetch(`https://${domain}/api/${storefrontVersion}/graphql.json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN.trim(),
  },
  body: JSON.stringify({ query: storefrontQuery, variables: { handle } }),
});
const storefrontData = await readJson(storefrontResponse, 'Storefront product inspection');

console.warn(
  JSON.stringify(
    {
      inspectedAt: new Date().toISOString(),
      configuredPublicationId: publicationId,
      admin: adminData.product,
      storefront: storefrontData.product,
      directProductUrl: `https://${domain}/products/${handle}`,
    },
    null,
    2,
  ),
);
