import { describe, expect, it } from 'vitest';

import { shopifyStoreLogoUrl } from './store-branding';

describe('Shopify store branding', () => {
  it('builds a stable square storefront icon URL from a connected primary domain', () => {
    expect(shopifyStoreLogoUrl('maker.example.com')).toBe(
      'https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fmaker.example.com&sz=128',
    );
  });

  it('rejects non-HTTPS and credential-bearing domains', () => {
    expect(shopifyStoreLogoUrl('http://maker.example.com')).toBeUndefined();
    expect(shopifyStoreLogoUrl('https://user:secret@maker.example.com')).toBeUndefined();
  });
});
