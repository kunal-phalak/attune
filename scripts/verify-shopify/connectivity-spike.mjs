import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const REQUIRED_ENVIRONMENT = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_STOREFRONT_PASSWORD',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ONLINE_STORE_PUBLICATION_ID',
  'SHOPIFY_ADMIN_API_VERSION',
  'SHOPIFY_STOREFRONT_API_VERSION',
];
const STOREFRONT_ACCESS_TOKEN_KEY = 'SHOPIFY_STOREFRONT_ACCESS_TOKEN';

const STOREFRONT_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000];
const runId = new Date()
  .toISOString()
  .replaceAll(/[-:.TZ]/g, '')
  .slice(0, 14);
const handle = `attune-connectivity-spike-${runId}`;
const expected = {
  title: 'Attune connectivity spike — fabrication lot',
  handle,
  optionName: 'Configuration',
  variantTitle: 'Fabrication lot — 4 panels',
  price: '2400.00',
  currency: 'INR',
  sku: `ATTUNE-SPIKE-${runId}-LOT4`,
  metafields: {
    commitment_id: `SPIKE-${runId}`,
    revision_id: 'connectivity-r0',
    spec_hash: `connectivity-${runId}`,
    panel_count: '4',
  },
};
const metafieldDefinitions = [
  { key: 'commitment_id', name: 'Attune commitment ID', type: 'single_line_text_field' },
  { key: 'revision_id', name: 'Attune revision ID', type: 'single_line_text_field' },
  { key: 'spec_hash', name: 'Attune specification hash', type: 'single_line_text_field' },
  { key: 'panel_count', name: 'Attune panel count', type: 'number_integer' },
];

function loadLocalEnvironment() {
  for (const path of ['.env.local', '.env']) {
    if (existsSync(path)) {
      loadEnvFile(path);
    }
  }
}

function requireEnvironment() {
  const missing = REQUIRED_ENVIRONMENT.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Shopify is not connected. Configure these inputs in .env.local or the execution environment:\n- ${missing.join('\n- ')}`,
    );
  }

  return {
    ...Object.fromEntries(REQUIRED_ENVIRONMENT.map((key) => [key, process.env[key].trim()])),
    [STOREFRONT_ACCESS_TOKEN_KEY]: process.env[STOREFRONT_ACCESS_TOKEN_KEY]?.trim() ?? '',
  };
}

function normalizeDomain(value) {
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

async function requestJson(url, init, label) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

function assertGraphqlResult(body, operationName) {
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(`${operationName} returned GraphQL errors: ${JSON.stringify(body.errors)}`);
  }

  return body.data;
}

function assertUserErrors(errors, operationName) {
  if (errors?.length > 0) {
    throw new Error(`${operationName} returned user errors: ${JSON.stringify(errors)}`);
  }
}

async function getAdminAccessToken(configuration, domain) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: configuration.SHOPIFY_CLIENT_ID,
    client_secret: configuration.SHOPIFY_CLIENT_SECRET,
  });
  const result = await requestJson(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    'Shopify client-credentials grant',
  );

  if (typeof result.access_token !== 'string' || result.access_token.length === 0) {
    throw new Error('Shopify client-credentials grant returned no access token.');
  }

  return result.access_token;
}

function createAdminClient(configuration, domain, accessToken) {
  const endpoint = `https://${domain}/admin/api/${configuration.SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

  return async function adminGraphql(query, variables, operationName) {
    const body = await requestJson(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
      operationName,
    );

    return assertGraphqlResult(body, operationName);
  };
}

