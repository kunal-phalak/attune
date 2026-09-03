'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import { useEffect, useMemo, useState } from 'react';

import type { InstallationsEnvelope } from './product-settings';
import { AppIcons } from './ui/app-icons';

export interface ShopifyOrderSummary {
  readonly externalId: string;
  readonly name: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly invoiceSent: boolean;
  readonly checkoutAvailable: boolean;
  readonly convertedOrderName?: string;
  readonly adminUrl: string;
  readonly attuneBinding?: {
    readonly requestId?: string;
    readonly versionId?: string;
    readonly versionNumber?: string;
    readonly revisionId?: string;
    readonly specificationHash?: string;
  };
}

export interface ShopifyOrdersEnvelope {
  readonly store: {
    readonly installationId: string;
    readonly name: string;
    readonly domain: string;
  };
  readonly draftOrders: readonly ShopifyOrderSummary[];
}

function valueObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return Object.fromEntries(Object.entries(value));
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

function exact(value: Record<string, unknown>, keys: readonly string[], name: string) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new TypeError(`${name} contains unsupported fields.`);
  }
}

async function json(response: Response): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload;
  const error =
    typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : null;
  throw new Error(typeof error === 'string' ? error : 'The request could not be completed.');
}

function locationName(envelope: InstallationsEnvelope, locationId: string): string | null {
  for (const installation of envelope.installations) {
    const location = installation.locations.find(({ id }) => id === locationId);
    if (location) return location.name;
  }
  return null;
}

