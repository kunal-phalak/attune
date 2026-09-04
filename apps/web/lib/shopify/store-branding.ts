export function shopifyStoreLogoUrl(storefrontLogoUrl?: string | null): string | undefined {
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
