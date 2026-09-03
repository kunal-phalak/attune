import type { CommerceAddress, ProviderCapabilityProfile } from '@attune/domain';

function mapboxPoint(value: unknown): readonly [number, number] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const features = Reflect.get(value, 'features');
  if (!Array.isArray(features)) return undefined;
  const feature: unknown = features[0];
  if (typeof feature !== 'object' || feature === null) return undefined;
  const geometry: unknown = Reflect.get(feature, 'geometry');
  if (typeof geometry !== 'object' || geometry === null) return undefined;
  const coordinates: unknown = Reflect.get(geometry, 'coordinates');
  if (Reflect.get(geometry, 'type') !== 'Point' || !Array.isArray(coordinates)) return undefined;
  const longitude: unknown = coordinates[0];
  const latitude: unknown = coordinates[1];
  return typeof longitude === 'number' && typeof latitude === 'number'
    ? [longitude, latitude]
    : undefined;
}

export async function withGeocodedShopifyLocation(
  profile: ProviderCapabilityProfile,
  fetcher: typeof fetch = fetch,
): Promise<ProviderCapabilityProfile> {
  const shopify = profile.shopify;
  if (!shopify || (typeof shopify.latitude === 'number' && typeof shopify.longitude === 'number')) {
    return profile;
  }
  const token =
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  const address = shopify.address?.trim();
  if (!token || !address) return profile;

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.search = new URLSearchParams({
    q: address.slice(0, 256),
    limit: '1',
    autocomplete: 'false',
    access_token: token,
  }).toString();
  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return profile;
    const coordinates = mapboxPoint(await response.json());
    if (!coordinates) return profile;
    const [longitude, latitude] = coordinates;
    return {
      ...profile,
      shopify: { ...shopify, longitude, latitude },
    };
  } catch {
    return profile;
  }
}

function commerceAddressQuery(address: CommerceAddress): string {
  return [
    address.address1,
    address.address2,
    address.city,
    address.provinceCode,
    address.countryCode,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(', ');
}

export interface GeocodedBuyerLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string;
}

export async function geocodeBuyerAddress(
  address: CommerceAddress,
  fetcher: typeof fetch = fetch,
): Promise<GeocodedBuyerLocation | null> {
  const token =
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  const query = commerceAddressQuery(address).trim();
  if (!token || !query) return null;

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.search = new URLSearchParams({
    q: query.slice(0, 256),
    limit: '1',
    autocomplete: 'false',
    access_token: token,
  }).toString();
  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const coordinates = mapboxPoint(await response.json());
    if (!coordinates) return null;
    const [longitude, latitude] = coordinates;
    return { latitude, longitude, address: query };
  } catch {
    return null;
  }
}
