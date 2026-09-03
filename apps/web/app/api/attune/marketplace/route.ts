import {
  listConnectedShopifyInstallations,
  listShopifyInstallations,
  readWorkspaceBundle,
  saveShopifyInstallationMakerProfile,
  selectShopifyInstallationLocation,
  shopifyInstallationForOwner,
  type ShopifyInstallation,
} from '@attune/database';
import type { ProviderCapabilityProfile } from '@attune/domain';
import type { ShopifyProviderConnection } from '@attune/shopify';

import { parseWorkspaceId } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { inspectForCurrentHuman, synchronizeProviderProfile } from '../../../../lib/attune-runtime';
import { workspaceIdentity } from '../../../../lib/auth/session';
import { assertMarketplaceRouteAccess } from '../../../../lib/manufacturing/access';
import { withGeocodedShopifyLocation } from '../../../../lib/manufacturing/geocoding';
import {
  DEMO_MARKETPLACE_PROVIDERS,
  isMarketplaceInstallationListed,
  marketplaceInstallationsForViewer,
  oauthShopifyProviderConnection,
  shopifyProviderConnection,
  shopifyProviderProfile,
} from '../../../../lib/manufacturing/marketplace';
import {
  validateProviderCapability,
  validateUniversalGeometry,
} from '../../../../lib/manufacturing/validation';

export const dynamic = 'force-dynamic';

interface MarketplaceUpdate {
  readonly action?: 'select_maker' | 'manage_profile';
  readonly installationId?: string;
  readonly locationId?: string;
  readonly marketplaceListed?: boolean;
}

interface LiveMaker {
  readonly installation: ShopifyInstallation | null;
  readonly connection: ShopifyProviderConnection;
  readonly profile: ProviderCapabilityProfile;
}

function marketplaceUpdate(value: unknown): MarketplaceUpdate {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('A marketplace update is required.');
  }
  const installationId = Reflect.get(value, 'installationId');
  const locationId = Reflect.get(value, 'locationId');
  const marketplaceListed = Reflect.get(value, 'marketplaceListed');
  const action = Reflect.get(value, 'action');
  if (action !== 'select_maker' && action !== 'manage_profile') {
    throw new TypeError('Choose a marketplace action.');
  }
  if (
    installationId !== undefined &&
    (typeof installationId !== 'string' || !installationId.startsWith('shopify:'))
  ) {
    throw new TypeError('installationId must identify a Shopify installation.');
  }
  if (
    locationId !== undefined &&
    (typeof locationId !== 'string' || !locationId.startsWith('gid://shopify/Location/'))
  ) {
    throw new TypeError('locationId must identify a Shopify location.');
  }
  if (marketplaceListed !== undefined && typeof marketplaceListed !== 'boolean') {
    throw new TypeError('marketplaceListed must be a boolean.');
  }
  if (action === 'select_maker' && typeof installationId !== 'string') {
    throw new TypeError('Select a live Shopify Maker.');
  }
  if (action === 'select_maker' && (locationId !== undefined || marketplaceListed !== undefined)) {
    throw new TypeError('Marketplace selection cannot change another Maker profile.');
  }
  return {
    action,
    ...(typeof installationId === 'string' ? { installationId } : {}),
    ...(typeof locationId === 'string' ? { locationId } : {}),
    ...(typeof marketplaceListed === 'boolean' ? { marketplaceListed } : {}),
  };
}

async function inspectedInstallation(
  installation: ShopifyInstallation,
  existing: ProviderCapabilityProfile,
  refresh: boolean,
): Promise<LiveMaker | null> {
  try {
    const connection = await oauthShopifyProviderConnection(installation, refresh);
    return {
      installation,
      connection,
      profile: shopifyProviderProfile(
        connection,
        installation.selectedLocationId ?? undefined,
        installation.makerProfile ?? existing,
      ),
    };
  } catch {
    return null;
  }
}

