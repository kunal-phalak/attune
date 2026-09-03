import { describe, expect, it } from 'vitest';

import { buyerCommerceProfileComplete, parseBuyerCommerceProfile } from './buyer-commerce';

const valid = {
  firstName: ' Asha ',
  lastName: ' Rao ',
  email: 'ASHA@example.test',
  phone: '+919876543210',
  shippingAddress: {
    firstName: 'Asha',
    lastName: 'Rao',
    address1: '12 Workshop Road',
    city: 'Pune',
    provinceCode: 'mh',
    countryCode: 'in',
    postalCode: '411001',
  },
  billingSameAsShipping: true,
};

describe('buyer commerce profile', () => {
  it('binds the authenticated principal and normalizes Shopify-facing fields', () => {
    const profile = parseBuyerCommerceProfile(
      'user:authenticated',
      { ...valid, principalId: 'user:forged' },
      '2026-09-03T00:00:00.000Z',
    );
    expect(profile).toMatchObject({
      principalId: 'user:authenticated',
      firstName: 'Asha',
      email: 'asha@example.test',
      shippingAddress: { provinceCode: 'MH', countryCode: 'IN' },
    });
    expect(buyerCommerceProfileComplete(profile)).toBe(true);
  });

  it('requires a separate billing address when billing differs from shipping', () => {
    expect(() =>
      parseBuyerCommerceProfile('user:buyer', {
        ...valid,
        billingSameAsShipping: false,
      }),
    ).toThrow(/Billing address is required/);
  });

  it('rejects invalid email and country codes', () => {
    expect(() =>
      parseBuyerCommerceProfile('user:buyer', { ...valid, email: 'not-an-email' }),
    ).toThrow(/valid email/);
    expect(() =>
      parseBuyerCommerceProfile('user:buyer', {
        ...valid,
        shippingAddress: { ...valid.shippingAddress, countryCode: 'India' },
      }),
    ).toThrow(/two-letter country/);
  });
});
