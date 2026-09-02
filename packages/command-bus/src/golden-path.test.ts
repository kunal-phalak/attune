import { compileCapabilities } from '@attune/capabilities';
import {
  createAt1042Workspace,
  hashSpecification,
  providerBinding,
  type CommerceVerification,
} from '@attune/domain';
import { describe, expect, it } from 'vitest';

import {
  AttuneCommandBus,
  AttuneCommandError,
  type AgentDelegation,
  type CommandEnvelope,
  type TrustedExecutionContext,
} from './index';

const FIXED_TIME = '2026-08-29T12:00:00.000Z';
const WORKSPACE_ID = 'workspace:at-1042';

function delegation(
  label: string,
  capabilityIds: AgentDelegation['capabilityIds'],
): AgentDelegation {
  return {
    id: `delegation:test:${label}`,
    workspaceId: WORKSPACE_ID,
    principalId: 'user:AT-1042',
    capabilityIds,
    authorityEpoch: 0,
    issuedAt: '2026-08-29T00:00:00.000Z',
    expiresAt: '2026-09-23T00:00:00.000Z',
    consentExpiresAt: '2026-09-23T00:00:00.000Z',
    revokedAt: null,
    observationCursor: 0,
  };
}

const buyer: TrustedExecutionContext = {
  path: 'human',
  workspaceId: WORKSPACE_ID,
  principalId: 'user:AT-1042',
  role: 'buyer',
};
const buyerAgent: TrustedExecutionContext = {
  path: 'webmcp',
  workspaceId: WORKSPACE_ID,
  principalId: 'user:AT-1042',
  role: 'buyer',
  delegation: delegation('buyer', [
    'compare_valid_changes',
    'apply_deterministic_repair',
    'edit_draft',
    'request_quote',
    'accept_revision',
    'navigate_to_storefront',
  ]),
};
const provider: TrustedExecutionContext = {
  path: 'human',
  workspaceId: WORKSPACE_ID,
  principalId: 'user:AT-1042',
  role: 'provider',
};
const shopify: TrustedExecutionContext = {
  path: 'system',
  workspaceId: WORKSPACE_ID,
  principalId: 'integration:shopify',
  role: 'provider',
};
const shopifyWebhook: TrustedExecutionContext = {
  path: 'shopify_webhook',
  workspaceId: WORKSPACE_ID,
  principalId: 'shopify:webhook:attune-demo',
  role: 'provider',
};

function commerceVerification(bus: AttuneCommandBus): CommerceVerification {
  return {
    adminVerified: true,
    publicationVerified: true,
    storefrontVerified: true,
    productId: 'gid://shopify/Product/AT1042R7',
    variantId: 'gid://shopify/ProductVariant/AT1042R7LOT4',
    publicationId: 'gid://shopify/Publication/online-store',
    storefrontUrl: 'https://attune-demo.myshopify.com/products/at-1042-r7',
    commitmentId: 'AT-1042',
    revisionId: 'r7',
    specHash: hashSpecification(bus.inspect('provider').workspace),
    title: 'Custom Control Faceplate — AT-1042 r7',
    sku: 'AT-1042-R7-LOT4',
    amountMinor: 240_000,
    currency: 'INR',
    panelCount: 4,
    verifiedAt: FIXED_TIME,
  };
}

function envelope(
  bus: AttuneCommandBus,
  commandId: string,
  observationCursor?: number,
): CommandEnvelope {
  const { workspace } = bus.inspect('buyer');
  return {
    commandId,
    expectedWorkspaceSeq: workspace.workspaceSeq,
    expectedCapabilityEpoch: workspace.capabilityEpoch,
    expectedAuthorityEpoch: workspace.authorityEpoch,
    expectedSpecHash: hashSpecification(workspace),
    observationCursor,
  };
}

function compiledIds(bus: AttuneCommandBus, role: TrustedExecutionContext['role']) {
  return bus.inspect(role).capabilities.map((candidate) => candidate.id);
}

