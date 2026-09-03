import { markShopifyInstallationUninstalled } from '@attune/database';
import { NextResponse } from 'next/server';

import {
  normalizeShopDomain,
  shopifyOAuthConfiguration,
  verifyShopifyWebhookHmac,
} from '../../../../../lib/shopify/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.text();
  const configuration = shopifyOAuthConfiguration();
  if (
    !verifyShopifyWebhookHmac(
      body,
      request.headers.get('X-Shopify-Hmac-Sha256'),
      configuration.clientSecret,
    )
  ) {
    return NextResponse.json({ error: 'Invalid webhook HMAC.' }, { status: 401 });
  }
  try {
    const shopDomain = normalizeShopDomain(request.headers.get('X-Shopify-Shop-Domain') ?? '');
    await markShopifyInstallationUninstalled(shopDomain);
    return new NextResponse(null, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Invalid Shopify shop domain.' }, { status: 400 });
  }
}
