import type { CommerceVerification, FrozenRevision } from '@attune/domain';

const REQUIRED_ENVIRONMENT = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ONLINE_STORE_PUBLICATION_ID',
  'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  'SHOPIFY_ADMIN_API_VERSION',
  'SHOPIFY_STOREFRONT_API_VERSION',
] as const;

const REQUIRED_ADMIN_SCOPES = [
  'write_products',
  'write_publications',
  'read_locations',
  'read_inventory',
] as const;

const STOREFRONT_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000] as const;

interface ShopifyConfiguration {
  readonly domain: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly publicationId: string;
  readonly storefrontToken: string;
  readonly adminVersion: string;
  readonly storefrontVersion: string;
}

interface GraphqlBody<T> {
  readonly data?: T;
  readonly errors?: readonly unknown[];
}

type GraphqlClient = <T>(
  query: string,
  variables: Record<string, unknown>,
  operationName: string,
) => Promise<T>;

export class ShopifyIntegrationError extends Error {
  constructor(
    readonly code:
      | 'MISSING_CONFIGURATION'
      | 'ADMIN_AUTH_FAILED'
      | 'MISSING_ADMIN_SCOPES'
      | 'GRAPHQL_FAILED'
      | 'CONFORMANCE_FAILED'
      | 'STOREFRONT_TIMEOUT',
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ShopifyIntegrationError';
  }
}

function configurationFromEnvironment(): ShopifyConfiguration {
  const missing = REQUIRED_ENVIRONMENT.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new ShopifyIntegrationError(
      'MISSING_CONFIGURATION',
      `Missing Shopify configuration: ${missing.join(', ')}.`,
    );
  }

  return {
    domain: process.env
      .SHOPIFY_STORE_DOMAIN!.trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, ''),
    clientId: process.env.SHOPIFY_CLIENT_ID!.trim(),
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET!.trim(),
    publicationId: process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID!.trim(),
    storefrontToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!.trim(),
    adminVersion: process.env.SHOPIFY_ADMIN_API_VERSION!.trim(),
    storefrontVersion: process.env.SHOPIFY_STOREFRONT_API_VERSION!.trim(),
  };
}

async function requestJson<T>(url: string, init: RequestInit, operationName: string): Promise<T> {
  const response = await fetch(url, init);
  const raw: unknown = await response.json().catch(() => null);
  // GraphQL selections are typed at each call site and then checked against Attune's contract.
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  const body = raw as T | null;
  if (!response.ok || body === null) {
    throw new ShopifyIntegrationError(
      'GRAPHQL_FAILED',
      `${operationName} failed with HTTP ${response.status}.`,
      response.status >= 500,
    );
  }
  return body;
}