function runThroughAcceptance(bus: AttuneCommandBus) {
  bus.execute(
    { type: 'apply_deterministic_repair', repairId: 'move_slot_left_to_clearance' },
    envelope(bus, 'repair-r7'),
    buyerAgent,
  );
  bus.execute({ type: 'request_quote' }, envelope(bus, 'request-r7'), buyer);
  bus.execute({ type: 'freeze_and_quote_revision' }, envelope(bus, 'quote-r7'), provider);
  const quote = bus.inspect('buyer').workspace.quotes[0];
  bus.execute(
    { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
    envelope(bus, 'accept-r7'),
    buyer,
  );
}

describe('shared Attune semantic command bus', () => {
  it('produces equivalent authoritative state for the same human and WebMCP repair', () => {
    const humanBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    const agentBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    const command = {
      type: 'apply_deterministic_repair' as const,
      repairId: 'move_slot_left_to_clearance' as const,
    };

    const humanResult = humanBus.execute(command, envelope(humanBus, 'same-command'), buyer);
    const agentResult = agentBus.execute(command, envelope(agentBus, 'same-command'), buyerAgent);

    expect(humanResult.receipt.afterHash).toBe(agentResult.receipt.afterHash);
    expect(humanResult.receipt.origin).toBe('human_ui');
    expect(agentResult.receipt.origin).toBe('webmcp');
    expect(humanResult.receipt.validationAfter.valid).toBe(true);
    expect(agentResult.receipt.preservedLocks).toHaveLength(4);
  });

  it('automatically reports unseen human intervention to the agent', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    bus.execute(
      { type: 'move_slot', centerX: 196, centerY: 60 },
      envelope(bus, 'human-move'),
      buyer,
    );

    const observed = bus.inspect('buyer', 0);
    expect(observed.observation).toEqual(
      expect.objectContaining({
        previousWorkspaceSeq: 0,
        currentWorkspaceSeq: 1,
        interventions: [
          expect.objectContaining({
            receiptSeq: 1,
            origin: 'human_ui',
            command: 'move_slot',
            affectedEntities: ['slot:connector'],
          }),
        ],
      }),
    );
  });

  it('makes command retries idempotent and rejects stale or forged authority', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    const request = envelope(bus, 'idempotent-repair');
    const command = {
      type: 'apply_deterministic_repair' as const,
      repairId: 'move_slot_left_to_clearance' as const,
    };
    const first = bus.execute(command, request, buyerAgent);
    const second = bus.execute(command, request, buyerAgent);

    expect(second).toBe(first);
    expect(bus.receipts()).toHaveLength(1);
    expect(() =>
      bus.execute({ type: 'request_quote' }, { ...request, commandId: 'stale-request' }, buyer),
    ).toThrowError(expect.objectContaining({ code: 'STALE_WORKSPACE' }));
    expect(() =>
      bus.execute({ type: 'request_quote' }, envelope(bus, 'forged-role'), {
        path: 'webmcp',
        workspaceId: WORKSPACE_ID,
        principalId: 'user:missing-delegation',
        role: 'buyer',
      }),
    ).toThrowError(expect.objectContaining({ code: 'DELEGATION_REQUIRED' }));
    expect(() =>
      bus.execute(
        { type: 'move_slot', centerX: 194, centerY: 60 },
        {
          ...request,
          commandId: 'forged-spec',
          expectedWorkspaceSeq: 1,
          expectedCapabilityEpoch: 2,
        },
        buyerAgent,
      ),
    ).toThrowError(expect.objectContaining({ code: 'SPEC_HASH_MISMATCH' }));
    expect(() =>
      bus.execute(
        { type: 'move_slot', centerX: 194, centerY: 60 },
        envelope(bus, 'forged-principal'),
        { ...buyerAgent, principalId: 'user:forged-browser-claim' },
      ),
    ).toThrowError(expect.objectContaining({ code: 'DELEGATION_INVALID' }));
    expect(() =>
      bus.execute({ type: 'move_slot', centerX: 194, centerY: 60 }, request, buyerAgent),
    ).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
    expect(bus.rejections().map(({ code }) => code)).toEqual([
      'STALE_WORKSPACE',
      'DELEGATION_REQUIRED',
      'SPEC_HASH_MISMATCH',
      'DELEGATION_INVALID',
      'IDEMPOTENCY_CONFLICT',
    ]);
  });
});

