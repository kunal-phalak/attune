import { describe, expect, it } from 'vitest';

import { SHOPIFY_FALLBACK_ICON_URL, shopifyStoreLogoUrl } from './store-branding';

describe('Shopify store branding', () => {
  it('accepts the official HTTPS storefront logo URL unchanged', () => {
    expect(shopifyStoreLogoUrl('https://cdn.shopify.com/s/files/store-logo.png')).toBe(
      'https://cdn.shopify.com/s/files/store-logo.png',
    );
  });

  it('uses Shopify’s favicon for missing or unsafe storefront logos', () => {
    expect(shopifyStoreLogoUrl()).toBe(SHOPIFY_FALLBACK_ICON_URL);
    expect(shopifyStoreLogoUrl('http://cdn.shopify.com/store-logo.png')).toBe(
      SHOPIFY_FALLBACK_ICON_URL,
    );
    expect(shopifyStoreLogoUrl('https://user:secret@cdn.shopify.com/store-logo.png')).toBe(
      SHOPIFY_FALLBACK_ICON_URL,
    );
  });
});
