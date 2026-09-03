import type { BuyerCommerceProfile, ShopifyCustomerBinding } from '@attune/domain';
import { describe, expect, it, vi } from 'vitest';

import { ShopifyIntegrationError } from './errors';
import type { GraphqlClient } from './types';
import { synchronizeCustomerWithAdmin } from './customers';

const profile: BuyerCommerceProfile = {
  principalId: 'user:buyer-1',
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.test',
  phone: '+919876543210',
  shippingAddress: {
    firstName: 'Asha',
    lastName: 'Rao',
    company: 'Attune Test',
    address1: '12 Workshop Road',
    city: 'Pune',
    provinceCode: 'MH',
    countryCode: 'IN',
    postalCode: '411001',
    phone: '+919876543210',
  },
  billingSameAsShipping: true,
  updatedAt: '2026-09-03T00:00:00.000Z',
};

const shopifyAddress = {
  id: 'gid://shopify/MailingAddress/51',
  firstName: 'Asha',
  lastName: 'Rao',
  company: 'Attune Test',
  address1: '12 Workshop Road',
  address2: null,
  city: 'Pune',
  provinceCode: 'MH',
  countryCodeV2: 'IN',
  zip: '411001',
  phone: '+919876543210',
};

function customer(addresses: readonly typeof shopifyAddress[]) {
  return {
    id: 'gid://shopify/Customer/1042',
    firstName: 'Asha',
    lastName: 'Rao',
    defaultEmailAddress: { emailAddress: 'asha@example.test' },
    defaultPhoneNumber: { phoneNumber: '+919876543210' },
    defaultAddress: addresses[0] ? { id: addresses[0].id } : null,
    addressesV2: { nodes: addresses },
  };
}

describe('Shopify customer synchronization', () => {
  it('upserts once, creates a missing address, rereads, and returns a store binding', async () => {
    let rereads = 0;
    const admin = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query.includes('currentAppInstallation')) {
        return {
          currentAppInstallation: {
            accessScopes: [{ handle: 'read_customers' }, { handle: 'write_customers' }],
          },
        };
      }
      if (query.includes('customerSet')) {
        expect(variables).toMatchObject({ identifier: { email: profile.email } });
        expect(variables).not.toHaveProperty('input.addresses');
        return {
          customerSet: {
            customer: { id: 'gid://shopify/Customer/1042' },
            userErrors: [],
          },
        };
      }
      if (query.includes('customerAddressCreate')) {
        expect(variables).toMatchObject({
          customerId: 'gid://shopify/Customer/1042',
          setAsDefault: true,
          address: { countryCode: 'IN', zip: '411001' },
        });
        return { customerAddressCreate: { address: { id: shopifyAddress.id }, userErrors: [] } };
      }
      if (query.includes('RereadAttuneCustomer')) {
        rereads += 1;
        return { customer: customer(rereads === 1 ? [] : [shopifyAddress]) };
      }
      throw new Error('Unexpected operation');
    }) as GraphqlClient;

    const binding = await synchronizeCustomerWithAdmin(admin, {
      profile,
      shopDomain: 'attune-test.myshopify.com',
    });

    expect(binding).toMatchObject({
      buyerPrincipalId: profile.principalId,
      shopDomain: 'attune-test.myshopify.com',
      customerId: 'gid://shopify/Customer/1042',
      defaultAddressId: shopifyAddress.id,
    });
    expect(admin).toHaveBeenCalledTimes(5);
  });

  it('reuses a store-specific binding and does not recreate a matching address', async () => {
    const existingBinding: ShopifyCustomerBinding = {
      buyerPrincipalId: profile.principalId,
      shopDomain: 'attune-test.myshopify.com',
      customerId: 'gid://shopify/Customer/1042',
      defaultAddressId: shopifyAddress.id,
      synchronizedAt: '2026-09-02T00:00:00.000Z',
    };
    const admin = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query.includes('currentAppInstallation')) {
        return {
          currentAppInstallation: {
            accessScopes: [{ handle: 'read_customers' }, { handle: 'write_customers' }],
          },
        };
      }
      if (query.includes('customerSet')) {
        expect(variables).toMatchObject({ identifier: { id: existingBinding.customerId } });
        return {
          customerSet: { customer: { id: existingBinding.customerId }, userErrors: [] },
        };
      }
      if (query.includes('RereadAttuneCustomer')) {
        return { customer: customer([shopifyAddress]) };
      }
      throw new Error('Unexpected operation');
    }) as GraphqlClient;

    const binding = await synchronizeCustomerWithAdmin(admin, {
      profile,
      shopDomain: existingBinding.shopDomain,
      existingBinding,
    });

    expect(binding.customerId).toBe(existingBinding.customerId);
    expect(admin).toHaveBeenCalledTimes(3);
    expect(admin.mock.calls.some(([query]) => String(query).includes('customerAddressCreate'))).toBe(
      false,
    );
  });

  it('reports missing customer scopes as a configuration error', async () => {
    const admin = vi.fn(async () => ({
      currentAppInstallation: { accessScopes: [{ handle: 'read_customers' }] },
    })) as GraphqlClient;

    await expect(
      synchronizeCustomerWithAdmin(admin, {
        profile,
        shopDomain: 'attune-test.myshopify.com',
      }),
    ).rejects.toMatchObject<Partial<ShopifyIntegrationError>>({ code: 'MISSING_ADMIN_SCOPES' });
  });
});
