'use client';

import type { ProviderCapabilityProfile } from '@attune/domain';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import { Surface } from '@cloudflare/kumo/components/surface';
import {
  ArrowRightIcon,
  BuildingsIcon,
  CheckCircleIcon,
  ClockIcon,
  CubeIcon,
  FactoryIcon,
  MapPinIcon,
  PackageIcon,
  SealCheckIcon,
  ShoppingBagOpenIcon,
  StorefrontIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  attuneWorkspaceEndpoint,
  commandRequestBody,
  isAttuneApiView,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import {
  calculateSlotRightClearance,
  validateProviderCapability,
  validateUniversalGeometry,
} from '../lib/manufacturing/validation';
import { attuneToastManager } from './attune-ui-provider';

export type ManufacturingSurface =
  | 'design'
  | 'marketplace'
  | 'buyer_orders'
  | 'provider_requests'
  | 'provider_profile';

interface MarketplaceProvider {
  readonly id: string;
  readonly name: string;
  readonly label: 'Live provider' | 'Demo profile';
  readonly connectionLabel?: string;
  readonly locationName?: string;
  readonly address?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly fit: 'Compatible' | 'Needs review' | 'Not compatible';
  readonly reason: string;
}

interface MarketplacePayload {
  readonly view: AttuneApiView;
  readonly providerProfile: ProviderCapabilityProfile;
  readonly connection: {
    readonly verifiedAt: string;
    readonly shop: {
      readonly id: string;
      readonly name: string;
      readonly myshopifyDomain: string;
      readonly primaryDomain: { readonly host: string; readonly url: string };
      readonly currencyCode: string;
    };
    readonly locations: readonly {
      readonly id: string;
      readonly name: string;
      readonly isActive: boolean;
      readonly fulfillsOnlineOrders: boolean;
      readonly address?: { readonly formatted?: readonly string[] } | null;
    }[];
    readonly capabilities: {
      readonly identity: boolean;
      readonly locations: boolean;
      readonly draftOrders: boolean;
      readonly productMaterialization: boolean;
      readonly storefront: boolean;
    };
  };
  readonly providers: readonly MarketplaceProvider[];
}

function isMarketplacePayload(value: unknown): value is MarketplacePayload {
  if (typeof value !== 'object' || value === null) return false;
  const connection = Reflect.get(value, 'connection');
  const profile = Reflect.get(value, 'providerProfile');
  return (
    isAttuneApiView(Reflect.get(value, 'view')) &&
    Array.isArray(Reflect.get(value, 'providers')) &&
    typeof connection === 'object' &&
    connection !== null &&
    Array.isArray(Reflect.get(connection, 'locations')) &&
    typeof profile === 'object' &&
    profile !== null &&
    typeof Reflect.get(profile, 'providerId') === 'string'
  );
}

interface MapboxMapInstance {
  flyTo(options: { center: [number, number]; zoom: number; essential: boolean }): void;
  remove(): void;
}

interface MapboxMarkerInstance {
  setLngLat(coordinates: [number, number]): MapboxMarkerInstance;
  addTo(map: MapboxMapInstance): MapboxMarkerInstance;
  getElement(): HTMLElement;
  remove(): void;
}

interface MapboxRuntime {
  accessToken: string;
  Map: new (options: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    attributionControl: boolean;
  }) => MapboxMapInstance;
  Marker: new (options: { element: HTMLElement; anchor: string }) => MapboxMarkerInstance;
}

declare global {
  interface Window {
    mapboxgl?: MapboxRuntime;
  }
}

