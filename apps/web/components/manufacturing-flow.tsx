'use client';

import type { PanelGeometry, ProviderCapabilityProfile } from '@attune/domain';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Combobox } from '@cloudflare/kumo/components/combobox';
import { Input } from '@cloudflare/kumo/components/input';
import { Select } from '@cloudflare/kumo/components/select';
import { Surface } from '@cloudflare/kumo/components/surface';
import { Text } from '@cloudflare/kumo/components/text';
import {
  ArrowRightIcon,
  BuildingsIcon,
  CheckCircleIcon,
  ClockIcon,
  CubeIcon,
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
  requestAttuneView,
  AttuneHttpError,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import {
  calculateSlotRightClearance,
  validateProviderCapability,
  validateUniversalGeometry,
} from '../lib/manufacturing/validation';
import { resolveManufacturingVersionSelection } from '../lib/manufacturing/version-selection';
import { attuneToastManager } from './attune-ui-provider';
import { BuyerProfileDialog } from './manufacturing-flow/buyer-profile-dialog';
import { MakerMap } from './manufacturing-flow/maker-map';
import { ProviderProfileSurface } from './manufacturing-flow/provider-profile';
import { isMarketplacePayload, type MarketplacePayload } from './manufacturing-flow/types';
import { WorkflowCallout } from './manufacturing-flow/workflow-callout';

export type ManufacturingSurface =
  | 'design'
  | 'marketplace'
  | 'buyer_orders'
  | 'provider_requests'
  | 'provider_profile';

function isManufacturingSurface(value: string): value is ManufacturingSurface {
  return [
    'design',
    'marketplace',
    'buyer_orders',
    'provider_requests',
    'provider_profile',
  ].includes(value);
}

function DesignPreview({
  view,
  versionId,
}: {
  readonly view: AttuneApiView;
  readonly versionId?: string;
}) {
  const version = versionId
    ? view.workspace.savedVersions.find((candidate) => candidate.versionId === versionId)
    : undefined;
  const preview = versionId
    ? view.versionPreviews.find((candidate) => candidate.versionId === versionId)
    : undefined;
  const geometry: PanelGeometry = version?.geometry ?? view.workspace.geometry;
  if (preview?.status === 'STORED' && preview.url) {
    return (
      <img
        className="manufacturing-design-preview"
        src={preview.url}
        alt={`Exact preview of Version ${version?.versionNumber ?? ''}`.trim()}
      />
    );
  }
  const sx = 330 / Math.max(geometry.width, 1);
  const sy = 188 / Math.max(geometry.height, 1);
  const storageMessage = versionId
    ? preview?.status === 'UNCONFIGURED'
      ? 'Private preview storage is not configured. Showing exact local geometry.'
      : preview?.status === 'FAILED'
        ? 'Private preview storage failed. Showing exact local geometry.'
        : preview?.status === 'PENDING'
          ? 'Private preview storage is pending. Showing exact local geometry.'
          : 'Exact preview is not stored yet. Showing exact local geometry.'
    : null;
  return (
    <figure className="exact-preview-frame">
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
      {storageMessage ? <figcaption>{storageMessage}</figcaption> : null}
    </figure>
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

function makerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function FitReport({
  geometry,
  profile,
  configuration,
}: {
  readonly geometry: PanelGeometry;
  readonly profile: ProviderCapabilityProfile;
  readonly configuration: {
    readonly material: 'aluminium' | 'acrylic';
    readonly thicknessMm: number;
    readonly finish: string;
    readonly quantity: number;
    readonly toleranceMm: number;
  };
}) {
  const universal = validateUniversalGeometry(geometry);
  const providerIssues = validateProviderCapability(geometry, profile);
  const issueIds = new Set(providerIssues.map(({ id }) => id));
  const process = profile.processes[0];
  const holes = [...geometry.mounts, ...geometry.auxiliaryHoles, ...geometry.circularCutouts];
  const smallestHole = Math.min(...holes.map(({ diameter }) => diameter));
  const slots = [geometry.slot, ...geometry.ventSlots];
  const smallestSlot = Math.min(...slots.map(({ width, height }) => Math.min(width, height)));
  const materialCapability = Array.isArray(profile.materials)
    ? profile.materials.find(({ material }) => material === configuration.material)
    : undefined;
  const compatible = universal.length === 0 && providerIssues.length === 0;
  const checks = [
    {
      label: 'Overall size',
      detail: `${geometry.width} × ${geometry.height} mm actual · ${process?.workEnvelopeMm.width} × ${process?.workEnvelopeMm.height} mm envelope`,
      source: 'Maker profile',
      pass: !issueIds.has('provider_work_envelope'),
    },
    {
      label: 'Material',
      detail: `${configuration.material} requested · ${materialCapability ? 'supported' : 'not declared'}`,
      source: 'Project requirement · Maker profile',
      pass: !issueIds.has('provider_material'),
    },
    {
      label: 'Thickness',
      detail: `${configuration.thicknessMm} mm requested · ${Array.isArray(materialCapability?.thicknessesMm) ? materialCapability.thicknessesMm.join(', ') : (materialCapability?.thicknessesMm ?? 'not declared')} mm supported`,
      source: 'Project requirement · Maker profile',
      pass: !issueIds.has('provider_thickness'),
    },
    {
      label: 'Smallest hole',
      detail: `${smallestHole} mm actual · ${profile.minimums.holeDiameterMm} mm minimum`,
      source: 'Universal geometry rule · Maker profile',
      pass: !issueIds.has('provider_hole_minimum'),
    },
    {
      label: 'Slot / feature',
      detail: `${smallestSlot} mm actual · ${profile.minimums.slotWidthMm} mm minimum`,
      source: 'Universal geometry rule · Maker profile',
      pass: !issueIds.has('provider_slot_minimum'),
    },
    {
      label: 'Edge clearance',
      detail: `${calculateSlotRightClearance(geometry)} mm actual · ${profile.minimums.edgeClearanceMm} mm required`,
      source: 'Universal geometry rule · Maker profile',
      pass: !issueIds.has('slot_clearance'),
    },
    {
      label: 'Tolerance',
      detail: `±${configuration.toleranceMm} mm requested · ±${profile.toleranceMm} mm capability`,
      source: 'Project requirement · Maker profile',
      pass:
        typeof profile.toleranceMm !== 'number' || configuration.toleranceMm >= profile.toleranceMm,
    },
  ];
  return (
    <section className="fit-report">
      <div className="fit-report-heading">
        <div>
          <span className="manufacturing-eyebrow">Maker fit</span>
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
              <small className="fit-check-source">Source: {check.source}</small>
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
  disabled = false,
}: {
  readonly label: string;
  readonly values: readonly (string | number)[];
  readonly value: string | number;
  readonly onChange: (value: string | number) => void;
  readonly disabled?: boolean;
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
            disabled={disabled}
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
  onView,
  onSelectedId,
  onSurface,
  canConfigure,
}: {
  readonly workspaceId: string;
  readonly view: AttuneApiView;
  readonly payload: MarketplacePayload;
  readonly selectedId: string;
  readonly onView: (view: AttuneApiView) => void;
  readonly onSelectedId: (id: string) => void;
  readonly onSurface: (surface: ManufacturingSurface) => void;
  readonly canConfigure: boolean;
}) {
  const selected = payload.providers.find(({ id }) => id === selectedId) ?? payload.providers[0];
  const profile = selected?.profile ?? payload.providerProfile;
  const initial = view.workspace.manufacturingConfiguration ?? {
    material: view.workspace.geometry.material,
    thicknessMm: view.workspace.geometry.thickness,
    finish: 'As cut',
    quantity: view.workspace.fabricationQuantity,
    toleranceMm: typeof profile.toleranceMm === 'number' ? profile.toleranceMm : 0.2,
  };
  const [configuration, setConfiguration] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState('current');
  const makerCardRefs = useRef(new Map<string, HTMLElement>());
  const versionOptions = useMemo(
    () => [
      { id: 'current', label: 'Current draft' },
      ...view.workspace.savedVersions
        .toSorted((left, right) => right.versionNumber - left.versionNumber)
        .map((version) => ({
          id: version.versionId,
          label: `Version ${version.versionNumber}`,
        })),
    ],
    [view.workspace.savedVersions],
  );
  const selectedVersionOption =
    versionOptions.find(({ id }) => id === selectedVersionId) ?? versionOptions[0];
  const selection = resolveManufacturingVersionSelection(
    view.workspace,
    selectedVersionOption.id,
    configuration,
  );
  const geometry = selection.geometry;
  const compatible =
    selected?.label === 'Live maker' &&
    validateUniversalGeometry(geometry).length === 0 &&
    validateProviderCapability(geometry, profile).length === 0;

  const selectVersion = (versionId: string) => {
    const version = view.workspace.savedVersions.find(
      (candidate) => candidate.versionId === versionId,
    );
    setSelectedVersionId(versionId);
    if (version) {
      setConfiguration((current) => ({
        ...current,
        material: version.geometry.material,
        thicknessMm: version.geometry.thickness,
      }));
    }
  };

  const submitRequest = async () => {
    setSubmitting(true);
    try {
      let requestView = view;
      if (selected?.label === 'Live maker' && selected.installationId) {
        const selectionResponse = await fetch(
          attuneWorkspaceEndpoint('/api/attune/marketplace', workspaceId),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installationId: selected.installationId }),
          },
        );
        const selectedMakerPayload: unknown = await selectionResponse.json();
        if (!selectionResponse.ok || !isMarketplacePayload(selectedMakerPayload)) {
          throw new Error('The selected Shopify Maker could not be bound to this request.');
        }
        requestView = selectedMakerPayload.view;
        onView(selectedMakerPayload.view);
      }
      const next = await requestAttuneView(
        attuneWorkspaceEndpoint('/api/attune/human', workspaceId),
        {
          method: 'POST',
          body: commandRequestBody(
            requestView,
            {
              type: 'request_quote',
              configuration: selection.configuration,
              ...(selection.version ? { versionId: selection.version.versionId } : {}),
            },
            'human-request',
            requestView.workspace.workspaceSeq,
          ),
        },
      );
      onView(next);
      attuneToastManager.add({
        title: 'Request sent',
        description: `Version ${next.workspace.manufacturingRequests.at(-1)?.versionNumber ?? next.workspace.savedVersions.at(-1)?.versionNumber} is ready for maker review.`,
        variant: 'success',
      });
      onSurface('buyer_orders');
    } catch (error) {
      if (error instanceof AttuneHttpError && error.code === 'BUYER_COMMERCE_PROFILE_REQUIRED') {
        setProfileOpen(true);
        return;
      }
      attuneToastManager.add({
        title: 'Request not sent',
        description: error instanceof Error ? error.message : 'Review maker fit and try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="manufacturing-layout marketplace-layout">
      <BuyerProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onSaved={() => submitRequest()}
      />
      <section className="maker-results">
        <div className="surface-heading">
          <span className="manufacturing-eyebrow">Design-driven search</span>
          <h2>Find makers</h2>
          <p>
            Matching the exact {geometry.width} × {geometry.height} mm design in{' '}
            {selection.configuration.thicknessMm} mm {selection.configuration.material}.
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
              ref={(element) => {
                if (element) makerCardRefs.current.set(provider.id, element);
                else makerCardRefs.current.delete(provider.id);
              }}
            >
              <span className="maker-card-icon" aria-hidden>
                <span>{makerInitials(provider.name)}</span>
                {provider.logoUrl ? (
                  <img
                    src={provider.logoUrl}
                    alt=""
                    onError={(event) => event.currentTarget.remove()}
                  />
                ) : null}
              </span>
              <span className="maker-card-main">
                <span className="maker-card-title">
                  <strong>{provider.name}</strong>
                  <span data-live={provider.label === 'Live maker'}>{provider.label}</span>
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
        <MakerMap
          providers={payload.providers}
          selectedId={selected?.id ?? ''}
          onSelect={(id) => {
            onSelectedId(id);
            requestAnimationFrame(() =>
              makerCardRefs.current.get(id)?.scrollIntoView({
                block: 'nearest',
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
              }),
            );
          }}
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
            {selected?.label === 'Live maker' ? (
              <StorefrontIcon size={28} />
            ) : (
              <BuildingsIcon size={28} />
            )}
          </div>
          {selected?.label === 'Live maker' ? (
            <>
              {canConfigure ? (
                <Combobox
                  label="Version to send"
                  items={versionOptions}
                  value={selectedVersionOption}
                  onValueChange={(value) => {
                    if (value && typeof value === 'object' && 'id' in value) {
                      selectVersion(value.id);
                    }
                  }}
                >
                  <Combobox.TriggerValue placeholder="Choose a version" />
                  <Combobox.Content>
                    <Combobox.Input placeholder="Search versions" />
                    <Combobox.Empty>No versions found.</Combobox.Empty>
                    <Combobox.List>
                      {(option: { id: string; label: string }) => (
                        <Combobox.Item key={option.id} value={option}>
                          {option.label}
                        </Combobox.Item>
                      )}
                    </Combobox.List>
                  </Combobox.Content>
                </Combobox>
              ) : null}
              <div className="manufacturing-version-preview">
                <DesignPreview view={view} versionId={selection.version?.versionId} />
                <Text as="p" variant="secondary" size="sm">
                  {selection.version
                    ? `Version ${selection.version.versionNumber} · Exact version locked.`
                    : 'Current draft · A new exact Version will be created before sending.'}
                </Text>
              </div>
              {canConfigure ? (
                <div className="configuration-grid">
                  <ConfigurationControl
                    label="Material"
                    values={['aluminium', 'acrylic']}
                    value={configuration.material}
                    disabled={Boolean(selection.version)}
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
                    disabled={Boolean(selection.version)}
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
              ) : null}
              <FitReport
                geometry={geometry}
                profile={profile}
                configuration={selection.configuration}
              />
              {canConfigure ? (
                <div className="manufacturing-primary-action">
                  <div>
                    <strong>Request a quote for the exact version</strong>
                    <small>Later design changes won&apos;t alter the submitted version.</small>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    loading={submitting}
                    disabled={!compatible || submitting}
                    onClick={() => void submitRequest()}
                  >
                    Request quote
                  </Button>
                </div>
              ) : (
                <p className="manufacturing-readonly-note">
                  You can inspect maker fit. Buyer authority is required to configure or submit a
                  request.
                </p>
              )}
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
  const request = view.workspace.manufacturingRequests.findLast(
    ({ status }) => status !== 'SUPERSEDED',
  );
  const quote = request
    ? view.workspace.quotes.findLast(({ requestId }) => requestId === request.requestId)
    : undefined;
  const acceptance = quote
    ? view.workspace.acceptances.find(
        ({ quoteId, requestId, versionId, specHash }) =>
          quoteId === quote.quoteId &&
          requestId === request?.requestId &&
          versionId === request.versionId &&
          specHash === request.specHash,
      )
    : undefined;
  const commerce = request
    ? view.workspace.externalCommerceRecords.find(
        ({ requestId }) => requestId === request.requestId,
      )
    : undefined;
  const stale = Boolean(
    quote &&
    (quote.status === 'STALE' ||
      quote.status === 'SUPERSEDED' ||
      request?.status === 'STALE' ||
      request?.status === 'SUPERSEDED'),
  );
  const checkoutConformant = Boolean(
    request &&
    quote &&
    acceptance &&
    commerce &&
    commerce.syncState === 'IN_SYNC' &&
    commerce.customerId &&
    commerce.requestId === request.requestId &&
    commerce.versionId === acceptance.versionId &&
    commerce.versionNumber === acceptance.versionNumber &&
    commerce.specHash === acceptance.specHash &&
    commerce.amountMinor === quote.amountMinor &&
    commerce.currency === quote.currency,
  );
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
        description: `Version ${quote.versionNumber} is locked for checkout.`,
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

  const requestChanges = async () => {
    if (!request) return;
    setBusy(true);
    try {
      const next = await requestAttuneView(
        attuneWorkspaceEndpoint('/api/attune/human', workspaceId),
        {
          method: 'POST',
          body: commandRequestBody(
            view,
            { type: 'request_changes', requestId: request.requestId },
            'human-request-changes',
            view.workspace.workspaceSeq,
          ),
        },
      );
      onView(next);
      attuneToastManager.add({
        title: 'Change request started',
        description: `Version ${next.workspace.manufacturingRequests.at(-1)?.versionNumber} is ready for maker review.`,
        variant: 'success',
      });
    } catch (error) {
      attuneToastManager.add({
        title: 'Change request not started',
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
        <p>Commercial records stay bound to the exact saved version that was submitted.</p>
      </div>
      <Surface render={<article />} className="order-record">
        <DesignPreview view={view} versionId={request.versionId} />
        <div className="order-record-main">
          <div className="order-record-title">
            <div>
              <span className="manufacturing-eyebrow">{view.product.projectName}</span>
              <h3>Custom fabrication</h3>
            </div>
            <StatusBadge status={checkoutConformant ? 'COMMERCE_READY' : request.status} />
          </div>
          <dl className="order-facts">
            <div>
              <dt>Maker</dt>
              <dd>{view.workspace.providerCapabilityProfile.providerName}</dd>
            </div>
            <div>
              <dt>Exact version</dt>
              <dd>Version {request.versionNumber}</dd>
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
                This quote is stale. Version {request.versionNumber} remains unchanged, but the
                request must be reviewed again.
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
              {!acceptance && quote.status === 'READY' ? (
                <Button
                  type="button"
                  variant="primary"
                  loading={busy}
                  disabled={busy || stale}
                  onClick={() => void accept()}
                >
                  Accept Version {quote.versionNumber}
                </Button>
              ) : null}
              {checkoutConformant && commerce?.invoiceUrl ? (
                <LinkButton
                  href={commerce.invoiceUrl}
                  target="_blank"
                  variant="primary"
                  icon={<ArrowRightIcon size={16} />}
                >
                  Continue to Shopify
                </LinkButton>
              ) : null}
              {quote ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy}
                  disabled={busy}
                  onClick={() => void requestChanges()}
                >
                  {acceptance ? 'Request design changes' : 'Request changes'}
                </Button>
              ) : null}
              {commerce ? (
                <span className="commerce-binding">
                  <SealCheckIcon size={17} weight="fill" /> Shopify Draft Order{' '}
                  {commerce.name ?? commerce.externalId.split('/').at(-1)}{' '}
                  {checkoutConformant ? 'verified' : 'awaiting exact conformance'}
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
  const request = view.workspace.manufacturingRequests.findLast(
    ({ status }) => status !== 'SUPERSEDED',
  );
  const quote = request
    ? view.workspace.quotes.findLast(({ requestId }) => requestId === request.requestId)
    : undefined;
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
    if (!request) return;
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
      const nextCommerce = next.workspace.externalCommerceRecords.find(
        ({ requestId }) => requestId === request.requestId,
      );
      attuneToastManager.add({
        title: 'Quote sent',
        description: nextCommerce
          ? 'Shopify customer and Draft Order were reread and verified.'
          : `Version ${request.versionNumber} is ready for buyer review.`,
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
            <DesignPreview view={view} versionId={request.versionId} />
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
                <dd>Attune buyer</dd>
              </div>
              <div>
                <dt>Exact version</dt>
                <dd>Version {request.versionNumber}</dd>
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
                <strong>Exact version locked</strong>
                <small>
                  This quote refers to Version {request.versionNumber}. Later design changes
                  won&apos;t alter it.
                </small>
                <small>{request.reviewAccess?.reason ?? 'Shared for manufacturing review'}</small>
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
                {request.shopDomain ? 'Send quote and prepare Draft Order' : 'Send quote'}
              </Button>
              <p className="human-authority-note">
                This action commits the maker-entered price and exact version. It is never sent
                silently by the buyer-side agent.
              </p>
            </>
          )}
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
  const canBuy = view.authority.perspectives.includes('buyer');
  const canMake = view.authority.perspectives.includes('provider');
  const activeRequest = view.workspace.manufacturingRequests.findLast(
    ({ status }) => status !== 'SUPERSEDED',
  );
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
        throw new Error('The live maker connection could not be verified.');
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

  const navigateSurface = (
    next: ManufacturingSurface,
    destinationPerspective?: Extract<CapabilityRole, 'buyer' | 'provider'>,
  ) => {
    if (
      view.product.agentToolsEnabled &&
      destinationPerspective &&
      destinationPerspective !== perspective
    ) {
      window.location.assign(
        `/workspace/${encodeURIComponent(workspaceId)}?perspective=${destinationPerspective}&surface=${next}`,
      );
      return;
    }
    setSurface(next);
  };

  return (
    <section
      className="manufacturing-flow t-panel-slide"
      data-open={open}
      data-judge-perspective={view.product.agentToolsEnabled ? perspective : undefined}
      aria-hidden={!open}
    >
      {view.product.agentToolsEnabled ? (
        <aside className="judge-mode-frame ring ring-kumo-line" aria-label="Judge demo context">
          <SealCheckIcon size={18} weight="fill" aria-hidden />
          <span>
            <Text as="strong" variant="heading">
              Judge demo · {perspective === 'provider' ? 'Maker' : 'Buyer'} view
            </Text>
            <Text as="span" variant="secondary" size="sm">
              {perspective === 'provider'
                ? "You're viewing the maker side with the same judge account."
                : "You're viewing the buyer side with the same judge account."}{' '}
              This is a challenge demonstration convenience.
            </Text>
          </span>
        </aside>
      ) : null}
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
          <div className="manufacturing-title">
            <Text as="span" variant="secondary" size="sm">
              {activeRequest
                ? `Exact version locked · Version ${activeRequest.versionNumber}`
                : 'Current design draft'}
            </Text>
            <Text as="strong" variant="heading">
              {view.product.projectName}
            </Text>
          </div>
        </div>
        <nav className="manufacturing-nav" aria-label="Manufacturing workspace">
          <Button
            type="button"
            size="sm"
            variant={surface === 'marketplace' ? 'secondary' : 'ghost'}
            aria-current={surface === 'marketplace' ? 'page' : undefined}
            onClick={() => setSurface('marketplace')}
          >
            Find makers
          </Button>
          {canBuy ? (
            <Button
              type="button"
              size="sm"
              variant={surface === 'buyer_orders' ? 'secondary' : 'ghost'}
              aria-current={surface === 'buyer_orders' ? 'page' : undefined}
              onClick={() => navigateSurface('buyer_orders', 'buyer')}
            >
              Orders
            </Button>
          ) : null}
          {canMake ? (
            <Button
              type="button"
              size="sm"
              variant={surface === 'provider_requests' ? 'secondary' : 'ghost'}
              aria-current={surface === 'provider_requests' ? 'page' : undefined}
              onClick={() => navigateSurface('provider_requests', 'provider')}
            >
              Requests
            </Button>
          ) : null}
          {canMake ? (
            <Button
              type="button"
              size="sm"
              variant={surface === 'provider_profile' ? 'secondary' : 'ghost'}
              aria-current={surface === 'provider_profile' ? 'page' : undefined}
              onClick={() => navigateSurface('provider_profile', 'provider')}
            >
              Maker profile
            </Button>
          ) : null}
        </nav>
        <Select
          aria-label="Manufacturing section"
          className="manufacturing-nav-mobile"
          value={surface}
          onValueChange={(value) => {
            if (value === null || !isManufacturingSurface(value)) return;
            const next = value;
            navigateSurface(
              next,
              next === 'buyer_orders'
                ? 'buyer'
                : next === 'provider_requests' || next === 'provider_profile'
                  ? 'provider'
                  : undefined,
            );
          }}
        >
          <Select.Option value="design">Design</Select.Option>
          <Select.Option value="marketplace">Find makers</Select.Option>
          {canBuy ? <Select.Option value="buyer_orders">Orders</Select.Option> : null}
          {canMake ? <Select.Option value="provider_requests">Requests</Select.Option> : null}
          {canMake ? <Select.Option value="provider_profile">Maker profile</Select.Option> : null}
        </Select>
      </header>
      <WorkflowCallout
        workspaceId={workspaceId}
        perspective={perspective}
        view={view}
        onSurface={setSurface}
      />
      <div className="manufacturing-content" aria-live="polite" aria-busy={loading}>
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
            <h2>Live maker unavailable</h2>
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
            onView={onView}
            onSelectedId={setSelectedId}
            onSurface={setSurface}
            canConfigure={canBuy}
          />
        ) : null}
        {!loading && !error && payload && canBuy && surface === 'buyer_orders' ? (
          <OrdersSurface workspaceId={workspaceId} view={view} onView={onView} />
        ) : null}
        {!loading && !error && payload && canMake && surface === 'provider_requests' ? (
          <ProviderRequestsSurface workspaceId={workspaceId} view={view} onView={onView} />
        ) : null}
        {!loading && !error && payload && canMake && surface === 'provider_profile' ? (
          <ProviderProfileSurface
            workspaceId={workspaceId}
            payload={payload}
            onPayload={setPayload}
            onView={onView}
          />
        ) : null}
      </div>
      <footer className="manufacturing-footer">
        <span>
          <SealCheckIcon size={15} weight="fill" />{' '}
          {activeRequest
            ? `Exact version locked · Version ${activeRequest.versionNumber}`
            : 'Version will lock when submitted'}
        </span>
        <span>
          {activeRequest
            ? view.versionPreviews.find(({ versionId }) => versionId === activeRequest.versionId)
                ?.status === 'STORED'
              ? 'Exact preview stored privately'
              : 'Preview storage needs attention'
            : 'Current draft'}
        </span>
      </footer>
    </section>
  );
}

export function FindMakersButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="primary"
      size="base"
      className="text-sm"
      icon={<StorefrontIcon size={16} />}
      onClick={onClick}
    >
      Find makers
    </Button>
  );
}
