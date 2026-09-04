export const SHOPIFY_FALLBACK_ICON_URL = 'https://cdn.shopify.com/static/shopify-favicon.png';

export function officialShopifyStoreLogoUrl(
  storefrontLogoUrl?: string | null,
): string | undefined {
  const candidate = storefrontLogoUrl?.trim();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function shopifyStoreLogoUrl(storefrontLogoUrl?: string | null): string {
  return officialShopifyStoreLogoUrl(storefrontLogoUrl) ?? SHOPIFY_FALLBACK_ICON_URL;
}