function MapboxProviderMap({
  providers,
  selectedId,
  onSelect,
}: {
  readonly providers: readonly MarketplaceProvider[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMapInstance | null>(null);
  const markersRef = useRef<MapboxMarkerInstance[]>([]);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const selected = providers.find(({ id }) => id === selectedId);

  useEffect(() => {
    if (!token || !rootRef.current) return undefined;
    let cancelled = false;
    let script = document.querySelector<HTMLScriptElement>('script[data-attune-mapbox]');
    let stylesheet = document.querySelector<HTMLLinkElement>('link[data-attune-mapbox]');
    if (!stylesheet) {
      stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css';
      stylesheet.dataset.attuneMapbox = '';
      document.head.append(stylesheet);
    }
    const initialize = () => {
      if (cancelled || !rootRef.current || !window.mapboxgl || mapRef.current) return;
      window.mapboxgl.accessToken = token;
      const first = providers.find(
        (provider) =>
          typeof provider.longitude === 'number' && typeof provider.latitude === 'number',
      );
      const map = new window.mapboxgl.Map({
        container: rootRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [first?.longitude ?? 78.9629, first?.latitude ?? 20.5937],
        zoom: first ? 8 : 4,
        attributionControl: false,
      });
      mapRef.current = map;
      markersRef.current = providers.flatMap((provider) => {
        if (typeof provider.longitude !== 'number' || typeof provider.latitude !== 'number')
          return [];
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'maker-map-pin';
        element.dataset.selected = provider.id === selectedId ? 'true' : 'false';
        element.setAttribute('aria-label', `Select ${provider.name}`);
        element.addEventListener('click', () => onSelect(provider.id));
        return [
          new window.mapboxgl!.Marker({ element, anchor: 'bottom' })
            .setLngLat([provider.longitude, provider.latitude])
            .addTo(map),
        ];
      });
    };
    if (window.mapboxgl) initialize();
    else {
      script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.js';
      script.async = true;
      script.dataset.attuneMapbox = '';
      script.addEventListener('load', initialize, { once: true });
      document.head.append(script);
    }
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [onSelect, providers, selectedId, token]);

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const markerId = marker.getElement().getAttribute('aria-label');
      marker.getElement().dataset.selected =
        markerId === `Select ${selected?.name}` ? 'true' : 'false';
    });
    if (
      mapRef.current &&
      typeof selected?.longitude === 'number' &&
      typeof selected.latitude === 'number'
    ) {
      mapRef.current.flyTo({
        center: [selected.longitude, selected.latitude],
        zoom: 10,
        essential: true,
      });
    }
  }, [selected]);

  return (
    <div className="maker-map" aria-label="Maker locations">
      <div ref={rootRef} className="maker-mapbox" />
      {!token ? (
        <div className="maker-map-fallback">
          <div className="maker-map-grid" aria-hidden />
          {providers.map((provider, index) => (
            <button
              key={provider.id}
              type="button"
              className="maker-map-fallback-pin"
              style={{ left: `${22 + index * 28}%`, top: `${38 + (index % 2) * 18}%` }}
              data-selected={provider.id === selectedId}
              onClick={() => onSelect(provider.id)}
              aria-label={`Select ${provider.name}`}
            >
              <MapPinIcon size={provider.id === selectedId ? 30 : 24} weight="fill" />
            </button>
          ))}
          <span className="maker-map-unavailable">Mapbox token required for geographic tiles</span>
        </div>
      ) : null}
      <div className="maker-map-caption">
        <MapPinIcon size={16} />
        <span>{selected?.address || selected?.locationName || 'Select a maker'}</span>
      </div>
    </div>
  );
}

