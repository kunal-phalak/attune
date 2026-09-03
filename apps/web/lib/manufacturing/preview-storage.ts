import type { SavedDesignVersion } from '@attune/domain';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface PreviewStorageConfiguration {
  readonly accountId: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly endpoint: string;
  readonly region: string;
}

export class PreviewStorageConfigurationError extends Error {
  readonly code = 'PREVIEW_STORAGE_UNCONFIGURED';

  constructor(readonly missing: readonly string[]) {
    super(`Exact-version preview storage is not configured: ${missing.join(', ')}.`);
    this.name = 'PreviewStorageConfigurationError';
  }
}

function configuration(): PreviewStorageConfiguration {
  const values = {
    accountId: process.env.R2_ACCOUNT_ID?.trim(),
    bucket: process.env.R2_BUCKET_NAME?.trim(),
    accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim(),
    endpoint: process.env.R2_ENDPOINT?.trim(),
    region: process.env.R2_REGION?.trim(),
  };
  const required = [
    ['R2_ACCOUNT_ID', values.accountId],
    ['R2_BUCKET_NAME', values.bucket],
    ['R2_ACCESS_KEY_ID', values.accessKeyId],
    ['R2_SECRET_ACCESS_KEY', values.secretAccessKey],
  ] as const;
  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new PreviewStorageConfigurationError(missing);
  return {
    accountId: values.accountId!,
    bucket: values.bucket!,
    accessKeyId: values.accessKeyId!,
    secretAccessKey: values.secretAccessKey!,
    endpoint: values.endpoint ?? `https://${values.accountId!}.r2.cloudflarestorage.com`,
    region: values.region || 'auto',
  };
}

function client(config: PreviewStorageConfiguration): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function versionPreviewKey(workspaceId: string, versionId: string): string {
  return `workspaces/${workspaceId}/versions/${versionId}/preview.png`;
}

export class PreviewStorage {
  async putVersionPreview(input: {
    readonly workspaceId: string;
    readonly version: SavedDesignVersion;
    readonly body: Uint8Array;
  }): Promise<string> {
    const config = configuration();
    const key = versionPreviewKey(input.workspaceId, input.version.versionId);
    await client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: input.body,
        ContentType: 'image/png',
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
    return key;
  }

  async getSignedPreviewUrl(key: string, expiresIn = 300): Promise<string> {
    const config = configuration();
    return getSignedUrl(client(config), new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
      expiresIn,
    });
  }

  async headVersionPreview(key: string): Promise<{
    readonly contentLength: number;
    readonly contentType: string | null;
    readonly etag: string | null;
  }> {
    const config = configuration();
    const result = await client(config).send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType ?? null,
      etag: result.ETag ?? null,
    };
  }
}

export function previewStorageConfigured(): boolean {
  try {
    configuration();
    return true;
  } catch {
    return false;
  }
}
