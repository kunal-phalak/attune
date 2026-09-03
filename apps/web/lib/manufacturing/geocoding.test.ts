import {
  createJudgeProviderCapabilityProfile,
  type ProviderCapabilityProfile,
} from '@attune/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withGeocodedShopifyLocation } from './geocoding';

const profile = {
  ...createJudgeProviderCapabilityProfile(),
  profileId: 'profile:maker',
  providerId: 'provider:maker',
  providerName: 'Maker',
  version: '1',
  effectiveAt: '2026-09-03T00:00:00.000Z',
  marketplaceListed: true,
  shopify: {
    shopId: 'gid://shopify/Shop/1',
    shopDomain: 'maker.myshopify.com',
    primaryDomain: 'maker.example',
    locationId: 'gid://shopify/Location/1',
    locationName: 'Workshop',
    address: 'Pune, Maharashtra, India',
    currency: 'INR',
    verifiedAt: '2026-09-03T00:00:00.000Z',
  },
} satisfies ProviderCapabilityProfile;

afterEach(() => {
  delete process.env.MAPBOX_ACCESS_TOKEN;
});

describe('Shopify location geocoding', () => {
  it('uses a configured Mapbox forward lookup without persisting a token', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-token';
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
      expect(url.pathname).toBe('/search/geocode/v6/forward');
      expect(url.searchParams.get('q')).toBe(profile.shopify.address);
      expect(url.searchParams.get('autocomplete')).toBe('false');
      return Response.json({
        features: [{ geometry: { type: 'Point', coordinates: [73.8567, 18.5204] } }],
      });
    });

    const result = await withGeocodedShopifyLocation(profile, fetcher);
    expect(result.shopify).toMatchObject({ longitude: 73.8567, latitude: 18.5204 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('keeps Shopify coordinates and skips geocoding when they already exist', async () => {
    const withCoordinates: ProviderCapabilityProfile = {
      ...profile,
      shopify: { ...profile.shopify, longitude: 72.8777, latitude: 19.076 },
    };
    const fetcher = vi.fn<typeof fetch>();
    expect(await withGeocodedShopifyLocation(withCoordinates, fetcher)).toBe(withCoordinates);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