function createStorefrontClient(configuration, domain) {
  const endpoint = `https://${domain}/api/${configuration.SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;

  return async function storefrontGraphql(query, variables, operationName) {
    const body = await requestJson(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': configuration.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
      },
      operationName,
    );

    return assertGraphqlResult(body, operationName);
  };
}

const CREATE_STOREFRONT_ACCESS_TOKEN = `#graphql
  mutation CreateAttuneStorefrontAccessToken($input: StorefrontAccessTokenInput!) {
    storefrontAccessTokenCreate(input: $input) {
      storefrontAccessToken {
        id
        accessToken
        accessScopes { handle }
        createdAt
        title
      }
      userErrors { field message }
    }
  }
`;

function persistLocalEnvironmentValue(key, value) {
  const path = '.env.local';
  const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = source.split(/\r?\n/);
  const prefix = `${key}=`;
  const index = lines.findIndex((line) => line.startsWith(prefix));

  if (index >= 0) {
    lines[index] = `${prefix}${value}`;
  } else {
    lines.push(`${prefix}${value}`);
  }

  writeFileSync(path, lines.join('\n'), { mode: 0o600 });
}

async function resolveStorefrontAccessToken(configuration, adminGraphql) {
  if (configuration.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    return { created: false, id: null, scopes: [] };
  }

  const data = await adminGraphql(
    CREATE_STOREFRONT_ACCESS_TOKEN,
    { input: { title: `Attune connectivity spike ${runId}` } },
    'storefrontAccessTokenCreate',
  );
  const result = data.storefrontAccessTokenCreate;
  assertUserErrors(result.userErrors, 'storefrontAccessTokenCreate');
  const token = result.storefrontAccessToken;

  if (typeof token?.accessToken !== 'string' || token.accessToken.length === 0) {
    throw new Error('storefrontAccessTokenCreate returned no access token.');
  }

  configuration.SHOPIFY_STOREFRONT_ACCESS_TOKEN = token.accessToken;
  persistLocalEnvironmentValue(STOREFRONT_ACCESS_TOKEN_KEY, token.accessToken);

  return {
    created: true,
    id: token.id,
    scopes: token.accessScopes.map((scope) => scope.handle),
  };
}

const LIST_ATTUNE_METAFIELD_DEFINITIONS = `#graphql
  query ListAttuneMetafieldDefinitions {
    metafieldDefinitions(ownerType: PRODUCT, namespace: "attune", first: 20) {
      nodes { id namespace key type { name } access { storefront } }
    }
  }
`;

const CREATE_ATTUNE_METAFIELD_DEFINITION = `#graphql
  mutation CreateAttuneMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id namespace key type { name } access { storefront } }
      userErrors { code field message }
    }
  }
`;

async function ensureStorefrontMetafieldDefinitions(adminGraphql) {
  const listed = await adminGraphql(
    LIST_ATTUNE_METAFIELD_DEFINITIONS,
    {},
    'List Attune metafield definitions',
  );
  const existing = new Map(
    listed.metafieldDefinitions.nodes.map((definition) => [definition.key, definition]),
  );
  const verified = [];

  for (const definition of metafieldDefinitions) {
    const current = existing.get(definition.key);

    if (current) {
      if (current.type.name !== definition.type || current.access.storefront !== 'PUBLIC_READ') {
        throw new Error(
          `Attune metafield definition ${definition.key} has incompatible type or Storefront access.`,
        );
      }

      verified.push({ id: current.id, key: current.key, created: false });
      continue;
    }

    const created = await adminGraphql(
      CREATE_ATTUNE_METAFIELD_DEFINITION,
      {
        definition: {
          namespace: 'attune',
          key: definition.key,
          name: definition.name,
          type: definition.type,
          ownerType: 'PRODUCT',
          access: { storefront: 'PUBLIC_READ' },
        },
      },
      `Create Attune metafield definition ${definition.key}`,
    );
    assertUserErrors(created.metafieldDefinitionCreate.userErrors, 'metafieldDefinitionCreate');
    const createdDefinition = created.metafieldDefinitionCreate.createdDefinition;
    verified.push({ id: createdDefinition.id, key: createdDefinition.key, created: true });
  }

  return verified;
}

const PRODUCT_SET = `#graphql
  mutation CreateConnectivityProduct($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product {
        id
        handle
        status
        title
        metafields(first: 10) {
          nodes { namespace key type value }
        }
        variants(first: 5) {
          nodes { id title price sku }
        }
      }
      userErrors { code field message }
    }
  }
