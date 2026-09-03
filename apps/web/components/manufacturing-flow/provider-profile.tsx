'use client';

import { Badge } from '@cloudflare/kumo/components/badge';
import { LinkButton } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Select } from '@cloudflare/kumo/components/select';
import { Switch } from '@cloudflare/kumo/components/switch';
import { FactoryIcon, StorefrontIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { attuneWorkspaceEndpoint, type AttuneApiView } from '../../lib/attune-view';
import { attuneToastManager } from '../attune-ui-provider';
import { isMarketplacePayload, type MarketplacePayload } from './types';

export function ProviderProfileSurface({
  workspaceId,
  payload,
  onPayload,
  onView,
}: {
  readonly workspaceId: string;
  readonly payload: MarketplacePayload;
  readonly onPayload: (payload: MarketplacePayload) => void;
  readonly onView: (view: AttuneApiView) => void;
}) {
  const profile = payload.providerProfile;
  const shopify = profile.shopify;
  const [busy, setBusy] = useState(false);
  const updateProfile = async (body: {
    readonly installationId?: string;
    readonly locationId?: string;
    readonly marketplaceListed?: boolean;
  }) => {
    setBusy(true);
    try {
      const response = await fetch(
        attuneWorkspaceEndpoint('/api/attune/marketplace', workspaceId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'manage_profile', ...body }),
        },
      );
      const next: unknown = await response.json();
      if (!response.ok || !isMarketplacePayload(next)) {
        throw new Error('Maker profile update failed.');
      }
      onPayload(next);
      onView(next.view);
    } catch (error) {
      attuneToastManager.add({
        title: 'Maker profile not updated',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="provider-profile-surface">
      <div className="surface-heading">
        <span className="manufacturing-eyebrow">Settings</span>
        <h2>Maker profile</h2>
        <p>
          Shopify supplies merchant identity and location. Attune stores manufacturing capability
          facts.
        </p>
      </div>
      <div className="provider-profile-grid">
        <LayerCard render={<section />} className="provider-profile-section">
          <div className="provider-section-icon">
            <StorefrontIcon size={22} />
          </div>
          <div>
            <span className="manufacturing-eyebrow">Settings · Integrations · Shopify</span>
            <h3>
              {shopify?.shopDomain ? payload.connection?.shop.name : 'Connect a Shopify store'}
            </h3>
          </div>
          {payload.installations && payload.installations.length > 1 ? (
            <Select
              label="Shopify store"
              value={payload.activeInstallationId ?? ''}
              disabled={busy}
              onValueChange={(installationId) =>
                void updateProfile({ installationId: String(installationId) })
              }
            >
              {payload.installations
                .filter(({ connectionStatus }) => connectionStatus === 'connected')
                .map((installation) => (
                  <Select.Option key={installation.id} value={installation.id}>
                    {installation.shopName}
                  </Select.Option>
                ))}
            </Select>
          ) : null}
          {payload.connection ? (
            <dl className="profile-facts">
              <div>
                <dt>Primary domain</dt>
                <dd>{shopify?.primaryDomain}</dd>
              </div>
              <div>
                <dt>Manufacturing location</dt>
                <dd>{shopify?.locationName}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{shopify?.address}</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{shopify?.currency}</dd>
              </div>
            </dl>
          ) : null}
          {payload.connection ? (
            <Badge variant="success" appearance="dot">
              Shopify connected
            </Badge>
          ) : (
            <LinkButton href="/settings#integrations" variant="primary">
              Connect Shopify
            </LinkButton>
          )}
        </LayerCard>
        <LayerCard render={<section />} className="provider-profile-section">
          <div className="provider-section-icon">
            <FactoryIcon size={22} />
          </div>
          <div>
            <span className="manufacturing-eyebrow">Settings · Maker profile</span>
            <h3>{profile.processes[0]?.name}</h3>
          </div>
          <dl className="profile-facts">
            <div>
              <dt>Work envelope</dt>
              <dd>
                {profile.processes[0]?.workEnvelopeMm.width} ×{' '}
                {profile.processes[0]?.workEnvelopeMm.height} mm
              </dd>
            </div>
            <div>
              <dt>Materials</dt>
              <dd>
                {typeof profile.materials === 'string'
                  ? profile.materials
                  : profile.materials.map(({ material }) => material).join(', ')}
              </dd>
            </div>
            <div>
              <dt>Minimum hole</dt>
              <dd>{profile.minimums.holeDiameterMm} mm</dd>
            </div>
            <div>
              <dt>Tolerance</dt>
              <dd>±{profile.toleranceMm} mm</dd>
            </div>
            <div>
              <dt>Finishes</dt>
              <dd>{profile.finishes?.join(', ')}</dd>
            </div>
          </dl>
          <div className="maker-profile-controls">
            <Select
              label="Selected manufacturing location"
              value={shopify?.locationId}
              disabled={busy || !payload.connection}
              onValueChange={(locationId) => void updateProfile({ locationId: String(locationId) })}
            >
              {payload.connection?.locations
                .filter(({ isActive }) => isActive)
                .map((location) => (
                  <Select.Option key={location.id} value={location.id}>
                    {location.name}
                  </Select.Option>
                ))}
            </Select>
            <Switch
              size="base"
              label="List my shop in Attune marketplace"
              checked={profile.marketplaceListed !== false}
              disabled={busy || !payload.connection}
              onCheckedChange={(marketplaceListed) => void updateProfile({ marketplaceListed })}
            />
            <small>
              Attune owns this directory listing. Turning it off does not disconnect Shopify.
            </small>
          </div>
        </LayerCard>
      </div>
    </div>
  );
}