export function SettingsWebMcp({
  workspaceId,
  envelope,
  orders,
  onInstallationsChanged,
  onOrdersLoaded,
}: {
  readonly workspaceId?: string;
  readonly envelope: InstallationsEnvelope | null;
  readonly orders: Readonly<Record<string, ShopifyOrdersEnvelope>>;
  readonly onInstallationsChanged: () => Promise<void>;
  readonly onOrdersLoaded: (installationId: string, payload: ShopifyOrdersEnvelope) => void;
}) {
  const [registration, setRegistration] = useState<
    'checking' | 'registered' | 'unsupported' | 'failed'
  >('checking');
  const activeInstallations = useMemo(
    () =>
      envelope?.installations.filter(
        ({ connectionStatus }) =>
          connectionStatus === 'connected' || connectionStatus === 'needs_reauthorization',
      ) ?? [],
    [envelope],
  );
  const loadedOrders = useMemo(
    () => Object.values(orders).flatMap(({ draftOrders }) => draftOrders),
    [orders],
  );

  const tools = useMemo(() => {
    const available: WebMcpTool[] = [
      {
        name: 'inspect_account_setup',
        title: 'Inspect Attune account setup',
        description:
          'Use on Settings to check Buyer profile completeness and connected Shopify Maker stores without returning addresses, contact details, or credentials.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          untrustedContentHint: true,
        },
        async execute(input, execution) {
          if (input !== undefined && (typeof input !== 'object' || input === null)) {
            throw new TypeError('inspect_account_setup input must be empty.');
          }
          const [profile, installations] = await Promise.all([
            fetch('/api/attune/commerce-profile', {
              cache: 'no-store',
              headers: { Accept: 'application/json' },
              signal: execution?.signal,
            }).then(json),
            fetch('/api/shopify/installations', {
              cache: 'no-store',
              headers: { Accept: 'application/json' },
              signal: execution?.signal,
            }).then(json),
          ]);
          const buyerProfile =
            typeof profile === 'object' && profile !== null
              ? Reflect.get(profile, 'profile')
              : null;
          const stores =
            typeof installations === 'object' && installations !== null
              ? Reflect.get(installations, 'installations')
              : [];
          return {
            buyerProfileConfigured: typeof buyerProfile === 'object' && buyerProfile !== null,
            shopifyConfigured:
              typeof installations === 'object' &&
              installations !== null &&
              Reflect.get(installations, 'configured') === true,
            connectedStores: Array.isArray(stores)
              ? stores.slice(0, 10).map((store) => ({
                  installationId: Reflect.get(store, 'id'),
                  shopName: Reflect.get(store, 'shopName'),
                  shopDomain: Reflect.get(store, 'shopDomain'),
                  connectionStatus: Reflect.get(store, 'connectionStatus'),
                  makerProfileReady:
                    typeof Reflect.get(store, 'makerProfile') === 'object' &&
                    Reflect.get(store, 'makerProfile') !== null,
                  marketplaceListed: Reflect.get(store, 'marketplaceListed') === true,
                }))
              : [],
          };
        },
      },
    ];

    if (envelope?.configured) {
      available.push({
        name: 'start_shopify_connection',
        title: 'Start Shopify connection',
        description:
          'Use when a merchant asks to connect a myshopify.com store. Returns the authorization URL; the merchant must review and approve Shopify permissions in the browser.',
        inputSchema: {
          type: 'object',
          properties: { shop_domain: { type: 'string', minLength: 16, maxLength: 80 } },
          required: ['shop_domain'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
          untrustedContentHint: false,
        },
        execute(input) {
          const value = valueObject(input, 'start_shopify_connection input');
          exact(value, ['shop_domain'], 'start_shopify_connection input');
          const domain =
            typeof value.shop_domain === 'string' ? value.shop_domain.trim().toLowerCase() : '';
          if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(domain)) {
            throw new TypeError('shop_domain must be a valid myshopify.com address.');
          }
          return {
            status: 'AUTHORIZATION_REQUIRED',
            authorizationUrl: `/api/shopify/oauth/start?shop=${encodeURIComponent(domain)}`,
            nextAction: 'Open this URL so the merchant can approve Shopify permissions.',
          };
        },
      });
    }

    if (activeInstallations.length) {
      const installationIds = activeInstallations.map(({ id }) => id);
      available.push(
        {
          name: 'select_shopify_location',
          title: 'Select Shopify maker location',
          description:
            'Use when the merchant asks to change the manufacturing location for a connected store. Accepts only an active location returned by account setup.',
          inputSchema: {
            type: 'object',
            properties: {
              installation_id: { type: 'string', enum: installationIds },
              location_id: { type: 'string' },
            },
            required: ['installation_id', 'location_id'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
            untrustedContentHint: false,
          },
          async execute(input, execution) {
            const value = valueObject(input, 'select_shopify_location input');
            exact(value, ['installation_id', 'location_id'], 'select_shopify_location input');
            const installation = activeInstallations.find(({ id }) => id === value.installation_id);
            const location = installation?.locations.find(
              ({ id, isActive }) => id === value.location_id && isActive,
            );
            if (!installation || !location) {
              throw new Error('Select an active location belonging to that store.');
            }
            await json(
              await fetch('/api/shopify/installations', {
                method: 'PATCH',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  installationId: installation.id,
                  locationId: location.id,
                }),
                signal: execution?.signal,
              }),
            );
            await onInstallationsChanged();
            return {
              status: 'MANUFACTURING_LOCATION_UPDATED',
              installationId: installation.id,
              locationId: location.id,
              locationName: locationName(envelope!, location.id),
            };
          },
        },
        {
          name: 'inspect_shopify_orders',
          title: 'Inspect recent Shopify orders',
          description:
            'Use on Settings to read recent Draft Orders for one connected Maker store. Returns status and Attune revision bindings without customer PII or checkout URLs.',
          inputSchema: {
            type: 'object',
            properties: { installation_id: { type: 'string', enum: installationIds } },
            required: ['installation_id'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
            untrustedContentHint: true,
          },
          async execute(input, execution) {
            const value = valueObject(input, 'inspect_shopify_orders input');
            exact(value, ['installation_id'], 'inspect_shopify_orders input');
            if (
              typeof value.installation_id !== 'string' ||
              !installationIds.includes(value.installation_id)
            ) {
              throw new Error('That connected store is not available.');
            }
            const payload = await json(
              await fetch(
                `/api/shopify/draft-orders?installation_id=${encodeURIComponent(value.installation_id)}`,
                {
                  cache: 'no-store',
                  headers: { Accept: 'application/json' },
                  signal: execution?.signal,
                },
              ),
            );
            if (!isShopifyOrdersEnvelope(payload)) {
              throw new Error('Shopify returned an invalid Draft Order response.');
            }
            onOrdersLoaded(value.installation_id, payload);
            return {
              store: payload.store,
              draftOrders: payload.draftOrders.map(({ adminUrl: _adminUrl, ...order }) => order),
            };
          },
        },
      );
    }

    const loadedById = new Map(loadedOrders.map((order) => [order.externalId, order]));
    if (loadedOrders.length) {
      available.push({
        name: 'open_shopify_admin',
        title: 'Open Shopify Draft Order',
        description:
          'Use after the merchant asks to review a loaded Draft Order in Shopify Admin. Opens the store-owned admin record and leaves Attune.',
        inputSchema: {
          type: 'object',
          properties: { draft_order_id: { type: 'string', enum: [...loadedById.keys()] } },
          required: ['draft_order_id'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
          untrustedContentHint: false,
        },
        execute(input) {
          const value = valueObject(input, 'open_shopify_admin input');
          exact(value, ['draft_order_id'], 'open_shopify_admin input');
          const order = loadedById.get(String(value.draft_order_id));
          if (!order) throw new Error('Inspect Shopify orders before opening this record.');
          window.location.assign(order.adminUrl);
          return { status: 'NAVIGATION_INITIATED', draftOrderId: order.externalId };
        },
      });
    }

    const checkoutOrders = loadedOrders.filter(({ attuneBinding, checkoutAvailable }) =>
      Boolean(attuneBinding && checkoutAvailable),
    );
    if (checkoutOrders.length) {
      available.push({
        name: 'prepare_customer_checkout',
        title: 'Prepare customer checkout',
        description:
          'Use after explicit merchant confirmation to retrieve one Attune-managed Draft Order checkout URL. This prepares a handoff and does not send a customer message.',
        inputSchema: {
          type: 'object',
          properties: {
            installation_id: { type: 'string', enum: Object.keys(orders) },
            draft_order_id: {
              type: 'string',
              enum: checkoutOrders.map(({ externalId }) => externalId),
            },
            user_confirmed: { type: 'boolean' },
          },
          required: ['installation_id', 'draft_order_id', 'user_confirmed'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
          untrustedContentHint: false,
        },
        async execute(input, execution) {
          const value = valueObject(input, 'prepare_customer_checkout input');
          exact(
            value,
            ['installation_id', 'draft_order_id', 'user_confirmed'],
            'prepare_customer_checkout input',
          );
          if (value.user_confirmed !== true) {
            return {
              status: 'USER_CONFIRMATION_REQUIRED',
              nextAction: 'Ask the merchant before revealing the customer checkout URL.',
            };
          }
          return json(
            await fetch('/api/shopify/draft-orders', {
              method: 'POST',
              headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({
                installationId: value.installation_id,
                draftOrderId: value.draft_order_id,
                userConfirmed: true,
              }),
              signal: execution?.signal,
            }),
          );
        },
      });
    }

    if (workspaceId && activeInstallations.length) {
      available.push({
        name: 'open_maker_workspace',
        title: 'Open the Maker workspace',
        description:
          'Use when the merchant asks to manage the connected Maker profile, incoming requests, or accepted jobs in Attune.',
        inputSchema: {
          type: 'object',
          properties: {
            surface: {
              type: 'string',
              enum: ['provider_profile', 'provider_requests', 'provider_jobs'],
            },
          },
          required: ['surface'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          untrustedContentHint: false,
        },
        execute(input) {
          const value = valueObject(input, 'open_maker_workspace input');
          exact(value, ['surface'], 'open_maker_workspace input');
          if (
            !['provider_profile', 'provider_requests', 'provider_jobs'].includes(
              String(value.surface),
            )
          ) {
            throw new TypeError('Choose a supported Maker surface.');
          }
          const target = `/workspace/${encodeURIComponent(workspaceId)}?perspective=provider&surface=${encodeURIComponent(String(value.surface))}`;
          window.location.assign(target);
          return { status: 'NAVIGATION_INITIATED', target };
        },
      });
    }

    return available;
  }, [
    activeInstallations,
    envelope,
    loadedOrders,
    onInstallationsChanged,
    onOrdersLoaded,
    orders,
    workspaceId,
  ]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) {
      setRegistration('unsupported');
      return undefined;
    }
    const lifecycle = new AbortController();
    setRegistration('checking');
    void Promise.all(
      tools.map((tool) =>
        Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })),
      ),
    ).then(
      () => setRegistration('registered'),
      () => setRegistration('failed'),
    );
    return () => lifecycle.abort();
  }, [tools]);

  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<AppIcons.Agent size={18} />}
            aria-label={`Settings agent tools ${registration}`}
          >
            WebMCP · {tools.length}
          </Button>
        }
      />
      <Popover.Content side="bottom" align="end" sideOffset={8} className="workspace-agent-popover">
        <Popover.Title className="workspace-agent-popover-title">Settings tools</Popover.Title>
        <p>
          {registration === 'registered'
            ? 'The active list follows connected-store and loaded-order state. Sensitive checkout handoff appears only for verified Attune Draft Orders.'
            : registration === 'unsupported'
              ? 'Enable WebMCP in a supported Chrome build to expose Settings tools.'
              : registration === 'failed'
                ? 'The browser did not accept the Settings tool registration.'
                : 'Registering page-scoped tools…'}
        </p>
        <div className="workspace-agent-popover-footer">
          {tools.map(({ name }) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      </Popover.Content>
    </Popover>
  );
}
