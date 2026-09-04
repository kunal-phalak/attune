import type { BuyerCommerceProfile, CommerceAddress, ShopifyCustomerBinding } from '@attune/domain';

import { createAdminClient } from './admin-client';
import { coreConfigurationFromEnvironment, CUSTOMER_WRITE_ADMIN_SCOPES } from './config';
import { ShopifyIntegrationError } from './errors';
import { VERIFY_SCOPES } from './queries';
import type { GraphqlClient } from './types';

export const CUSTOMER_SET = `#graphql
  mutation SetAttuneCustomer($identifier: CustomerSetIdentifiers, $input: CustomerSetInput!) {
    customerSet(identifier: $identifier, input: $input) {
      customer { id }
      userErrors { field message code }
    }
  }
`;

export const CUSTOMER_ADDRESS_CREATE = `#graphql
  mutation CreateAttuneCustomerAddress(
    $customerId: ID!
    $address: MailingAddressInput!
    $setAsDefault: Boolean
  ) {
    customerAddressCreate(
      customerId: $customerId
      address: $address
      setAsDefault: $setAsDefault
    ) {
      address { id }
      userErrors { field message }
    }
  }
`;

export const CUSTOMER_REREAD = `#graphql
  query RereadAttuneCustomer($id: ID!) {
    customer(id: $id) {
      id firstName lastName
      defaultEmailAddress { emailAddress }
      defaultPhoneNumber { phoneNumber }
      defaultAddress { id }
      addressesV2(first: 50) {
        nodes {
          id firstName lastName company address1 address2 city provinceCode countryCodeV2 zip phone
        }
      }
    }
  }
`;

interface ShopifyMailingAddress {
  readonly id: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly company?: string | null;
  readonly address1?: string | null;
  readonly address2?: string | null;
  readonly city?: string | null;
  readonly provinceCode?: string | null;
  readonly countryCodeV2?: string | null;
  readonly zip?: string | null;
  readonly phone?: string | null;
}

interface ShopifyCustomer {
  readonly id: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly defaultEmailAddress?: { readonly emailAddress?: string | null } | null;
  readonly defaultPhoneNumber?: { readonly phoneNumber?: string | null } | null;
  readonly defaultAddress?: { readonly id: string } | null;
  readonly addressesV2: { readonly nodes: readonly ShopifyMailingAddress[] };
}

function mailingAddressInput(address: CommerceAddress) {
  return {
    firstName: address.firstName,
    lastName: address.lastName,
    ...(address.company ? { company: address.company } : {}),
    address1: address.address1,
    ...(address.address2 ? { address2: address.address2 } : {}),
    city: address.city,
    ...(address.provinceCode ? { provinceCode: address.provinceCode } : {}),
    countryCode: address.countryCode.toUpperCase(),
    zip: address.postalCode,
    ...(address.phone ? { phone: address.phone } : {}),
  };
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function addressMatches(actual: ShopifyMailingAddress, expected: CommerceAddress): boolean {
  return (
    normalized(actual.firstName) === normalized(expected.firstName) &&
    normalized(actual.lastName) === normalized(expected.lastName) &&
    normalized(actual.company) === normalized(expected.company) &&
    normalized(actual.address1) === normalized(expected.address1) &&
    normalized(actual.address2) === normalized(expected.address2) &&
    normalized(actual.city) === normalized(expected.city) &&
    normalized(actual.provinceCode) === normalized(expected.provinceCode) &&
    normalized(actual.countryCodeV2) === normalized(expected.countryCode) &&
    normalized(actual.zip) === normalized(expected.postalCode) &&
    normalized(actual.phone) === normalized(expected.phone)
  );
}

function assertNoUserErrors(
  errors: readonly { readonly message?: string }[] | undefined,
  operation: string,
): void {
  if (errors?.length) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      `${operation} returned customer validation errors.`,
    );
  }
}

async function requireCustomerScopes(admin: GraphqlClient): Promise<void> {
  const data = await admin<{
    currentAppInstallation: { accessScopes: readonly { handle: string }[] };
  }>(VERIFY_SCOPES, {}, 'Verify customer scopes');
  const granted = new Set(data.currentAppInstallation.accessScopes.map(({ handle }) => handle));
  const missing = CUSTOMER_WRITE_ADMIN_SCOPES.filter(
    (scope) =>
      !granted.has(scope) && !(scope.startsWith('read_') && granted.has(`write_${scope.slice(5)}`)),
  );
  if (missing.length) {
    throw new ShopifyIntegrationError(
      'MISSING_ADMIN_SCOPES',
      `Missing Shopify Admin access scopes: ${missing.join(', ')}.`,
    );
  }
}

