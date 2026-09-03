import { ShopifyIntegrationError } from './errors';
import { FILE_CREATE, FILE_REREAD, PRODUCT_ADD_MEDIA, PRODUCT_MEDIA_REREAD } from './queries';
import type { GraphqlClient } from './types';

const PROCESSING_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000] as const;

interface ShopifyFile {
  readonly id: string;
  readonly fileStatus: string;
  readonly alt?: string | null;
  readonly image?: { readonly url?: string | null } | null;
}

interface ShopifyMedia {
  readonly id: string;
  readonly alt?: string | null;
  readonly mediaContentType: string;
  readonly status: string;
}

function assertNoUserErrors(
  result: { readonly userErrors?: readonly unknown[] },
  operation: string,
) {
  if (result.userErrors?.length) {
    throw new ShopifyIntegrationError('CONFORMANCE_FAILED', `${operation} returned user errors.`);
  }
}

async function pause(delayMs: number) {
  if (delayMs === 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function waitForFile(admin: GraphqlClient, initial: ShopifyFile): Promise<ShopifyFile> {
  let current = initial;
  for (const delayMs of PROCESSING_RETRY_DELAYS_MS) {
    if (current.fileStatus === 'READY' && current.image?.url) return current;
    if (current.fileStatus === 'FAILED') break;
    await pause(delayMs);
    const reread = await admin<{ node: ShopifyFile | null }>(
      FILE_REREAD,
      { id: current.id },
      'Exact preview file reread',
    );
    if (!reread.node) break;
    current = reread.node;
  }
  throw new ShopifyIntegrationError(
    'CONFORMANCE_FAILED',
    'Shopify did not finish processing the exact saved-version preview.',
    true,
  );
}

function matchingMedia(
  product: { readonly media?: { readonly nodes?: readonly ShopifyMedia[] } } | null | undefined,
  alt: string,
) {
  return product?.media?.nodes?.find(
    (candidate) => candidate.mediaContentType === 'IMAGE' && candidate.alt === alt,
  );
}

async function waitForProductMedia(
  admin: GraphqlClient,
  productId: string,
  alt: string,
  initial: ShopifyMedia | undefined,
): Promise<string> {
  let current = initial;
  for (const delayMs of PROCESSING_RETRY_DELAYS_MS) {
    if (current?.status === 'READY') return current.id;
    if (current?.status === 'FAILED') break;
    await pause(delayMs);
    const reread = await admin<{
      product: { readonly media?: { readonly nodes?: readonly ShopifyMedia[] } } | null;
    }>(PRODUCT_MEDIA_REREAD, { id: productId }, 'Exact product media reread');
    current = matchingMedia(reread.product, alt);
  }
  throw new ShopifyIntegrationError(
    'CONFORMANCE_FAILED',
    'Shopify did not verify the exact saved-version preview on the product.',
    true,
  );
}

export async function attachExactVersionPreview(
  admin: GraphqlClient,
  input: {
    readonly productId: string;
    readonly previewUrl: string;
    readonly alt: string;
    readonly filename: string;
  },
): Promise<string> {
  const created = await admin<{
    fileCreate: {
      readonly files?: readonly ShopifyFile[];
      readonly userErrors: readonly unknown[];
    };
  }>(
    FILE_CREATE,
    {
      files: [
        {
          originalSource: input.previewUrl,
          filename: input.filename,
          alt: input.alt,
          contentType: 'IMAGE',
          duplicateResolutionMode: 'REPLACE',
        },
      ],
    },
    'fileCreate exact version preview',
  );
  assertNoUserErrors(created.fileCreate, 'fileCreate');
  const file = created.fileCreate.files?.[0];
  if (!file?.id) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Shopify returned no file for the exact saved-version preview.',
    );
  }
  const readyFile = await waitForFile(admin, file);
  const source = readyFile.image?.url;
  if (!source) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Shopify returned no hosted URL for the exact saved-version preview.',
    );
  }

  const attached = await admin<{
    productUpdate: {
      readonly product: {
        readonly id: string;
        readonly media?: { readonly nodes?: readonly ShopifyMedia[] };
      } | null;
      readonly userErrors: readonly unknown[];
    };
  }>(
    PRODUCT_ADD_MEDIA,
    {
      product: { id: input.productId },
      media: [{ originalSource: source, alt: input.alt, mediaContentType: 'IMAGE' }],
    },
    'productUpdate exact version preview',
  );
  assertNoUserErrors(attached.productUpdate, 'productUpdate');
  if (attached.productUpdate.product?.id !== input.productId) {
    throw new ShopifyIntegrationError(
      'CONFORMANCE_FAILED',
      'Shopify returned the wrong product while attaching the exact saved-version preview.',
    );
  }
  return waitForProductMedia(
    admin,
    input.productId,
    input.alt,
    matchingMedia(attached.productUpdate.product, input.alt),
  );
}
