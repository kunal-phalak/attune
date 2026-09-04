import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createShopifyOAuthState,
  decryptShopifyToken,
  encryptShopifyToken,
  exchangeShopifyAuthorizationCode,
  missingShopifyCoreScopes,
  normalizeShopDomain,
  shopifyAuthorizationUrl,
  verifyShopifyCallbackHmac,
  verifyShopifyOAuthState,
  verifyShopifyWebhookHmac,
} from './oauth';

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env.ATTUNE_SESSION_SECRET = 'attune-test-session-secret-with-32-characters';
  process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');
  process.env.SHOPIFY_CLIENT_ID = 'test-client';
  process.env.SHOPIFY_CLIENT_SECRET = 'test-secret';
  process.env.SHOPIFY_ADMIN_API_VERSION = '2026-07';
  process.env.SHOPIFY_OAUTH_REDIRECT_URI = 'https://attune.example.test/api/shopify/oauth/callback';
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('Shopify OAuth security', () => {
  it('accepts only canonical myshopify domains', () => {
    expect(normalizeShopDomain('  Maker-One.myshopify.com ')).toBe('maker-one.myshopify.com');
    for (const invalid of [
      'https://maker-one.myshopify.com',
      'maker-one.example.com',
      '-maker.myshopify.com',
      'maker.myshopify.com.evil.test',
    ]) {
      expect(() => normalizeShopDomain(invalid)).toThrow(TypeError);
    }
  });

  it('binds short-lived state to the principal and shop', () => {
    const created = createShopifyOAuthState('user:buyer', 'maker-one.myshopify.com', 1_000);
    expect(
      verifyShopifyOAuthState({
        cookieValue: created.cookieValue,
        state: created.state,
        shopDomain: 'maker-one.myshopify.com',
        ownerPrincipalId: 'user:buyer',
        now: 2_000,
      }),
    ).toBe(true);
    expect(
      verifyShopifyOAuthState({
        cookieValue: created.cookieValue,
        state: created.state,
        shopDomain: 'maker-two.myshopify.com',
        ownerPrincipalId: 'user:buyer',
        now: 2_000,
      }),
    ).toBe(false);
    expect(
      verifyShopifyOAuthState({
        cookieValue: created.cookieValue,
        state: created.state,
        shopDomain: 'maker-one.myshopify.com',
        ownerPrincipalId: 'user:other',
        now: 2_000,
      }),
    ).toBe(false);
    expect(
      verifyShopifyOAuthState({
        cookieValue: created.cookieValue,
        state: created.state,
        shopDomain: 'maker-one.myshopify.com',
        ownerPrincipalId: 'user:buyer',
        now: 1_000 + 11 * 60 * 1_000,
      }),
    ).toBe(false);
  });

  it('builds an offline authorization-code redirect with the exact callback', () => {
    const url = shopifyAuthorizationUrl('maker-one.myshopify.com', 'opaque-state');
    expect(url.origin).toBe('https://maker-one.myshopify.com');
    expect(url.pathname).toBe('/admin/oauth/authorize');
    expect(url.searchParams.get('state')).toBe('opaque-state');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://attune.example.test/api/shopify/oauth/callback',
    );
    expect(url.searchParams.has('grant_options[]')).toBe(false);
  });

  it('verifies callback and webhook HMACs with Shopify encodings', () => {
    const params = new URLSearchParams({
      code: 'authorization-code',
      shop: 'maker-one.myshopify.com',
      state: 'opaque-state',
      timestamp: '1788440000',
    });
    const message = [...params.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    params.set('hmac', createHmac('sha256', 'test-secret').update(message).digest('hex'));
    expect(verifyShopifyCallbackHmac(params, 'test-secret')).toBe(true);
    params.set('code', 'tampered');
    expect(verifyShopifyCallbackHmac(params, 'test-secret')).toBe(false);

    const body = JSON.stringify({ id: 123, domain: 'maker-one.myshopify.com' });
    const webhookHmac = createHmac('sha256', 'test-secret').update(body).digest('base64');
    expect(verifyShopifyWebhookHmac(body, webhookHmac, 'test-secret')).toBe(true);
    expect(verifyShopifyWebhookHmac(`${body}x`, webhookHmac, 'test-secret')).toBe(false);
  });

  it('encrypts tokens with authenticated encryption', () => {
    const encrypted = encryptShopifyToken('shpat_private-token');
    expect(encrypted).not.toContain('shpat_private-token');
    expect(decryptShopifyToken(encrypted)).toBe('shpat_private-token');
    expect(() => decryptShopifyToken(`${encrypted.slice(0, -2)}aa`)).toThrow();
  });

  it('derives a domain-separated encryption key when a dedicated key is absent', () => {
    delete process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
    const encrypted = encryptShopifyToken('shpat_fallback-token');
    expect(encrypted).not.toContain('shpat_fallback-token');
    expect(decryptShopifyToken(encrypted)).toBe('shpat_fallback-token');
  });

  it('requests an expiring offline token and keeps core scopes separate', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body =
        init?.body instanceof URLSearchParams
          ? init.body.toString()
          : typeof init?.body === 'string'
            ? init.body
            : '';
      expect(body).toContain('expiring=1');
      expect(body).not.toContain('per-user');
      return Response.json({
        access_token: 'shpat_private-token',
        refresh_token: 'shprt_private-refresh',
        expires_in: 3_600,
        refresh_token_expires_in: 7_776_000,
        scope:
          'read_locations,write_draft_orders,write_customers,read_orders,unauthenticated_read_content,unauthenticated_read_product_listings,write_products,write_files',
      });
    });
    const token = await exchangeShopifyAuthorizationCode(
      'maker-one.myshopify.com',
      'authorization-code',
      undefined,
      fetcher,
    );
    expect(token.refreshToken).toBe('shprt_private-refresh');
    expect(token.accessTokenExpiresAt).toBeTruthy();
    expect(missingShopifyCoreScopes(token.grantedScopes)).toEqual([]);
  });
});
