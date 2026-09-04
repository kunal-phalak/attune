export interface ShopifyCoreConfiguration {
  readonly domain: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly adminVersion: string;
}

export interface ShopifyConfiguration extends ShopifyCoreConfiguration {
  readonly publicationId: string;
  readonly storefrontToken: string;
  readonly storefrontVersion: string;
}

export interface GraphqlBody<T> {
  readonly data?: T;
  readonly errors?: readonly unknown[];
}

export type GraphqlClient = <T>(
  query: string,
  variables: Record<string, unknown>,
  operationName: string,
) => Promise<T>;

export interface ProductExpectation {
  readonly title: string;
  readonly handle: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly price: string;
  readonly currency: string;
  readonly panelCount: number;
  readonly inventoryLots: number;
  readonly descriptionHtml: string;
  readonly metafields: Readonly<Record<string, string>>;
}

export interface ShopifyLocation {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly fulfillsOnlineOrders: boolean;
  readonly address?: {
    readonly formatted?: readonly string[];
    readonly address1?: string | null;
    readonly address2?: string | null;
    readonly city?: string | null;
    readonly province?: string | null;
    readonly provinceCode?: string | null;
    readonly country?: string | null;
    readonly countryCode?: string | null;
    readonly zip?: string | null;
    readonly latitude?: number | null;
    readonly longitude?: number | null;
  } | null;
}

export interface ShopifyShopIdentity {
  readonly id: string;
  readonly name: string;
  readonly myshopifyDomain: string;
  readonly primaryDomain: { readonly host: string; readonly url: string };
  readonly logoUrl?: string;
  readonly currencyCode: string;
}

export interface ShopifyProviderConnection {
  readonly verifiedAt: string;
  readonly shop: ShopifyShopIdentity;
  readonly locations: readonly ShopifyLocation[];
  readonly grantedScopes: readonly string[];
  readonly capabilities: {
    readonly identity: boolean;
    readonly locations: boolean;
    readonly draftOrders: boolean;
    readonly customerLookup: boolean;
    readonly productMaterialization: boolean;
    readonly storefront: boolean;
  };
}

export interface MaterializedProduct {
  readonly productId: string;
  readonly variantId: string;
}

export type ShopifyProduct = Record<string, any>;
