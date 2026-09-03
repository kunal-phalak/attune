export type ShopifyIntegrationErrorCode =
  | 'MISSING_CONFIGURATION'
  | 'ADMIN_AUTH_FAILED'
  | 'MISSING_ADMIN_SCOPES'
  | 'BUYER_COMMERCE_PROFILE_REQUIRED'
  | 'PROTECTED_CUSTOMER_DATA_UNAVAILABLE'
  | 'GRAPHQL_FAILED'
  | 'CONFORMANCE_FAILED'
  | 'STOREFRONT_TIMEOUT';

export class ShopifyIntegrationError extends Error {
  constructor(
    readonly code: ShopifyIntegrationErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ShopifyIntegrationError';
  }
}