function DesignPreview({ view }: { readonly view: AttuneApiView }) {
  const geometry = view.workspace.geometry;
  const sx = 330 / Math.max(geometry.width, 1);
  const sy = 188 / Math.max(geometry.height, 1);
  return (
    <svg
      className="manufacturing-design-preview"
      viewBox="0 0 360 218"
      aria-label="Exact design preview"
    >
      <defs>
        <pattern id="manufacturing-grid" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M14 0H0V14" />
        </pattern>
      </defs>
      <rect width="360" height="218" className="manufacturing-preview-bg" />
      <rect
        width="360"
        height="218"
        fill="url(#manufacturing-grid)"
        className="manufacturing-preview-grid"
      />
      <g
        transform={`translate(15 15) scale(${sx} ${sy})`}
        className="manufacturing-preview-geometry"
      >
        <rect width={geometry.width} height={geometry.height} rx={5 / Math.max(sx, sy)} />
        {[...geometry.mounts, ...geometry.auxiliaryHoles, ...geometry.circularCutouts].map(
          (feature) => (
            <circle
              key={feature.id}
              cx={feature.center.x}
              cy={feature.center.y}
              r={feature.diameter / 2}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
        {[geometry.slot, ...geometry.rectangularCutouts, ...geometry.ventSlots].map((feature) => (
          <rect
            key={feature.id}
            x={feature.center.x - feature.width / 2}
            y={feature.center.y - feature.height / 2}
            width={feature.width}
            height={feature.height}
            rx={
              'cornerRadius' in feature && typeof feature.cornerRadius === 'number'
                ? feature.cornerRadius
                : 2
            }
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}

function StatusBadge({ status }: { readonly status: string }) {
  const label =
    {
      PROVIDER_REVIEW_REQUESTED: 'Request sent',
      QUOTED: 'Quote ready',
      ACCEPTED: 'Accepted',
      COMMERCE_READY: 'Checkout ready',
      EXTERNAL_DRIFT: 'Needs attention',
    }[status] ?? status.toLowerCase().replaceAll('_', ' ');
  return (
    <span className="manufacturing-status" data-status={status}>
      {label}
    </span>
  );
}

function FitReport({
  view,
  profile,
  configuration,
}: {
  readonly view: AttuneApiView;
  readonly profile: ProviderCapabilityProfile;
  readonly configuration: {
    readonly material: 'aluminium' | 'acrylic';
    readonly thicknessMm: number;
    readonly finish: string;
    readonly quantity: number;
    readonly toleranceMm: number;
  };
}) {
  const geometry = {
    ...view.workspace.geometry,
    material: configuration.material,
    thickness: configuration.thicknessMm,
  };
  const universal = validateUniversalGeometry(geometry);
  const providerIssues = validateProviderCapability(geometry, profile);
  const issueIds = new Set(providerIssues.map(({ id }) => id));
  const process = profile.processes[0];
  const holes = [...geometry.mounts, ...geometry.auxiliaryHoles, ...geometry.circularCutouts];
  const smallestHole = Math.min(...holes.map(({ diameter }) => diameter));
  const compatible = universal.length === 0 && providerIssues.length === 0;
  const checks = [
    {
      label: 'Work envelope',
      detail: `${geometry.width} × ${geometry.height} mm · provider ${process?.workEnvelopeMm.width} × ${process?.workEnvelopeMm.height} mm`,
      pass: !issueIds.has('provider_work_envelope'),
    },
    {
      label: 'Material and thickness',
      detail: `${configuration.thicknessMm} mm ${configuration.material}`,
      pass: !issueIds.has('provider_material') && !issueIds.has('provider_thickness'),
    },
    {
      label: 'Minimum hole',
      detail: `${smallestHole} mm actual · ≥ ${profile.minimums.holeDiameterMm} mm provider minimum`,
      pass: !issueIds.has('provider_hole_minimum'),
    },
    {
      label: 'Edge clearance',
      detail: `${calculateSlotRightClearance(geometry)} mm actual · ≥ ${profile.minimums.edgeClearanceMm} mm provider minimum`,
      pass: !issueIds.has('slot_clearance'),
    },
  ];
  return (
    <section className="fit-report">
      <div className="fit-report-heading">
        <div>
          <span className="manufacturing-eyebrow">Provider fit</span>
          <h3>
            {compatible ? 'Compatible' : universal.length ? 'Not compatible' : 'Needs review'}
          </h3>
        </div>
        {compatible ? (
          <CheckCircleIcon size={24} weight="fill" />
        ) : (
          <WarningCircleIcon size={24} weight="fill" />
        )}
      </div>
      <div className="fit-checks">
        {checks.map((check) => (
          <div key={check.label} className="fit-check" data-pass={check.pass}>
            {check.pass ? (
              <CheckCircleIcon size={16} weight="fill" />
            ) : (
              <WarningCircleIcon size={16} weight="fill" />
            )}
            <span>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfigurationControl({
  label,
  values,
  value,
  onChange,
}: {
  readonly label: string;
  readonly values: readonly (string | number)[];
  readonly value: string | number;
  readonly onChange: (value: string | number) => void;
}) {
  return (
    <fieldset className="configuration-control">
      <legend>{label}</legend>
      <div>
        {values.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={option === value ? 'primary' : 'secondary'}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {typeof option === 'number' && label === 'Thickness' ? `${option} mm` : option}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function MarketplaceSurface({
  workspaceId,
  view,
  payload,
  selectedId,
  onPayload,
  onView,
  onSelectedId,
  onSurface,
}: {
  readonly workspaceId: string;
  readonly view: AttuneApiView;
  readonly payload: MarketplacePayload;
  readonly selectedId: string;
  readonly onPayload: (payload: MarketplacePayload) => void;
  readonly onView: (view: AttuneApiView) => void;
  readonly onSelectedId: (id: string) => void;
  readonly onSurface: (surface: ManufacturingSurface) => void;
}) {
  const profile = payload.providerProfile;
  const initial = view.workspace.manufacturingConfiguration ?? {
    material: view.workspace.geometry.material,
    thicknessMm: view.workspace.geometry.thickness,
    finish: 'As cut',
    quantity: view.workspace.fabricationQuantity,
    toleranceMm: typeof profile.toleranceMm === 'number' ? profile.toleranceMm : 0.2,
  };
  const [configuration, setConfiguration] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const selected = payload.providers.find(({ id }) => id === selectedId) ?? payload.providers[0];
  const geometry = {
    ...view.workspace.geometry,
    material: configuration.material,
    thickness: configuration.thicknessMm,
  };
  const compatible =
    selected?.label === 'Live provider' &&
    validateUniversalGeometry(geometry).length === 0 &&
    validateProviderCapability(geometry, profile).length === 0;

  const selectLocation = async (locationId: string) => {
    const response = await fetch(attuneWorkspaceEndpoint('/api/attune/marketplace', workspaceId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId }),
    });
    const next: unknown = await response.json();
    if (!response.ok || !isMarketplacePayload(next)) throw new Error('Location update failed.');
    onPayload(next);
    onView(next.view);
  };

  const submitRequest = async () => {
    setSubmitting(true);
    try {
      const next = await requestAttuneView(
        attuneWorkspaceEndpoint('/api/attune/human', workspaceId),
        {
          method: 'POST',
          body: commandRequestBody(
            view,
            { type: 'request_quote', configuration },
            'human-request',
            view.workspace.workspaceSeq,
          ),
        },
      );
      onView(next);
      attuneToastManager.add({
        title: 'Request sent',
        description: `The exact r${next.workspace.draftVersion} revision is ready for maker review.`,
        variant: 'success',
      });
      onSurface('buyer_orders');
    } catch (error) {
      attuneToastManager.add({
        title: 'Request not sent',
        description: error instanceof Error ? error.message : 'Review provider fit and try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="manufacturing-layout marketplace-layout">
      <section className="maker-results">
        <div className="surface-heading">
          <span className="manufacturing-eyebrow">Design-driven search</span>
          <h2>Find makers</h2>
          <p>
            Matching the exact {view.workspace.geometry.width} × {view.workspace.geometry.height} mm
            design in {configuration.thicknessMm} mm {configuration.material}.
          </p>
        </div>
        <div className="maker-list">
          {payload.providers.map((provider) => (
            <Surface
              key={provider.id}
              render={<button type="button" aria-label={`Select ${provider.name}`} />}
              className="maker-card"
              data-selected={provider.id === selected?.id}
              onClick={() => onSelectedId(provider.id)}
            >
              <span className="maker-card-icon">
                <FactoryIcon size={20} />
              </span>
              <span className="maker-card-main">
                <span className="maker-card-title">
                  <strong>{provider.name}</strong>
                  <span data-live={provider.label === 'Live provider'}>{provider.label}</span>
                </span>
                <small>
                  {provider.locationName} · {provider.address}
                </small>
                <span className="maker-card-fit" data-fit={provider.fit}>
                  {provider.fit}
                </span>
              </span>
              <ArrowRightIcon size={17} />
            </Surface>
          ))}
        </div>
      </section>
      <section className="maker-detail">
        <MapboxProviderMap
          providers={payload.providers}
          selectedId={selected?.id ?? ''}
          onSelect={onSelectedId}
        />
        <div className="maker-detail-body">
          <div className="maker-detail-heading">
            <div>
              <span className="manufacturing-eyebrow">
                {selected?.connectionLabel ?? 'Demonstration data'}
              </span>
              <h2>{selected?.name}</h2>
              <p>{selected?.reason}</p>
            </div>
            {selected?.label === 'Live provider' ? (
              <StorefrontIcon size={28} />
            ) : (
              <BuildingsIcon size={28} />
            )}
          </div>
          {selected?.label === 'Live provider' ? (
            <>
              {payload.connection.locations.filter(({ isActive }) => isActive).length > 1 ? (
                <div className="configuration-control">
                  <span>Manufacturing location</span>
                  <div>
                    {payload.connection.locations
                      .filter(({ isActive }) => isActive)
                      .map((location) => (
                        <Button
                          key={location.id}
                          type="button"
                          size="sm"
                          variant={
                            profile.shopify?.locationId === location.id ? 'primary' : 'secondary'
                          }
                          onClick={() => void selectLocation(location.id)}
                        >
                          {location.name}
                        </Button>
                      ))}
                  </div>
                </div>
              ) : null}
              <div className="configuration-grid">
                <ConfigurationControl
                  label="Material"
                  values={['aluminium', 'acrylic']}
                  value={configuration.material}
                  onChange={(value) =>
                    setConfiguration((current) => ({
                      ...current,
                      material: value === 'acrylic' ? 'acrylic' : 'aluminium',
                    }))
                  }
                />
                <ConfigurationControl
                  label="Thickness"
                  values={[2, 3, 4, 5, 6]}
                  value={configuration.thicknessMm}
                  onChange={(value) =>
                    setConfiguration((current) => ({ ...current, thicknessMm: Number(value) }))
                  }
                />
                <ConfigurationControl
                  label="Finish"
                  values={profile.finishes ?? ['As cut']}
                  value={configuration.finish}
                  onChange={(value) =>
                    setConfiguration((current) => ({ ...current, finish: String(value) }))
                  }
                />
                <ConfigurationControl
                  label="Quantity"
                  values={[1, 2, 4, 8, 16]}
                  value={configuration.quantity}
                  onChange={(value) =>
                    setConfiguration((current) => ({ ...current, quantity: Number(value) }))
                  }
                />
              </div>
              <FitReport view={view} profile={profile} configuration={configuration} />
              <div className="manufacturing-primary-action">
                <div>
                  <strong>Request a quote for the exact revision</strong>
                  <small>Revision and specification hash freeze when submitted.</small>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  loading={submitting}
                  disabled={
                    !compatible || submitting || view.workspace.manufacturingRequests.length > 0
                  }
                  onClick={() => void submitRequest()}
                >
                  {view.workspace.manufacturingRequests.length > 0
                    ? 'Request sent'
                    : 'Request quote'}
                </Button>
              </div>
            </>
          ) : (
            <div className="demo-provider-note">
              <WarningCircleIcon size={18} />
              <p>
                This profile demonstrates marketplace breadth. It does not claim a live connection,
                availability, inventory, or real-time quote.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function OrdersSurface({
  workspaceId,
  view,
  onView,
}: {
  readonly workspaceId: string;
  readonly view: AttuneApiView;
  readonly onView: (view: AttuneApiView) => void;
}) {
  const request = view.workspace.manufacturingRequests.at(-1);
  const quote = view.workspace.quotes.at(-1);
  const acceptance = quote
    ? view.workspace.acceptances.find(({ quoteId }) => quoteId === quote.quoteId)
    : undefined;
  const commerce = request
    ? view.workspace.externalCommerceRecords.find(
        ({ requestId }) => requestId === request.requestId,
      )
    : undefined;
  const stale = Boolean(quote && quote.specHash !== view.specHash);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    if (!quote) return;
    setBusy(true);
    try {
      const next = await requestAttuneView(
        attuneWorkspaceEndpoint('/api/attune/human', workspaceId),
        {
          method: 'POST',
          body: commandRequestBody(
            view,
            { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
            'human-accept',
            view.workspace.workspaceSeq,
          ),
        },
      );
      onView(next);
      attuneToastManager.add({
        title: 'Quote accepted',
        description: 'The exact quoted revision is bound for checkout.',
        variant: 'success',
      });
    } catch (error) {
      attuneToastManager.add({
        title: 'Quote not accepted',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!request) {
    return (
      <div className="manufacturing-empty">
        <ShoppingBagOpenIcon size={32} />
        <h2>No manufacturing orders yet</h2>
        <p>Choose a capable maker from the current design to request a quote.</p>
      </div>
    );
  }

  return (
    <div className="orders-surface">
      <div className="surface-heading">
        <span className="manufacturing-eyebrow">Buyer workspace</span>
        <h2>Orders</h2>
        <p>Commercial records stay bound to the exact design revision that was submitted.</p>
      </div>
      <Surface render={<article />} className="order-record">
        <DesignPreview view={view} />
        <div className="order-record-main">
          <div className="order-record-title">
            <div>
              <span className="manufacturing-eyebrow">{view.product.projectName}</span>
              <h3>Custom fabrication</h3>
            </div>
            <StatusBadge status={acceptance && commerce ? 'COMMERCE_READY' : request.status} />
          </div>
          <dl className="order-facts">
            <div>
              <dt>Maker</dt>
              <dd>{view.workspace.providerCapabilityProfile.providerName}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{request.specRevision}</dd>
            </div>
            <div>
              <dt>Configuration</dt>
              <dd>
                {request.configuration
                  ? `${request.configuration.thicknessMm} mm ${request.configuration.material} · ${request.configuration.finish} · qty ${request.configuration.quantity}`
                  : 'Exact submitted configuration'}
              </dd>
            </div>
            <div>
              <dt>Specification hash</dt>
              <dd className="technical-value">{request.specHash.slice(0, 16)}…</dd>
            </div>
          </dl>
          {stale ? (
            <div className="revision-warning">
              <WarningCircleIcon size={18} />
              <span>
                This quote belongs to {quote?.revisionId}. Your active design has changed.
              </span>
            </div>
          ) : null}
          {quote ? (
            <div className="quote-summary">
              <div>
                <span>Price</span>
                <strong>
                  {new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: quote.currency,
                  }).format(quote.amountMinor / 100)}
                </strong>
              </div>
              <div>
                <span>Lead time</span>
                <strong>{quote.leadTimeDays ?? '—'} days</strong>
              </div>
              <div>
                <span>Valid until</span>
                <strong>
                  {quote.validUntil
                    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
                        new Date(quote.validUntil),
                      )
                    : '—'}
                </strong>
              </div>
            </div>
          ) : (
            <div className="quote-waiting">
              <ClockIcon size={18} />
              <span>The maker is reviewing this request.</span>
            </div>
          )}
          {quote ? (
            <div className="order-actions">
              {!acceptance ? (
                <Button
                  type="button"
                  variant="primary"
                  loading={busy}
                  disabled={busy || stale}
                  onClick={() => void accept()}
                >
                  Accept exact revision
                </Button>
              ) : null}
              {acceptance && commerce?.invoiceUrl ? (
                <LinkButton
                  href={commerce.invoiceUrl}
                  target="_blank"
                  variant="primary"
                  icon={<ArrowRightIcon size={16} />}
                >
                  Continue to Shopify
                </LinkButton>
              ) : null}
              {commerce ? (
                <span className="commerce-binding">
                  <SealCheckIcon size={17} weight="fill" /> Shopify Draft Order{' '}
                  {commerce.name ?? commerce.externalId.split('/').at(-1)} verified
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}

function ProviderRequestsSurface({
  workspaceId,
  view,
  onView,
}: {
  readonly workspaceId: string;
  readonly view: AttuneApiView;
  readonly onView: (view: AttuneApiView) => void;
}) {
  const request = view.workspace.manufacturingRequests.at(-1);
  const quote = view.workspace.quotes.at(-1);
  const commerce = request
    ? view.workspace.externalCommerceRecords.find(
        ({ requestId }) => requestId === request.requestId,
      )
    : undefined;
  const currency = view.workspace.providerCapabilityProfile.shopify?.currency ?? 'INR';
  const [amount, setAmount] = useState('');
  const [leadTime, setLeadTime] = useState('7');
  const [busy, setBusy] = useState(false);
  const validUntil = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString();
  }, []);

  const finalize = async () => {
    const amountMinor = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return;
    setBusy(true);
    try {
      const next = await requestAttuneView(
        attuneWorkspaceEndpoint('/api/attune/provider', workspaceId),
        {
          method: 'POST',
          body: commandRequestBody(
            view,
            {
              type: 'freeze_and_quote_revision',
              amountMinor,
              currency,
              leadTimeDays: Number(leadTime),
              validUntil,
            },
            'maker-quote',
            view.workspace.workspaceSeq,
          ),
        },
      );
      onView(next);
      attuneToastManager.add({
        title: 'Quote sent',
        description: 'Shopify Draft Order created and reread successfully.',
        variant: 'success',
      });
    } catch (error) {
      attuneToastManager.add({
        title: 'Quote not finalized',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!request) {
    return (
      <div className="manufacturing-empty">
        <PackageIcon size={32} />
        <h2>No incoming requests</h2>
        <p>Buyer manufacturing requests will appear here.</p>
      </div>
    );
  }

  return (
    <div className="provider-request-surface">
      <div className="surface-heading">
        <span className="manufacturing-eyebrow">Maker workspace</span>
        <h2>Requests</h2>
        <p>Review the exact frozen design before making a commercial commitment.</p>
      </div>
      <div className="provider-request-layout">
        <Surface render={<article />} className="provider-request-card">
          <div className="provider-request-preview">
            <DesignPreview view={view} />
          </div>
          <div className="provider-request-meta">
            <div className="order-record-title">
              <div>
                <span className="manufacturing-eyebrow">Incoming request</span>
                <h3>{view.product.projectName}</h3>
              </div>
              <StatusBadge status={request.status} />
            </div>
            <dl className="order-facts">
              <div>
                <dt>Buyer</dt>
                <dd>Challenge Judge</dd>
              </div>
              <div>
                <dt>Exact revision</dt>
                <dd>{request.specRevision}</dd>
              </div>
              <div>
                <dt>Material</dt>
                <dd>{request.configuration?.material ?? view.workspace.geometry.material}</dd>
              </div>
              <div>
                <dt>Thickness</dt>
                <dd>
                  {request.configuration?.thicknessMm ?? view.workspace.geometry.thickness} mm
                </dd>
              </div>
              <div>
                <dt>Finish</dt>
                <dd>{request.configuration?.finish ?? 'As cut'}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>{request.configuration?.quantity ?? view.workspace.fabricationQuantity}</dd>
              </div>
            </dl>
            <div className="exact-binding">
              <SealCheckIcon size={18} weight="fill" />
              <span>
                <strong>Exact design bound</strong>
                <small className="technical-value">{request.specHash.slice(0, 20)}…</small>
              </span>
            </div>
          </div>
        </Surface>
        <Surface render={<aside />} className="quote-controls">
          <span className="manufacturing-eyebrow">Human commitment</span>
          <h3>{quote ? 'Quote finalized' : 'Prepare quote'}</h3>
          {quote ? (
            <>
              <div className="finalized-quote">
                <CheckCircleIcon size={28} weight="fill" />
                <strong>
                  {new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: quote.currency,
                  }).format(quote.amountMinor / 100)}
                </strong>
                <span>{quote.leadTimeDays} day lead time</span>
              </div>
              {commerce ? (
                <div className="commerce-binding">
                  <SealCheckIcon size={17} weight="fill" /> Draft Order{' '}
                  {commerce.name ?? commerce.externalId.split('/').at(-1)} reread and verified
                </div>
              ) : null}
            </>
          ) : (
            <>
              <label className="quote-field" htmlFor="provider-quote-amount">
                <span>Price ({currency})</span>
                <Input
                  id="provider-quote-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  placeholder="Enter price"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label className="quote-field" htmlFor="provider-quote-lead-time">
                <span>Lead time (days)</span>
                <Input
                  id="provider-quote-lead-time"
                  type="number"
                  min="1"
                  max="365"
                  value={leadTime}
                  onChange={(event) => setLeadTime(event.target.value)}
                />
              </label>
              <div className="quote-validity">
                <ClockIcon size={17} />
                <span>Quote valid for 14 days</span>
              </div>
              <Button
                type="button"
                variant="primary"
                loading={busy}
                disabled={busy || Number(amount) <= 0 || Number(leadTime) <= 0}
                onClick={() => void finalize()}
              >
                Send quote and create Draft Order
              </Button>
              <p className="human-authority-note">
                This action commits the maker-entered price and exact revision. It is never sent
                silently by the buyer-side agent.
              </p>
            </>
          )}
        </Surface>
      </div>
    </div>
  );
}

function ProviderProfileSurface({ payload }: { readonly payload: MarketplacePayload }) {
  const profile = payload.providerProfile;
  const shopify = profile.shopify;
  return (
    <div className="provider-profile-surface">
      <div className="surface-heading">
        <span className="manufacturing-eyebrow">Settings · Integrations</span>
        <h2>Provider profile</h2>
        <p>
          Shopify supplies merchant identity and location. Attune stores manufacturing capability
          facts.
        </p>
      </div>
      <div className="provider-profile-grid">
        <Surface render={<section />} className="provider-profile-section">
          <div className="provider-section-icon">
            <StorefrontIcon size={22} />
          </div>
          <div>
            <span className="manufacturing-eyebrow">Shopify-sourced</span>
            <h3>{shopify?.shopDomain ? payload.connection.shop.name : 'Connection unavailable'}</h3>
          </div>
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
          <span className="connection-state">
            <CheckCircleIcon size={16} weight="fill" /> Shopify connected
          </span>
        </Surface>
        <Surface render={<section />} className="provider-profile-section">
          <div className="provider-section-icon">
            <FactoryIcon size={22} />
          </div>
          <div>
            <span className="manufacturing-eyebrow">Attune manufacturing profile</span>
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
        </Surface>
      </div>
    </div>
  );
}

export function ManufacturingFlow({
  workspaceId,
  perspective,
  surface,
  view,
  onSurface,
  onView,
}: {
  readonly workspaceId: string;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly surface: ManufacturingSurface;
  readonly view: AttuneApiView;
  readonly onSurface: (surface: ManufacturingSurface) => void;
  readonly onView: (view: AttuneApiView) => void;
}) {
  const [payload, setPayload] = useState<MarketplacePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const open = surface !== 'design';
  const loadMarketplace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        attuneWorkspaceEndpoint('/api/attune/marketplace', workspaceId),
        { cache: 'no-store' },
      );
      const result: unknown = await response.json();
      if (!response.ok || !isMarketplacePayload(result))
        throw new Error('The live provider connection could not be verified.');
      const next = result;
      setPayload(next);
      setSelectedId((current) => current || next.providers[0]?.id || '');
      onView(next.view);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The marketplace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [onView, workspaceId]);

  useEffect(() => {
    if (open && !payload && !loading && !error) void loadMarketplace();
  }, [error, loadMarketplace, loading, open, payload]);

  const setSurface = (next: ManufacturingSurface) => {
    onSurface(next);
    const parameters = new URLSearchParams(window.location.search);
    if (next === 'design') parameters.delete('surface');
    else parameters.set('surface', next);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${parameters.size ? `?${parameters}` : ''}`,
    );
  };

  return (
    <section className="manufacturing-flow t-panel-slide" data-open={open} aria-hidden={!open}>
      <header className="manufacturing-header">
        <div className="manufacturing-header-left">
          <Button
            type="button"
            variant="ghost"
            size="base"
            shape="square"
            icon={<XIcon size={18} />}
            aria-label="Return to design"
            onClick={() => setSurface('design')}
          />
          <div>
            <span className="manufacturing-eyebrow">
              Exact design · r{view.workspace.draftVersion}
            </span>
            <strong>{view.product.projectName}</strong>
          </div>
        </div>
        <nav className="manufacturing-nav" aria-label="Manufacturing workspace">
          <Button
            type="button"
            size="sm"
            variant={surface === 'marketplace' ? 'secondary' : 'ghost'}
            onClick={() => setSurface('marketplace')}
          >
            Find makers
          </Button>
          <Button
            type="button"
            size="sm"
            variant={surface === 'buyer_orders' ? 'secondary' : 'ghost'}
            onClick={() => setSurface('buyer_orders')}
          >
            Orders
          </Button>
          {view.authority.perspectives.includes('provider') ? (
            <Button
              type="button"
              size="sm"
              variant={surface === 'provider_requests' ? 'secondary' : 'ghost'}
              onClick={() => setSurface('provider_requests')}
            >
              Requests
            </Button>
          ) : null}
          {view.authority.perspectives.includes('provider') ? (
            <Button
              type="button"
              size="sm"
              variant={surface === 'provider_profile' ? 'secondary' : 'ghost'}
              onClick={() => setSurface('provider_profile')}
            >
              Provider profile
            </Button>
          ) : null}
        </nav>
        <div className="perspective-switch" aria-label="Workspace perspective">
          <LinkButton
            href={`/workspace/${encodeURIComponent(workspaceId)}?perspective=buyer&surface=${surface}`}
            size="sm"
            variant={perspective === 'buyer' ? 'primary' : 'ghost'}
          >
            Buyer
          </LinkButton>
          {view.authority.perspectives.includes('provider') ? (
            <LinkButton
              href={`/workspace/${encodeURIComponent(workspaceId)}?perspective=provider&surface=${surface === 'buyer_orders' ? 'provider_requests' : surface}`}
              size="sm"
              variant={perspective === 'provider' ? 'primary' : 'ghost'}
            >
              Maker
            </LinkButton>
          ) : null}
        </div>
      </header>
      <div className="manufacturing-content">
        {loading ? (
          <div className="manufacturing-empty">
            <CubeIcon className="manufacturing-loading" size={34} />
            <h2>Matching this exact design</h2>
            <p>Verifying Shopify identity, location, and Attune manufacturing capabilities.</p>
          </div>
        ) : null}
        {error ? (
          <div className="manufacturing-empty">
            <WarningCircleIcon size={34} />
            <h2>Live provider unavailable</h2>
            <p>{error}</p>
            <Button type="button" variant="secondary" onClick={() => void loadMarketplace()}>
              Retry connection
            </Button>
          </div>
        ) : null}
        {!loading && !error && payload && surface === 'marketplace' ? (
          <MarketplaceSurface
            workspaceId={workspaceId}
            view={view}
            payload={payload}
            selectedId={selectedId}
            onPayload={setPayload}
            onView={onView}
            onSelectedId={setSelectedId}
            onSurface={setSurface}
          />
        ) : null}
        {!loading && !error && payload && surface === 'buyer_orders' ? (
          <OrdersSurface workspaceId={workspaceId} view={view} onView={onView} />
        ) : null}
        {!loading && !error && payload && surface === 'provider_requests' ? (
          <ProviderRequestsSurface workspaceId={workspaceId} view={view} onView={onView} />
        ) : null}
        {!loading && !error && payload && surface === 'provider_profile' ? (
          <ProviderProfileSurface payload={payload} />
        ) : null}
      </div>
      <footer className="manufacturing-footer">
        <span>
          <SealCheckIcon size={15} weight="fill" /> Revision binding active
        </span>
        <span className="technical-value">{view.specHash.slice(0, 20)}…</span>
      </footer>
    </section>
  );
}

export function FindMakersButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      icon={<FactoryIcon size={16} />}
      onClick={onClick}
    >
      Find makers
    </Button>
  );
}
