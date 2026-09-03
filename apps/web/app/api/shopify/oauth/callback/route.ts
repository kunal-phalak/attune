import {
  saveShopifyInstallation,
  shopifyInstallationForShop,
} from '@attune/database';
import {
  createAdminClientForAccessToken,
  inspectShopifyProviderWithAdmin,
} from '@attune/shopify';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { currentAttuneUser } from '../../../../../lib/auth/session';
import {
  registerShopifyUninstallWebhook,
  shopifyInstallationId,
} from '../../../../../lib/shopify/installations';
import {
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

function failure(message: string, status: number) {
  const response = NextResponse.json({ error: message }, { status });
  response.cookies.delete(SHOPIFY_OAUTH_COOKIE);
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
    const connection = await inspectShopifyProviderWithAdmin(admin);
    const verifiedShopDomain = normalizeShopDomain(connection.shop.myshopifyDomain);
    if (verifiedShopDomain !== callbackShopDomain) {
      return failure('Shopify returned a different store identity.', 403);
    }
    const existing = await shopifyInstallationForShop(user.principalId, verifiedShopDomain);
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
      encryptedOfflineRefreshToken: token.refreshToken
        ? encryptShopifyToken(token.refreshToken)
        : null,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      grantedScopes: connection.grantedScopes,
      connectionStatus:
        missingShopifyCoreScopes(connection.grantedScopes).length === 0
          ? 'connected'
          : 'needs_reauthorization',
      locations: connection.locations,
      selectedLocationId,
      makerProfile: existing?.makerProfile,
      marketplaceListed: existing?.marketplaceListed,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
    });

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
    response.cookies.delete(SHOPIFY_OAUTH_COOKIE);
    return response;
  } catch {
    return failure('Shopify authorization could not be completed.', 502);
  }
}
