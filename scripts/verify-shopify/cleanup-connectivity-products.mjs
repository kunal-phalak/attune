import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const deleteRequested = process.argv.includes('--delete');
const handlePrefix = 'attune-connectivity-spike-';
const exactTitle = 'Attune connectivity spike — fabrication lot';

for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) {
    loadEnvFile(path);
  }
}

const required = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ADMIN_API_VERSION',
];
const missing = required.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  throw new Error(`Missing Shopify configuration: ${missing.join(', ')}`);
}

const domain = process.env.SHOPIFY_STORE_DOMAIN.trim()
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');
const adminVersion = process.env.SHOPIFY_ADMIN_API_VERSION.trim();

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

async function adminGraphql(query, variables, label) {
  const response = await fetch(`https://${domain}/admin/api/${adminVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': tokenBody.access_token,
    },
    body: JSON.stringify({ query, variables }),
  });

  return readJson(response, label);
}

const listed = await adminGraphql(
  `#graphql
    query ListDisposableAttuneProducts {
      products(first: 100, reverse: true, sortKey: CREATED_AT) {
        nodes { id handle title status createdAt }
      }
    }
  `,
  {},
  'List disposable Attune products',
);
const targets = listed.products.nodes.filter(
  (product) => product.handle.startsWith(handlePrefix) && product.title === exactTitle,
);
const deleted = [];

if (deleteRequested) {
  for (const product of targets) {
    const data = await adminGraphql(
      `#graphql
        mutation DeleteDisposableAttuneProduct($input: ProductDeleteInput!) {
          productDelete(synchronous: true, input: $input) {
            deletedProductId
            userErrors { field message }
          }
        }
      `,
      { input: { id: product.id } },
      `Delete disposable Attune product ${product.id}`,
    );
    const result = data.productDelete;

    if (result.userErrors.length > 0 || result.deletedProductId !== product.id) {
      throw new Error(`Product cleanup failed: ${JSON.stringify(result.userErrors)}`);
    }

    deleted.push(product);
  }
}

const evidence = {
  mode: deleteRequested ? 'delete' : 'dry-run',
  completedAt: new Date().toISOString(),
  targetRule: { handlePrefix, exactTitle },
  matchedCount: targets.length,
  deletedCount: deleted.length,
  products: deleteRequested ? deleted : targets,
};
mkdirSync('artifacts/shopify-spike', { recursive: true });
const evidencePath = `artifacts/shopify-spike/cleanup-${Date.now()}.json`;
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.warn(JSON.stringify(evidence, null, 2));
console.warn(`Redacted cleanup evidence: ${evidencePath}`);
