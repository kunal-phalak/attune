import type { BuyerCommerceProfile, CommerceAddress } from '@attune/domain';

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseAddress(value: unknown, label: string): CommerceAddress {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${label} is required.`);
  }
  const object = Object.fromEntries(Object.entries(value));
  const countryCode = requiredString(object.countryCode, `${label} country`).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new TypeError(`${label} country must use a two-letter country code.`);
  }
  return {
    firstName: requiredString(object.firstName, `${label} first name`),
    lastName: requiredString(object.lastName, `${label} last name`),
    ...(optionalString(object.company) ? { company: optionalString(object.company) } : {}),
    address1: requiredString(object.address1, `${label} address`),
    ...(optionalString(object.address2) ? { address2: optionalString(object.address2) } : {}),
    city: requiredString(object.city, `${label} city`),
    ...(optionalString(object.provinceCode)
      ? { provinceCode: optionalString(object.provinceCode)?.toUpperCase() }
      : {}),
    countryCode,
    postalCode: requiredString(object.postalCode, `${label} postal code`),
    ...(optionalString(object.phone) ? { phone: optionalString(object.phone) } : {}),
  };
}

export function parseBuyerCommerceProfile(
  principalId: string,
  value: unknown,
  now = new Date().toISOString(),
): BuyerCommerceProfile {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Buyer details are required.');
  }
  const object = Object.fromEntries(Object.entries(value));
  const email = requiredString(object.email, 'Email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError('Enter a valid email address.');
  }
  const billingSameAsShipping = object.billingSameAsShipping !== false;
  return {
    principalId,
    firstName: requiredString(object.firstName, 'First name'),
    lastName: requiredString(object.lastName, 'Last name'),
    email,
    ...(optionalString(object.phone) ? { phone: optionalString(object.phone) } : {}),
    shippingAddress: parseAddress(object.shippingAddress, 'Shipping address'),
    billingSameAsShipping,
    ...(!billingSameAsShipping
      ? { billingAddress: parseAddress(object.billingAddress, 'Billing address') }
      : {}),
    updatedAt: now,
  };
}

export function buyerCommerceProfileComplete(
  profile: BuyerCommerceProfile | null | undefined,
): profile is BuyerCommerceProfile {
  return Boolean(
    profile?.firstName &&
    profile.lastName &&
    profile.email &&
    profile.shippingAddress.firstName &&
    profile.shippingAddress.lastName &&
    profile.shippingAddress.address1 &&
    profile.shippingAddress.city &&
    profile.shippingAddress.countryCode &&
    profile.shippingAddress.postalCode &&
    (profile.billingSameAsShipping || profile.billingAddress),
  );
}
