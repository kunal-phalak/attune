import { ShopifyIntegrationError } from './errors';
import type { GraphqlBody, GraphqlClient, ShopifyConfiguration } from './types';

function isExpectedJsonObject<T extends object>(value: unknown, _expected?: T): value is T {
  return typeof value === 'object' && value !== null;
}

async function requestJson<T extends object>(
  url: string,
  init: RequestInit,
  operationName: string,
): Promise<T> {
  const response = await fetch(url, init);
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok || !isExpectedJsonObject<T>(raw)) {
    throw new ShopifyIntegrationError(
      'GRAPHQL_FAILED',
      `${operationName} failed with HTTP ${response.status}.`,
      response.status >= 500,
    );
  }
  return raw;
}

export function graphqlClient(
  endpoint: string,
  headers: Readonly<Record<string, string>>,
): GraphqlClient {
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

export async function createAdminClient(
  configuration: ShopifyConfiguration,
): Promise<GraphqlClient> {
  const accessToken = await getAdminToken(configuration);
  return graphqlClient(
    `https://${configuration.domain}/admin/api/${configuration.adminVersion}/graphql.json`,
    { 'X-Shopify-Access-Token': accessToken },
  );
}
