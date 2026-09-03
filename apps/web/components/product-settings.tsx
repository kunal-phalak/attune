'use client';

import { Badge } from '@cloudflare/kumo/components/badge';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Input } from '@cloudflare/kumo/components/input';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Select } from '@cloudflare/kumo/components/select';
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  FactoryIcon,
  IdentificationCardIcon,
  PlugsConnectedIcon,
  StorefrontIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { BuyerProfileDialog } from './manufacturing-flow/buyer-profile-dialog';
import { SettingsWebMcp, type ShopifyOrdersEnvelope } from './settings-webmcp';

export interface InstallationLocation {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly address?: {
    readonly formatted?: readonly string[];
    readonly address1?: string | null;
    readonly address2?: string | null;
    readonly city?: string | null;
    readonly province?: string | null;
    readonly country?: string | null;
    readonly zip?: string | null;
  } | null;
}

export interface ShopifyInstallationView {
  readonly id: string;
  readonly shopDomain: string;
  readonly shopName: string;
  readonly primaryDomain: string;
  readonly connectionStatus: 'connected' | 'needs_reauthorization' | 'disconnected' | 'uninstalled';
  readonly missingCoreScopes: readonly string[];
  readonly locations: readonly InstallationLocation[];
  readonly selectedLocationId?: string | null;
  readonly selectedLocation?: InstallationLocation | null;
  readonly publicationMediaAvailable: boolean;
  readonly marketplaceListed: boolean;
  readonly makerProfile?: object | null;
}

export interface InstallationsEnvelope {
  readonly configured: boolean;
  readonly redirectUri?: string | null;
  readonly installations: readonly ShopifyInstallationView[];
}

function isInstallationsEnvelope(value: unknown): value is InstallationsEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'configured') === 'boolean' &&
    Array.isArray(Reflect.get(value, 'installations'))
  );
}

function isShopifyOrdersEnvelope(value: unknown): value is ShopifyOrdersEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'store') === 'object' &&
    Reflect.get(value, 'store') !== null &&
    Array.isArray(Reflect.get(value, 'draftOrders'))
  );
}

async function installationResponse(response: Response): Promise<InstallationsEnvelope> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok && isInstallationsEnvelope(payload)) return payload;
  const error =
    typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : null;
  throw new Error(typeof error === 'string' ? error : 'Shopify connections are unavailable.');
}

function formattedLocation(location: InstallationLocation | null | undefined): string {
  const formatted = location?.address?.formatted?.filter(Boolean).join(', ');
  if (formatted) return formatted;
  return [
    location?.address?.address1,
    location?.address?.address2,
    location?.address?.city,
    location?.address?.province,
    location?.address?.country,
    location?.address?.zip,
  ]
    .filter(Boolean)
    .join(', ');
}

function statusTreatment(status: ShopifyInstallationView['connectionStatus']) {
  if (status === 'connected') {
    return { variant: 'success' as const, label: 'Healthy' };
  }
  if (status === 'needs_reauthorization') {
    return {
      variant: 'warning' as const,
      label: 'Additional permission required',
    };
  }
  return { variant: 'secondary' as const, label: 'Disconnected' };
}

