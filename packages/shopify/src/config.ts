import { ShopifyIntegrationError } from './errors';
import type { ShopifyConfiguration, ShopifyCoreConfiguration } from './types';

export const CORE_REQUIRED_ENVIRONMENT = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ADMIN_API_VERSION',
] as const;

export const PRODUCT_REQUIRED_ENVIRONMENT = [
  'SHOPIFY_ONLINE_STORE_PUBLICATION_ID',
  'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  'SHOPIFY_STOREFRONT_API_VERSION',
] as const;

export const REQUIRED_ENVIRONMENT = [
  ...CORE_REQUIRED_ENVIRONMENT,
  ...PRODUCT_REQUIRED_ENVIRONMENT,
] as const;

export const PROVIDER_IDENTITY_SCOPES = ['read_locations'] as const;
export const DRAFT_ORDER_ADMIN_SCOPES = ['write_draft_orders'] as const;
export const CUSTOMER_LOOKUP_ADMIN_SCOPES = ['read_customers'] as const;
export const CUSTOMER_WRITE_ADMIN_SCOPES = ['read_customers', 'write_customers'] as const;
export const PRODUCT_ADMIN_SCOPES = [
  'write_products',
  'write_files',
  'write_publications',
  'read_locations',
  'read_inventory',
] as const;
export const REQUIRED_ADMIN_SCOPES = PRODUCT_ADMIN_SCOPES;

export const TARGET_ADMIN_SCOPES = [
  ...REQUIRED_ADMIN_SCOPES,
  'write_draft_orders',
  'read_customers',
  'write_customers',
  'read_orders',
] as const;

export const STOREFRONT_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000] as const;

function requireEnvironment(keys: readonly string[]) {
  const missing = keys.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new ShopifyIntegrationError(
      'MISSING_CONFIGURATION',
      `Missing Shopify configuration: ${missing.join(', ')}.`,
    );
  }
}

export function coreConfigurationFromEnvironment(): ShopifyCoreConfiguration {
  requireEnvironment(CORE_REQUIRED_ENVIRONMENT);

  return {
    domain: process.env
      .SHOPIFY_STORE_DOMAIN!.trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, ''),
    clientId: process.env.SHOPIFY_CLIENT_ID!.trim(),
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET!.trim(),
    adminVersion: process.env.SHOPIFY_ADMIN_API_VERSION!.trim(),
  };
}

export function configurationFromEnvironment(): ShopifyConfiguration {
  requireEnvironment(REQUIRED_ENVIRONMENT);
  return {
    ...coreConfigurationFromEnvironment(),
    publicationId: process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID!.trim(),
    storefrontToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!.trim(),
    storefrontVersion: process.env.SHOPIFY_STOREFRONT_API_VERSION!.trim(),
  };
}