async function rereadCustomer(admin: GraphqlClient, customerId: string): Promise<ShopifyCustomer> {
  const result = await admin<{ readonly customer: ShopifyCustomer | null }>(
    CUSTOMER_REREAD,
    { id: customerId },
    'Customer reread',
  );
  if (!result.customer) {
    throw new ShopifyIntegrationError(
      'PROTECTED_CUSTOMER_DATA_UNAVAILABLE',
      'Shopify customer data could not be reread. Confirm protected customer data access.',
    );
  }
  return result.customer;
}

export async function synchronizeCustomerWithAdmin(
  admin: GraphqlClient,
  input: {
    readonly profile: BuyerCommerceProfile;
    readonly shopDomain: string;
    readonly existingBinding?: ShopifyCustomerBinding | null;
  },
): Promise<ShopifyCustomerBinding> {
  await requireCustomerScopes(admin);
  const { profile } = input;
  const set = await admin<{
    readonly customerSet: {
      readonly customer: { readonly id: string } | null;
      readonly userErrors: readonly { readonly message?: string }[];
    };
  }>(
    CUSTOMER_SET,
    {
      identifier: input.existingBinding
        ? { id: input.existingBinding.customerId }
        : { email: profile.email },
      input: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        ...(profile.phone ? { phone: profile.phone } : {}),
      },
    },
    'customerSet',
  );
  assertNoUserErrors(set.customerSet.userErrors, 'customerSet');
  const customerId = set.customerSet.customer?.id;
  if (!customerId) {
    throw new ShopifyIntegrationError('CONFORMANCE_FAILED', 'Shopify returned no customer ID.');
  }

  let customer = await rereadCustomer(admin, customerId);
  let shippingAddress = customer.addressesV2.nodes.find((address) =>
    addressMatches(address, profile.shippingAddress),
  );
  if (!shippingAddress) {
    const created = await admin<{
      readonly customerAddressCreate: {
        readonly address: { readonly id: string } | null;
        readonly userErrors: readonly { readonly message?: string }[];
      };
    }>(
      CUSTOMER_ADDRESS_CREATE,
      {
        customerId,
        address: mailingAddressInput(profile.shippingAddress),
        setAsDefault: true,
      },
      'customerAddressCreate',
    );
    assertNoUserErrors(created.customerAddressCreate.userErrors, 'customerAddressCreate');
    if (!created.customerAddressCreate.address?.id) {
      throw new ShopifyIntegrationError(
        'CONFORMANCE_FAILED',
        'Shopify returned no customer address ID.',
      );
    }
    customer = await rereadCustomer(admin, customerId);
    shippingAddress = customer.addressesV2.nodes.find((address) =>
      addressMatches(address, profile.shippingAddress),
    );
  }

  const returnedEmail = normalized(customer.defaultEmailAddress?.emailAddress);
  const returnedFirstName = normalized(customer.firstName);
  const returnedLastName = normalized(customer.lastName);
  const mismatches: string[] = [];
  if (returnedEmail !== normalized(profile.email)) mismatches.push('email');
  if (returnedFirstName !== normalized(profile.firstName)) mismatches.push('first name');
  if (returnedLastName !== normalized(profile.lastName)) mismatches.push('last name');
  if (!shippingAddress) mismatches.push('delivery address');
  if (mismatches.length > 0) {
    throw new ShopifyIntegrationError(
      'PROTECTED_CUSTOMER_DATA_UNAVAILABLE',
      `Shopify did not return the expected customer data for customer ${customerId} in ${input.shopDomain}: ${mismatches.join(', ')} were missing or redacted. Confirm the app is approved for Level 2 protected customer data access (name, address, phone, and email) in the Shopify Partner Dashboard: https://partners.shopify.com, and that the store re-granted the read_customers/write_customers scopes.`,
    );
  }
  if (!shippingAddress) {
    throw new ShopifyIntegrationError(
      'PROTECTED_CUSTOMER_DATA_UNAVAILABLE',
      `Shopify did not return a delivery address for customer ${customerId} in ${input.shopDomain}. Confirm protected customer data access in the Shopify Partner Dashboard.`,
    );
  }

  return {
    buyerPrincipalId: profile.principalId,
    shopDomain: input.shopDomain,
    customerId,
    defaultAddressId: shippingAddress.id,
    synchronizedAt: new Date().toISOString(),
  };
}

export async function synchronizeShopifyCustomer(input: {
  readonly profile: BuyerCommerceProfile;
  readonly existingBinding?: ShopifyCustomerBinding | null;
}): Promise<ShopifyCustomerBinding> {
  const configuration = coreConfigurationFromEnvironment();
  return synchronizeCustomerWithAdmin(await createAdminClient(configuration), {
    ...input,
    shopDomain: configuration.domain,
  });
}