export function ProductSettings({ workspaceId }: { readonly workspaceId?: string }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState('');
  const [shopError, setShopError] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<InstallationsEnvelope | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ordersBusyId, setOrdersBusyId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Readonly<Record<string, ShopifyOrdersEnvelope>>>({});

  const loadInstallations = useCallback(async () => {
    setIntegrationError(null);
    try {
      setEnvelope(
        await installationResponse(
          await fetch('/api/shopify/installations', { cache: 'no-store' }),
        ),
      );
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : 'Shopify is unavailable.');
    }
  }, []);

  const ordersLoaded = useCallback((installationId: string, payload: ShopifyOrdersEnvelope) => {
    setOrders((current) => ({ ...current, [installationId]: payload }));
  }, []);

  const loadOrders = useCallback(
    async (installationId: string) => {
      setOrdersBusyId(installationId);
      setIntegrationError(null);
      try {
        const response = await fetch(
          `/api/shopify/draft-orders?installation_id=${encodeURIComponent(installationId)}`,
          { cache: 'no-store', headers: { Accept: 'application/json' } },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (
          !response.ok ||
          typeof payload !== 'object' ||
          payload === null ||
          !isShopifyOrdersEnvelope(payload)
        ) {
          const message =
            typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : null;
          throw new Error(
            typeof message === 'string' ? message : 'Shopify Draft Orders are unavailable.',
          );
        }
        ordersLoaded(installationId, payload);
      } catch (error) {
        setIntegrationError(
          error instanceof Error ? error.message : 'Shopify Draft Orders are unavailable.',
        );
      } finally {
        setOrdersBusyId(null);
      }
    },
    [ordersLoaded],
  );

  useEffect(() => {
    void loadInstallations();
  }, [loadInstallations]);

  const connect = (event: FormEvent) => {
    event.preventDefault();
    setShopError(null);
    const normalized = shopDomain.trim().toLocaleLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(normalized)) {
      setShopError('Enter a valid store address ending in .myshopify.com.');
      return;
    }
    window.location.assign(`/api/shopify/oauth/start?shop=${encodeURIComponent(normalized)}`);
  };

  const updateLocation = async (installationId: string, locationId: string) => {
    setBusyId(installationId);
    try {
      const response = await fetch('/api/shopify/installations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId, locationId }),
      });
      if (!response.ok) throw new Error('The manufacturing location could not be updated.');
      await loadInstallations();
    } catch (error) {
      setIntegrationError(
        error instanceof Error ? error.message : 'The location could not be updated.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = async (installationId: string) => {
    setBusyId(installationId);
    try {
      const response = await fetch('/api/shopify/installations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId }),
      });
      if (!response.ok) throw new Error('The Shopify store could not be disconnected.');
      await loadInstallations();
      setOrders((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== installationId)),
      );
    } catch (error) {
      setIntegrationError(
        error instanceof Error ? error.message : 'The store could not be disconnected.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const activeInstallations =
    envelope?.installations.filter(
      ({ connectionStatus }) =>
        connectionStatus === 'connected' || connectionStatus === 'needs_reauthorization',
    ) ?? [];

  return (
    <main className="product-settings">
      <BuyerProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onSaved={() => undefined}
      />
      <Dialog.Root open={shopDialogOpen} onOpenChange={setShopDialogOpen}>
        <Dialog size="sm" className="shopify-connect-dialog">
          <header className="shopify-dialog-header">
            <div>
              <Dialog.Title className="shopify-dialog-title">Connect Shopify</Dialog.Title>
              <Dialog.Description className="shopify-dialog-description">
                Enter the permanent myshopify.com address for the store you manage.
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  shape="square"
                  title="Close Shopify connection"
                  icon={<XIcon size={17} />}
                />
              }
            />
          </header>
          <form className="shopify-connect-form" onSubmit={connect}>
            <label htmlFor="shopify-store-domain">
              <span>Store address</span>
              <Input
                id="shopify-store-domain"
                name="shop"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="your-store.myshopify.com"
                aria-label="Store address"
                value={shopDomain}
                onChange={(event) => setShopDomain(event.target.value)}
                aria-invalid={Boolean(shopError)}
                required
              />
            </label>
            {shopError ? <p className="form-error">{shopError}</p> : null}
            <div className="shopify-dialog-actions">
              <Dialog.Close
                render={
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                }
              />
              <Button type="submit" variant="primary">
                Continue to Shopify
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      <header className="product-settings-header">
        <div>
          <span className="manufacturing-eyebrow">Attune</span>
          <h1>Settings</h1>
          <p>Manage delivery details, store connections, and manufacturing capability.</p>
        </div>
        <div className="product-settings-actions">
          <SettingsWebMcp
            workspaceId={workspaceId}
            envelope={envelope}
            orders={orders}
            onInstallationsChanged={loadInstallations}
            onOrdersLoaded={ordersLoaded}
          />
          <LinkButton href="/dashboard" variant="secondary">
            Back to projects
          </LinkButton>
        </div>
      </header>
      <nav className="product-settings-nav" aria-label="Settings sections">
        <a href="#profile">Profile</a>
        <a href="#integrations">Integrations</a>
        <a href="#maker-profile">Maker profile</a>
      </nav>

      <section id="profile" className="product-settings-section" aria-labelledby="profile-title">
        <LayerCard render={<article />} className="product-settings-card">
          <span className="product-settings-icon" aria-hidden>
            <IdentificationCardIcon size={22} />
          </span>
          <div className="product-settings-copy">
            <span className="manufacturing-eyebrow">Settings · Profile</span>
            <h2 id="profile-title">Shipping &amp; billing</h2>
            <p>
              These details let a Maker prepare your store-specific Shopify customer and delivery
              information. Attune never stores card details.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={() => setProfileOpen(true)}>
            Edit buyer details
          </Button>
        </LayerCard>
      </section>

      <section
        id="integrations"
        className="product-settings-section"
        aria-labelledby="integrations-title"
      >
        <LayerCard render={<article />} className="product-settings-card is-stacked">
          <span className="product-settings-icon shopify-product-icon" aria-hidden>
            <img src="https://cdn.shopify.com/static/shopify-favicon.png" alt="" />
          </span>
          <div className="product-settings-copy">
            <span className="manufacturing-eyebrow">Settings · Integrations</span>
            <div className="settings-section-heading">
              <div>
                <h2 id="integrations-title">Shopify</h2>
                <p>Connect a store to receive manufacturing requests and manage commerce.</p>
              </div>
              <Button
                type="button"
                variant="primary"
                icon={<PlugsConnectedIcon size={17} />}
                disabled={envelope?.configured === false}
                onClick={() => setShopDialogOpen(true)}
              >
                {activeInstallations.length > 0 ? 'Connect another store' : 'Connect Shopify'}
              </Button>
            </div>
            {envelope?.configured === false ? (
              <div className="settings-truth-state" data-error>
                <WarningCircleIcon size={18} />
                <p>
                  Shopify OAuth needs its app credentials, callback URL, and a strong server secret.
                </p>
              </div>
            ) : null}
            {integrationError ? (
              <div className="settings-truth-state" data-error>
                <WarningCircleIcon size={18} />
                <p>{integrationError}</p>
              </div>
            ) : null}
            {activeInstallations.length > 0 ? (
              <div className="shopify-installations">
                <h3>Connected stores</h3>
                {activeInstallations.map((installation) => {
                  const status = statusTreatment(installation.connectionStatus);
                  return (
                    <div className="shopify-installation" key={installation.id}>
                      <div className="settings-shop-identity">
                        <img src="https://cdn.shopify.com/static/shopify-favicon.png" alt="" />
                        <div>
                          <strong>{installation.shopName}</strong>
                          <small>{installation.primaryDomain}</small>
                        </div>
                        <Badge variant={status.variant} appearance="dot">
                          {status.label}
                        </Badge>
                      </div>
                      {installation.connectionStatus === 'needs_reauthorization' ? (
                        <div className="settings-truth-state">
                          <WarningCircleIcon size={18} />
                          <p>
                            Additional Shopify permission required. Reconnect Shopify to approve the
                            missing core scopes.
                          </p>
                        </div>
                      ) : null}
                      <dl className="profile-facts settings-facts">
                        <div>
                          <dt>Store address</dt>
                          <dd>{installation.shopDomain}</dd>
                        </div>
                        <div>
                          <dt>Manufacturing location</dt>
                          <dd>
                            {installation.selectedLocation?.name ??
                              'Manufacturing location unavailable'}
                          </dd>
                        </div>
                        <div>
                          <dt>Actual address</dt>
                          <dd>
                            {formattedLocation(installation.selectedLocation) ||
                              'Manufacturing location unavailable'}
                          </dd>
                        </div>
                        <div>
                          <dt>Maker profile</dt>
                          <dd>{installation.makerProfile ? 'Ready' : 'Needs setup'}</dd>
                        </div>
                        <div>
                          <dt>Product media</dt>
                          <dd>
                            {installation.publicationMediaAvailable
                              ? 'Available'
                              : 'Private Draft Orders only'}
                          </dd>
                        </div>
                      </dl>
                      {installation.locations.some(({ isActive }) => isActive) ? (
                        <Select
                          label="Manufacturing location"
                          value={installation.selectedLocationId ?? ''}
                          disabled={busyId === installation.id}
                          onValueChange={(value) =>
                            void updateLocation(installation.id, String(value))
                          }
                        >
                          {installation.locations
                            .filter(({ isActive }) => isActive)
                            .map((location) => (
                              <Select.Option key={location.id} value={location.id}>
                                {location.name}
                              </Select.Option>
                            ))}
                        </Select>
                      ) : null}
                      <div className="shopify-installation-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          icon={<StorefrontIcon size={17} />}
                          loading={ordersBusyId === installation.id}
                          onClick={() => void loadOrders(installation.id)}
                        >
                          {orders[installation.id] ? 'Refresh Draft Orders' : 'View Draft Orders'}
                        </Button>
                        {workspaceId ? (
                          <LinkButton
                            href={`/workspace/${encodeURIComponent(workspaceId)}?perspective=provider&surface=provider_profile&installation=${encodeURIComponent(installation.id)}`}
                            variant="secondary"
                          >
                            Manage
                          </LinkButton>
                        ) : (
                          <LinkButton href="/dashboard" variant="secondary">
                            Create a project to manage
                          </LinkButton>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          icon={<ArrowClockwiseIcon size={17} />}
                          onClick={() =>
                            window.location.assign(
                              `/api/shopify/oauth/start?shop=${encodeURIComponent(installation.shopDomain)}`,
                            )
                          }
                        >
                          Reconnect
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          icon={<TrashIcon size={17} />}
                          loading={busyId === installation.id}
                          onClick={() => void disconnect(installation.id)}
                        >
                          Disconnect
                        </Button>
                      </div>
                      {orders[installation.id] ? (
                        <div className="shopify-order-disclosure" aria-live="polite">
                          <div className="shopify-order-disclosure-heading">
                            <div>
                              <h4>Recent Draft Orders</h4>
                              <p>
                                Customer details stay in Shopify. Attune shows only status and exact
                                revision bindings.
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {orders[installation.id].draftOrders.length} recent
                            </Badge>
                          </div>
                          {orders[installation.id].draftOrders.length ? (
                            <div className="shopify-order-list">
                              {orders[installation.id].draftOrders.map((order) => (
                                <article className="shopify-order-row" key={order.externalId}>
                                  <div>
                                    <div className="shopify-order-title">
                                      <strong>{order.name}</strong>
                                      <Badge
                                        variant={
                                          order.attuneBinding
                                            ? 'success'
                                            : order.status === 'OPEN'
                                              ? 'warning'
                                              : 'secondary'
                                        }
                                        appearance="dot"
                                      >
                                        {order.attuneBinding ? 'Attune verified' : order.status}
                                      </Badge>
                                    </div>
                                    <small>
                                      Updated{' '}
                                      {new Intl.DateTimeFormat('en', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                      }).format(new Date(order.updatedAt))}
                                      {order.attuneBinding?.versionNumber
                                        ? ` · Version ${order.attuneBinding.versionNumber}`
                                        : ''}
                                      {order.checkoutAvailable ? ' · Checkout ready' : ''}
                                    </small>
                                  </div>
                                  <LinkButton
                                    href={order.adminUrl}
                                    target="_blank"
                                    variant="ghost"
                                    size="sm"
                                    icon={<ArrowSquareOutIcon size={16} />}
                                  >
                                    Open in Shopify
                                  </LinkButton>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <p className="shopify-order-empty">No Draft Orders in this store.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : envelope ? (
              <div className="shopify-disconnected-state">
                <StorefrontIcon size={20} />
                <div>
                  <strong>No Shopify stores connected</strong>
                  <p>
                    Connect a store, choose its manufacturing location, then publish a Maker
                    profile.
                  </p>
                </div>
              </div>
            ) : (
              <output>Checking Shopify connections…</output>
            )}
            {envelope?.redirectUri ? (
              <p className="shopify-redirect-note">
                OAuth callback: <span>{envelope.redirectUri}</span>
              </p>
            ) : null}
          </div>
        </LayerCard>
      </section>

      <section
        id="maker-profile"
        className="product-settings-section"
        aria-labelledby="maker-profile-title"
      >
        <LayerCard render={<article />} className="product-settings-card">
          <span className="product-settings-icon" aria-hidden>
            <FactoryIcon size={22} />
          </span>
          <div className="product-settings-copy">
            <span className="manufacturing-eyebrow">Settings · Maker profile</span>
            <h2 id="maker-profile-title">Manufacturing capability</h2>
            <p>
              Each Maker profile is bound to one authorized Shopify store and one selected location.
            </p>
          </div>
          {workspaceId && activeInstallations.length > 0 ? (
            <LinkButton
              href={`/workspace/${encodeURIComponent(workspaceId)}?perspective=provider&surface=provider_profile`}
              variant="secondary"
            >
              Manage Maker profiles
            </LinkButton>
          ) : activeInstallations.length === 0 ? (
            <Badge variant="secondary" appearance="dot">
              Connect Shopify first
            </Badge>
          ) : (
            <Badge variant="warning" appearance="dot">
              Create a project to manage
            </Badge>
          )}
        </LayerCard>
      </section>
    </main>
  );
}
