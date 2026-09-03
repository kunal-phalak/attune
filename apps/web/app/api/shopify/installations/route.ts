import {
  disconnectShopifyInstallation,
  listShopifyInstallations,
  selectShopifyInstallationLocation,
  shopifyInstallationForOwner,
} from '@attune/database';
import { NextResponse } from 'next/server';

import { currentAttuneUser } from '../../../../lib/auth/session';
import { publicShopifyInstallation } from '../../../../lib/shopify/installations';
import { shopifyOAuthConfigured, shopifyOAuthConfiguration } from '../../../../lib/shopify/oauth';

export const dynamic = 'force-dynamic';

async function authenticatedUser() {
  const user = await currentAttuneUser();
  if (!user) throw new Error('AUTHENTICATION_REQUIRED');
  return user;
}

function bodyIdentifiers(value: unknown): { installationId: string; locationId?: string } {
  if (typeof value !== 'object' || value === null) throw new TypeError('A request body is required.');
  const installationId = Reflect.get(value, 'installationId');
  const locationId = Reflect.get(value, 'locationId');
  if (typeof installationId !== 'string' || !installationId.startsWith('shopify:')) {
    throw new TypeError('A valid Shopify installation is required.');
  }
  if (
    locationId !== undefined &&
    (typeof locationId !== 'string' || !locationId.startsWith('gid://shopify/Location/'))
  ) {
    throw new TypeError('A valid Shopify location is required.');
  }
  return { installationId, ...(typeof locationId === 'string' ? { locationId } : {}) };
}

export async function GET() {
  try {
    const user = await authenticatedUser();
    const installations = await listShopifyInstallations(user.principalId);
    return NextResponse.json(
      {
        configured: shopifyOAuthConfigured(),
        redirectUri: shopifyOAuthConfigured()
          ? shopifyOAuthConfiguration().redirectUri
          : null,
        installations: installations.map(publicShopifyInstallation),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Shopify installations are unavailable.' },
      { status: error instanceof Error && error.message === 'AUTHENTICATION_REQUIRED' ? 401 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await authenticatedUser();
    const { installationId, locationId } = bodyIdentifiers(await request.json());
    if (!locationId) throw new TypeError('A Shopify location is required.');
    const installation = await shopifyInstallationForOwner(user.principalId, installationId);
    if (!installation) return NextResponse.json({ error: 'Installation not found.' }, { status: 404 });
    if (!installation.locations.some(({ id, isActive }) => id === locationId && isActive)) {
      return NextResponse.json({ error: 'Select an active Shopify location.' }, { status: 400 });
    }
    await selectShopifyInstallationLocation({
      ownerPrincipalId: user.principalId,
      installationId,
      locationId,
    });
    const updated = await shopifyInstallationForOwner(user.principalId, installationId);
    return NextResponse.json({ installation: updated ? publicShopifyInstallation(updated) : null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Shopify location could not be updated.' },
      { status: error instanceof Error && error.message === 'AUTHENTICATION_REQUIRED' ? 401 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await authenticatedUser();
    const { installationId } = bodyIdentifiers(await request.json());
    const installation = await shopifyInstallationForOwner(user.principalId, installationId);
    if (!installation) return NextResponse.json({ error: 'Installation not found.' }, { status: 404 });
    await disconnectShopifyInstallation(user.principalId, installationId);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Shopify could not be disconnected.' },
      { status: error instanceof Error && error.message === 'AUTHENTICATION_REQUIRED' ? 401 : 400 },
    );
  }
}
