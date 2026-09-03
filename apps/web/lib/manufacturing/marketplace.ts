import type { ShopifyInstallation } from '@attune/database';
import type { ProviderCapabilityProfile } from '@attune/domain';
import {
  inspectShopifyProvider,
  type ShopifyLocation,
  type ShopifyProviderConnection,
} from '@attune/shopify';

import { inspectShopifyInstallation } from '../shopify/installations';

interface ConnectionCache {
  expiresAt: number;
  value: Promise<ShopifyProviderConnection>;
}

export function isMarketplaceInstallationListed(
  installation: Pick<ShopifyInstallation, 'marketplaceListed' | 'makerProfile'>,
): boolean {
  return (
    installation.marketplaceListed ||
    Boolean(installation.makerProfile && installation.makerProfile.marketplaceListed !== false)
  );
}

let connectionCache: ConnectionCache | undefined;
const installationConnectionCache = new Map<string, ConnectionCache>();

export function shopifyProviderConnection(refresh = false): Promise<ShopifyProviderConnection> {
  const now = Date.now();
  if (!refresh && connectionCache && connectionCache.expiresAt > now) return connectionCache.value;
  const value = inspectShopifyProvider();
  connectionCache = { expiresAt: now + 5 * 60 * 1000, value };
  void value.catch(() => {
    if (connectionCache?.value === value) connectionCache = undefined;
  });
  return value;
}

export function oauthShopifyProviderConnection(
  installation: ShopifyInstallation,
  refresh = false,
): Promise<ShopifyProviderConnection> {
  const now = Date.now();
  const cached = installationConnectionCache.get(installation.id);
  if (!refresh && cached && cached.expiresAt > now) return cached.value;
  const value = inspectShopifyInstallation(installation);
  installationConnectionCache.set(installation.id, { expiresAt: now + 5 * 60 * 1_000, value });
  void value.catch(() => {
    if (installationConnectionCache.get(installation.id)?.value === value) {
      installationConnectionCache.delete(installation.id);
    }
  });
  return value;
}

function publicId(gid: string): string {
  return (
    gid
      .split('/')
      .at(-1)
      ?.replaceAll(/[^a-zA-Z0-9_-]/g, '') || 'unknown'
  );
}

export function formattedShopifyAddress(location: ShopifyLocation): string {
  const formatted = location.address?.formatted?.filter(Boolean).join(', ');
  if (formatted) return formatted;
  return [
    location.address?.address1,
    location.address?.address2,
    location.address?.city,
    location.address?.province,
    location.address?.country,
    location.address?.zip,
  ]
    .filter(Boolean)
    .join(', ');
}

export function shopifyProviderProfile(
  connection: ShopifyProviderConnection,
  locationId: string | undefined,
  existing: ProviderCapabilityProfile,
): ProviderCapabilityProfile {
  const locations = connection.locations.filter(({ isActive }) => isActive);
  const location =
    locations.find(({ id }) => id === locationId) ??
    locations.find(({ fulfillsOnlineOrders }) => fulfillsOnlineOrders) ??
    locations[0];
  if (!location) throw new Error('The connected Shopify shop has no active location.');
  const providerId = `provider:shopify:${publicId(connection.shop.id)}`;
  const profileId = `profile:${publicId(connection.shop.id)}:${publicId(location.id)}`;
  const sameBinding =
    existing.shopify?.shopId === connection.shop.id && existing.shopify.locationId === location.id;
  return {
    ...existing,
    providerId,
    profileId,
    providerName: connection.shop.name,
    version: sameBinding ? existing.version : 'v1',
    source: 'SHOPIFY_AND_ATTUNE',
    marketplaceListed: existing.marketplaceListed ?? true,
    minimums: {
      ...existing.minimums,
      edgeClearanceMm: 3,
    },
    finishes: existing.finishes ?? ['As cut', 'Brushed', 'Powder coated'],
    leadTimeDays: existing.leadTimeDays ?? { min: 5, max: 10 },
    shopify: {
      shopId: connection.shop.id,
      shopDomain: connection.shop.myshopifyDomain,
      primaryDomain: connection.shop.primaryDomain.host,
      locationId: location.id,
      locationName: location.name,
      address: formattedShopifyAddress(location),
      ...(location.address?.city ? { city: location.address.city } : {}),
      ...(location.address?.province ? { province: location.address.province } : {}),
      ...(location.address?.country ? { country: location.address.country } : {}),
      ...(typeof location.address?.latitude === 'number'
        ? { latitude: location.address.latitude }
        : {}),
      ...(typeof location.address?.longitude === 'number'
        ? { longitude: location.address.longitude }
        : {}),
      currency: connection.shop.currencyCode,
      verifiedAt: sameBinding
        ? (existing.shopify?.verifiedAt ?? connection.verifiedAt)
        : connection.verifiedAt,
    },
    effectiveAt: sameBinding ? existing.effectiveAt : connection.verifiedAt,
  };
}

export const DEMO_MARKETPLACE_PROVIDERS = [
  {
    id: 'demo:precision-bend',
    name: 'Precision Bend Collective',
    label: 'Demo profile' as const,
    locationName: 'Pune workshop',
    address: 'Pune, Maharashtra, India',
    latitude: 18.5204,
    longitude: 73.8567,
    fit: 'Needs review' as const,
    reason: 'Tolerance requires a process review before quoting.',
  },
  {
    id: 'demo:west-coast-laser',
    name: 'West Coast Laser Works',
    label: 'Demo profile' as const,
    locationName: 'Mumbai workshop',
    address: 'Mumbai, Maharashtra, India',
    latitude: 19.076,
    longitude: 72.8777,
    fit: 'Not compatible' as const,
    reason: 'The current envelope exceeds this profile’s declared width.',
  },
] as const;
