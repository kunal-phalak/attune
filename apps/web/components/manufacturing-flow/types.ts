import type { ProviderCapabilityProfile } from '@attune/domain';

import { isAttuneApiView, type AttuneApiView } from '../../lib/attune-view';

export interface MarketplaceProvider {
  readonly id: string;
  readonly name: string;
  readonly label: 'Live maker' | 'Demo profile';
  readonly connectionLabel?: string;
  readonly locationName?: string;
  readonly address?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly fit: 'Compatible' | 'Needs review' | 'Not compatible';
  readonly reason: string;
}

export interface MarketplacePayload {
  readonly view: AttuneApiView;
  readonly providerProfile: ProviderCapabilityProfile;
  readonly connection: {
    readonly verifiedAt: string;
    readonly shop: {
      readonly id: string;
      readonly name: string;
      readonly myshopifyDomain: string;
      readonly primaryDomain: { readonly host: string; readonly url: string };
      readonly currencyCode: string;
    };
    readonly locations: readonly {
      readonly id: string;
      readonly name: string;
      readonly isActive: boolean;
      readonly fulfillsOnlineOrders: boolean;
      readonly address?: { readonly formatted?: readonly string[] } | null;
    }[];
    readonly capabilities: {
      readonly identity: boolean;
      readonly locations: boolean;
      readonly draftOrders: boolean;
      readonly customerLookup: boolean;
      readonly productMaterialization: boolean;
      readonly storefront: boolean;
    };
  };
  readonly providers: readonly MarketplaceProvider[];
}

export function isMarketplacePayload(value: unknown): value is MarketplacePayload {
  if (typeof value !== 'object' || value === null) return false;
  const connection = Reflect.get(value, 'connection');
  const profile = Reflect.get(value, 'providerProfile');
  return (
    isAttuneApiView(Reflect.get(value, 'view')) &&
    Array.isArray(Reflect.get(value, 'providers')) &&
    typeof connection === 'object' &&
    connection !== null &&
    Array.isArray(Reflect.get(connection, 'locations')) &&
    typeof profile === 'object' &&
    profile !== null &&
    typeof Reflect.get(profile, 'providerId') === 'string'
  );
}
