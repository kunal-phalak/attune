export interface ShopifyConfiguration {
  readonly domain: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly publicationId: string;
  readonly storefrontToken: string;
  readonly adminVersion: string;
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
  readonly title: 'Custom Equipment Panel — AT-1042 r7';
  readonly handle: 'custom-equipment-panel-at-1042-r7';
  readonly variantTitle: 'Fabrication lot — 4 panels';
  readonly sku: 'AT-1042-R7-LOT4';
  readonly price: '2400.00';
  readonly panelCount: 4;
  readonly inventoryLots: 10;
  readonly metafields: Readonly<Record<string, string>>;
}

export interface ShopifyLocation {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly fulfillsOnlineOrders: boolean;
}

export interface MaterializedProduct {
  readonly productId: string;
  readonly variantId: string;
}

export type ShopifyProduct = Record<string, any>;
