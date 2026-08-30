import type { CommerceVerification, FrozenRevision } from '@attune/domain';

import { createAdminClient } from './admin-client';
import { configurationFromEnvironment } from './config';
import { createStorefrontClient, pollStorefront } from './storefront-client';
import {
  expectation,
  publishAndVerify,
  resolveLocation,
  upsertProduct,
  verifyAdminProduct,
  verifyScopes,
} from './verify';

export async function materializeAt1042Revision(
  revision: FrozenRevision,
): Promise<CommerceVerification> {
  const configuration = configurationFromEnvironment();
  const expected = expectation(revision);
  const admin = await createAdminClient(configuration);
  const storefront = createStorefrontClient(configuration);

  await verifyScopes(admin);
  const location = await resolveLocation(admin);
  const { productId, variantId } = await upsertProduct(admin, location.id, expected);
  await verifyAdminProduct(admin, productId, configuration.publicationId, location.id, expected);
  await publishAndVerify(admin, productId, configuration.publicationId);
  const storefrontProduct = await pollStorefront(storefront, expected);

  return {
    adminVerified: true,
    publicationVerified: true,
    storefrontVerified: true,
    productId,
    variantId,
    publicationId: configuration.publicationId,
    storefrontUrl:
      storefrontProduct.onlineStoreUrl ??
      `https://${configuration.domain}/products/${expected.handle}`,
    commitmentId: 'AT-1042',
    revisionId: 'r7',
    specHash: revision.specHash,
    title: expected.title,
    sku: expected.sku,
    amountMinor: 240_000,
    currency: 'INR',
    panelCount: 4,
    verifiedAt: new Date().toISOString(),
  };
}
