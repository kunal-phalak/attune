const STOREFRONT_ICON_SERVICE = 'https://www.google.com/s2/favicons';

export function shopifyStoreLogoUrl(primaryDomain: string): string | undefined {
  const candidate = primaryDomain.trim().toLowerCase();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) {
      return undefined;
    }
    const parameters = new URLSearchParams({ domain_url: url.origin, sz: '128' });
    return `${STOREFRONT_ICON_SERVICE}?${parameters}`;
  } catch {
    return undefined;
  }
}
