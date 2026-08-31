import { ShopifyIntegrationError } from './errors';
import type { ShopifyConfiguration } from './types';

export const REQUIRED_ENVIRONMENT = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ONLINE_STORE_PUBLICATION_ID',
  'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  'SHOPIFY_ADMIN_API_VERSION',
  'SHOPIFY_STOREFRONT_API_VERSION',
] as const;

export const REQUIRED_ADMIN_SCOPES = [
  'write_products',
  'write_publications',
  'read_locations',
  'read_inventory',
] as const;

export const TARGET_ADMIN_SCOPES = [
  ...REQUIRED_ADMIN_SCOPES,
  'write_draft_orders',
  'read_customers',
  'read_orders',
] as const;

export const STOREFRONT_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000] as const;

export function configurationFromEnvironment(): ShopifyConfiguration {
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
