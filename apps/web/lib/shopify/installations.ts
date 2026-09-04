import { createHash } from 'node:crypto';

import {
  markShopifyInstallationNeedsReauthorization,
  updateShopifyInstallationCredentials,
  type ShopifyInstallation,
} from '@attune/database';
import {
  createAdminClientForAccessToken,
  inspectShopifyProviderWithAdmin,
  type ShopifyProviderConnection,
} from '@attune/shopify';

import {
  decryptShopifyToken,
  encryptShopifyToken,
  hasShopifyScopes,
  missingShopifyCoreScopes,
  refreshShopifyOfflineToken,
  SHOPIFY_OPTIONAL_SCOPES,
  shopifyOAuthConfiguration,
} from './oauth';
import { shopifyStoreLogoUrl } from './store-branding';

const REFRESH_WINDOW_MS = 5 * 60 * 1_000;

export function shopifyInstallationId(ownerPrincipalId: string, shopId: string): string {
  return `shopify:${createHash('sha256').update(`${ownerPrincipalId}\0${shopId}`).digest('hex').slice(0, 32)}`;
}

export function publicShopifyInstallation(installation: ShopifyInstallation) {
  const missingCoreScopes = missingShopifyCoreScopes(installation.grantedScopes);
  const selectedLocation =
    installation.locations.find(({ id }) => id === installation.selectedLocationId) ?? null;
  return {
    id: installation.id,
    shopId: installation.shopId,
    shopDomain: installation.shopDomain,
    shopName: installation.shopName,
    primaryDomain: installation.primaryDomain,
    logoUrl: shopifyStoreLogoUrl(installation.makerProfile?.shopify?.logoUrl),
    currencyCode: installation.currencyCode,
    grantedScopes: installation.grantedScopes,
    missingCoreScopes,
    connectionStatus:
      missingCoreScopes.length > 0 && installation.connectionStatus === 'connected'
        ? 'needs_reauthorization'
        : installation.connectionStatus,
    locations: installation.locations,
    selectedLocationId: installation.selectedLocationId,
    selectedLocation,
    marketplaceListed: installation.marketplaceListed,
    makerProfile: installation.makerProfile,
    publicationMediaAvailable: hasShopifyScopes(
      installation.grantedScopes,
      SHOPIFY_OPTIONAL_SCOPES,
    ),
    installedAt: installation.installedAt,
    updatedAt: installation.updatedAt,
  };
}

async function usableAccessToken(installation: ShopifyInstallation): Promise<string> {
  if (installation.connectionStatus !== 'connected') {
    throw new Error('This Shopify store needs to be reconnected.');
  }
  if (!installation.encryptedOfflineAccessToken) {
    await markShopifyInstallationNeedsReauthorization(installation.id);
    throw new Error('This Shopify store has no usable offline token.');
  }
  const expiry = installation.accessTokenExpiresAt
    ? Date.parse(installation.accessTokenExpiresAt)
    : Number.POSITIVE_INFINITY;
  if (expiry - Date.now() > REFRESH_WINDOW_MS) {
    return decryptShopifyToken(installation.encryptedOfflineAccessToken);
  }
  if (!installation.encryptedOfflineRefreshToken) {
    await markShopifyInstallationNeedsReauthorization(installation.id);
    throw new Error('This Shopify store requires reauthorization.');
  }
  try {
    const refreshed = await refreshShopifyOfflineToken(
      installation.shopDomain,
      decryptShopifyToken(installation.encryptedOfflineRefreshToken),
    );
    const now = new Date().toISOString();
    await updateShopifyInstallationCredentials({
      installationId: installation.id,
      encryptedOfflineAccessToken: encryptShopifyToken(refreshed.accessToken),
      encryptedOfflineRefreshToken: refreshed.refreshToken
        ? encryptShopifyToken(refreshed.refreshToken)
        : installation.encryptedOfflineRefreshToken,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ?? installation.refreshTokenExpiresAt,
      updatedAt: now,
    });
    return refreshed.accessToken;
  } catch (error) {
    await markShopifyInstallationNeedsReauthorization(installation.id);
    throw error;
  }
}

export async function adminForShopifyInstallation(installation: ShopifyInstallation) {
  const accessToken = await usableAccessToken(installation);
  return createAdminClientForAccessToken(
    installation.shopDomain,
    shopifyOAuthConfiguration().adminVersion,
    accessToken,
  );
}

export async function inspectShopifyInstallation(
  installation: ShopifyInstallation,
): Promise<ShopifyProviderConnection> {
  return inspectShopifyProviderWithAdmin(await adminForShopifyInstallation(installation));
}

export async function registerShopifyUninstallWebhook(
  installation: ShopifyInstallation,
  callbackUrl: string,
): Promise<boolean> {
  const admin = await adminForShopifyInstallation(installation);
  const result = await admin<{
    webhookSubscriptionCreate: {
      webhookSubscription: { readonly id: string } | null;
      userErrors: readonly unknown[];
    };
  }>(
    `#graphql
      mutation RegisterAttuneUninstallWebhook($subscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: APP_UNINSTALLED, webhookSubscription: $subscription) {
          webhookSubscription { id }
          userErrors { field message }
        }
      }
    `,
    { subscription: { uri: callbackUrl, format: 'JSON' } },
    'Register app uninstall webhook',
  );
  return Boolean(
    result.webhookSubscriptionCreate.webhookSubscription?.id &&
    result.webhookSubscriptionCreate.userErrors.length === 0,
  );
}
