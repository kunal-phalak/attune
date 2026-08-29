import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) {
    loadEnvFile(path);
  }
}

const required = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ONLINE_STORE_PUBLICATION_ID',
  'SHOPIFY_ADMIN_API_VERSION',
];
const missing = required.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  throw new Error(`Missing Shopify configuration: ${missing.join(', ')}`);
}

const domain = process.env.SHOPIFY_STORE_DOMAIN.trim()
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');
const tokenResponse = await fetch(`https://${domain}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SHOPIFY_CLIENT_ID.trim(),
    client_secret: process.env.SHOPIFY_CLIENT_SECRET.trim(),
  }),
});
const tokenBody = await tokenResponse.json();

if (!tokenResponse.ok || typeof tokenBody.access_token !== 'string') {
  throw new Error(`Shopify Admin authentication failed with HTTP ${tokenResponse.status}.`);
}

const query = `#graphql
  query InspectAttuneShopifyConfiguration {
    shop {
      id
      name
      currencyCode
      primaryDomain { host url }
      storefrontAccessTokens(first: 20) {
        nodes { id title createdAt accessScopes { handle } }
      }
    }
    publications(first: 20) {
      nodes { id name supportsFuturePublishing }
    }
    metafieldDefinitions(ownerType: PRODUCT, namespace: "attune", first: 20) {
      nodes {
        id
        name
        namespace
        key
        type { name }
        access { storefront }
      }
    }
  }
`;
const response = await fetch(
  `https://${domain}/admin/api/${process.env.SHOPIFY_ADMIN_API_VERSION.trim()}/graphql.json`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': tokenBody.access_token,
    },
    body: JSON.stringify({ query }),
  },
);
const body = await response.json();

if (!response.ok || body.errors?.length > 0) {
  throw new Error(
    `Shopify configuration inspection failed: ${JSON.stringify(body.errors ?? response.status)}`,
  );
}

const configuredPublicationId = process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID.trim();
const publications = body.data.publications.nodes;
const configuredPublication = publications.find(
  (publication) => publication.id === configuredPublicationId,
);

console.warn(
  JSON.stringify(
    {
      shop: {
        id: body.data.shop.id,
        name: body.data.shop.name,
        currencyCode: body.data.shop.currencyCode,
        primaryDomain: body.data.shop.primaryDomain,
      },
      configuredPublication: configuredPublication ?? {
        id: configuredPublicationId,
        status: 'not_found',
      },
      publications,
      attuneMetafieldDefinitions: body.data.metafieldDefinitions.nodes,
      storefrontAccessTokens: body.data.shop.storefrontAccessTokens.nodes,
    },
    null,
    2,
  ),
);
