import { readWorkspaceBundle } from '@attune/database';

import { parseWorkspaceId } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import {
  inspectForCurrentHuman,
  synchronizeProviderProfile,
} from '../../../../lib/attune-runtime';
import { requireWorkspaceIdentity, workspaceIdentity } from '../../../../lib/auth/session';
import { assertMarketplaceRouteAccess } from '../../../../lib/manufacturing/access';
import {
  DEMO_MARKETPLACE_PROVIDERS,
  shopifyProviderConnection,
  shopifyProviderProfile,
} from '../../../../lib/manufacturing/marketplace';
import {
  validateProviderCapability,
  validateUniversalGeometry,
} from '../../../../lib/manufacturing/validation';

export const dynamic = 'force-dynamic';

function marketplaceUpdate(value: unknown): {
  readonly locationId?: string;
  readonly marketplaceListed?: boolean;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('A marketplace update is required.');
  }
  const locationId = Reflect.get(value, 'locationId');
  const marketplaceListed = Reflect.get(value, 'marketplaceListed');
  if (
    locationId !== undefined &&
    (typeof locationId !== 'string' || !locationId.startsWith('gid://shopify/Location/'))
  ) {
    throw new TypeError('locationId must identify a Shopify location.');
  }
  if (marketplaceListed !== undefined && typeof marketplaceListed !== 'boolean') {
    throw new TypeError('marketplaceListed must be a boolean.');
  }
  return {
    ...(typeof locationId === 'string' ? { locationId } : {}),
    ...(typeof marketplaceListed === 'boolean' ? { marketplaceListed } : {}),
  };
}

async function marketplace(
  workspaceId: string,
  locationId?: string,
  refresh = false,
  updateRole?: 'buyer' | 'provider',
  marketplaceListed?: boolean,
) {
  const identity = updateRole
    ? await requireWorkspaceIdentity(workspaceId, updateRole)
    : await workspaceIdentity(workspaceId);
  assertMarketplaceRouteAccess(identity.roles, updateRole ? 'POST' : 'GET');
  const [connection, bundle] = await Promise.all([
    shopifyProviderConnection(refresh),
    readWorkspaceBundle(workspaceId),
  ]);
  const connectedProfile = shopifyProviderProfile(
    connection,
    locationId ?? bundle.workspace.providerCapabilityProfile.shopify?.locationId,
    bundle.workspace.providerCapabilityProfile,
  );
  const profile =
    marketplaceListed === undefined
      ? connectedProfile
      : { ...connectedProfile, marketplaceListed };
  if (updateRole === 'provider') {
    await synchronizeProviderProfile(workspaceId, profile);
  }
  const view = await inspectForCurrentHuman(workspaceId);
  const universalIssues = validateUniversalGeometry(view.workspace.geometry);
  const makerIssues = validateProviderCapability(view.workspace.geometry, profile);
  const compatible = universalIssues.length === 0 && makerIssues.length === 0;
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
      ...(profile.marketplaceListed === false
        ? []
        : [
            {
              id: profile.providerId,
              name: profile.providerName,
              label: 'Live maker',
              connectionLabel: 'Shopify connected',
              locationName: profile.shopify?.locationName,
              address: profile.shopify?.address,
              latitude: profile.shopify?.latitude,
              longitude: profile.shopify?.longitude,
              fit: compatible ? 'Compatible' : 'Needs review',
              reason: compatible
                ? 'The exact design satisfies this maker profile.'
                : (universalIssues[0]?.message ??
                  makerIssues[0]?.message ??
                  'Maker review is required.'),
            },
          ]),
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
    const update = marketplaceUpdate(await request.json());
    return marketplace(
      workspaceId,
      update.locationId,
      true,
      'provider',
      update.marketplaceListed,
    );
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
