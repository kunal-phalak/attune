import { NextResponse } from 'next/server';

import { currentAttuneUser } from '../../../../../lib/auth/session';
import {
  createShopifyOAuthState,
  normalizeShopDomain,
  SHOPIFY_OAUTH_COOKIE,
  shopifyAuthorizationUrl,
} from '../../../../../lib/shopify/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await currentAttuneUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const shopDomain = normalizeShopDomain(new URL(request.url).searchParams.get('shop') ?? '');
    const oauthState = createShopifyOAuthState(user.principalId, shopDomain);
    const response = NextResponse.redirect(shopifyAuthorizationUrl(shopDomain, oauthState.state));
    response.cookies.set(SHOPIFY_OAUTH_COOKIE, oauthState.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/shopify/oauth',
      maxAge: oauthState.maxAgeSeconds,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Shopify OAuth could not start.' },
      { status: 400 },
    );
  }
}
