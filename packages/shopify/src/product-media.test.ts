import { describe, expect, it } from 'vitest';

import { attachExactVersionPreview } from './product-media';
import { PRODUCT_ADD_MEDIA } from './queries';
import type { GraphqlClient } from './types';

type GraphqlHandler = (
  query: string,
  variables: Record<string, unknown>,
  operation: string,
) => Promise<unknown>;

function graphqlTestClient(handler: GraphqlHandler): GraphqlClient {
  return async <T>(
    query: string,
    variables: Record<string, unknown>,
    operation: string,
  ): Promise<T> => {
    const result = await handler(query, variables, operation);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each test controls its GraphQL response shape.
    return result as T;
  };
}

function successfulMediaClient() {
  const calls: Array<{ operation: string; variables: Record<string, unknown> }> = [];
  const admin = graphqlTestClient(async (_query, variables, operation) => {
    calls.push({ operation, variables });
    if (operation === 'fileCreate exact version preview') {
      return {
        fileCreate: {
          files: [
            {
              id: 'gid://shopify/MediaImage/file-1',
              fileStatus: 'READY',
              alt: 'Mounting plate — Version 3 exact preview',
              image: { url: 'https://cdn.shopify.com/files/attune-version-3.png' },
            },
          ],
          userErrors: [],
        },
      };
    }
    if (operation === 'productUpdate exact version preview') {
      return {
        productUpdate: {
          product: {
            id: 'gid://shopify/Product/1042',
            media: {
              nodes: [
                {
                  id: 'gid://shopify/MediaImage/product-1',
                  alt: 'Mounting plate — Version 3 exact preview',
                  mediaContentType: 'IMAGE',
                  status: 'PROCESSING',
                },
              ],
            },
          },
          userErrors: [],
        },
      };
    }
    if (operation === 'Exact product media reread') {
      return {
        product: {
          id: 'gid://shopify/Product/1042',
          media: {
            nodes: [
              {
                id: 'gid://shopify/MediaImage/product-1',
                alt: 'Mounting plate — Version 3 exact preview',
                mediaContentType: 'IMAGE',
                status: 'READY',
              },
            ],
          },
        },
      };
    }
    throw new Error(`Unexpected operation: ${operation}`);
  });
  return { admin, calls };
}

const rejectedFileClient = graphqlTestClient(async () => ({
  fileCreate: { files: [], userErrors: [{ message: 'scope denied' }] },
}));

describe('Shopify exact-version product media', () => {
  it('creates a file, attaches its Shopify URL, and rereads ready product media', async () => {
    const { admin, calls } = successfulMediaClient();

    await expect(
      attachExactVersionPreview(admin, {
        productId: 'gid://shopify/Product/1042',
        previewUrl: 'https://r2.example.test/signed-version-3.png',
        filename: 'attune-version-3-preview.png',
        alt: 'Mounting plate — Version 3 exact preview',
      }),
    ).resolves.toBe('gid://shopify/MediaImage/product-1');

    expect(calls[0]?.variables).toEqual({
      files: [
        expect.objectContaining({
          originalSource: 'https://r2.example.test/signed-version-3.png',
          contentType: 'IMAGE',
        }),
      ],
    });
    expect(calls[1]?.variables).toEqual({
      product: { id: 'gid://shopify/Product/1042' },
      media: [
        expect.objectContaining({
          originalSource: 'https://cdn.shopify.com/files/attune-version-3.png',
          mediaContentType: 'IMAGE',
        }),
      ],
    });
    expect(PRODUCT_ADD_MEDIA).not.toContain('productCreateMedia');
  });

  it('does not claim success when Shopify rejects file creation', async () => {
    await expect(
      attachExactVersionPreview(rejectedFileClient, {
        productId: 'gid://shopify/Product/1042',
        previewUrl: 'https://r2.example.test/signed.png',
        filename: 'preview.png',
        alt: 'Exact preview',
      }),
    ).rejects.toMatchObject({ code: 'CONFORMANCE_FAILED' });
  });
});