describe('server-issued WebMCP delegation', () => {
  it('denies capabilities outside the delegated subset', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    const restricted = {
      ...buyerAgent,
      delegation: delegation('buyer', ['compare_valid_changes']),
    } satisfies TrustedExecutionContext;

    expect(() =>
      bus.execute(
        { type: 'move_slot', centerX: 194, centerY: 60 },
        envelope(bus, 'restricted-agent'),
        restricted,
      ),
    ).toThrowError(expect.objectContaining({ code: 'DELEGATION_CAPABILITY_DENIED' }));
  });

  it('denies expired, revoked, stale-authority, and wrong-workspace grants', () => {
    const cases = [
      {
        context: {
          ...buyerAgent,
          delegation: { ...buyerAgent.delegation!, expiresAt: FIXED_TIME },
        },
        code: 'DELEGATION_EXPIRED',
      },
      {
        context: {
          ...buyerAgent,
          delegation: { ...buyerAgent.delegation!, revokedAt: FIXED_TIME },
        },
        code: 'DELEGATION_REVOKED',
      },
      {
        context: {
          ...buyerAgent,
          delegation: { ...buyerAgent.delegation!, authorityEpoch: 1 },
        },
        code: 'REVALIDATION_REQUIRED',
      },
      {
        context: {
          ...buyerAgent,
          delegation: { ...buyerAgent.delegation!, workspaceId: 'workspace:other' },
        },
        code: 'DELEGATION_INVALID',
      },
    ];

    for (const [index, candidate] of cases.entries()) {
      const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
      expect(() =>
        bus.execute(
          { type: 'move_slot', centerX: 194, centerY: 60 },
          envelope(bus, `invalid-delegation-${index}`),
          candidate.context,
        ),
      ).toThrowError(expect.objectContaining({ code: candidate.code }));
    }
  });
});

describe('manufacturing request and Shopify synchronization contract', () => {
  it('binds a private request and quote to the exact provider profile', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    runThroughAcceptance(bus);
    const workspace = bus.inspect('buyer').workspace;

    expect(workspace.manufacturingRequests).toEqual([
      expect.objectContaining({
        specRevision: 'r7',
        specHash: workspace.quotes[0].specHash,
        provider: workspace.quotes[0].provider,
        visibility: 'PRIVATE',
        status: 'ACCEPTED',
      }),
    ]);
  });

  it('keeps exact webhook state in sync and revokes commerce authority on material drift', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    runThroughAcceptance(bus);
    const accepted = bus.inspect('provider').workspace;
    const request = accepted.manufacturingRequests[0];
    const quote = accepted.quotes[0];
    const snapshot = {
      externalId: 'gid://shopify/DraftOrder/1042',
      kind: 'SHOPIFY_DRAFT_ORDER' as const,
      status: 'OPEN',
      requestId: request.requestId,
      specRevision: request.specRevision,
      specHash: request.specHash,
      provider: request.provider,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      customerId: 'gid://shopify/Customer/1042',
      updatedAt: FIXED_TIME,
    };

    bus.execute(
      { type: 'synchronize_shopify_draft_order', snapshot },
      envelope(bus, 'draft-order-in-sync'),
      shopifyWebhook,
    );
    expect(bus.inspect('provider').workspace.externalCommerceRecords[0].syncState).toBe('IN_SYNC');
    expect(compiledIds(bus, 'provider')).toContain('materialize_for_commerce');

    bus.execute(
      {
        type: 'synchronize_shopify_draft_order',
        snapshot: { ...snapshot, amountMinor: 250_000, updatedAt: '2026-08-29T12:01:00.000Z' },
      },
      envelope(bus, 'draft-order-drift'),
      shopifyWebhook,
    );
    const drifted = bus.inspect('provider').workspace;
    expect(drifted.manufacturingRequests[0].status).toBe('EXTERNAL_DRIFT');
    expect(drifted.externalCommerceRecords[0].syncState).toBe('EXTERNAL_DRIFT');
    expect(compiledIds(bus, 'provider')).not.toContain('materialize_for_commerce');
    expect(bus.receipts().at(-1)?.origin).toBe('shopify_webhook');
  });

  it('does not let a browser claim Shopify synchronization provenance', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    expect(() =>
      bus.execute(
        {
          type: 'synchronize_shopify_draft_order',
          snapshot: {
            externalId: 'gid://shopify/DraftOrder/forged',
            kind: 'SHOPIFY_DRAFT_ORDER',
            status: 'OPEN',
            requestId: 'quote-request:forged',
            specRevision: 'r7',
            specHash: hashSpecification(bus.inspect('buyer').workspace),
            provider: providerBinding(bus.inspect('buyer').workspace),
            amountMinor: 240_000,
            currency: 'INR',
            customerId: 'gid://shopify/Customer/forged',
            updatedAt: FIXED_TIME,
          },
        },
        envelope(bus, 'forged-webhook'),
        buyer,
      ),
    ).toThrowError(expect.objectContaining({ code: 'ORIGIN_NOT_ALLOWED' }));
  });
});