async function marketplaceProvider(
  live: LiveMaker,
  geometry: Parameters<typeof validateUniversalGeometry>[0],
) {
  const profile = await withGeocodedShopifyLocation(live.profile);
  const universalIssues = validateUniversalGeometry(geometry);
  const makerIssues = validateProviderCapability(geometry, profile);
  const compatible = universalIssues.length === 0 && makerIssues.length === 0;
  return {
    id: profile.providerId,
    installationId: live.installation?.id,
    name: profile.providerName,
    label: 'Live maker' as const,
    connectionLabel: 'Shopify connected',
    locationName: profile.shopify?.locationName,
    address: profile.shopify?.address,
    logoUrl: profile.shopify?.primaryDomain
      ? `https://${profile.shopify.primaryDomain}/favicon.ico`
      : undefined,
    latitude: profile.shopify?.latitude,
    longitude: profile.shopify?.longitude,
    profile,
    fit: compatible ? ('Compatible' as const) : ('Needs review' as const),
    reason: compatible
      ? 'The exact design satisfies this maker profile.'
      : (universalIssues[0]?.message ?? makerIssues[0]?.message ?? 'Maker review is required.'),
  };
}

async function compatibilityMaker(existing: ProviderCapabilityProfile): Promise<LiveMaker> {
  const connection = await shopifyProviderConnection();
  return {
    installation: null,
    connection,
    profile: shopifyProviderProfile(connection, existing.shopify?.locationId, existing),
  };
}