async function getAdminToken(configuration: ShopifyConfiguration): Promise<string> {
  const response = await requestJson<{ access_token?: unknown }>(
    `https://${configuration.domain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
      }),
    },
    'Shopify Admin authentication',
  );
  if (typeof response.access_token !== 'string' || response.access_token.length === 0) {
    throw new ShopifyIntegrationError(
      'ADMIN_AUTH_FAILED',
      'Shopify Admin authentication returned no access token.',
    );
  }
  return response.access_token;
}

function graphqlClient(endpoint: string, headers: Readonly<Record<string, string>>): GraphqlClient {
  return async function execute<T>(
    query: string,
    variables: Record<string, unknown>,
    operationName: string,
  ) {
    const body = await requestJson<GraphqlBody<T>>(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ query, variables }),
      },
      operationName,
    );
    if (body.errors?.length) {
      throw new ShopifyIntegrationError(
        'GRAPHQL_FAILED',
        `${operationName} returned GraphQL errors.`,
      );
    }
    if (!body.data) {
      throw new ShopifyIntegrationError('GRAPHQL_FAILED', `${operationName} returned no data.`);
    }
    return body.data;
  };
}

const VERIFY_SCOPES = `#graphql
  query VerifyAttuneScopes {
    currentAppInstallation { accessScopes { handle } }
  }
`;

const RESOLVE_LOCATION = `#graphql
  query ResolveAttuneLocation {
    locations(first: 20) {
      nodes { id name isActive fulfillsOnlineOrders }
    }
  }
`;

const PRODUCT_SET = `#graphql
  mutation MaterializeAttuneProduct(
    $identifier: ProductSetIdentifiers!
    $input: ProductSetInput!
  ) {
    productSet(identifier: $identifier, synchronous: true, input: $input) {
      product {
        id handle status title
        metafields(first: 10) { nodes { namespace key value } }
        variants(first: 1) {
          nodes {
            id title price sku inventoryPolicy inventoryQuantity
            inventoryItem {
              tracked
              inventoryLevels(first: 5) {
                nodes {
                  location { id isActive fulfillsOnlineOrders }
                  quantities(names: ["available"]) { name quantity }
                }
              }
            }
          }
        }
      }
      userErrors { code field message }
    }
  }
`;

const ADMIN_REREAD = `#graphql
  query RereadAttuneProduct($id: ID!, $publicationId: ID!) {
    product(id: $id) {
      id handle status title
      publishedOnPublication(publicationId: $publicationId)
      metafields(first: 10) { nodes { namespace key value } }
      variants(first: 1) {
        nodes {
          id title price sku inventoryPolicy inventoryQuantity
          inventoryItem {
            tracked
            inventoryLevels(first: 5) {
              nodes {
                location { id isActive fulfillsOnlineOrders }
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
        }
      }
    }
  }
`;

const PUBLISH_PRODUCT = `#graphql
  mutation PublishAttuneProduct($id: ID!, $publicationId: ID!) {
    publishablePublish(id: $id, input: { publicationId: $publicationId }) {
      publishable { publishedOnPublication(publicationId: $publicationId) }
      userErrors { field message }
    }
  }
`;

const STOREFRONT_REREAD = `#graphql
  query VerifyAttuneProduct($handle: String!) {
    product(handle: $handle) {
      id handle title onlineStoreUrl
      metafields(identifiers: [
        { namespace: "attune", key: "commitment_id" }
        { namespace: "attune", key: "revision_id" }
        { namespace: "attune", key: "spec_hash" }
        { namespace: "attune", key: "panel_count" }
      ]) { namespace key value }
      variants(first: 1) {
        nodes {
          id title sku availableForSale
          price { amount currencyCode }
        }
      }
    }
  }
`;

interface ProductExpectation {
  readonly title: 'Custom Equipment Panel — AT-1042 r7';
  readonly handle: 'custom-equipment-panel-at-1042-r7';
  readonly variantTitle: 'Fabrication lot — 4 panels';
  readonly sku: 'AT-1042-R7-LOT4';
  readonly price: '2400.00';
  readonly panelCount: 4;
  readonly inventoryLots: 10;
  readonly metafields: Readonly<Record<string, string>>;
}

function expectation(revision: FrozenRevision): ProductExpectation {
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
      {
        name: 'Configuration',
        position: 1,
        values: [{ name: expected.variantTitle }],
      },
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
  product: Record<string, any> | null | undefined,
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

function storefrontConforms(
  product: Record<string, any> | null | undefined,
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

async function verifyScopes(admin: GraphqlClient) {
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

async function resolveLocation(admin: GraphqlClient) {
  const data = await admin<{
    locations: {
      nodes: readonly {
        id: string;
        name: string;
        isActive: boolean;
        fulfillsOnlineOrders: boolean;
      }[];
    };
  }>(RESOLVE_LOCATION, {}, 'Resolve inventory location');
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

async function pollStorefront(
  storefront: GraphqlClient,
  expected: ProductExpectation,
): Promise<Record<string, any>> {
  let lastProduct: Record<string, any> | null = null;
  for (const delay of STOREFRONT_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const data = await storefront<{ product: Record<string, any> | null }>(
      STOREFRONT_REREAD,
      { handle: expected.handle },
      'Storefront product(handle) verification',
    );
    lastProduct = data.product;
    if (storefrontConforms(lastProduct, expected)) return lastProduct!;
  }
  throw new ShopifyIntegrationError(
    'STOREFRONT_TIMEOUT',
    'Storefront product(handle) did not converge within 30 seconds.',
    true,
  );
}

export async function materializeAt1042Revision(
  revision: FrozenRevision,
): Promise<CommerceVerification> {
  const configuration = configurationFromEnvironment();
  const expected = expectation(revision);
  const accessToken = await getAdminToken(configuration);
  const admin = graphqlClient(
    `https://${configuration.domain}/admin/api/${configuration.adminVersion}/graphql.json`,
    { 'X-Shopify-Access-Token': accessToken },
  );
  const storefront = graphqlClient(
    `https://${configuration.domain}/api/${configuration.storefrontVersion}/graphql.json`,
    { 'X-Shopify-Storefront-Access-Token': configuration.storefrontToken },
  );

  await verifyScopes(admin);
  const location = await resolveLocation(admin);
  const created = await admin<{
    productSet: { product: Record<string, any> | null; userErrors: readonly unknown[] };
  }>(
    PRODUCT_SET,
    {
      identifier: { handle: expected.handle },
      input: productInput(expected, location.id),
    },
    'productSet',
  );
  assertUserErrors(created.productSet, 'productSet');
  if (!adminConforms(created.productSet.product, location.id, expected)) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Admin productSet response did not match the exact r7 lot contract.',
    );
  }
  const productId: unknown = created.productSet.product?.id;
  const variantId: unknown = created.productSet.product?.variants?.nodes?.[0]?.id;
  if (typeof productId !== 'string' || typeof variantId !== 'string') {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Shopify returned invalid product or variant identifiers.',
    );
  }

  const reread = await admin<{ product: Record<string, any> | null }>(
    ADMIN_REREAD,
    { id: productId, publicationId: configuration.publicationId },
    'Admin product reread',
  );
  if (!adminConforms(reread.product, location.id, expected)) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Admin reread did not match the exact r7 lot contract.',
    );
  }

  const published = await admin<{
    publishablePublish: {
      publishable: { publishedOnPublication: boolean } | null;
      userErrors: readonly unknown[];
    };
  }>(
    PUBLISH_PRODUCT,
    { id: productId, publicationId: configuration.publicationId },
    'publishablePublish',
  );
  assertUserErrors(published.publishablePublish, 'publishablePublish');
  if (published.publishablePublish.publishable?.publishedOnPublication !== true) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Shopify did not verify publishedOnPublication.',
    );
  }

  const publishedReread = await admin<{ product: Record<string, any> | null }>(
    ADMIN_REREAD,
    { id: productId, publicationId: configuration.publicationId },
    'Published Admin product reread',
  );
  if (publishedReread.product?.publishedOnPublication !== true) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Admin reread did not verify publication state.',
    );
  }

  const storefrontProduct = await pollStorefront(storefront, expected);
  return {
    adminVerified: true,
    publicationVerified: true,
    storefrontVerified: true,
    productId,
    variantId,
    publicationId: configuration.publicationId,
    storefrontUrl:
      storefrontProduct.onlineStoreUrl ??
      `https://${configuration.domain}/products/${expected.handle}`,
    commitmentId: 'AT-1042',
    revisionId: 'r7',
    specHash: revision.specHash,
    title: expected.title,
    sku: expected.sku,
    amountMinor: 240_000,
    currency: 'INR',
    panelCount: 4,
    verifiedAt: new Date().toISOString(),
  };
}