describe('AT-1042 r7 to r8 authority path', () => {
  it('freezes, accepts and materializes exact r7, then revokes current commerce authority at r8', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    expect(compiledIds(bus, 'buyer')).toContain('apply_deterministic_repair');

    runThroughAcceptance(bus);
    const accepted = bus.inspect('provider');
    expect(accepted.workspace.draftVersion).toBe(7);
    expect(compiledIds(bus, 'provider')).toContain('materialize_for_commerce');

    const materializeEnvelope = envelope(bus, 'materialize-r7');
    bus.execute(
      {
        type: 'materialize_for_commerce',
        revisionId: 'r7',
        verification: commerceVerification(bus),
      },
      materializeEnvelope,
      shopify,
    );
    const materialized = bus.inspect('buyer').workspace;
    const frozenR7 = structuredClone(materialized.frozenRevisions[0]);
    expect(materialized.commerceLinks[0]).toEqual(
      expect.objectContaining({
        revisionId: 'r7',
        specHash: frozenR7.specHash,
        status: 'VERIFIED',
      }),
    );
    expect(compileCapabilities(materialized, 'buyer').map(({ id }) => id)).toContain(
      'navigate_to_storefront',
    );

    const staleEpoch = materialized.capabilityEpoch;
    bus.execute({ type: 'move_slot', centerX: 195, centerY: 60 }, envelope(bus, 'human-r8'), buyer);
    const r8 = bus.inspect('buyer').workspace;
    const r8Capabilities = compileCapabilities(r8, 'buyer').map(({ id }) => id);

    expect(r8.draftVersion).toBe(8);
    expect(r8.frozenRevisions[0]).toEqual(frozenR7);
    expect(r8.commerceLinks[0].revisionId).toBe('r7');
    expect(r8.quotes.some((quote) => quote.revisionId === 'r8')).toBe(false);
    expect(r8Capabilities).not.toContain('materialize_for_commerce');
    expect(r8Capabilities).not.toContain('navigate_to_storefront');
    expect(() =>
      bus.execute(
        {
          type: 'materialize_for_commerce',
          revisionId: 'r7',
          verification: commerceVerification(bus),
        },
        {
          commandId: 'stale-materialize',
          expectedWorkspaceSeq: r8.workspaceSeq,
          expectedCapabilityEpoch: staleEpoch,
          expectedAuthorityEpoch: r8.authorityEpoch,
          expectedSpecHash: hashSpecification(r8),
        },
        shopify,
      ),
    ).toThrowError(AttuneCommandError);
    expect(() =>
      bus.execute(
        {
          type: 'materialize_for_commerce',
          revisionId: 'r7',
          verification: commerceVerification(bus),
        },
        envelope(bus, 'revalidated-materialize'),
        shopify,
      ),
    ).toThrowError(expect.objectContaining({ code: 'CAPABILITY_UNAVAILABLE' }));
  });

  it('emits immutable provenance, hashes, versions, epochs and lock evidence on every transition', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    runThroughAcceptance(bus);

    const receipts = bus.receipts();
    expect(receipts).toHaveLength(4);
    expect(receipts.map(({ receiptSeq }) => receiptSeq)).toEqual([1, 2, 3, 4]);
    expect(receipts.map(({ origin }) => origin)).toEqual([
      'webmcp',
      'human_ui',
      'human_ui',
      'human_ui',
    ]);
    expect(receipts.every(({ beforeHash, afterHash }) => beforeHash !== afterHash)).toBe(true);
    expect(receipts.every(({ preservedLocks }) => preservedLocks.length === 4)).toBe(true);
    expect(receipts.at(-1)).toEqual(
      expect.objectContaining({ workspaceSeq: 4, draftVersion: 7, capabilityEpoch: 5 }),
    );
    expect(bus.transitions()).toHaveLength(4);
    expect(bus.transitions()[1].gained).toContainEqual({
      role: 'provider',
      capabilityId: 'freeze_and_quote_revision',
    });
    expect(bus.transitions()[3].gained).toContainEqual({
      role: 'provider',
      capabilityId: 'materialize_for_commerce',
    });
    expect(Object.isFrozen(receipts[0])).toBe(true);
    expect(Object.isFrozen(receipts[0].validationAfter)).toBe(true);
  });
});
