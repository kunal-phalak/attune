import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export const SHOPIFY_OAUTH_COOKIE = 'attune_shopify_oauth_state';
export const SHOPIFY_CORE_SCOPES = [
  'read_locations',
  'write_draft_orders',
  'read_customers',
  'write_customers',
  'read_orders',
] as const;
export const SHOPIFY_OPTIONAL_SCOPES = [
  'write_products',
  'write_publications',
  'read_inventory',
  'write_files',
] as const;
export const SHOPIFY_REQUESTED_SCOPES = [
  ...SHOPIFY_CORE_SCOPES,
  ...SHOPIFY_OPTIONAL_SCOPES,
] as const;

const STATE_TTL_MS = 10 * 60 * 1_000;
const SHOPIFY_TIMEOUT_MS = 30_000;

export interface ShopifyOAuthConfiguration {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly adminVersion: string;
  readonly redirectUri: string;
}

export interface ShopifyOfflineTokenResponse {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly grantedScopes: readonly string[];
  readonly accessTokenExpiresAt?: string;
  readonly refreshTokenExpiresAt?: string;
}

interface OAuthStatePayload {
  readonly ownerPrincipalId: string;
  readonly shopDomain: string;
  readonly nonce: string;
  readonly expiresAt: number;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function normalizeShopDomain(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(normalized)) {
    throw new TypeError('Enter a valid store address ending in .myshopify.com.');
  }
  return normalized;
}

export function shopifyOAuthConfigured(): boolean {
  return Boolean(
    process.env.SHOPIFY_CLIENT_ID?.trim() &&
    process.env.SHOPIFY_CLIENT_SECRET?.trim() &&
    process.env.SHOPIFY_ADMIN_API_VERSION?.trim() &&
    (process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim() ||
      (process.env.ATTUNE_SESSION_SECRET?.length ?? 0) >= 32) &&
    (process.env.SHOPIFY_OAUTH_REDIRECT_URI?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()),
  );
}

export function shopifyOAuthConfiguration(): ShopifyOAuthConfiguration {
  const explicitRedirect = process.env.SHOPIFY_OAUTH_REDIRECT_URI?.trim();
  const redirectUri = explicitRedirect
    ? new URL(explicitRedirect).toString()
    : new URL('/api/shopify/oauth/callback', requiredEnvironment('NEXT_PUBLIC_APP_URL')).toString();
  if (new URL(redirectUri).protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('SHOPIFY_OAUTH_REDIRECT_URI must use HTTPS in production.');
  }
  return {
    clientId: requiredEnvironment('SHOPIFY_CLIENT_ID'),
    clientSecret: requiredEnvironment('SHOPIFY_CLIENT_SECRET'),
    adminVersion: requiredEnvironment('SHOPIFY_ADMIN_API_VERSION'),
    redirectUri,
  };
}

