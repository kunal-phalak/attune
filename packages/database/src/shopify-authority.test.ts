import { describe, expect, it } from 'vitest';

import { rolesAfterShopifyConnection } from './shopify-authority';

describe('Shopify maker authority', () => {
  it('adds Maker authority without removing Buyer or editor authority', () => {
    expect(rolesAfterShopifyConnection(['buyer', 'editor'])).toEqual({
      roles: ['buyer', 'editor', 'provider'],
      changed: true,
    });
  });

  it('keeps an existing dual-role membership stable', () => {
    expect(rolesAfterShopifyConnection(['buyer', 'provider'])).toEqual({
      roles: ['buyer', 'provider'],
      changed: false,
    });
  });
});
