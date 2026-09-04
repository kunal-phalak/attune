import { describe, expect, it } from 'vitest';

import { shopifyStoreLogoUrl } from './store-branding';

describe('Shopify store branding', () => {
  it('accepts the official HTTPS storefront logo URL unchanged', () => {
    expect(shopifyStoreLogoUrl('https://cdn.shopify.com/s/files/store-logo.png')).toBe(
      'https://cdn.shopify.com/s/files/store-logo.png',
    );
  });

  it('rejects non-HTTPS and credential-bearing URLs', () => {
    expect(shopifyStoreLogoUrl('http://cdn.shopify.com/store-logo.png')).toBeUndefined();
    expect(shopifyStoreLogoUrl('https://user:secret@cdn.shopify.com/store-logo.png')).toBeUndefined();
  });
});
