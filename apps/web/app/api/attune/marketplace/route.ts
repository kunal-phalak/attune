import { JUDGE_WORKSPACE_ID, readWorkspaceBundle } from '@attune/database';
import { NextResponse } from 'next/server';

import { parseWorkspaceId } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { inspectForHuman, synchronizeProviderProfile } from '../../../../lib/attune-runtime';
import { requireWorkspaceIdentity } from '../../../../lib/auth/session';
import {
  DEMO_MARKETPLACE_PROVIDERS,
  shopifyProviderConnection,
  shopifyProviderProfile,
} from '../../../../lib/manufacturing/marketplace';

export const dynamic = 'force-dynamic';

function selectedLocation(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const locationId = Reflect.get(value, 'locationId');
  if (typeof locationId !== 'string' || !locationId.startsWith('gid://shopify/Location/')) {
    throw new TypeError('locationId must identify a Shopify location.');
  }
  return locationId;
}

async function marketplace(workspaceId: string, locationId?: string, refresh = false) {
  await requireWorkspaceIdentity(workspaceId, 'buyer');
  if (workspaceId !== JUDGE_WORKSPACE_ID) {
    return NextResponse.json(
      {
        error: {
          code: 'JUDGE_WORKSPACE_REQUIRED',
          message: 'The live Shopify marketplace is enabled for the designated judge workspace.',
        },
      },
      { status: 403 },
    );
  }
  const [connection, bundle] = await Promise.all([
    shopifyProviderConnection(refresh),
    readWorkspaceBundle(workspaceId),
  ]);
  const profile = shopifyProviderProfile(
    connection,
    locationId ?? bundle.workspace.providerCapabilityProfile.shopify?.locationId,
    bundle.workspace.providerCapabilityProfile,
  );
  await synchronizeProviderProfile(workspaceId, profile);
  const view = await inspectForHuman(workspaceId);
  return noStoreJson({
    view,
    connection: {
      verifiedAt: connection.verifiedAt,
      shop: connection.shop,
      locations: connection.locations,
      capabilities: connection.capabilities,
    },
    providerProfile: profile,
    providers: [
      {
        id: profile.providerId,
        name: profile.providerName,
        label: 'Live provider',
        connectionLabel: 'Shopify connected',
        locationName: profile.shopify?.locationName,
        address: profile.shopify?.address,
        latitude: profile.shopify?.latitude,
        longitude: profile.shopify?.longitude,
        fit: view.validation.valid ? 'Compatible' : 'Needs review',
        reason: view.validation.valid
          ? 'The exact design satisfies this provider profile.'
          : (view.validation.issues[0]?.message ?? 'Provider review is required.'),
      },
      ...DEMO_MARKETPLACE_PROVIDERS,
    ],
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = parseWorkspaceId(url.searchParams.get('workspace_id'));
    return marketplace(workspaceId, undefined, url.searchParams.get('refresh') === 'true');
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    return marketplace(workspaceId, selectedLocation(await request.json()), true);
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
