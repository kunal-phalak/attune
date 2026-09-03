import type {
  CommerceVerification,
  FrozenRevision,
  ManufacturingRequest,
  Quote,
} from '@attune/domain';

import { createAdminClient } from './admin-client';
import { configurationFromEnvironment } from './config';
import { attachExactVersionPreview } from './product-media';
import { createStorefrontClient, pollStorefront } from './storefront-client';
import {
  expectation,
  publishAndVerify,
  resolveLocation,
  upsertProduct,
  verifyAdminProduct,
  verifyScopes,
} from './verify';

export async function materializeRevision(input: {
  readonly commitmentId: string;
  readonly projectName: string;
  readonly revision: FrozenRevision;
  readonly request: ManufacturingRequest;
  readonly quote: Quote;
  readonly previewUrl: string;
}): Promise<CommerceVerification> {
  const configuration = configurationFromEnvironment();
  const expected = expectation(input);
  const admin = await createAdminClient(configuration);
  const storefront = createStorefrontClient(configuration);

  await verifyScopes(admin);
  const location = await resolveLocation(admin);
  const { productId, variantId } = await upsertProduct(admin, location.id, expected);
  await attachExactVersionPreview(admin, {
    productId,
    previewUrl: input.previewUrl,
    filename: `attune-${input.revision.versionId}-preview.png`,
    alt: `${input.projectName} — Version ${input.revision.versionNumber} exact preview`,
  });
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
    commitmentId: input.commitmentId,
    revisionId: input.revision.revisionId,
    specHash: input.revision.specHash,
    title: expected.title,
    sku: expected.sku,
    amountMinor: input.quote.amountMinor,
    currency: input.quote.currency,
    panelCount: expected.panelCount,
    verifiedAt: new Date().toISOString(),
  };
}
