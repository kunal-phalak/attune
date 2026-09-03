'use client';

import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Surface } from '@cloudflare/kumo/components/surface';
import {
  CheckCircleIcon,
  FactoryIcon,
  IdentificationCardIcon,
  StorefrontIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { attuneWorkspaceEndpoint } from '../lib/attune-view';
import { BuyerProfileDialog } from './manufacturing-flow/buyer-profile-dialog';
import { isMarketplacePayload, type MarketplacePayload } from './manufacturing-flow/types';

export function ProductSettings({
  judge,
  workspaceId,
}: {
  readonly judge: boolean;
  readonly workspaceId?: string;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [marketplace, setMarketplace] = useState<MarketplacePayload | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);

  useEffect(() => {
    if (!judge || !workspaceId) return undefined;
    const cancellation = new AbortController();
    void fetch(attuneWorkspaceEndpoint('/api/attune/marketplace', workspaceId), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: cancellation.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok || !isMarketplacePayload(payload)) {
          throw new Error('The Shopify connection could not be inspected.');
        }
        setMarketplace(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setIntegrationError(error instanceof Error ? error.message : 'Shopify is unavailable.');
      });
    return () => cancellation.abort();
  }, [judge, workspaceId]);

  const shopify = marketplace?.providerProfile.shopify;
  const process = marketplace?.providerProfile.processes[0];

  return (
    <main className="product-settings">
      <BuyerProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onSaved={() => undefined}
      />
      <header className="product-settings-header">
        <div>
          <span className="manufacturing-eyebrow">Attune</span>
          <h1>Settings</h1>
          <p>Manage Buyer delivery details and truthful commerce integration state.</p>
        </div>
        <LinkButton href="/dashboard" variant="secondary">
          Back to projects
        </LinkButton>
      </header>
      <nav className="product-settings-nav" aria-label="Settings sections">
        <a href="#profile">Profile</a>
        <a href="#integrations">Integrations</a>
        <a href="#maker-profile">Maker profile</a>
      </nav>

      <section id="profile" className="product-settings-section" aria-labelledby="profile-title">
        <Surface render={<article />} className="product-settings-card">
          <span className="product-settings-icon" aria-hidden>
            <IdentificationCardIcon size={22} />
          </span>
          <div className="product-settings-copy">
            <span className="manufacturing-eyebrow">Settings · Profile</span>
            <h2 id="profile-title">Shipping &amp; billing</h2>
            <p>
              These details let a live Maker prepare your store-specific Shopify customer and
              delivery information. Attune never stores card details.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={() => setProfileOpen(true)}>
            Edit Buyer details
          </Button>
        </Surface>
      </section>

      <section
        id="integrations"
        className="product-settings-section"
        aria-labelledby="integrations-title"
      >
        <Surface render={<article />} className="product-settings-card is-stacked">
          <span className="product-settings-icon" aria-hidden>
            <StorefrontIcon size={22} />
          </span>
          <div className="product-settings-copy">
            <span className="manufacturing-eyebrow">Settings · Integrations</span>
            <h2 id="integrations-title">Shopify</h2>
            {!judge ? (
              <div className="settings-truth-state">
                <WarningCircleIcon size={18} />
                <p>
                  General Shopify OAuth is not available in this build. The release demo uses one
                  preconfigured own-store connection only in the designated judge workspace.
                </p>
              </div>
            ) : integrationError ? (
              <div className="settings-truth-state" data-error>
                <WarningCircleIcon size={18} />
                <p>{integrationError}</p>
              </div>
            ) : marketplace ? (
              <>
                <div className="settings-shop-identity">
                  <span aria-hidden>
                    {marketplace.connection.shop.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{marketplace.connection.shop.name}</strong>
                    <small>Shopify connected</small>
                  </div>
                </div>
                <dl className="profile-facts settings-facts">
                  <div>
                    <dt>Primary domain</dt>
                    <dd>{shopify?.primaryDomain}</dd>
                  </div>
                  <div>
                    <dt>Manufacturing location</dt>
                    <dd>{shopify?.locationName}</dd>
                  </div>
                  <div>
                    <dt>Actual address</dt>
                    <dd>{shopify?.address}</dd>
                  </div>
                  <div>
                    <dt>Connection health</dt>
                    <dd className="settings-healthy">
                      <CheckCircleIcon size={16} weight="fill" /> Verified
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <output>Checking the configured Shopify connection…</output>
            )}
          </div>
        </Surface>
      </section>

      <section
        id="maker-profile"
        className="product-settings-section"
        aria-labelledby="maker-profile-title"
      >
        <Surface render={<article />} className="product-settings-card">
          <span className="product-settings-icon" aria-hidden>
            <FactoryIcon size={22} />
          </span>
          <div className="product-settings-copy">
            <span className="manufacturing-eyebrow">Settings · Maker profile</span>
            <h2 id="maker-profile-title">Manufacturing capability</h2>
            {judge && marketplace ? (
              <p>
                {process?.name} · {process?.workEnvelopeMm.width} × {process?.workEnvelopeMm.height}{' '}
                mm ·{' '}
                {marketplace.providerProfile.marketplaceListed === false
                  ? 'Not listed in marketplace'
                  : 'Listed in marketplace'}
              </p>
            ) : (
              <p>Maker profile setup becomes available after an authorized Shopify connection.</p>
            )}
          </div>
          {judge && workspaceId ? (
            <LinkButton
              href={`/workspace/${encodeURIComponent(workspaceId)}?perspective=provider&surface=provider_profile`}
              variant="secondary"
            >
              Manage Maker profile
            </LinkButton>
          ) : null}
        </Surface>
      </section>
    </main>
  );
}