`;

const ADMIN_REREAD = `#graphql
  query RereadConnectivityProduct($id: ID!, $publicationId: ID!) {
    product(id: $id) {
      id
      handle
      status
      title
      publishedOnPublication(publicationId: $publicationId)
      metafields(first: 10) {
        nodes { namespace key type value }
      }
      variants(first: 5) {
        nodes { id title price sku }
      }
    }
  }
`;

const PUBLISH_PRODUCT = `#graphql
  mutation PublishConnectivityProduct($id: ID!, $publicationId: ID!) {
    publishablePublish(id: $id, input: { publicationId: $publicationId }) {
      publishable {
        publishedOnPublication(publicationId: $publicationId)
      }
      userErrors { field message }
    }
  }
`;

const STOREFRONT_REREAD = `#graphql
  query VerifyConnectivityProduct($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      onlineStoreUrl
      metafields(identifiers: [
        { namespace: "attune", key: "commitment_id" }
        { namespace: "attune", key: "revision_id" }
        { namespace: "attune", key: "spec_hash" }
        { namespace: "attune", key: "panel_count" }
      ]) {
        namespace
        key
        value
      }
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

function productInput() {
  return {
    title: expected.title,
    handle: expected.handle,
    status: 'ACTIVE',
    descriptionHtml:
      '<p>Connectivity proof for one revision-bound fabrication lot of four panels.</p>',
    productOptions: [
      {
        name: expected.optionName,
        position: 1,
        values: [{ name: expected.variantTitle }],
      },
    ],
    variants: [
      {
        optionValues: [{ optionName: expected.optionName, name: expected.variantTitle }],
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

function metafieldMap(metafields) {
  return Object.fromEntries(
    (metafields ?? []).filter(Boolean).map((metafield) => [metafield.key, metafield.value]),
  );
}

function assertAdminConformance(product) {
  const variant = product?.variants?.nodes?.[0];
  const observedMetafields = metafieldMap(product?.metafields?.nodes);

  if (
    product?.title !== expected.title ||
    product?.handle !== expected.handle ||
    product?.status !== 'ACTIVE' ||
    variant?.title !== expected.variantTitle ||
    Number(variant?.price) !== Number(expected.price) ||
    variant?.sku !== expected.sku ||
    JSON.stringify(observedMetafields) !== JSON.stringify(expected.metafields)
  ) {
    throw new Error(`Admin conformance failed: ${JSON.stringify({ product, expected })}`);
  }
}

function storefrontConforms(product) {
  const variant = product?.variants?.nodes?.[0];
  const observedMetafields = metafieldMap(product?.metafields);

  return (
    product?.title === expected.title &&
    product?.handle === expected.handle &&
    Boolean(product?.onlineStoreUrl) &&
    variant?.title === expected.variantTitle &&
    Number(variant?.price?.amount) === Number(expected.price) &&
    variant?.price?.currencyCode === expected.currency &&
    variant?.sku === expected.sku &&
    variant?.availableForSale === true &&
    JSON.stringify(observedMetafields) === JSON.stringify(expected.metafields)
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pollStorefront(storefrontGraphql) {
  let lastProduct = null;

  for (const delay of STOREFRONT_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await sleep(delay);
    }

    const data = await storefrontGraphql(
      STOREFRONT_REREAD,
      { handle: expected.handle },
      'Storefront product(handle) reread',
    );
    lastProduct = data.product;

    if (storefrontConforms(lastProduct)) {
      return lastProduct;
    }
  }

  throw new Error(
    `Storefront verification did not converge within 30 seconds: ${JSON.stringify(lastProduct)}`,
  );
}

function writeEvidence(evidence) {
  mkdirSync('artifacts/shopify-spike', { recursive: true });
  const path = `artifacts/shopify-spike/${runId}.json`;
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  return path;
}

async function main() {
  loadLocalEnvironment();
  const configuration = requireEnvironment();
  const domain = normalizeDomain(configuration.SHOPIFY_STORE_DOMAIN);
  const evidence = {
    runId,
    startedAt: new Date().toISOString(),
    apiVersions: {
      admin: configuration.SHOPIFY_ADMIN_API_VERSION,
      storefront: configuration.SHOPIFY_STOREFRONT_API_VERSION,
    },
    passwordProtectedStorefront: true,
    expected,
    stages: [],
  };

  const accessToken = await getAdminAccessToken(configuration, domain);
  evidence.stages.push({ stage: 'admin_auth', status: 'verified' });

  const adminGraphql = createAdminClient(configuration, domain, accessToken);
  const storefrontToken = await resolveStorefrontAccessToken(configuration, adminGraphql);
  evidence.stages.push({
    stage: 'storefront_access_token',
    status: 'verified',
    created: storefrontToken.created,
    tokenId: storefrontToken.id,
    scopes: storefrontToken.scopes,
  });
  const verifiedDefinitions = await ensureStorefrontMetafieldDefinitions(adminGraphql);
  evidence.stages.push({
    stage: 'storefront_metafield_definitions',
    status: 'verified',
    definitions: verifiedDefinitions,
  });
  const storefrontGraphql = createStorefrontClient(configuration, domain);
  const created = await adminGraphql(PRODUCT_SET, { input: productInput() }, 'productSet');
  assertUserErrors(created.productSet.userErrors, 'productSet');
  assertAdminConformance(created.productSet.product);
  const productId = created.productSet.product.id;
  const variantId = created.productSet.product.variants.nodes[0].id;
  evidence.stages.push({ stage: 'product_set', status: 'verified', productId, variantId });

  const reread = await adminGraphql(
    ADMIN_REREAD,
    {
      id: productId,
      publicationId: configuration.SHOPIFY_ONLINE_STORE_PUBLICATION_ID,
    },
    'Admin product reread',
  );
  assertAdminConformance(reread.product);
  evidence.stages.push({ stage: 'admin_reread', status: 'verified' });

  const published = await adminGraphql(
    PUBLISH_PRODUCT,
    {
      id: productId,
      publicationId: configuration.SHOPIFY_ONLINE_STORE_PUBLICATION_ID,
    },
    'publishablePublish',
  );
  assertUserErrors(published.publishablePublish.userErrors, 'publishablePublish');

  if (published.publishablePublish.publishable?.publishedOnPublication !== true) {
    throw new Error('publishablePublish did not verify publishedOnPublication.');
  }
  evidence.stages.push({ stage: 'publication', status: 'verified' });

  const storefrontProduct = await pollStorefront(storefrontGraphql);
  evidence.stages.push({
    stage: 'storefront_reread',
    status: 'verified',
    storefrontUrl: storefrontProduct.onlineStoreUrl,
  });
  evidence.commercePanel = {
    verification: {
      admin: 'verified',
      publication: 'verified',
      storefront: 'verified',
    },
    product: {
      id: productId,
      variantId,
      title: storefrontProduct.title,
      handle: storefrontProduct.handle,
      storefrontUrl: storefrontProduct.onlineStoreUrl,
    },
    fabricationLot: {
      variantTitle: expected.variantTitle,
      sku: expected.sku,
      price: { amount: expected.price, currencyCode: expected.currency },
      cartQuantity: 1,
      panelCount: Number(expected.metafields.panel_count),
    },
    revisionLinkage: {
      commitmentId: expected.metafields.commitment_id,
      revisionId: expected.metafields.revision_id,
      specHash: expected.metafields.spec_hash,
    },
  };
  evidence.completedAt = new Date().toISOString();
  evidence.nextManualGate = {
    storefrontUrl: storefrontProduct.onlineStoreUrl,
    steps: [
      'Enter the development-store password in a WebMCP-enabled browser.',
      'Call Shopify-native get_product for the visible product.',
      'Call Shopify-native update_cart with this variant and quantity 1.',
      'Verify the visible cart shows one ₹2,400 fabrication lot representing four panels.',
      'Capture product-page and cart screenshots.',
    ],
  };

  const evidencePath = writeEvidence(evidence);
  console.warn(`Shopify API connectivity verified. Redacted evidence: ${evidencePath}`);
  console.warn(`Manual browser gate: ${storefrontProduct.onlineStoreUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
