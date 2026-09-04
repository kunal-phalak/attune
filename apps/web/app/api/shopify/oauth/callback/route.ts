import {
  grantShopifyMakerAuthority,
  saveShopifyInstallation,
  shopifyInstallationForShop,
} from '@attune/database';
import { createJudgeProviderCapabilityProfile } from '@attune/domain';
import {
  createAdminClientForAccessToken,
  createStorefrontAccessToken,
  createStorefrontClientForDomain,
  inspectShopifyProviderWithAdmin,
  resolveShopBrandLogo,
} from '@attune/shopify';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { currentAttuneUser } from '../../../../../lib/auth/session';
import { shopifyProviderProfile } from '../../../../../lib/manufacturing/marketplace';
import {
  registerShopifyUninstallWebhook,
  shopifyInstallationId,
} from '../../../../../lib/shopify/installations';
import {
  decryptShopifyToken,
  encryptShopifyToken,
  exchangeShopifyAuthorizationCode,
  missingShopifyCoreScopes,
  normalizeShopDomain,
  SHOPIFY_OAUTH_COOKIE,
  shopifyOAuthConfiguration,
  verifyShopifyCallbackHmac,
  verifyShopifyOAuthState,
} from '../../../../../lib/shopify/oauth';

export const dynamic = 'force-dynamic';

function clearOAuthCookie(response: NextResponse) {
  response.cookies.set(SHOPIFY_OAUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/shopify/oauth',
    maxAge: 0,
  });
}

function failure(message: string, status: number) {
  const response = NextResponse.json({ error: message }, { status });
  clearOAuthCookie(response);
  return response;
}

export async function GET(request: Request) {
  const user = await currentAttuneUser();
  if (!user) return failure('Authentication required.', 401);
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const cookieStore = await cookies();
  if (
    !state ||
    !code ||
    !verifyShopifyOAuthState({
      cookieValue: cookieStore.get(SHOPIFY_OAUTH_COOKIE)?.value,
      state,
      shopDomain: shop,
      ownerPrincipalId: user.principalId,
    })
  ) {
    return failure('Invalid or expired Shopify OAuth state.', 403);
  }

  const configuration = shopifyOAuthConfiguration();
  if (!verifyShopifyCallbackHmac(url.searchParams, configuration.clientSecret)) {
    return failure('Invalid Shopify OAuth HMAC.', 403);
  }

  try {
    const callbackShopDomain = normalizeShopDomain(shop);
    const token = await exchangeShopifyAuthorizationCode(callbackShopDomain, code, configuration);
    const admin = createAdminClientForAccessToken(
      callbackShopDomain,
      configuration.adminVersion,
      token.accessToken,
    );
    const inspectedConnection = await inspectShopifyProviderWithAdmin(admin);
    const connectionStatus =
      missingShopifyCoreScopes(inspectedConnection.grantedScopes).length === 0
        ? 'connected'
        : 'needs_reauthorization';
    const verifiedShopDomain = normalizeShopDomain(inspectedConnection.shop.myshopifyDomain);
    if (verifiedShopDomain !== callbackShopDomain) {
      return failure('Shopify returned a different store identity.', 403);
    }
    const existing = await shopifyInstallationForShop(user.principalId, verifiedShopDomain);

    // The storefront token and brand logo are non-critical branding concerns. Never let a
    // storefront-token failure (e.g. ACCESS_DENIED when the app lacks Storefront access) fail
    // the store connection itself. Reuse an existing stored token when the store already has
    // one, and only mint a fresh token otherwise.
    let storefrontToken: string | undefined;
    let logoUrl: string | undefined;
    if (connectionStatus === 'connected') {
      try {
        if (existing?.encryptedStorefrontAccessToken) {
          storefrontToken = decryptShopifyToken(existing.encryptedStorefrontAccessToken);
        } else {
          storefrontToken = await createStorefrontAccessToken(
            admin,
            `Attune marketplace ${user.principalId}`,
          );
        }
        if (storefrontToken) {
          logoUrl = await resolveShopBrandLogo(
            createStorefrontClientForDomain(callbackShopDomain, storefrontToken),
          );
        }
      } catch {
        // Keep whatever plaintext token was already decrypted (or none). The encrypted form
        // stored below falls back to the existing token, so a re-mint failure never corrupts it.
        logoUrl = undefined;
      }
    }
    const connection = logoUrl
      ? { ...inspectedConnection, shop: { ...inspectedConnection.shop, logoUrl } }
      : inspectedConnection;
    const now = new Date().toISOString();
    const activeLocations = connection.locations.filter(({ isActive }) => isActive);
    const selectedLocationId =
      activeLocations.find(({ id }) => id === existing?.selectedLocationId)?.id ??
      activeLocations.find(({ fulfillsOnlineOrders }) => fulfillsOnlineOrders)?.id ??
      activeLocations[0]?.id ??
      null;
    const installation = await saveShopifyInstallation({
      id: existing?.id ?? shopifyInstallationId(user.principalId, connection.shop.id),
      ownerPrincipalId: user.principalId,
      shopId: connection.shop.id,
      shopDomain: verifiedShopDomain,
      shopName: connection.shop.name,
      primaryDomain: connection.shop.primaryDomain.host,
      currencyCode: connection.shop.currencyCode,
      encryptedOfflineAccessToken: encryptShopifyToken(token.accessToken),
      encryptedStorefrontAccessToken: storefrontToken
        ? encryptShopifyToken(storefrontToken)
        : existing?.encryptedStorefrontAccessToken,
      encryptedOfflineRefreshToken: token.refreshToken
        ? encryptShopifyToken(token.refreshToken)
        : null,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      grantedScopes: connection.grantedScopes,
      connectionStatus,
      locations: connection.locations,
      selectedLocationId,
      makerProfile: selectedLocationId
        ? shopifyProviderProfile(
            connection,
            selectedLocationId,
            existing?.makerProfile ?? createJudgeProviderCapabilityProfile(),
          )
        : (existing?.makerProfile ?? null),
      marketplaceListed: existing?.marketplaceListed ?? true,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
    });

    await grantShopifyMakerAuthority(user.userId);

    if (installation.connectionStatus === 'connected') {
      const webhookUrl = new URL(
        '/api/shopify/webhooks/app-uninstalled',
        configuration.redirectUri,
      ).toString();
      await registerShopifyUninstallWebhook(installation, webhookUrl).catch(() => false);
    }

    const destination = new URL('/settings', configuration.redirectUri);
    destination.searchParams.set('section', 'integrations');
    destination.searchParams.set(
      'shopify',
      installation.connectionStatus === 'connected' ? 'connected' : 'needs_reauthorization',
    );
    const response = NextResponse.redirect(destination);
    clearOAuthCookie(response);
    return response;
  } catch {
    return failure('Shopify authorization could not be completed.', 502);
  }
}