async function marketplace(
  workspaceId: string,
  update: MarketplaceUpdate,
  refresh: boolean,
  versionId?: string,
) {
  const identity = await workspaceIdentity(workspaceId);
  assertMarketplaceRouteAccess(
    identity.roles,
    update.action === 'select_maker'
      ? 'SELECT_MAKER'
      : update.action === 'manage_profile'
        ? 'MANAGE_PROFILE'
        : 'GET',
  );
  const [bundle, connectedInstallations, ownerInstallations] = await Promise.all([
    readWorkspaceBundle(workspaceId),
    listConnectedShopifyInstallations(),
    listShopifyInstallations(identity.principalId),
  ]);

  let selectedInstallation: ShopifyInstallation | null = null;
  if (update.installationId) {
    if (update.action === 'manage_profile') {
      selectedInstallation = await shopifyInstallationForOwner(
        identity.principalId,
        update.installationId,
      );
      if (!selectedInstallation || selectedInstallation.connectionStatus !== 'connected') {
        throw new Error('WORKSPACE_ROLE_REQUIRED');
      }
    } else {
      selectedInstallation =
        connectedInstallations.find(
          (installation) =>
            installation.id === update.installationId &&
            installation.ownerPrincipalId !== identity.principalId &&
            isMarketplaceInstallationListed(installation),
        ) ?? null;
      if (!selectedInstallation) throw new TypeError('The selected Shopify Maker is unavailable.');
    }
  } else {
    const ownedInstallation = ownerInstallations.find(
      ({ connectionStatus }) => connectionStatus === 'connected',
    );
    const workspaceInstallation = connectedInstallations.find(
      ({ shopDomain }) =>
        shopDomain === bundle.workspace.providerCapabilityProfile.shopify?.shopDomain,
    );
    selectedInstallation =
      identity.userId === 'user:judge'
        ? (workspaceInstallation ??
          connectedInstallations.find(isMarketplaceInstallationListed) ??
          null)
        : (ownedInstallation ?? workspaceInstallation ?? null);
  }

  let active = selectedInstallation
    ? await inspectedInstallation(
        selectedInstallation,
        bundle.workspace.providerCapabilityProfile,
        refresh,
      )
    : null;
  if (!active && ownerInstallations.length === 0 && identity.userId === 'user:judge') {
    active = await compatibilityMaker(bundle.workspace.providerCapabilityProfile);
  }
  if (!active) {
    const view = await inspectForCurrentHuman(workspaceId);
    return noStoreJson({
      view,
      activeInstallationId: null,
      installations: ownerInstallations.map(({ id, shopName, shopDomain, connectionStatus }) => ({
        id,
        shopName,
        shopDomain,
        connectionStatus,
      })),
      connection: null,
      providerProfile: bundle.workspace.providerCapabilityProfile,
      providers: DEMO_MARKETPLACE_PROVIDERS,
    });
  }

  if (update.action === 'manage_profile') {
    if (active.installation) {
      if (
        update.locationId &&
        !active.connection.locations.some(
          ({ id, isActive }) => id === update.locationId && isActive,
        )
      ) {
        throw new TypeError('Select an active Shopify location.');
      }
      if (update.locationId) {
        await selectShopifyInstallationLocation({
          ownerPrincipalId: identity.principalId,
          installationId: active.installation.id,
          locationId: update.locationId,
        });
      }
      const profile = shopifyProviderProfile(
        active.connection,
        update.locationId ?? active.installation.selectedLocationId ?? undefined,
        active.installation.makerProfile ?? bundle.workspace.providerCapabilityProfile,
      );
      const marketplaceListed = update.marketplaceListed ?? active.installation.marketplaceListed;
      await saveShopifyInstallationMakerProfile({
        ownerPrincipalId: identity.principalId,
        installationId: active.installation.id,
        makerProfile: { ...profile, marketplaceListed },
        marketplaceListed,
      });
      active = { ...active, profile: { ...profile, marketplaceListed } };
    } else if (update.marketplaceListed !== undefined) {
      active = {
        ...active,
        profile: { ...active.profile, marketplaceListed: update.marketplaceListed },
      };
    }
    await synchronizeProviderProfile(workspaceId, active.profile);
  } else if (update.action === 'select_maker') {
    await synchronizeProviderProfile(workspaceId, active.profile);
  }

  const visibleInstallations = marketplaceInstallationsForViewer(
    connectedInstallations,
    identity.principalId,
    identity.userId === 'user:judge',
  );
  const listed = (
    await Promise.all(
      visibleInstallations.map((installation) =>
        inspectedInstallation(
          installation,
          installation.makerProfile ?? bundle.workspace.providerCapabilityProfile,
          refresh,
        ),
      ),
    )
  ).filter((candidate): candidate is LiveMaker => candidate !== null);
  if (
    (identity.userId === 'user:judge' ||
      active.installation?.ownerPrincipalId !== identity.principalId) &&
    active.profile.marketplaceListed !== false &&
    !listed.some(({ profile }) => profile.providerId === active.profile.providerId)
  ) {
    listed.unshift(active);
  }
  const view = await inspectForCurrentHuman(workspaceId);
  const selectedVersion = versionId
    ? view.workspace.savedVersions.find(({ versionId: candidateId }) => candidateId === versionId)
    : undefined;
  if (versionId && !selectedVersion)
    throw new TypeError('The selected saved version does not exist.');
  const fitGeometry = selectedVersion?.geometry ?? view.workspace.geometry;
  return noStoreJson({
    view,
    selectedVersionId: selectedVersion?.versionId ?? null,
    activeInstallationId: active.installation?.id ?? null,
    installations: ownerInstallations.map(({ id, shopName, shopDomain, connectionStatus }) => ({
      id,
      shopName,
      shopDomain,
      connectionStatus,
    })),
    connection: {
      verifiedAt: active.connection.verifiedAt,
      shop: active.connection.shop,
      locations: active.connection.locations,
      capabilities: active.connection.capabilities,
    },
    providerProfile: active.profile,
    providers: [
      ...(await Promise.all(
        listed.map((candidate) => marketplaceProvider(candidate, fitGeometry)),
      )),
      ...DEMO_MARKETPLACE_PROVIDERS,
    ],
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = parseWorkspaceId(url.searchParams.get('workspace_id'));
    return marketplace(
      workspaceId,
      {},
      url.searchParams.get('refresh') === 'true',
      url.searchParams.get('version_id') ?? undefined,
    );
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    return marketplace(workspaceId, marketplaceUpdate(await request.json()), true);
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
