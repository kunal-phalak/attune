import { readWorkspaceBundle } from '@attune/database';

import { parseWorkspaceId } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import {
  inspectForCurrentHuman,
  synchronizeProviderProfile,
} from '../../../../lib/attune-runtime';
import { requireWorkspaceIdentity, workspaceIdentity } from '../../../../lib/auth/session';
import { manufacturingAccessForRoles } from '../../../../lib/manufacturing/access';
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

async function marketplace(
  workspaceId: string,
  locationId?: string,
  refresh = false,
  updateSelection = false,
) {
  const identity = updateSelection
    ? await requireWorkspaceIdentity(workspaceId, 'buyer')
    : await workspaceIdentity(workspaceId);
  const access = manufacturingAccessForRoles(identity.roles);
  if (!access.browseMarketplace) throw new Error('WORKSPACE_ROLE_REQUIRED');
  const [connection, bundle] = await Promise.all([
    shopifyProviderConnection(refresh),
    readWorkspaceBundle(workspaceId),
  ]);
  const profile = shopifyProviderProfile(
    connection,
    locationId ?? bundle.workspace.providerCapabilityProfile.shopify?.locationId,
    bundle.workspace.providerCapabilityProfile,
  );
  if (access.configureRequest) await synchronizeProviderProfile(workspaceId, profile);
  const view = await inspectForCurrentHuman(workspaceId);
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
        label: 'Live maker',
        connectionLabel: 'Shopify connected',
        locationName: profile.shopify?.locationName,
        address: profile.shopify?.address,
        latitude: profile.shopify?.latitude,
        longitude: profile.shopify?.longitude,
        fit: view.validation.valid ? 'Compatible' : 'Needs review',
        reason: view.validation.valid
          ? 'The exact design satisfies this maker profile.'
          : (view.validation.issues[0]?.message ?? 'Maker review is required.'),
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
    return marketplace(workspaceId, selectedLocation(await request.json()), true, true);
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