function stateSecret(): string {
  const secret = requiredEnvironment('ATTUNE_SESSION_SECRET');
  if (secret.length < 32)
    throw new Error('ATTUNE_SESSION_SECRET must contain at least 32 characters.');
  return secret;
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createShopifyOAuthState(
  ownerPrincipalId: string,
  shopDomain: string,
  now = Date.now(),
): { readonly state: string; readonly cookieValue: string; readonly maxAgeSeconds: number } {
  const payload: OAuthStatePayload = {
    ownerPrincipalId,
    shopDomain: normalizeShopDomain(shopDomain),
    nonce: randomBytes(24).toString('base64url'),
    expiresAt: now + STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', stateSecret()).update(encoded).digest('base64url');
  return {
    state: payload.nonce,
    cookieValue: `${encoded}.${signature}`,
    maxAgeSeconds: STATE_TTL_MS / 1_000,
  };
}

export function verifyShopifyOAuthState(input: {
  readonly cookieValue?: string;
  readonly state: string;
  readonly shopDomain: string;
  readonly ownerPrincipalId: string;
  readonly now?: number;
}): boolean {
  const [encoded, suppliedSignature] = input.cookieValue?.split('.') ?? [];
  if (!encoded || !suppliedSignature) return false;
  const expectedSignature = createHmac('sha256', stateSecret()).update(encoded).digest('base64url');
  if (!safeEqual(Buffer.from(expectedSignature), Buffer.from(suppliedSignature))) return false;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return false;
    const expiresAt = Reflect.get(parsed, 'expiresAt');
    return (
      Reflect.get(parsed, 'nonce') === input.state &&
      Reflect.get(parsed, 'shopDomain') === normalizeShopDomain(input.shopDomain) &&
      Reflect.get(parsed, 'ownerPrincipalId') === input.ownerPrincipalId &&
      typeof expiresAt === 'number' &&
      expiresAt > (input.now ?? Date.now())
    );
  } catch {
    return false;
  }
}

export function shopifyAuthorizationUrl(
  shopDomain: string,
  state: string,
  configuration = shopifyOAuthConfiguration(),
): URL {
  const url = new URL(`https://${normalizeShopDomain(shopDomain)}/admin/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: configuration.clientId,
    scope: SHOPIFY_REQUESTED_SCOPES.join(','),
    redirect_uri: configuration.redirectUri,
    state,
  }).toString();
  return url;
}

export function verifyShopifyCallbackHmac(
  searchParams: URLSearchParams,
  clientSecret: string,
): boolean {
  const supplied = searchParams.get('hmac');
  if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const message = [...searchParams.entries()]
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .toSorted(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const digest = createHmac('sha256', clientSecret).update(message).digest();
  return safeEqual(digest, Buffer.from(supplied, 'hex'));
}

export function verifyShopifyWebhookHmac(
  body: string,
  suppliedHmac: string | null,
  clientSecret: string,
): boolean {
  if (!suppliedHmac) return false;
  const digest = createHmac('sha256', clientSecret).update(body).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedHmac, 'base64');
  } catch {
    return false;
  }
  return safeEqual(digest, supplied);
}

function tokenEncryptionKey(): Buffer {
  const encoded = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    return scryptSync(stateSecret(), 'attune:shopify-token:v1', 32);
  }

  let key: Buffer;
  if (/^[a-f0-9]{64}$/i.test(encoded)) key = Buffer.from(encoded, 'hex');
  else
    key = Buffer.from(
      encoded,
      encoded.includes('-') || encoded.includes('_') ? 'base64url' : 'base64',
    );
  if (key.length !== 32) {
    throw new Error('SHOPIFY_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

export function encryptShopifyToken(token: string): string {
  if (!token) throw new TypeError('Cannot encrypt an empty Shopify token.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptShopifyToken(value: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error('Stored Shopify token has an unsupported encrypted format.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    tokenEncryptionKey(),
    Buffer.from(encodedIv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function expiry(seconds: unknown): string | undefined {
  const parsed = Number(seconds);
  return Number.isFinite(parsed) && parsed > 0
    ? new Date(Date.now() + parsed * 1_000).toISOString()
    : undefined;
}

async function tokenRequest(
  shopDomain: string,
  body: URLSearchParams,
  fetcher: typeof fetch,
): Promise<ShopifyOfflineTokenResponse> {
  const response = await fetcher(
    `https://${normalizeShopDomain(shopDomain)}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
      cache: 'no-store',
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof payload !== 'object' || payload === null) {
    throw new Error(`Shopify token exchange failed with HTTP ${response.status}.`);
  }
  const accessToken = Reflect.get(payload, 'access_token');
  const refreshToken = Reflect.get(payload, 'refresh_token');
  const scope = Reflect.get(payload, 'scope');
  if (typeof accessToken !== 'string' || !accessToken || typeof scope !== 'string') {
    throw new Error('Shopify token exchange returned an invalid response.');
  }
  const accessTokenExpiresAt = expiry(Reflect.get(payload, 'expires_in'));
  const refreshTokenExpiresAt = expiry(Reflect.get(payload, 'refresh_token_expires_in'));
  return {
    accessToken,
    ...(typeof refreshToken === 'string' && refreshToken ? { refreshToken } : {}),
    grantedScopes: scope
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    ...(accessTokenExpiresAt ? { accessTokenExpiresAt } : {}),
    ...(refreshTokenExpiresAt ? { refreshTokenExpiresAt } : {}),
  };
}

export function exchangeShopifyAuthorizationCode(
  shopDomain: string,
  code: string,
  configuration = shopifyOAuthConfiguration(),
  fetcher: typeof fetch = fetch,
): Promise<ShopifyOfflineTokenResponse> {
  return tokenRequest(
    shopDomain,
    new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      code,
      expiring: '1',
    }),
    fetcher,
  );
}

export function refreshShopifyOfflineToken(
  shopDomain: string,
  refreshToken: string,
  configuration = shopifyOAuthConfiguration(),
  fetcher: typeof fetch = fetch,
): Promise<ShopifyOfflineTokenResponse> {
  return tokenRequest(
    shopDomain,
    new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    fetcher,
  );
}

function impliedScope(granted: ReadonlySet<string>, scope: string): boolean {
  return (
    granted.has(scope) || (scope.startsWith('read_') && granted.has(`write_${scope.slice(5)}`))
  );
}

export function missingShopifyCoreScopes(grantedScopes: readonly string[]): readonly string[] {
  const granted = new Set(grantedScopes);
  return SHOPIFY_CORE_SCOPES.filter((scope) => !impliedScope(granted, scope));
}

export function hasShopifyScopes(
  grantedScopes: readonly string[],
  required: readonly string[],
): boolean {
  const granted = new Set(grantedScopes);
  return required.every((scope) => impliedScope(granted, scope));
}
